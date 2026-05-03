import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";
import { registerAnnualDispatchPlanPrompt } from "./annual-dispatch-plan.js";
import { registerSswStrategyBriefingPrompt } from "./ssw-strategy-briefing.js";
import { registerStrategyRoomDashboardPrompt } from "./strategy-room-dashboard.js";
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
import { registerStaffDeployPlanPrompt } from "./staff-deploy-plan.js";
import { registerWeatherRiskAlertPrompt } from "./weather-risk-alert.js";

/**
 * 15 user-controlled prompts (slash commands). They are exposed
 * unconditionally; the underlying tools they reference may not be available
 * in early phases, in which case the prompt simply tells the LLM to
 * apologise and explain what is missing.
 *
 * Returns the names of registered prompts for Server Card consumption.
 */
export function registerAllPrompts(server: McpServer, deps: Deps): string[] {
  registerFieldSummaryPrompt(server, deps);
  registerPesticideAdvicePrompt(server, deps);
  registerStaffDeployPlanPrompt(server, deps);
  registerAreaBriefingPrompt(server, deps);
  registerWeatherRiskAlertPrompt(server, deps);
  registerIrrigationSchedulePrompt(server, deps);
  registerDataFreshnessCheckPrompt(server, deps);
  registerHarvestReadinessPrompt(server, deps);
  registerDailyBriefingPrompt(server, deps);
  registerFieldVisitChecklistPrompt(server, deps);
  registerMarketTrendBriefingPrompt(server, deps);
  registerRegionDispatchDemandPrompt(server, deps);
  registerAnnualDispatchPlanPrompt(server, deps);
  registerSswStrategyBriefingPrompt(server, deps);
  registerStrategyRoomDashboardPrompt(server, deps);
  return [
    "field_summary",
    "pesticide_advice",
    "staff_deploy_plan",
    "area_briefing",
    "weather_risk_alert",
    "irrigation_schedule",
    "data_freshness_check",
    "harvest_readiness",
    "daily_briefing",
    "field_visit_checklist",
    "market_trend_briefing",
    "region_dispatch_demand",
    "annual_dispatch_plan",
    "ssw_strategy_briefing",
    "strategy_room_dashboard",
  ];
}

export const PROMPT_COUNT = 15;
