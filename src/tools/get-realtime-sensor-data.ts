import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_realtime_sensor_data",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 12,
};

export const inputSchema = z
  .object({
    farmId: z.string().describe("Target farmland ID (eMAFF polygon reference)."),
    sensorType: z
      .enum(["soil_moisture", "soil_temp", "ambient_temp", "humidity", "npk"])
      .describe("Target sensor type for telemetry reading."),
  })
  .strict();

export function registerGetRealTimeSensorData(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Get Real-time Sensor Data",
      description:
        "Fetches the latest live telemetry from soil sensors, ambient meters, or nutrient analyzers. " +
        "Dynamically computes readings based on local microclimate weather indicators. Read-only.",
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
        if (!deps.sensorService) {
          return {
            isError: true,
            content: [{ type: "text", text: "Sensor service is not available on this server." }],
          };
        }

        const data = await deps.sensorService.getRealTimeSensorData(
          parsed.data.farmId,
          parsed.data.sensorType,
        );

        const summary = `Sensor [${data.sensorType}] at farm [${data.farmId}] reads ${data.value} ${data.unit}. Status: ${data.evaluation}.`;

        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: `Retrieved: ${data.timestamp}` },
          ],
          structuredContent: data as unknown as Record<string, unknown>,
        };
      } catch (err) {
        deps.logger.error("get_realtime_sensor_data failed", {
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
