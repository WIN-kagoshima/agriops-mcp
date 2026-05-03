/**
 * CalendarHeatmap.tsx — 12ヶ月×作物のヒートマップ (Pure SVG)
 *
 * viz_hint: { preferredView: "calendar_heatmap", dataPath, rowLabelKey, maxValue }
 *
 * データ期待形式: Array of { [rowLabelKey]: string, harvestMonths?: number[], monthlyLaborIntensity?: number[] }
 */

import { useMemo } from "react";
import type { VizHintCalendarHeatmap } from "../../lib/viz-hint.js";
import { resolvePath } from "../../lib/viz-hint.js";

interface CalendarHeatmapProps {
  hint: VizHintCalendarHeatmap;
  data: unknown;
}

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const CELL_W = 30;
const CELL_H = 22;
const LABEL_W = 130;
const PAD = 14;
const HEADER_H = 24;

function intensityToColor(value: number, max: number, tone: string): string {
  const t = Math.min(value / max, 1);
  if (tone === "danger") {
    const r = Math.round(255 * t + 30 * (1 - t));
    const g = Math.round(71 * t + 30 * (1 - t));
    const b = Math.round(71 * t + 30 * (1 - t));
    return `rgb(${r},${g},${b})`;
  }
  if (tone === "success") {
    const r = Math.round(52 * t + 20 * (1 - t));
    const g = Math.round(211 * t + 30 * (1 - t));
    const b = Math.round(153 * t + 40 * (1 - t));
    return `rgb(${r},${g},${b})`;
  }
  // warning (amber)
  const r = Math.round(245 * t + 30 * (1 - t));
  const g = Math.round(158 * t + 30 * (1 - t));
  const b = Math.round(11 * t + 20 * (1 - t));
  return `rgb(${r},${g},${b})`;
}

export function CalendarHeatmap({ hint, data }: CalendarHeatmapProps) {
  const { dataPath, rowLabelKey = "crop", maxValue, title, legend } = hint;
  const tone = legend?.tone ?? "warning";

  const rows = useMemo<Record<string, unknown>[]>(() => {
    const src = dataPath ? resolvePath(data, dataPath) : data;
    if (!Array.isArray(src)) return [];
    return (src as Record<string, unknown>[]).slice(0, 16);
  }, [data, dataPath]);

  // Build intensity matrix: rows × 12 months
  const matrix = useMemo<number[][]>(() => {
    return rows.map((row) => {
      // Try monthlyLaborIntensity (12-element array)
      const mli = row.monthlyLaborIntensity;
      if (Array.isArray(mli) && mli.length === 12) {
        return mli.map(Number);
      }
      // Fall back: harvestMonths => binary 0/1
      const hm = row.harvestMonths;
      if (Array.isArray(hm)) {
        return Array.from({ length: 12 }, (_, i) => (hm.includes(i + 1) ? 5 : 0));
      }
      return Array(12).fill(0);
    });
  }, [rows]);

  const max = useMemo(() => {
    if (maxValue) return maxValue;
    let m = 1;
    for (const row of matrix) for (const v of row) if (v > m) m = v;
    return m;
  }, [matrix, maxValue]);

  const W = LABEL_W + CELL_W * 12 + PAD * 2;
  const H = HEADER_H + rows.length * CELL_H + PAD * 2 + 20;

  if (rows.length === 0) {
    return <div className="viz-panel viz-empty">データがありません</div>;
  }

  return (
    <div className="viz-panel">
      {title && <div className="viz-title">{title}</div>}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Month header */}
        {MONTHS.map((m, mi) => (
          <text
            key={m}
            x={LABEL_W + PAD + mi * CELL_W + CELL_W / 2}
            y={PAD + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
          >
            {m}月
          </text>
        ))}

        {/* Row label + cells */}
        {rows.map((row, ri) => {
          const label = String(row[rowLabelKey] ?? `Row ${ri + 1}`);
          const y = PAD + HEADER_H + ri * CELL_H;
          return (
            <g key={ri}>
              <text
                x={LABEL_W - 6}
                y={y + CELL_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="#e2e8f0"
              >
                {label.length > 14 ? `${label.slice(0, 13)}…` : label}
              </text>
              {matrix[ri]?.map((val, mi) => (
                <rect
                  key={mi}
                  x={LABEL_W + PAD + mi * CELL_W + 1}
                  y={y + 2}
                  width={CELL_W - 2}
                  height={CELL_H - 4}
                  rx={3}
                  fill={val > 0 ? intensityToColor(val, max, tone) : "rgba(255,255,255,0.05)"}
                  opacity={0.9}
                />
              ))}
            </g>
          );
        })}

        {/* Color scale legend */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const x = LABEL_W + PAD + i * ((CELL_W * 12) / 4.0);
          return (
            <g key={i}>
              <rect
                x={x}
                y={H - 20}
                width={CELL_W * 2.5}
                height={10}
                fill={intensityToColor(t * max, max, tone)}
                rx={2}
              />
            </g>
          );
        })}
        <text x={LABEL_W + PAD} y={H - 4} fontSize={9} fill="#64748b">
          低強度
        </text>
        <text x={W - PAD} y={H - 4} textAnchor="end" fontSize={9} fill="#64748b">
          高強度
        </text>
      </svg>
    </div>
  );
}
