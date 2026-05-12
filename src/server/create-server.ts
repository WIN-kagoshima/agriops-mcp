import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EmaffSqliteAdapter } from "../adapters/emaff-fude.js";
import { EstatApiAdapter } from "../adapters/estat.js";
import { FamicSqliteAdapter } from "../adapters/famic-pesticide.js";
import { JmaWarningAdapter } from "../adapters/weather/jma-warning.js";
import { OpenMeteoWeatherAdapter } from "../adapters/weather/open-meteo.js";
import { InMemoryTokenStore } from "../auth/token-store.js";
import { InMemoryElicitationStore } from "../elicitation/store.js";
import type { Config } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import { registerAllPrompts } from "../prompts/_registry.js";
import { registerAllResources } from "../resources/_registry.js";
import { InMemoryTaskStore } from "../tasks/index.js";
import { registerAllTools } from "../tools/_registry.js";
import type { Deps } from "./deps.js";
import { type RegisteredSurface, emptyRegisteredSurface } from "./surface-catalog.js";

const SERVER_NAME = "agriops-mcp";

export interface CreateServerOptions {
  config: Config;
  logger: Logger;
  version: string;
  /** Override individual deps in tests. */
  overrides?: Partial<Deps>;
}

/**
 * Build a fully-wired MCP server. Pure factory: no transport, no listening,
 * no global side effects. The caller picks stdio or Streamable HTTP and
 * connects the returned server.
 */
export function createServer(options: CreateServerOptions): {
  server: McpServer;
  deps: Deps;
  surface: RegisteredSurface;
} {
  const { config, logger, version, overrides } = options;

  const emaff =
    overrides?.emaff !== undefined
      ? overrides.emaff
      : existsSync(config.emaffSnapshotPath)
        ? new EmaffSqliteAdapter({
            path: config.emaffSnapshotPath,
            logger: logger.child({ component: "emaff" }),
          })
        : null;

  const famic =
    overrides?.famic !== undefined
      ? overrides.famic
      : existsSync(config.famicSnapshotPath)
        ? new FamicSqliteAdapter({
            path: config.famicSnapshotPath,
            logger: logger.child({ component: "famic" }),
          })
        : null;

  const estat =
    overrides?.estat !== undefined
      ? overrides.estat
      : config.estatAppId
        ? new EstatApiAdapter({
            appId: config.estatAppId,
            logger: logger.child({ component: "estat" }),
          })
        : null;

  const deps: Deps = {
    config,
    logger,
    version,
    bootedAt: new Date().toISOString(),
    weather:
      overrides?.weather ??
      new OpenMeteoWeatherAdapter({
        baseUrl: config.openMeteoBaseUrl,
        logger: logger.child({ component: "open-meteo" }),
      }),
    jma:
      overrides?.jma !== undefined
        ? overrides.jma
        : new JmaWarningAdapter({
            logger: logger.child({ component: "jma" }),
            version,
          }),
    emaff,
    famic,
    estat,
    tokenStore: overrides?.tokenStore ?? new InMemoryTokenStore(),
    elicitationStore: overrides?.elicitationStore ?? new InMemoryElicitationStore(),
    metrics: overrides?.metrics,
    taskStore: overrides?.taskStore ?? new InMemoryTaskStore(),
  };

  if (!emaff) {
    logger.info("eMAFF snapshot not found — farmland tools disabled", {
      path: config.emaffSnapshotPath,
    });
  }
  if (!famic) {
    logger.info("FAMIC snapshot not found — pesticide tool disabled", {
      path: config.famicSnapshotPath,
    });
  }
  if (!estat) {
    logger.info("ESTAT_APP_ID not set — get_estat_stats tool disabled");
  }

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version,
      title: "AgriOps MCP",
      description:
        "Japanese agricultural data (farmland, weather, pesticides) for SSW workforce dispatching. Reference MCP server (Apache-2.0).",
      websiteUrl: "https://github.com/WIN-kagoshima/agriops-mcp",
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true, subscribe: false },
        logging: {},
      },
      instructions: [
        "This server exposes Japanese agricultural data — farmland polygons (eMAFF), 1 km mesh weather (Open-Meteo), pesticide registrations (FAMIC), and government statistics (e-Stat).",
        "Cross-tool patterns: use `search_farmland` to get a `field_id`, then `get_weather_1km` with the field's centroid for site-specific weather, then `get_pesticide_rules` for the registered crop.",
        "For government statistics (census, crop output, livestock): use `get_estat_stats` with mode='search' first to find a statsDataId, then mode='data' to retrieve values. Presets: census_workers, crop_output, livestock.",
        "All data sources include a license attribution string in `structuredContent.attribution`. Surface it when summarising the data to end users.",
        "Stable since 1.0.0: tool names, resource URIs, prompt names, and input/output schemas are frozen under SemVer.",
      ].join(" "),
    },
  );

  const surface: RegisteredSurface = emptyRegisteredSurface();
  surface.tools = registerAllTools(server, deps);
  surface.prompts = registerAllPrompts(server, deps);
  surface.resources = registerAllResources(server, deps);

  return { server, deps, surface };
}
