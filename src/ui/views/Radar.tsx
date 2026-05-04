/**
 * Radar.tsx — 5軸ペンタゴンレーダーチャート (Pure SVG, no external deps)
 *
 * viz_hint: { preferredView: "radar", axes: [...5], scoresPath, axisMax }
 */

import { useMemo } from "react";
import type { VizHintRadar } from "../../lib/viz-hint.js";
import { resolvePath } from "../../lib/viz-hint.js";

interface RadarProps {
  hint: VizHintRadar;
  data: unknown;
}

const W = 320;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R = 120;
const INNER_TICKS = 4;

/** Convert polar (angle in radians, radius) to Cartesian from center. */
function polar(angle: number, r: number): [number, number] {
  return [CX + r * Math.sin(angle), CY - r * Math.cos(angle)];
}

/** Build an SVG polygon points string from array of [x,y]. */
function pts(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function Radar({ hint, data }: RadarProps) {
  const { axes, scoresPath, axisMax = 20, title } = hint;
  const n = axes.length;
  const step = (2 * Math.PI) / n;

  // Resolve the scores object from scoresPath
  const scoresObj = useMemo<Record<string, number> | null>(() => {
    if (!scoresPath) return null;
    const resolved = resolvePath(data, scoresPath);
    if (!resolved || typeof resolved !== "object") return null;
    return resolved as Record<string, number>;
  }, [data, scoresPath]);

  // Map Japanese axis names to score keys (best-effort heuristic)
  const axisKeyMap: Record<string, string[]> = {
    自動化困難度: ["automationResistance"],
    価値密度: ["valueDensity"],
    季節集中度: ["seasonalConcentration"],
    技能習得速度: ["skillAcquisitionSpeed"],
    労働力不足度: ["laborShortageLevel"],
    "農業就業人口(千人)": ["agriWorkers2020"],
    "経営体数(百)": ["farmBodies2020"],
    SSWスコア: ["topSswScore"],
    "5年減少率逆数": ["changeRate5yr"],
    主要作物数: ["mainCrops"],
  };

  const values: number[] = axes.map((axisName) => {
    if (!scoresObj) return 0;
    const candidates = axisKeyMap[axisName] ?? [];
    for (const k of candidates) {
      const v = scoresObj[k];
      if (typeof v === "number") return v;
    }
    // Try the axis name directly as a key
    const direct = scoresObj[axisName];
    if (typeof direct === "number") return direct;
    return 0;
  });

  // Build axis endpoints
  const axisPoints: [number, number][] = axes.map((_, i) => polar(i * step, R));

  // Build concentric tick polygons
  const ticks = Array.from({ length: INNER_TICKS }, (_, i) => {
    const r = (R * (i + 1)) / INNER_TICKS;
    return axes.map((_, j) => polar(j * step, r));
  });

  // Build data polygon
  const dataPoints: [number, number][] = values.map((v, i) => {
    const ratio = Math.min(v / axisMax, 1);
    return polar(i * step, ratio * R);
  });

  return (
    <div className="viz-panel">
      {title && <div className="viz-title">{title}</div>}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", margin: "0 auto" }}
      >
        {/* Background ticks */}
        {ticks.map((tickPts, ti) => (
          <polygon
            key={ti}
            points={pts(tickPts)}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />
        ))}

        {/* Axis lines */}
        {axisPoints.map(([x, y], i) => (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        ))}

        {/* Data polygon fill */}
        <polygon
          points={pts(dataPoints)}
          fill="rgba(52, 211, 153, 0.25)"
          stroke="#34d399"
          strokeWidth={2}
        />

        {/* Data points */}
        {dataPoints.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill="#34d399" />
        ))}

        {/* Axis labels */}
        {axisPoints.map(([x, y], i) => {
          const dx = x - CX;
          const dy = y - CY;
          const lx = CX + (dx / R) * (R + 22);
          const ly = CY + (dy / R) * (R + 22);
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#e2e8f0"
            >
              {axes[i]}
            </text>
          );
        })}

        {/* Score labels on data points */}
        {dataPoints.map(([x, y], i) => (
          <text
            key={`score-${i}`}
            x={x}
            y={y - 8}
            textAnchor="middle"
            fontSize={9}
            fill="#34d399"
            fontWeight="bold"
          >
            {values[i]}
          </text>
        ))}

        {/* Center dot */}
        <circle cx={CX} cy={CY} r={3} fill="rgba(255,255,255,0.4)" />
      </svg>
    </div>
  );
}
