import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_traceability_report",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 12,
};

export const inputSchema = z
  .object({
    batchId: z
      .string()
      .describe("Unique farm crop batch transaction identifier (e.g. batch_tea_2026_01)."),
  })
  .strict();

export function registerGetTraceabilityReport(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Get Crop Traceability Report",
      description:
        "Fetches a comprehensive farm-to-fork record of a crop batch. " +
        "Details planting, harvest, and shipping logs, and cross-checks pesticide spray histories " +
        "against FAMIC rules to certify compliance.",
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
        if (!deps.traceabilityService) {
          return {
            isError: true,
            content: [
              { type: "text", text: "Traceability service is not available on this server." },
            ],
          };
        }

        const data = await deps.traceabilityService.getTraceabilityReport(parsed.data.batchId);
        if (!data) {
          return {
            isError: true,
            content: [
              { type: "text", text: `Traceability batch ID '${parsed.data.batchId}' not found.` },
            ],
          };
        }

        const plantedStr = new Date(data.plantedAt).toLocaleDateString("ja-JP");
        const harvestedStr = data.harvestedAt
          ? new Date(data.harvestedAt).toLocaleDateString("ja-JP")
          : "Not harvested yet";
        const shippedStr = data.shippedAt
          ? new Date(data.shippedAt).toLocaleDateString("ja-JP")
          : "Not shipped yet";

        const pesticideLines =
          data.pesticidesApplied.length > 0
            ? data.pesticidesApplied
                .map(
                  (p: any) =>
                    `- ${p.name} (Applied: ${new Date(p.appliedAt).toLocaleDateString("ja-JP")}, ${p.amountG}g)`,
                )
                .join("\n")
            : "- No pesticide applications recorded.";

        const summary =
          `Traceability report for crop batch [${data.crop}] (Batch ID: ${data.batchId}):\n` +
          `- Farm ID: ${data.farmId}\n` +
          `- Planted: ${plantedStr}\n` +
          `- Harvested: ${harvestedStr}\n` +
          `- Shipped: ${shippedStr}\n\n` +
          `Pesticide spray records:\n${pesticideLines}\n\n` +
          `Safety Certification: [${data.safetyStatus}]\n` +
          `Compliance details: ${data.complianceReport}`;

        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: `Data Source: ${data.attribution}` },
          ],
          structuredContent: data as unknown as Record<string, unknown>,
        };
      } catch (err) {
        deps.logger.error("get_traceability_report failed", {
          error: (err as Error).message,
          batchId: parsed.data.batchId,
        });
        return {
          isError: true,
          content: [{ type: "text", text: `Execution error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
