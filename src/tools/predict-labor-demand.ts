import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "predict_labor_demand",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 12,
};

export const inputSchema = z
  .object({
    farmId: z.string().describe("Farmland identifier (eMAFF polygon ID)."),
    cropType: z.string().describe("Target crop name (e.g. Sweet Potato, Tea)."),
    daysAhead: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(7)
      .describe("Number of forecast days ahead (1-30)."),
  })
  .strict();

export function registerPredictLaborDemand(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Predict Labor Demand",
      description:
        "Calculates required manual labor force crew (Specified Skilled Workers / 特定技能) " +
        "over a specified horizon, integrating crop factors, physical farm area (eMAFF), " +
        "and meteorological alerts (e.g., storm work-shifting). Integrates with SuguVisa criteria.",
      inputSchema: inputSchema.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            },
          ],
        };
      }

      try {
        if (!deps.laborService) {
          return {
            isError: true,
            content: [{ type: "text", text: "Labor service is not available on this server." }],
          };
        }

        const data = await deps.laborService.predictLaborDemand(
          parsed.data.farmId,
          parsed.data.cropType,
          parsed.data.daysAhead,
        );

        const summary =
          `Labor demand for ${data.cropType} at ${data.farmId} over the next ${data.daysAhead} days: ` +
          `Required crew size: ${data.adjustedWorkersNeeded} workers (Base demand: ${data.baseWorkersNeeded}, Weather multiplier: ${data.weatherFactor}x). ` +
          `Work priority: [${data.workPriority}].`;

        const alertsStr =
          data.weatherAlerts.length > 0
            ? `Alerts:\n- ${data.weatherAlerts.join("\n- ")}`
            : "No microclimate labor alerts.";

        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: alertsStr },
            { type: "text", text: data.suguvisaRecommendation },
          ],
          structuredContent: data as unknown as Record<string, unknown>,
        };
      } catch (err) {
        deps.logger.error("predict_labor_demand failed", {
          error: (err as Error).message,
          farmId: parsed.data.farmId,
        });
        return {
          isError: true,
          content: [{ type: "text", text: `Execution error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
