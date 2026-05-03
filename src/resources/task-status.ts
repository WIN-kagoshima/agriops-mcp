import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";

/**
 * Register a dynamic MCP resource template so clients can read task state
 * via a URI rather than calling the `get_task_status` tool.
 *
 * URI scheme: `tasks://{task_id}`
 *
 * Uses the SDK's `registerResource` overload that accepts a `ResourceTemplate`
 * for parameterised URIs. The callback receives `(uri, variables)` where
 * `variables.task_id` is the extracted path segment.
 */
export function registerTaskStatusResource(server: McpServer, deps: Deps): void {
  const template = new ResourceTemplate("tasks://{task_id}", {
    list: () => ({
      resources: (deps.taskStore?.list() ?? []).map((t) => ({
        uri: `tasks://${t.id}`,
        name: `Task ${t.id} (${t.kind} / ${t.status})`,
        mimeType: "application/json",
      })),
    }),
  });

  server.registerResource(
    "task-status",
    template,
    {
      title: "Background task status",
      description:
        "Returns the current status and result of a background task created by `create_task`. " +
          "Content is JSON: { id, kind, status, created_at, updated_at, result?, error? }. " +
          "Poll this resource until status is 'done' or 'error'.",
      mimeType: "application/json",
    },
    async (_uri, variables) => {
      const taskId = String(variables["task_id"] ?? "");
      const task = deps.taskStore?.get(taskId);

      if (!task) {
        return {
          contents: [
            {
              uri: `tasks://${taskId}`,
              mimeType: "application/json",
              text: JSON.stringify({ error: "task_not_found", task_id: taskId }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: `tasks://${taskId}`,
            mimeType: "application/json",
            text: JSON.stringify({
              id: task.id,
              kind: task.kind,
              status: task.status,
              created_at: task.createdAt,
              updated_at: task.updatedAt,
              result: task.result ?? null,
              error: task.error ?? null,
            }),
          },
        ],
      };
    },
  );
}
