import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";
import {
  registerComputeNdviStub,
  registerExportPlanCsv,
  registerFetchFieldGeojson,
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
import { registerGetLaborShortageStats } from "./get-labor-shortage-stats.js";
import { registerGetMarketPrice } from "./get-market-price.js";
import { registerGetPesticideRules } from "./get-pesticide-rules.js";
import { registerGetPrefectureCropProfile } from "./get-prefecture-crop-profile.js";
import { registerGetSswCropCompatibility } from "./get-ssw-crop-compatibility.js";
import { registerGetTaskStatus } from "./get-task-status.js";
import { registerGetWeather1km } from "./get-weather-1km.js";
import { registerGetWeatherWarning } from "./get-weather-warning.js";
import { registerMultiFieldCompare } from "./multi-field-compare.js";
import { registerNearbyFarms } from "./nearby-farms.js";
import { registerOpenDashboard } from "./open-dashboard.js";
import { registerOptimizeHarvestTiming } from "./optimize-harvest-timing.js";
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

  if (deps.metrics) {
    const metrics = deps.metrics;
    serverRecord.registerTool = (
      toolName: string,
      config: unknown,
      handler: (input: unknown) => Promise<{ isError?: boolean }>,
    ) => {
      const tracked = async (input: unknown) => {
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
      originalRegisterTool(toolName, config, tracked);
    };
  }

  const reg = (name: string, fn: () => void) => {
    fn();
    registered.push(name);
  };

  // ----- Phase 0 -----
  reg("get_weather_1km", () => registerGetWeather1km(server, deps));

  // ----- Phase 1 — JMA warnings; cheap to mount unconditionally because
  //                 the adapter only goes upstream when the tool is called. -----
  if (deps.jma) {
    reg("get_weather_warning", () => registerGetWeatherWarning(server, deps));
  }

  // ----- Phase 1 — only when eMAFF / FAMIC adapters are configured -----
  if (deps.emaff) {
    reg("search_farmland", () => registerSearchFarmland(server, deps));
    reg("area_summary", () => registerAreaSummary(server, deps));
    reg("nearby_farms", () => registerNearbyFarms(server, deps));
  }
  if (deps.famic) {
    reg("get_pesticide_rules", () => registerGetPesticideRules(server, deps));
  }

  // ----- Phase 3 (uses Form elicitation, falls back when client lacks it) -----
  if (deps.emaff) {
    reg("create_staff_deploy_plan", () => registerCreateStaffDeployPlan(server, deps));
  }

  // ----- Phase 4 — async task management -----
  reg("create_task", () => registerCreateTask(server, deps));
  reg("get_task_status", () => registerGetTaskStatus(server, deps));

  // ----- Phase 7 — Sugu-kuru regional expansion + market data -----
  reg("get_market_price", () => registerGetMarketPrice(server, deps));
  reg("get_prefecture_crop_profile", () => registerGetPrefectureCropProfile(server, deps));
  reg("optimize_harvest_timing", () => registerOptimizeHarvestTiming(server, deps));

  // ----- Phase 8 — SSW strategic intelligence layer -----
  reg("get_ssw_crop_compatibility", () => registerGetSswCropCompatibility(server, deps));
  reg("get_labor_shortage_stats", () => registerGetLaborShortageStats(server, deps));

  // ----- Phase 6 — user-facing agricultural decision tools -----
  reg("crop_calendar", () => registerCropCalendar(server, deps));
  reg("spray_window", () => registerSprayWindow(server, deps));
  reg("seasonal_risk_forecast", () => registerSeasonalRiskForecast(server, deps));
  if (deps.emaff) {
    reg("field_weather_report", () => registerFieldWeatherReport(server, deps));
    reg("multi_field_compare", () => registerMultiFieldCompare(server, deps));
  }

  // ----- Phase 5 — snapshot freshness + MCP Apps UI dashboard -----
  reg("snapshot_status", () => registerSnapshotStatus(server, deps));
  reg("open_dashboard", () => registerOpenDashboard(server, deps));

  // ----- Phase 5 app-only helpers (LLM-invisible) -----
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
  reg("export_plan_csv", () => registerExportPlanCsv(server, deps));

  // Restore the original registerTool after all registrations are complete.
  if (deps.metrics) {
    serverRecord.registerTool = originalRegisterTool;
  }

  return registered;
}
