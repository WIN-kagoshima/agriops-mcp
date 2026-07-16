import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";
import { TOOL_METADATA } from "../server/surface-catalog.js";
import {
  registerComputeNdviStub,
  registerExportPlanCsv,
  registerFetchFieldGeojson,
  registerFetchTopoJsonResource,
  registerFetchWeatherLayer,
  registerListMunicipalities,
  registerListPrefectures,
  registerSearchOperators,
  registerSelectField,
  registerSummarizeFarmland,
} from "./app-only/index.js";
import { registerAreaSummary } from "./area-summary.js";
import { registerCreateStaffDeployPlan } from "./create-staff-deploy-plan.js";
import { registerCreateTask } from "./create-task.js";
import { registerCropCalendar } from "./crop-calendar.js";
import { registerFieldWeatherReport } from "./field-weather-report.js";
import { registerGenerateSubsidyApplication } from "./generate-subsidy-application.js";
import { registerGetEstatStats } from "./get-estat-stats.js";
import { registerGetLaborShortageStats } from "./get-labor-shortage-stats.js";
import { registerGetLivestockRegionalStats } from "./get-livestock-regional-stats.js";
import { registerGetMachineIoTStatus } from "./get-machine-iot-status.js";
import { registerGetMarketPrice } from "./get-market-price.js";
import { registerGetMunicipalityStats } from "./get-municipality-stats.js";
import { registerGetPesticideRules } from "./get-pesticide-rules.js";
import { registerGetPrefectureCropProfile } from "./get-prefecture-crop-profile.js";
import { registerGetRealTimeSensorData } from "./get-realtime-sensor-data.js";
import { registerGetSswCropCompatibility } from "./get-ssw-crop-compatibility.js";
import { registerGetTaskStatus } from "./get-task-status.js";
import { registerGetTraceabilityReport } from "./get-traceability-report.js";
import { registerGetWeather1km } from "./get-weather-1km.js";
import { registerGetWeatherWarning } from "./get-weather-warning.js";
import { registerMultiFieldCompare } from "./multi-field-compare.js";
import { registerNearbyFarms } from "./nearby-farms.js";
import { registerOpenDashboard } from "./open-dashboard.js";
import { registerOptimizeHarvestTiming } from "./optimize-harvest-timing.js";
import { registerPlanIrrigation } from "./plan-irrigation.js";
import { registerPredictLaborDemand } from "./predict-labor-demand.js";
import { registerSearchFarmland } from "./search-farmland.js";
import { registerSeasonalRiskForecast } from "./seasonal-risk-forecast.js";
import { registerSnapshotStatus } from "./snapshot-status.js";
import { registerSprayWindow } from "./spray-window.js";

/**
 * Single source of truth for tool registration.
 *
 * Tools are registered conditionally on the deps that are present, so a
 * Phase 0 server (no eMAFF) only exposes weather. This keeps the LLM
 * context lean and avoids "tool exists but always errors" UX.
 *
 * Model-visible surface is additionally gated by two feature flags (see
 * `src/lib/config.ts`):
 *
 *   - `config.enableExtendedTools` (env `AGRIOPS_ENABLE_EXTENDED_TOOLS`):
 *     multi-step agronomy tools (`crop_calendar`, `spray_window`, ...),
 *     the async Tasks Primitive (`create_task`/`get_task_status`), and the
 *     Phase 12 IoT layer. These are real product features but are not part
 *     of the default 8-tool core, so a Directory reviewer or a first
 *     connection is not shown ~20 extra tools.
 *   - `config.enableLegacyTools` (env `AGRIOPS_ENABLE_LEGACY_TOOLS`):
 *     the seven tools already flagged `deprecated: true` in
 *     `surface-catalog.ts` (Phase 7-11 market/SSW/e-Stat tools).
 *
 * Both default to `false`. Neither flag renames, removes, or changes the
 * schema of a published tool — see `docs/anthropic-directory-submission.md`
 * for the rationale. Operators who rely on the extended/legacy tools today
 * set the corresponding env var to `true` in their deployment.
 *
 * When `deps.metrics` is present, every tool handler is automatically wrapped
 * to increment `tool_calls_total{tool,outcome}` and observe
 * `tool_duration_ms{tool}`. This is done by temporarily patching
 * `server.registerTool` so individual tool files don't need to know about
 * the metrics registry.
 *
 * Returns the names of tools that were actually registered, so the
 * Server Card builder can advertise only what is live.
 */
