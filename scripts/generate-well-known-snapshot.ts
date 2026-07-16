/**
 * Generates a static `.well-known/mcp-server.json` snapshot and commits it
 * to the repository root.
 *
 * Why this exists: `buildServerCard()` (`src/server/well-known.ts`) is a
 * pure function of the *live* registered surface, served dynamically at
 * `GET /.well-known/mcp-server.json`. A registry/crawler that only clones
 * the GitHub repo — without running the server — previously saw nothing at
 * `.well-known/`, even though `AGENTS.md` documented that path as "the
 * public contract for registries and crawlers". This script produces a
 * committed fallback snapshot of the *default* (no env flags) surface with
 * all adapters present, so cloning the repo is enough to discover the
 * contract.
 *
 * The live endpoint remains authoritative. Run via `npm run snapshot:well-known`
 * whenever the default 8-tool surface, prompts, or resources change; CI's
 * `release-check.ts` (or a future check) can diff this file against a fresh
 * run to catch drift before a release.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  EmaffAdapter,
  FamicAdapter,
  JmaAdapter,
  WeatherAdapter,
} from "../src/adapters/_interface.js";
import { loadConfig } from "../src/lib/config.js";
import { createLogger } from "../src/lib/logger.js";
import { createServer } from "../src/server/create-server.js";
import { buildServerCard } from "../src/server/well-known.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "..", ".well-known", "mcp-server.json");

function buildMockWeather(): WeatherAdapter {
  return {
    async getForecast({ lat, lng }) {
      return {
        source: "snapshot-generator",
        attribution: "Weather data by Open-Meteo.com (CC-BY 4.0)",
        location: { lat, lng, timezone: "Asia/Tokyo" },
        generatedAt: new Date(0).toISOString(),
        hourly: [],
        alerts: [],
      };
    },
  };
}

function buildMockJma(): JmaAdapter {
  return {
    async getActiveWarnings() {
      return { warnings: [], fetchedAt: new Date(0).toISOString(), attribution: "気象庁" };
    },
  };
}

function buildMockEmaff(): EmaffAdapter {
  return {
    async search() {
      return { fields: [], nextCursor: null, total: 0, attribution: "農林水産省 eMAFF 筆ポリゴン" };
    },
    async get() {
      return null;
    },
    async nearby() {
      return { fields: [], nextCursor: null, total: 0, attribution: "農林水産省 eMAFF 筆ポリゴン" };
    },
    async areaSummary() {
      return {
        prefectureCode: "JP-46",
        cityCode: null,
        totalFields: 0,
        totalAreaHa: 0,
        topCrops: [],
        attribution: "農林水産省 eMAFF 筆ポリゴン",
      };
    },
  };
}

function buildMockFamic(): FamicAdapter {
  return {
    async search() {
      return { rules: [], nextCursor: null, attribution: "FAMIC 農薬登録情報" };
    },
    async get() {
      return null;
    },
  };
}

async function main(): Promise<void> {
  // Force the Directory-facing default: no extended/legacy tools, regardless
  // of what this shell's environment has set.
  process.env.AGRIOPS_ENABLE_EXTENDED_TOOLS = undefined;
  process.env.AGRIOPS_ENABLE_LEGACY_TOOLS = undefined;

  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { surface } = createServer({
    config,
    logger,
    version: `${process.env.npm_package_version ?? "0.0.0-snapshot"}`,
    overrides: {
      weather: buildMockWeather(),
      jma: buildMockJma(),
      emaff: buildMockEmaff(),
      famic: buildMockFamic(),
    },
  });

  const card = buildServerCard({
    baseUrl: "https://agriops-mcp-n5vdix22hq-an.a.run.app",
    version:
      config.enableExtendedTools || config.enableLegacyTools
        ? "unexpected-flags-set"
        : `${process.env.npm_package_version ?? "0.0.0-snapshot"}`,
    surface,
  });

  const annotated = {
    ...card,
    _snapshotNote:
      "Static fallback for repo clones/crawlers that do not run the server. " +
      "The live endpoint's GET /.well-known/mcp-server.json is authoritative " +
      "and may additionally advertise extended/legacy tools if the operator " +
      "set AGRIOPS_ENABLE_EXTENDED_TOOLS / AGRIOPS_ENABLE_LEGACY_TOOLS=true. " +
      "Regenerate with `npm run snapshot:well-known`. See docs/anthropic-directory-submission.md.",
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(annotated, null, 2)}\n`, "utf8");
  console.error(
    `Wrote ${OUTPUT_PATH} (${(card.tools as unknown[]).length} tools, ${(card.prompts as unknown[]).length} prompts, ${(card.apps as unknown[]).length} apps)`,
  );
}

main().catch((err) => {
  console.error("generate-well-known-snapshot failed:", err);
  process.exitCode = 1;
});
