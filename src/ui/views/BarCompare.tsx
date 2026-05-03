/**
 * BarCompare.tsx — 横棒比較グラフ (Pure SVG)
 *
 * viz_hint: { preferredView: "bar_compare", labelKey, valueKeys, dataPath, threshold }
 */

import { useMemo } from "react";
import type { VizHintBarCompare } from "../../lib/viz-hint.js";
import { resolvePath } from "../../lib/viz-hint.js";

interface BarCompareProps {
  hint: VizHintBarCompare;
  data: unknown;
}

const W = 520;
const BAR_H = 22;
const BAR_GAP = 6;
const LABEL_W = 140;
const VALUE_W = 42;
const PAD = 16;

const COLOURS = ["#34d399", "#60a5fa", "#f59e0b", "#f87171"];

export function BarCompare({ hint, data }: BarCompareProps) {
  const { labelKey, valueKeys, dataPath, threshold, title, legend } = hint;

  const rows = useMemo<Record<string, unknown>[]>(() => {
    const src = dataPath ? resolvePath(data, dataPath) : data;
    if (!Array.isArray(src)) return [];
    return src as Record<string, unknown>[];
  }, [data, dataPath]);

  const maxVal = useMemo(() => {
    let m = legend?.max ?? 0;
    for (const row of rows) {
      for (const k of valueKeys) {
        const v = row[k];
        if (typeof v === "number" && v > m) m = v;
      }
    }
    return m || 1;
  }, [rows, valueKeys, legend]);

  const BAR_W = W - LABEL_W - VALUE_W - PAD * 2;
  const svgH = PAD * 2 + rows.length * (BAR_H * valueKeys.length + BAR_GAP) + 24;

  if (rows.length === 0) {
    return <div className="viz-panel viz-empty">データがありません</div>;
  }

  return (
    <div className="viz-panel">
      {title && <div className="viz-title">{title}</div>}
      {/* Legend */}
      {valueKeys.length > 1 && (
        <div className="viz-legend">
          {valueKeys.map((k, i) => (
            <span key={k} style={{ color: COLOURS[i], marginRight: 12, fontSize: 11 }}>
              ■ {k}
            </span>
          ))}
        </div>
      )}
      <svg width={W} height={svgH} viewBox={`0 0 ${W} ${svgH}`} style={{ display: "block" }}>
        {/* Threshold line */}
        {threshold != null && (
          <>
            <line
              x1={LABEL_W + (threshold / maxVal) * BAR_W}
              y1={PAD}
              x2={LABEL_W + (threshold / maxVal) * BAR_W}
              y2={svgH - PAD}
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="4,3"
            />
            <text
              x={LABEL_W + (threshold / maxVal) * BAR_W + 3}
              y={PAD + 10}
              fontSize={9}
              fill="#f59e0b"
            >
              {threshold}
            </text>
          </>
        )}

        {rows.map((row, ri) => {
          const label = String(row[labelKey] ?? "");
          const y = PAD + ri * (BAR_H * valueKeys.length + BAR_GAP);

          return (
            <g key={ri}>
              {/* Row label */}
              <text
                x={LABEL_W - 6}
                y={y + (BAR_H * valueKeys.length) / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="#e2e8f0"
              >
                {label.length > 14 ? `${label.slice(0, 13)}…` : label}
              </text>

              {valueKeys.map((k, ki) => {
                const val = typeof row[k] === "number" ? (row[k] as number) : 0;
                const barW = (val / maxVal) * BAR_W;
                const by = y + ki * BAR_H;
                const isAboveThreshold = threshold != null && val >= threshold;

                return (
                  <g key={k}>
                    {/* Background track */}
                    <rect
                      x={LABEL_W}
                      y={by + 2}
                      width={BAR_W}
                      height={BAR_H - 6}
                      fill="rgba(255,255,255,0.07)"
                      rx={3}
                    />
                    {/* Data bar */}
                    <rect
                      x={LABEL_W}
                      y={by + 2}
                      width={Math.max(barW, 2)}
                      height={BAR_H - 6}
                      fill={isAboveThreshold ? "#34d399" : COLOURS[ki]}
                      rx={3}
                      opacity={0.85}
                    />
                    {/* Value label */}
                    <text
                      x={LABEL_W + barW + 4}
                      y={by + BAR_H / 2}
                      dominantBaseline="middle"
                      fontSize={10}
                      fill="#94a3b8"
                    >
                      {val % 1 === 0 ? val : val.toFixed(1)}
                      {legend?.unit}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
