import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_task_status",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 4,
};

export const inputSchema = z
  .object({
    task_id: z.string().uuid().describe("UUID returned by create_task."),
  })
  .strict();

const outputSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  status: z.enum(["pending", "running", "done", "error"]),
  created_at: z.string(),
  updated_at: z.string(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});

export function registerGetTaskStatus(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Get task status",
      description:
        "Returns the current status of a background task created by `create_task`. " +
        "Statuses: pending → running → done | error. " +
        "When `done`, `structuredContent.result` contains the task output. " +
        "When `error`, `structuredContent.error` contains the failure message. " +
        "Read-only and idempotent; safe to poll repeatedly.",
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        const reason = parsed.error.issues[0]?.message ?? "invalid input";
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid input: ${reason}` }],
        };
      }

      if (!deps.taskStore) {
        return {
          isError: true,
          content: [{ type: "text", text: "Task store is not configured on this server." }],
        };
      }

      const task = deps.taskStore.get(parsed.data.task_id);
      if (!task) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Task not found: ${parsed.data.task_id}. Tasks are ephemeral and lost on server restart.`,
            },
          ],
        };
      }

      const lines = [
        `Task ${task.id}: kind=${task.kind}, status=${task.status}`,
        `Created: ${task.createdAt}  Updated: ${task.updatedAt}`,
      ];
      if (task.status === "error") lines.push(`Error: ${task.error}`);
      if (task.status === "done") lines.push("Result available in structuredContent.result");

      const structured: z.infer<typeof outputSchema> = {
        id: task.id,
        kind: task.kind,
        status: task.status as "pending" | "running" | "done" | "error",
        created_at: task.createdAt,
        updated_at: task.updatedAt,
        result: task.result ?? null,
        error: task.error ?? null,
      };
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: structured as unknown as Record<string, unknown>,
      };
    },
  );
}
