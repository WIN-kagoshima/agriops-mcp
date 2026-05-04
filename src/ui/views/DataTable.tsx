/**
 * DataTable.tsx — ソート可能テーブル (フォールバック / 汎用)
 *
 * viz_hint: { preferredView: "table", columns?, dataPath? }
 */

import { useMemo, useState } from "react";
import type { VizHintTable } from "../../lib/viz-hint.js";
import { resolvePath } from "../../lib/viz-hint.js";

interface DataTableProps {
  hint: VizHintTable;
  data: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function DataTable({ hint, data }: DataTableProps) {
  const { columns, dataPath, title } = hint;
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo<Record<string, unknown>[]>(() => {
    const src = dataPath ? resolvePath(data, dataPath) : data;
    if (!Array.isArray(src)) {
      if (isPlainObject(src)) return [src as Record<string, unknown>];
      return [];
    }
    return (src as unknown[]).filter(isPlainObject) as Record<string, unknown>[];
  }, [data, dataPath]);

  const keys = useMemo(() => {
    if (columns?.length) return columns;
    const s = new Set<string>();
    for (const row of rows.slice(0, 10)) {
      for (const k of Object.keys(row)) s.add(k);
    }
    // Exclude internal / very long keys
    return [...s].filter((k) => !k.startsWith("_") && k !== "viz_hint").slice(0, 12);
  }, [rows, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va ?? "").localeCompare(String(vb ?? ""))
        : String(vb ?? "").localeCompare(String(va ?? ""));
    });
  }, [rows, sortKey, sortAsc]);

  if (sorted.length === 0) {
    return <div className="viz-panel viz-empty">データがありません</div>;
  }

  const handleSort = (k: string) => {
    if (sortKey === k) setSortAsc((p) => !p);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  };

  const fmt = (v: unknown): string => {
    if (v == null) return "—";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "number") return v % 1 === 0 ? v.toLocaleString() : v.toFixed(2);
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="viz-panel">
      {title && <div className="viz-title">{title}</div>}
      <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              {keys.map((k) => (
                <th
                  key={k}
                  onClick={() => handleSort(k)}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  {k}
                  {sortKey === k ? (sortAsc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((row, ri) => (
              <tr key={ri}>
                {keys.map((k) => (
                  <td key={k}>{fmt(row[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > 200 && (
          <div style={{ textAlign: "center", padding: 8, fontSize: 11, color: "#64748b" }}>
            {sorted.length - 200} 行以上の行を省略しました
          </div>
        )}
      </div>
    </div>
  );
}
