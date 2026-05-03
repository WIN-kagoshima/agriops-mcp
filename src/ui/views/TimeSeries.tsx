/**
 * TimeSeries.tsx — 折れ線/エリアチャート (Pure SVG)
 *
 * viz_hint: { preferredView: "timeseries", timeKey, valueKeys, dataPath }
 */

import { useMemo } from "react";
import type { VizHintTimeSeries } from "../../lib/viz-hint.js";
import { resolvePath } from "../../lib/viz-hint.js";

interface TimeSeriesProps {
  hint: VizHintTimeSeries;
  data: unknown;
}

const W = 520;
const H = 220;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 28;
const PAD_B = 36;
const CHART_W = W - PAD_L - PAD_R;
const CHART_H = H - PAD_T - PAD_B;

const COLOURS = ["#34d399", "#60a5fa", "#f59e0b"];

export function TimeSeries({ hint, data }: TimeSeriesProps) {
  const { timeKey, valueKeys, dataPath, title, legend } = hint;

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

  const minVal = legend?.min ?? 0;
  const range = maxVal - minVal || 1;

  if (rows.length === 0) {
    return <div className="viz-panel viz-empty">データがありません</div>;
  }

  const xStep = rows.length > 1 ? CHART_W / (rows.length - 1) : CHART_W;
  const toX = (i: number) => PAD_L + i * xStep;
  const toY = (v: number) => PAD_T + CHART_H - ((v - minVal) / range) * CHART_H;

  return (
    <div className="viz-panel">
      {title && <div className="viz-title">{title}</div>}
      <div className="viz-legend">
        {valueKeys.map((k, i) => (
          <span key={k} style={{ color: COLOURS[i], marginRight: 12, fontSize: 11 }}>
            ■ {k}
          </span>
        ))}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Y axis grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD_T + CHART_H * (1 - t);
          const val = minVal + t * range;
          return (
            <g key={t}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(255,255,255,0.1)" />
              <text x={PAD_L - 4} y={y} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="#64748b">
                {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Area fills + lines */}
        {valueKeys.map((k, ki) => {
          const points: [number, number][] = rows.map((row, i) => {
            const v = typeof row[k] === "number" ? (row[k] as number) : 0;
            return [toX(i), toY(v)];
          });
          const pathD = points
            .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
            .join(" ");
          const areaD =
            `${pathD} L${toX(rows.length - 1).toFixed(1)},${(PAD_T + CHART_H).toFixed(1)}` +
            ` L${PAD_L.toFixed(1)},${(PAD_T + CHART_H).toFixed(1)} Z`;

          return (
            <g key={k}>
              <path d={areaD} fill={COLOURS[ki]} opacity={0.08} />
              <path d={pathD} fill="none" stroke={COLOURS[ki]} strokeWidth={2} />
              {points.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3} fill={COLOURS[ki]} />
              ))}
            </g>
          );
        })}

        {/* X axis labels */}
        {rows.map((row, i) => {
          const label = String(row[timeKey] ?? i + 1);
          return (
            <text
              key={i}
              x={toX(i)}
              y={PAD_T + CHART_H + 14}
              textAnchor="middle"
              fontSize={10}
              fill="#64748b"
            >
              {label}
            </text>
          );
        })}

        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CHART_H} stroke="#475569" strokeWidth={1} />
        <line x1={PAD_L} y1={PAD_T + CHART_H} x2={W - PAD_R} y2={PAD_T + CHART_H} stroke="#475569" strokeWidth={1} />

        {/* Unit label */}
        {legend?.unit && (
          <text x={PAD_L - 6} y={PAD_T - 8} textAnchor="end" fontSize={9} fill="#64748b">
            {legend.unit}
          </text>
        )}
      </svg>
    </div>
  );
}