export function registerAllTools(server: McpServer, deps: Deps): string[] {
  const registered: string[] = [];

  // Patch server.registerTool to wrap handlers with automatic metrics
  // tracking when a metrics registry is available.
  //
  // McpServer.registerTool is overloaded, so we capture it through an
  // `unknown` cast to avoid TypeScript's "never" inference on overloaded
  // function parameters. The patch is restored after all tools are registered.
  type AnyFn = (toolName: string, config: unknown, handler: unknown) => void;
  const serverRecord = server as unknown as Record<string, unknown>;
  const originalRegisterTool = (server.registerTool as unknown as AnyFn).bind(server);

  serverRecord.registerTool = (
    toolName: string,
    config: unknown,
    handler: (input: unknown) => Promise<{ isError?: boolean }>,
  ) => {
    const meta = TOOL_METADATA[toolName];
    const finalConfig = meta?.deprecated
      ? { ...(config as Record<string, unknown>), deprecated: true }
      : config;

    let finalHandler = handler;
    if (deps.metrics) {
      const metrics = deps.metrics;
      finalHandler = async (input: unknown) => {
        const start = Date.now();
        try {
          const result = await handler(input);
          const outcome = result?.isError === true ? "error" : "ok";
          metrics.inc("tool_calls_total", { tool: toolName, outcome });
          metrics.observe("tool_duration_ms", Date.now() - start, { tool: toolName });
          return result;
        } catch (err) {
          metrics.inc("tool_calls_total", { tool: toolName, outcome: "error" });
          metrics.observe("tool_duration_ms", Date.now() - start, { tool: toolName });
          throw err;
        }
      };
    }
    originalRegisterTool(toolName, finalConfig, finalHandler);
  };

  const reg = (name: string, fn: () => void) => {
    fn();
    registered.push(name);
  };

  const extended = deps.config.enableExtendedTools;
  const legacy = deps.config.enableLegacyTools;

  // ----- Core model-visible surface (always on when deps allow) -----
  // These 8 tools are the entire default surface. They are the set an
  // Anthropic Directory reviewer, MCP Inspector, or a first-time agent
  // sees with no env vars set. See docs/anthropic-directory-submission.md.
  reg("get_weather_1km", () => registerGetWeather1km(server, deps));

  if (deps.jma) {
    reg("get_weather_warning", () => registerGetWeatherWarning(server, deps));
  }

  if (deps.emaff) {
    reg("search_farmland", () => registerSearchFarmland(server, deps));
    reg("area_summary", () => registerAreaSummary(server, deps));
    reg("nearby_farms", () => registerNearbyFarms(server, deps));
  }
  if (deps.famic) {
    reg("get_pesticide_rules", () => registerGetPesticideRules(server, deps));
  }

  // Phase 3 (uses Form elicitation, falls back when client lacks it).
  if (deps.emaff) {
    reg("create_staff_deploy_plan", () => registerCreateStaffDeployPlan(server, deps));
  }

  reg("open_dashboard", () => registerOpenDashboard(server, deps));

  // ----- Extended surface (AGRIOPS_ENABLE_EXTENDED_TOOLS=true) -----
  // Real product features for operators who need them by default (e.g. the
  // SuguKuru internal deployment), opt-in for the public Directory listing.
  if (extended) {
    // Phase 4 — async task management.
    reg("create_task", () => registerCreateTask(server, deps));
    reg("get_task_status", () => registerGetTaskStatus(server, deps));

    // Phase 5 — snapshot freshness diagnostics.
    reg("snapshot_status", () => registerSnapshotStatus(server, deps));

    // Phase 6 — derived agronomy tools.
    reg("crop_calendar", () => registerCropCalendar(server, deps));
    reg("spray_window", () => registerSprayWindow(server, deps));
    reg("seasonal_risk_forecast", () => registerSeasonalRiskForecast(server, deps));
    if (deps.emaff) {
      reg("field_weather_report", () => registerFieldWeatherReport(server, deps));
      reg("multi_field_compare", () => registerMultiFieldCompare(server, deps));
    }

    // Phase 7 — market data.
    reg("optimize_harvest_timing", () => registerOptimizeHarvestTiming(server, deps));

    // Phase 12 — Precision Agriculture & IoT Unified Layer.
    reg("get_realtime_sensor_data", () => registerGetRealTimeSensorData(server, deps));
    reg("get_machine_iot_status", () => registerGetMachineIoTStatus(server, deps));
    reg("predict_labor_demand", () => registerPredictLaborDemand(server, deps));
    reg("plan_irrigation", () => registerPlanIrrigation(server, deps));
    reg("generate_subsidy_application", () => registerGenerateSubsidyApplication(server, deps));
    reg("get_traceability_report", () => registerGetTraceabilityReport(server, deps));
  }

  // ----- Legacy / deprecated surface (AGRIOPS_ENABLE_LEGACY_TOOLS=true) -----
  // All seven are already flagged `deprecated: true` in surface-catalog.ts.
  if (legacy) {
    // Phase 7 — Sugu-kuru regional expansion + market data.
    reg("get_market_price", () => registerGetMarketPrice(server, deps));
    reg("get_prefecture_crop_profile", () => registerGetPrefectureCropProfile(server, deps));

    // Phase 8-9 — SSW strategic intelligence layer.
    reg("get_ssw_crop_compatibility", () => registerGetSswCropCompatibility(server, deps));
    reg("get_labor_shortage_stats", () => registerGetLaborShortageStats(server, deps));
    reg("get_livestock_regional_stats", () => registerGetLivestockRegionalStats(server, deps));

    // Phase 10 — municipality drill-down.
    reg("get_municipality_stats", () => registerGetMunicipalityStats(server, deps));

    // Phase 11 — e-Stat live government statistics.
    if (deps.estat) {
      reg("get_estat_stats", () => registerGetEstatStats(server, deps));
    }
  }

  // ----- Phase 5 app-only helpers (LLM-invisible; always on) -----
  if (deps.emaff) {
    reg("fetch_field_geojson", () => registerFetchFieldGeojson(server, deps));
    reg("select_field", () => registerSelectField(server, deps));
    reg("list_prefectures", () => registerListPrefectures(server, deps));
    reg("list_municipalities", () => registerListMunicipalities(server, deps));
    reg("search_operators", () => registerSearchOperators(server, deps));
    reg("summarize_farmland", () => registerSummarizeFarmland(server, deps));
    reg("compute_ndvi_stub", () => registerComputeNdviStub(server, deps));
  }
  reg("fetch_weather_layer", () => registerFetchWeatherLayer(server, deps));
  reg("fetch_topojson_resource", () => registerFetchTopoJsonResource(server, deps));
  reg("export_plan_csv", () => registerExportPlanCsv(server, deps));

  // Restore the original registerTool after all registrations are complete.
  serverRecord.registerTool = originalRegisterTool;

  return registered;
}
