import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "open_dashboard",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 5,
};

export const DASHBOARD_URI = "ui://agriops/dashboard.html";

const outputSchema = z.object({
  prefectureCode: z.string(),
  fieldId: z.string().nullable(),
  viewSpec: z.string().nullable(),
  attribution: z.string(),
});

export const inputSchema = z
  .object({
    initialPrefectureCode: z
      .string()
      .regex(/^JP-\d{2}$/)
      .optional()
      .describe("ISO 3166-2:JP prefecture code to focus the map on, e.g. JP-46."),
    initialFieldId: z
      .string()
      .max(64)
      .optional()
      .describe("eMAFF field ID to highlight on first render."),
    viewSpec: z
      .string()
      .max(120)
      .optional()
      .describe(
        "Optional view specification to pre-select a visualization. " +
          "Examples: 'national_labor_choropleth', 'ssw_radar:みかん', 'municipality_drill:JP-46'. " +
          "The dashboard will attempt to load the matching tool and render the appropriate view.",
      ),
  })
  .strict();

/**
 * Phase 5 entry point: opens the MCP Apps UI dashboard.
 * Phase 10 upgrade: adds `viewSpec` to pre-select a visualization view.
 *
 * On hosts that support MCP Apps the result is rendered inline as a sandboxed
 * iframe. On hosts that do not, the `content[0].text` summary plus the
 * structured snapshot are still useful: this is the official Apps fallback
 * pattern.
 */
export function registerOpenDashboard(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Open the AgriOps Strategic Dashboard",
      description:
        "Open the interactive strategic dashboard (戦略室 UI). " +
        "Supports hierarchical drill-down from national → prefecture → municipality → field, " +
        "with 8 adaptive visualizations (choropleth map, radar chart, bar compare, " +
        "time series, sankey diagram, calendar heatmap, data table). " +
        "On MCP Apps hosts (Claude, Cursor) the UI renders inline; " +
        "on hosts without MCP Apps support a structured text summary is returned. Read-only.",
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
      annotations: getToolAnnotations(meta.name),
      _meta: {
        "openai/widgetAccessible": true,
        "openai/outputTemplate": DASHBOARD_URI,
      },
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
        const initialState = {
          prefectureCode: parsed.data.initialPrefectureCode ?? "JP-46",
          fieldId: parsed.data.initialFieldId ?? null,
          viewSpec: parsed.data.viewSpec ?? null,
          attribution:
            "Map © OpenStreetMap contributors · Weather © Open-Meteo (CC-BY 4.0) · " +
            "Farmland: 農林水産省 eMAFF 筆ポリゴン · 農林業センサス2020",
        };
        const structured: z.infer<typeof outputSchema> = initialState;

        const focusDesc = parsed.data.initialPrefectureCode
          ? ` — ${parsed.data.initialPrefectureCode}`
          : "";
        const viewDesc = parsed.data.viewSpec ? ` (${parsed.data.viewSpec})` : "";

        return {
          content: [
            {
              type: "text",
              text: `Opening AgriOps strategic dashboard${focusDesc}${viewDesc}.`,
            },
            {
              type: "resource_link",
              uri: DASHBOARD_URI,
              name: "AgriOps 戦略室ダッシュボード",
              mimeType: "text/html",
            },
          ],
          structuredContent: structured as unknown as Record<string, unknown>,
          _meta: {
            "openai/outputTemplate": DASHBOARD_URI,
          },
        };
      } catch (err) {
        deps.logger.error("open_dashboard failed", { error: (err as Error).message });
        return { isError: true, content: [{ type: "text", text: safeErrorMessage(err) }] };
      }
    },
  );
}
