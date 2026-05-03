import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";
import { registerDashboardUiResource } from "./dashboard-ui.js";
import { registerTaskStatusResource } from "./task-status.js";
import {
  TOPOJSON_RESOURCE_URIS,
  registerTopoJsonResources,
} from "./topojson-resources.js";

/**
 * MCP resources exposed by this server.
 *
 * Phase 5 introduces `ui://agriops/dashboard.html` — the MCP Apps UI resource.
 * Phase 4 introduces `tasks://{task_id}` — polling resource for background tasks.
 * Phase 10 introduces `resource://agriops/topojson/*` — TopoJSON boundary data.
 *
 * Returns the URIs/URI templates of registered resources for Server Card consumption.
 */
export function registerAllResources(server: McpServer, deps: Deps): string[] {
  registerDashboardUiResource(server, deps);
  registerTaskStatusResource(server, deps);
  registerTopoJsonResources(server, deps);
  return ["ui://agriops/dashboard.html", "tasks://{task_id}", ...TOPOJSON_RESOURCE_URIS];
}
