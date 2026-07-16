import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Deps } from "../server/deps.js";

/**
 * Read-only Resource Template for a single eMAFF farmland polygon.
 *
 * URI scheme: `farmland://{fude_id}`
 *
 * This is the primary vehicle for the Completion primitive (MCP Spec
 * 2025-11-25 §6.11 / `completions` capability): registering a `complete`
 * callback for the `fude_id` variable is enough for the SDK to
 * auto-negotiate the `completions` capability and wire the
 * `completion/complete` request handler — no manual capability
 * declaration in `create-server.ts` is needed or wanted (declaring the
 * capability without a completer would be a false capability claim).
 *
 * Gated on `deps.emaff` like the other eMAFF-backed tools; this is core
 * surface (not extended-tier) because `search_farmland` — which returns the
 * `fieldId`s this template resolves — is itself core-tier.
 */
export function registerFarmlandResourceTemplate(server: McpServer, deps: Deps): void {
  if (!deps.emaff) return;
  const emaff = deps.emaff;

  const template = new ResourceTemplate("farmland://{fude_id}", {
    // Enumerating every farmland polygon is not practical (hundreds of
    // thousands of rows); clients discover IDs via `search_farmland` /
    // `nearby_farms` first, then resolve one via completion or a direct read.
    list: undefined,
    complete: {
      fude_id: async (value: string) => {
        const result = await emaff.search({ query: value || undefined, limit: 10 });
        return result.fields.map((f) => f.fieldId);
      },
    },
  });

  server.registerResource(
    "farmland",
    template,
    {
      title: "eMAFF farmland polygon by ID",
      description:
        "Read a single farmland (eMAFF Fude) polygon by its `fieldId`. Content is the same JSON shape as one " +
        "entry in `search_farmland`'s `structuredContent.fields`. Use `search_farmland` or `nearby_farms` first " +
        "to discover a `fieldId`, or rely on client-side completion on this template's `fude_id` variable.",
      mimeType: "application/json",
    },
    async (_uri, variables) => {
      const fudeId = String(variables.fude_id ?? "");
      const field = await emaff.get(fudeId);

      if (!field) {
        return {
          contents: [
            {
              uri: `farmland://${fudeId}`,
              mimeType: "application/json",
              text: JSON.stringify({ error: "farmland_not_found", fude_id: fudeId }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: `farmland://${fudeId}`,
            mimeType: "application/json",
            text: JSON.stringify(field),
          },
        ],
      };
    },
  );
}
