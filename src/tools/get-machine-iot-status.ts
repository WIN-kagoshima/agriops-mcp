import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_machine_iot_status",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 12,
};

export const inputSchema = z
  .object({
    machineId: z.string().describe("Unique machinery asset identifier (e.g. mach_tractor_001)."),
  })
  .strict();

export function registerGetMachineIoTStatus(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Get Machine IoT Status",
      description:
        "Queries live telemetry from autonomous or smart farm equipment (tractors, drones, sprayers). " +
        "Returns current coordinates, active operation, fuel/battery metrics, and diagnostics. Read-only.",
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
        if (!deps.machineService) {
          return {
            isError: true,
            content: [{ type: "text", text: "Machine service is not available on this server." }],
          };
        }

        const data = await deps.machineService.getMachineIoTStatus(parsed.data.machineId);
        if (!data) {
          return {
            isError: true,
            content: [{ type: "text", text: `Machine ID '${parsed.data.machineId}' not found.` }],
          };
        }

        const summary =
          `Machine [${data.model}] (ID: ${data.machineId}) is currently [${data.activity}]. ` +
          `Fuel: ${data.fuel}%, Battery: ${data.battery}%. System status: ${data.diagnostics}`;

        return {
          content: [
            { type: "text", text: summary },
            {
              type: "text",
              text: `Position: (${data.location.lat.toFixed(4)}, ${data.location.lng.toFixed(4)}), last seen: ${data.lastSeen}`,
            },
          ],
          structuredContent: data as unknown as Record<string, unknown>,
        };
      } catch (err) {
        deps.logger.error("get_machine_iot_status failed", {
          error: (err as Error).message,
          machineId: parsed.data.machineId,
        });
        return {
          isError: true,
          content: [{ type: "text", text: `Execution error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
