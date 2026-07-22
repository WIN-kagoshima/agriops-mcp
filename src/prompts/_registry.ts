import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";
import { registerAnnualDispatchPlanPrompt } from "./annual-dispatch-plan.js";
import { registerAreaBriefingPrompt } from "./area-briefing.js";
import { registerDailyBriefingPrompt } from "./daily-briefing.js";
import { registerDataFreshnessCheckPrompt } from "./data-freshness-check.js";
import { registerFieldSummaryPrompt } from "./field-summary.js";
import { registerFieldVisitChecklistPrompt } from "./field-visit-checklist.js";
import { registerHarvestReadinessPrompt } from "./harvest-readiness.js";
import { registerIrrigationSchedulePrompt } from "./irrigation-schedule.js";
import { registerMarketTrendBriefingPrompt } from "./market-trend-briefing.js";
import { registerPesticideAdvicePrompt } from "./pesticide-advice.js";
import { registerRegionDispatchDemandPrompt } from "./region-dispatch-demand.js";
import { registerSswStrategyBriefingPrompt } from "./ssw-strategy-briefing.js";
import { registerStaffDeployPlanPrompt } from "./staff-deploy-plan.js";
import { registerStrategyRoomDashboardPrompt } from "./strategy-room-dashboard.js";
import { registerWeatherRiskAlertPrompt } from "./weather-risk-alert.js";

/**
 * 15 user-controlled prompts (slash commands).
 *
 * Ten are exposed unconditionally. Five instruct the LLM to call specific
 * extended/legacy tools by name (`snapshot_status`, `get_market_price`,
 * `get_prefecture_crop_profile`, `crop_calendar`, ...) that are not
 * model-visible on the Directory default surface — showing them there would
 * mean a reviewer or first connection who runs the prompt gets steered
 * towards a tool call that fails. They register only when the tools they
 * depend on are actually model-visible
 * (`AGRIOPS_ENABLE_EXTENDED_TOOLS=true` and, where noted,
 * `AGRIOPS_ENABLE_LEGACY_TOOLS=true`). See
 * docs/anthropic-directory-submission.md.
 *
 * Returns the names of registered prompts for Server Card consumption.
 */
export function registerAllPrompts(server: McpServer, deps: Deps): string[] {
  const registered: string[] = [];
  const reg = (name: string, fn: () => void) => {
    fn();
    registered.push(name);
  };
  const extended = deps.config.enableExtendedTools;
  const legacy = deps.config.enableLegacyTools;

  reg("field_summary", () => registerFieldSummaryPrompt(server, deps));
  reg("pesticide_advice", () => registerPesticideAdvicePrompt(server, deps));
  reg("staff_deploy_plan", () => registerStaffDeployPlanPrompt(server, deps));
  reg("area_briefing", () => registerAreaBriefingPrompt(server, deps));
  reg("weather_risk_alert", () => registerWeatherRiskAlertPrompt(server, deps));
  reg("irrigation_schedule", () => registerIrrigationSchedulePrompt(server, deps));
  reg("harvest_readiness", () => registerHarvestReadinessPrompt(server, deps));
  reg("daily_briefing", () => registerDailyBriefingPrompt(server, deps));
  reg("field_visit_checklist", () => registerFieldVisitChecklistPrompt(server, deps));
  reg("strategy_room_dashboard", () => registerStrategyRoomDashboardPrompt(server, deps));

  // Needs `snapshot_status` (extended-only).
  if (extended) {
    reg("data_freshness_check", () => registerDataFreshnessCheckPrompt(server, deps));
  }

  // Need `crop_calendar` (extended) plus one or more legacy market/SSW tools.
  if (extended && legacy) {
    reg("market_trend_briefing", () => registerMarketTrendBriefingPrompt(server, deps));
    reg("region_dispatch_demand", () => registerRegionDispatchDemandPrompt(server, deps));
    reg("annual_dispatch_plan", () => registerAnnualDispatchPlanPrompt(server, deps));
    reg("ssw_strategy_briefing", () => registerSswStrategyBriefingPrompt(server, deps));
  }

  return registered;
}

export const PROMPT_COUNT = 15;
