import type { Express, Request, Response } from "express";
import {
  PROMPT_METADATA,
  RESOURCE_METADATA,
  type RegisteredSurface,
  TOOL_METADATA,
} from "./surface-catalog.js";

export interface WellKnownOptions {
  baseUrl: string;
  version: string;
  /**
   * The surface that the live server actually registered. The card filters
   * `TOOL_METADATA` / `PROMPT_METADATA` / `RESOURCE_METADATA` to this set
   * so a Phase 0 deployment without eMAFF does not advertise farmland tools.
   */
  surface: RegisteredSurface;
}

/**
 * Build the `.well-known/mcp-server.json` Server Card.
 *
 * Aligned with the MCP 2026 roadmap (Server Cards / discovery): a static,
 * cacheable JSON document that registries and crawlers can fetch with no
 * authentication and no live MCP session.
 *
 * IMPORTANT: change here = change to the public surface. Bump `version`
 * and update CHANGELOG.md.
 */
export function buildServerCard(options: WellKnownOptions): Record<string, unknown> {
  const appOnly = new Set(options.surface.appOnlyToolNames ?? []);
  const tools = options.surface.tools
    .filter((name) => TOOL_METADATA[name])
    .map((name) => {
      const meta = TOOL_METADATA[name];
      if (!meta) throw new Error(`internal: missing TOOL_METADATA for ${name}`);
      return {
        name,
        sideEffect: meta.sideEffect,
        introduced: meta.introduced,
        // Report the *runtime* visibility, not just the static catalog
        // entry — a handful of tools (dashboard-helper legacy tools, see
        // RegisteredSurface.appOnlyToolNames) are catalogued as
        // "model" for self-hosted operators with AGRIOPS_ENABLE_LEGACY_TOOLS=true
        // but register as LLM-invisible app tools otherwise.
        visibility: appOnly.has(name) ? "app" : meta.visibility,
        annotations: meta.annotations,
      };
    });

  const prompts = options.surface.prompts
    .filter((name) => PROMPT_METADATA[name])
    .map((name) => {
      const meta = PROMPT_METADATA[name];
      if (!meta) throw new Error(`internal: missing PROMPT_METADATA for ${name}`);
      return { name, introduced: meta.introduced };
    });

  const apps = options.surface.resources
    .filter((uri) => uri.startsWith("ui://") && RESOURCE_METADATA[uri])
    .map((uri) => {
      const meta = RESOURCE_METADATA[uri];
      if (!meta) throw new Error(`internal: missing RESOURCE_METADATA for ${uri}`);
      return { uri, title: meta.title, introduced: meta.introduced };
    });

  // Non-UI resources / resource templates (tasks, farmland, TopoJSON). Kept
  // separate from `apps` (which is specifically the MCP Apps UI bundle
  // resource) so registries can tell "renders a UI" apart from "returns
  // data". This is what previously went entirely unreported in the card.
  const resources = options.surface.resources
    .filter((uri) => !uri.startsWith("ui://") && RESOURCE_METADATA[uri])
    .map((uri) => {
      const meta = RESOURCE_METADATA[uri];
      if (!meta) throw new Error(`internal: missing RESOURCE_METADATA for ${uri}`);
      return { uri, title: meta.title, introduced: meta.introduced, mimeType: meta.mimeType };
    });

  return {
    name: "AgriOps MCP",
    version: options.version,
    description:
      "Japanese agricultural land + 1 km mesh weather + pesticide registration + government statistics (e-Stat) MCP server " +
      "for Specified Skilled Worker (SSW) workforce dispatching. Reference implementation of " +
      "MCP Spec 2025-11-25 + MCP Apps Extension 2026-01-26.",
    homepage: "https://github.com/WIN-kagoshima/agriops-mcp",
    repository: "https://github.com/WIN-kagoshima/agriops-mcp",
    license: "Apache-2.0",
    contact: {
      issues: "https://github.com/WIN-kagoshima/agriops-mcp/issues",
      security: "info@win-g-c.com",
    },
    endpoints: {
      mcp: `${options.baseUrl}/mcp`,
      health: `${options.baseUrl}/healthz`,
    },
    capabilities: {
      tools: { listChanged: true },
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: false },
      logging: {},
      // Activated by the `area_briefing` prompt's completable `prefecture`
      // argument and the `farmland://{fude_id}` Resource Template — both
      // register unconditionally, so this is always true at runtime. See
      // docs/phase-plan.md Phase 13.
      completions: {},
    },
    transports: ["streamable-http"],
    languages: ["ja", "en"],
    tools,
    prompts,
    apps,
    resources,
    data_sources: [
      {
        name: "eMAFF Fude Polygon",
        license: "open-data",
        attribution: "農林水産省 eMAFF 筆ポリゴン",
      },
      { name: "Open-Meteo", license: "CC-BY-4.0", attribution: "Open-Meteo.com" },
      {
        name: "JMA Disaster XML feed",
        license: "Japan Meteorological Business Act",
        attribution: "気象庁",
      },
      {
        name: "FAMIC pesticide registration",
        license: "open-data",
        attribution: "FAMIC 農薬登録情報",
      },
      {
        name: "ALIC agricultural market price reference",
        license: "open-data",
        attribution: "農畜産業振興機構 (ALIC) 野菜情報・果実情報",
      },
      {
        name: "Forestry Agency timber market reference",
        license: "open-data",
        attribution: "林野庁 木材需給報告書",
      },
      {
        name: "e-Stat (政府統計の総合窓口) API",
        license: "政府統計API利用規約",
        attribution: "政府統計総合窓口(e-Stat)",
      },
    ],
    spec: {
      core: "2025-11-25",
      apps: "2026-01-26",
    },
    experimental: false,
    /** Known-compatible MCP clients. Agents use this to detect feature support. */
    clients: [
      { name: "Claude Desktop", tested: true, transport: "stdio" },
      { name: "Cursor", tested: true, transport: "streamable-http" },
      {
        name: "ChatGPT (Connectors)",
        tested: false,
        transport: "streamable-http",
        notes: "Planned",
      },
      { name: "Google ADK", tested: false, transport: "streamable-http", notes: "Planned" },
    ],
    /** Operator-facing observability endpoints (relative to the base URL). */
    observability: {
      metrics: `${options.baseUrl}/metrics`,
      health: `${options.baseUrl}/livez`,
      readiness: `${options.baseUrl}/readyz`,
      metricsFormat: "text/plain; version=0.0.4",
      metricsAuth: "Bearer (set AGRIOPS_METRICS_BEARER to enable)",
    },
    /** Test-suite summary baked at build time; updated on each release. */
    eval: {
      testFiles: 49,
      testCases: 270,
      scenarios: 23,
      conformanceChecks: 17,
      lastRun: "2026-07-22",
      note: "v1.15.2: fixed the Cloud Build docker build ERESOLVE that 1.15.1's .npmrc missed — Dockerfile's deps/prod-deps stages now COPY .npmrc alongside package.json/package-lock.json so npm ci inside the image build also gets legacy-peer-deps. v1.15.1: fixed a CI-blocking npm ci ERESOLVE (added .npmrc legacy-peer-deps) plus a corrupted package-lock.json entry, and closed a check-then-insert race in initIotDb() that could throw a UNIQUE constraint error under concurrent seeding (parallel test workers / multi-instance cold starts) — no tool/schema changes. v1.15.0: Directory UX/spec-compliance pass — AGRIOPS_ALLOWED_HOSTS for multi-hostname Cloud Run deployments; dashboard-helper tools now register unconditionally as ui/visibility:['app'] (Server Card reports runtime visibility, not just the static catalog) fixing a tool-not-found gap in the MCP Apps dashboard/prompts on the default surface; create_staff_deploy_plan gained an outputSchema; search_farmland/nearby_farms/get_pesticide_rules/create_staff_deploy_plan now embed a GeoJSON or CSV resource block ('take this artifact home'); dashboard gained a CSV-download button with a copy-to-clipboard fallback; assets/logo.png (was a mislabeled JPEG) re-encoded to a true PNG; 5 dashboard screenshots captured via npm run capture:screenshots. v1.14.2 shipped developer-trust distribution content (Zenn/dev.to 7-primitives writeups, Show HN draft, note.com writeup, README Demo/Roadmap, awesome-list PRs). v1.14.1 verified the Anthropic Directory submission packet locally. v1.14.0 shipped craft signals (fast-check PBT, non-empty attribution schema, tinybench, CI hard gate).",
      repository: "https://github.com/WIN-kagoshima/agriops-mcp/tree/main/tests",
    },
    /**
     * Directory-facing surface note. The `tools` array above already
     * reflects only what this deployment actually registered (see
     * `RegisteredSurface`) — this field documents *why* it may be smaller
     * than the full published catalog for a self-hosted deployment.
     */
    toolSurfacePolicy: {
      defaultModelVisibleCount: 8,
      extendedToolsEnvVar: "AGRIOPS_ENABLE_EXTENDED_TOOLS",
      legacyToolsEnvVar: "AGRIOPS_ENABLE_LEGACY_TOOLS",
      docs: "https://github.com/WIN-kagoshima/agriops-mcp/blob/main/docs/anthropic-directory-submission.md",
    },
    /** Container image for self-hosted deployments. */
    container: {
      image: "ghcr.io/win-kagoshima/agriops-mcp",
      platforms: ["linux/amd64", "linux/arm64"],
      runtimeNode: "22-lts",
      baseImage: "gcr.io/distroless/nodejs22-debian12:nonroot",
    },
  };
}

export function mountWellKnown(app: Express, options: WellKnownOptions): void {
  const card = buildServerCard(options);
  const body = JSON.stringify(card, null, 2);
  app.get("/.well-known/mcp-server.json", (_req: Request, res: Response) => {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=300");
    res.status(200).send(body);
  });
}
