import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "create_task",
  sideEffect: "mutating",
  visibility: "model",
  introducedInPhase: 4,
};

/**
 * Built-in task kinds that the server can execute asynchronously.
 *
 * Add new kinds here and implement the corresponding `runTask` branch below.
 * Each kind should complete within the Cloud Run request timeout (60 s default)
 * or hand off to Cloud Tasks / Pub/Sub for truly long-running work.
 */
const TASK_KINDS = ["echo", "area_summary_async"] as const;
type TaskKind = (typeof TASK_KINDS)[number];

export const inputSchema = z
  .object({
    kind: z
      .enum(TASK_KINDS)
      .describe(
        'Kind of background work to run. "echo" returns the args after a short delay and ' +
          'is useful for testing the task lifecycle. "area_summary_async" runs an area summary ' +
          "for the given prefecture/city codes asynchronously.",
      ),
    args: z
      .record(z.unknown())
      .optional()
      .describe("Kind-specific arguments passed verbatim to the task handler."),
  })
  .strict();

export type CreateTaskInput = z.infer<typeof inputSchema>;

export function registerCreateTask(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Create background task",
      description:
        "Creates a long-running background task and returns a task_id immediately. " +
        "Poll `tasks://{task_id}` or call `get_task_status` with the returned ID to check progress. " +
        "Useful for work that might exceed a single tool-call timeout (e.g. bulk analysis, " +
        "snapshot audits). Mutating: creates a task record in the server's task store.",
      inputSchema: inputSchema.shape,
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

      const { kind, args } = parsed.data;
      const task = deps.taskStore.create(kind);

      // Kick off the work in the background (non-blocking).
      runTask(task.id, kind, args ?? {}, deps).catch((err) => {
        deps.logger.error("Background task failed", { taskId: task.id, kind, error: String(err) });
      });

      return {
        content: [
          {
            type: "text",
            text: [
              `Task created: id=${task.id}, kind=${kind}, status=pending.`,
              `Poll with: get_task_status({ task_id: "${task.id}" })`,
              `Or read resource: tasks://${task.id}`,
            ].join("\n"),
          },
        ],
        structuredContent: {
          task_id: task.id,
          kind,
          status: task.status,
          poll_resource: `tasks://${task.id}`,
          created_at: task.createdAt,
        } as Record<string, unknown>,
      };
    },
  );
}

/**
 * Dispatcher: runs the appropriate handler for each task kind.
 * Called asynchronously — errors are caught by the caller.
 */
async function runTask(
  taskId: string,
  kind: TaskKind,
  args: Record<string, unknown>,
  deps: Deps,
): Promise<void> {
  const store = deps.taskStore;
  if (!store) return;

  store.update(taskId, { status: "running" });

  try {
    let result: unknown;

    if (kind === "echo") {
      // Minimal delay so callers can observe the pending → running → done transition.
      const delayMs = typeof args.delay_ms === "number" ? Math.min(args.delay_ms, 5000) : 200;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      result = { echoed: args, delay_ms: delayMs };
    } else if (kind === "area_summary_async") {
      if (!deps.emaff) {
        throw new Error("eMAFF adapter is not available — cannot run area_summary_async.");
      }
      result = await deps.emaff.areaSummary({
        prefectureCode: typeof args.prefecture_code === "string" ? args.prefecture_code : undefined,
        cityCode: typeof args.city_code === "string" ? args.city_code : undefined,
      });
    } else {
      const _exhaustive: never = kind;
      throw new Error(`Unknown task kind: ${String(_exhaustive)}`);
    }

    store.update(taskId, { status: "done", result });
  } catch (err) {
    store.update(taskId, { status: "error", error: safeErrorMessage(err) });
  }
}
