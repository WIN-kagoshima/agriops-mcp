/**
 * fetch_topojson_resource — app-only helper
 *
 * Serves TopoJSON boundary data to the UI by reading the assets/topojson/ files.
 * Exposed as an app-only tool (invisible to the LLM) so the dashboard can call it
 * via bridge.callTool("fetch_topojson_resource", { uri }).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../../server/deps.js";
import { registerAppOnlyTool } from "./_helpers.js";

const ASSETS_DIR = join(fileURLToPath(import.meta.url), "../../../../assets/topojson");

const URI_TO_FILE: Record<string, string> = {
  "resource://agriops/topojson/japan-prefectures": "japan-prefectures.topo.json",
  "resource://agriops/topojson/kyushu-municipalities": "kyushu-municipalities.topo.json",
  "resource://agriops/topojson/shikoku-municipalities": "shikoku-municipalities.topo.json",
  "resource://agriops/topojson/tokai-kinki-chugoku-municipalities": "tokai-kinki-chugoku-municipalities.topo.json",
};

const inputSchema = z.object({ uri: z.string() }).strict();

export function registerFetchTopoJsonResource(server: McpServer, deps: Deps): void {
  registerAppOnlyTool(
    server,
    "fetch_topojson_resource",
    {
      title: "Fetch TopoJSON boundary resource for dashboard map rendering",
      description: "Returns TopoJSON boundary data as text for use by the dashboard map. App-only (LLM-invisible).",
      inputSchema,
      deps,
    },
    async (args) => {
      const file = URI_TO_FILE[args.uri];
      if (!file) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown URI: ${args.uri}` }],
        };
      }
      try {
        const text = readFileSync(join(ASSETS_DIR, file), "utf-8");
        return { content: [{ type: "text", text }] };
      } catch {
        const notBuilt = JSON.stringify({
          status: "not_built",
          message: "TopoJSON file not found. Run: node scripts/build-topojson.mjs",
          uri: args.uri,
        });
        return { content: [{ type: "text", text: notBuilt }] };
      }
    },
  );
}
