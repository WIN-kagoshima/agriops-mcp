/**
 * VizHint protocol — v1.10.0
 *
 * Tools embed a `viz_hint` object inside `structuredContent` to tell the
 * MCP Apps dashboard which visual component best represents their output.
 *
 * The UI's ViewDispatcher reads `viz_hint.preferredView` and routes to the
 * matching `views/<Type>.tsx` component. Hints are entirely optional — the
 * DataTable fallback is always available.
 *
 * Design principles:
 *  - Forward-compatible: unknown `preferredView` values fall back to "table".
 *  - Statically typed: `VizHint` is a discriminated union so each view type
 *    carries only the props it needs.
 *  - Zero runtime overhead: the hint is a plain JSON object.
 */

// ── Per-view payload shapes ────────────────────────────────────────────────

export interface VizHintChoropleth {
  preferredView: "choropleth";
  /** JSON key in `structuredContent` (or array items) to use as the fill metric. */
  metric: string;
  geoLevel: "nation" | "region" | "prefecture" | "city";
  title?: string;
  legend?: VizLegend;
}

export interface VizHintMapZoom {
  preferredView: "map_zoom";
  geoLevel: "prefecture" | "city" | "field";
  /** Initial centre — defaults to last selected area centroid. */
  center?: { lat: number; lng: number };
  zoom?: number;
  title?: string;
}

export interface VizHintRadar {
  preferredView: "radar";
  /**
   * Names of the 5 numeric axes, in order.
   * Each must correspond to a numeric key in the tool's `structuredContent`
   * `results[0].scores` (or a flat object if `resultsKey` is not set).
   */
  axes: [string, string, string, string, string];
  /** Key path to the nested scores object, e.g. "results.0.scores". */
  scoresPath?: string;
  /** Max value for all axes — defaults to 20. */
  axisMax?: number;
  title?: string;
}

export interface VizHintTimeSeries {
  preferredView: "timeseries";
  /** Key in each array item that holds the time / label value. */
  timeKey: string;
  /** Keys in each item to plot as separate series. */
  valueKeys: string[];
  /** Key path to the array within structuredContent (dot-notation). */
  dataPath?: string;
  title?: string;
  legend?: VizLegend;
}

export interface VizHintBarCompare {
  preferredView: "bar_compare";
  /** Key used as the row label. */
  labelKey: string;
  /** Keys to render as bars (first = primary bar). */
  valueKeys: string[];
  /** Key path to the array within structuredContent. */
  dataPath?: string;
  /** Horizontal threshold line (e.g. 75 for "A-rank and above"). */
  threshold?: number;
  title?: string;
  legend?: VizLegend;
}

export interface VizHintSankey {
  preferredView: "sankey";
  /**
   * Flow edges embedded directly in the hint (small payloads only).
   * Alternatively the dispatcher reads them from `structuredContent.flowEdges`.
   */
  flowEdges?: Array<{ from: string; to: string; weight: number; label?: string }>;
  title?: string;
}

export interface VizHintCalendarHeatmap {
  preferredView: "calendar_heatmap";
  /** Key path to a 2D matrix array: rows = items (crops/prefectures), cols = months 1-12. */
  dataPath?: string;
  /** Key for the row label. */
  rowLabelKey?: string;
  /** Max intensity value — defaults to highest value in data. */
  maxValue?: number;
  title?: string;
  legend?: VizLegend;
}

export interface VizHintTable {
  preferredView: "table";
  /** If given, only these columns (in order) are shown. */
  columns?: string[];
  /** Key path to the array to render. */
  dataPath?: string;
  title?: string;
}

export interface VizLegend {
  unit?: string;
  min?: number;
  max?: number;
  /** Colour scale bias: "warning" = amber, "danger" = red, "success" = green. */
  tone?: "warning" | "danger" | "success" | "neutral";
}

// ── Discriminated union ───────────────────────────────────────────────────

export type VizHint =
  | VizHintChoropleth
  | VizHintMapZoom
  | VizHintRadar
  | VizHintTimeSeries
  | VizHintBarCompare
  | VizHintSankey
  | VizHintCalendarHeatmap
  | VizHintTable;

export type VizHintView = VizHint["preferredView"];

// ── Helper ────────────────────────────────────────────────────────────────

/**
 * Attach a `viz_hint` to any structured-content record before returning from
 * a tool handler.
 *
 * ```ts
 * return {
 *   content: [{ type: "text", text: "…" }],
 *   structuredContent: withVizHint(myData, {
 *     preferredView: "radar",
 *     axes: ["A", "B", "C", "D", "E"],
 *   }),
 * };
 * ```
 */
export function withVizHint(data: Record<string, unknown>, hint: VizHint): Record<string, unknown> {
  return { ...data, viz_hint: hint };
}

/**
 * Extract a viz_hint from structuredContent (UI-side helper, works on
 * unknown shapes coming back from bridge.callTool).
 */
export function extractVizHint(sc: unknown): VizHint | null {
  if (!sc || typeof sc !== "object") return null;
  const hint = (sc as Record<string, unknown>).viz_hint;
  if (!hint || typeof hint !== "object") return null;
  const pv = (hint as Record<string, unknown>).preferredView;
  if (typeof pv !== "string") return null;
  return hint as VizHint;
}

/**
 * Safely resolve a dot-notation path inside an object.
 * e.g. resolvePath({ a: { b: [1,2,3] } }, "a.b") => [1,2,3]
 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return null;
    return (acc as Record<string, unknown>)[key] ?? null;
  }, obj);
}
