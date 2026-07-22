/**
 * "Take the current view home as CSV" — client-side only, no extra tool
 * call. Flattens whatever array/object the dashboard is currently
 * rendering (the same `dataPath` resolution `DataTable.tsx` uses) into a
 * CSV string using the same `toCsv` serialiser the server-side tools use
 * for their embedded CSV artifacts (see src/lib/artifacts.ts).
 */

import { toCsv } from "../lib/csv.js";
import { type VizHint, resolvePath } from "../lib/viz-hint.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cellValue(v: unknown): string | number {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number;
}

/** Returns `null` when there is nothing tabular to export (e.g. no data loaded yet). */
export function buildCsvFromView(hint: VizHint | null, data: unknown): string | null {
  const dataPath = hint && "dataPath" in hint ? hint.dataPath : undefined;
  const src = dataPath ? resolvePath(data, dataPath) : data;

  let rows: Record<string, unknown>[];
  if (Array.isArray(src)) {
    rows = src.filter(isPlainObject);
  } else if (isPlainObject(src)) {
    rows = [src];
  } else {
    return null;
  }
  if (rows.length === 0) return null;

  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!k.startsWith("_") && k !== "viz_hint") keys.add(k);
    }
  }
  const header = [...keys];
  if (header.length === 0) return null;

  return toCsv(
    header,
    rows.map((row) => header.map((k) => cellValue(row[k]))),
  );
}

/**
 * Trigger a browser download for the given CSV text. Most MCP Apps hosts
 * run the dashboard in a lightly-sandboxed iframe where an anchor-click
 * download works; on hosts that block it silently, callers should also
 * offer the copy-to-clipboard fallback (see Dashboard.tsx) — per the
 * "Interoperability over optimization" design principle, every capability
 * needs a working fallback.
 */
export function triggerCsvDownload(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
