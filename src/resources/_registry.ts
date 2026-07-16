import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";
import { registerDashboardUiResource } from "./dashboard-ui.js";
import { registerFarmlandResourceTemplate } from "./farmland-template.js";
import { registerTaskStatusResource } from "./task-status.js";
import { TOPOJSON_RESOURCE_URIS, registerTopoJsonResources } from "./topojson-resources.js";

/**
 * MCP resources exposed by this server.
 *
 * Phase 5 introduces `ui://agriops/dashboard.html` — the MCP Apps UI resource.
 * Phase 4 introduces `tasks://{task_id}` — polling resource for background tasks.
 * Phase 10 introduces `resource://agriops/topojson/*` — TopoJSON boundary data.
 *
 * `tasks://{task_id}` is gated on `config.enableExtendedTools` (same flag as
 * the `create_task`/`get_task_status` tools, see `src/tools/_registry.ts`)
 * so the default surface never advertises a polling resource with no
 * corresponding tool to create a task in the first place.
 *
 * Phase 13 (`1.13.0`+) adds `farmland://{fude_id}` — a completable Resource
 * Template that activates the `completions` capability (see
 * `farmland-template.ts`). It is core-tier, gated only on `deps.emaff`,
 * same as `search_farmland`.
 *
 * Returns the URIs/URI templates of registered resources for Server Card consumption.
 */
export function registerAllResources(server: McpServer, deps: Deps): string[] {
  const registered: string[] = [];

  registerDashboardUiResource(server, deps);
  registered.push("ui://agriops/dashboard.html");

  if (deps.emaff) {
    registerFarmlandResourceTemplate(server, deps);
    registered.push("farmland://{fude_id}");
  }

  if (deps.config.enableExtendedTools) {
    registerTaskStatusResource(server, deps);
    registered.push("tasks://{task_id}");
  }

  registerTopoJsonResources(server, deps);
  registered.push(...TOPOJSON_RESOURCE_URIS);

  return registered;
}
