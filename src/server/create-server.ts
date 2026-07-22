import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoggingLevel } from "@modelcontextprotocol/sdk/types.js";
import { EmaffSqliteAdapter } from "../adapters/emaff-fude.js";
import { EstatApiAdapter } from "../adapters/estat.js";
import { FamicSqliteAdapter } from "../adapters/famic-pesticide.js";
import { JmaWarningAdapter } from "../adapters/weather/jma-warning.js";
import { OpenMeteoWeatherAdapter } from "../adapters/weather/open-meteo.js";
import { InMemoryTokenStore } from "../auth/token-store.js";
import { InMemoryElicitationStore } from "../elicitation/store.js";
import type { Config } from "../lib/config.js";
import { type Level, type Logger, withMcpSink } from "../lib/logger.js";
import { registerAllPrompts } from "../prompts/_registry.js";
import { registerAllResources } from "../resources/_registry.js";
import { initIotDb } from "../services/iot/iot-db.js";
import { LaborService } from "../services/iot/labor-service.js";
import { MachineService } from "../services/iot/machine-service.js";
import { SensorService } from "../services/iot/sensor-service.js";
import { TraceabilityService } from "../services/iot/traceability-service.js";
import { InMemoryTaskStore } from "../tasks/index.js";
import { registerAllTools } from "../tools/_registry.js";
import type { Deps } from "./deps.js";
import { type RegisteredSurface, emptyRegisteredSurface } from "./surface-catalog.js";

const SERVER_NAME = "agriops-mcp";

function buildInstructions(opts: { estatEnabled: boolean }): string {
  const lines = [
    "This server exposes Japanese agricultural data — farmland polygons (eMAFF), 1 km mesh weather (Open-Meteo), and pesticide registrations (FAMIC).",
    "Cross-tool patterns: use `search_farmland` to get a `field_id`, then `get_weather_1km` with the field's centroid for site-specific weather, then `get_pesticide_rules` for the registered crop.",
  ];
  if (opts.estatEnabled) {
    lines.push(
      "For government statistics (census, crop output, livestock): use `get_estat_stats` with mode='search' first to find a statsDataId, then mode='data' to retrieve values. Presets: census_workers, crop_output, livestock.",
    );
  }
  lines.push(
    "All data sources include a license attribution string in `structuredContent.attribution`. Surface it when summarising the data to end users.",
    "Stable since 1.0.0: tool names, resource URIs, prompt names, and input/output schemas are frozen under SemVer.",
  );
  return lines.join(" ");
}

export interface CreateServerOptions {
  config: Config;
  logger: Logger;
  version: string;
  /** Override individual deps in tests. */
  overrides?: Partial<Deps>;
}

/** RFC 5424-ish severity mapping from our internal `Level` to the MCP `LoggingLevel` enum. */
const MCP_LOG_LEVEL: Record<Level, LoggingLevel> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

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
  const { config, version, overrides } = options;

  // Backs the `logging: {}` capability declared below with a real
  // implementation: every `logger.warn`/`.error` (and `.debug`/`.info`) call
  // made through this server's `deps.logger` — including `.child()`
  // loggers used by adapters/tools — also becomes a `notifications/message`
  // once a client session connects. `serverRef` is filled in after the
  // `McpServer` is constructed further down; the sink closes over the
  // `let` binding so early log calls made during adapter construction
  // (before `serverRef` exists, or before `.connect()` is called) are
  // silently skipped rather than throwing.
  // biome-ignore lint/style/useConst: reassigned below once the McpServer is constructed; the sink closure needs the `let` binding to observe that later assignment.
  let serverRef: McpServer | undefined;
  const logger = withMcpSink(options.logger, (level, msg, fields) => {
    if (!serverRef?.isConnected()) return;
    serverRef
      .sendLoggingMessage({
        level: MCP_LOG_LEVEL[level],
        logger: "agriops-mcp",
        data: { message: msg, ...fields },
      })
      .catch(() => {
        // Best-effort only — never let logging delivery break the caller.
      });
  });

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

  const iotDb =
    overrides?.iotDb !== undefined
      ? overrides.iotDb
      : initIotDb(config.iotSnapshotPath, logger.child({ component: "iot-db" }));

  const sensorService =
    overrides?.sensorService !== undefined
      ? overrides.sensorService
      : new SensorService(iotDb as any, () => deps);

  const machineService =
    overrides?.machineService !== undefined
      ? overrides.machineService
      : new MachineService(iotDb as any);

  const laborService =
    overrides?.laborService !== undefined ? overrides.laborService : new LaborService(() => deps);

  const traceabilityService =
    overrides?.traceabilityService !== undefined
      ? overrides.traceabilityService
      : new TraceabilityService(iotDb as any, () => deps);

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
    iotDb,
    sensorService,
    machineService,
    laborService,
    traceabilityService,
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
        // Backed by a real `notifications/message` sink — see `logger`
        // above (`withMcpSink`) — instead of an unused declaration.
        logging: {},
        // `area_briefing`'s completable `prefecture` argument and the
        // `farmland://{fude_id}` Resource Template register unconditionally
        // (see docs/phase-plan.md Phase 13), so this capability is always
        // true at runtime; the SDK would auto-enable it on first use
        // anyway, but declaring it upfront means `initialize` already
        // reflects the full capability set instead of only after the
        // first `completion/complete` request.
        completions: {},
      },
      // Built after we know which optional tools will actually register
      // (see below) so a default (no env flags) connection is never told
      // to call a tool that isn't in `tools/list` — see
      // docs/anthropic-directory-submission.md.
      instructions: buildInstructions({
        estatEnabled: config.enableLegacyTools && Boolean(estat),
      }),
    },
  );
  serverRef = server;

  const surface: RegisteredSurface = emptyRegisteredSurface();
  const toolSurface = registerAllTools(server, deps);
  surface.tools = toolSurface.tools;
  surface.appOnlyToolNames = toolSurface.appOnlyToolNames;
  surface.prompts = registerAllPrompts(server, deps);
  surface.resources = registerAllResources(server, deps);

  return { server, deps, surface };
}
