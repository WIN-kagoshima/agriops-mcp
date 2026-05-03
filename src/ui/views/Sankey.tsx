/**
 * Sankey.tsx — SSW通年ローテーションフロー図 (Pure SVG)
 *
 * viz_hint: { preferredView: "sankey", flowEdges }
 */

import { useMemo } from "react";
import type { VizHintSankey } from "../../lib/viz-hint.js";

interface SankeyProps {
  hint: VizHintSankey;
  data: unknown;
}

const W = 520;
const H = 300;
const NODE_W = 120;
const NODE_H = 34;
const PAD = 24;

type FlowEdge = { from: string; to: string; weight: number; label?: string };

const PALETTE = [
  "#34d399", "#60a5fa", "#f59e0b", "#f87171",
  "#a78bfa", "#fb923c", "#38bdf8", "#4ade80",
];

export function Sankey({ hint, data }: SankeyProps) {
  const { title } = hint;

  // Edges: try hint first, then structuredContent.flowEdges
  const edges = useMemo<FlowEdge[]>(() => {
    if (hint.flowEdges?.length) return hint.flowEdges;
    const sc = data as Record<string, unknown> | null;
    const fe = sc?.flowEdges;
    if (Array.isArray(fe)) return fe as FlowEdge[];
    return [];
  }, [hint.flowEdges, data]);

  // Collect unique nodes
  const nodeSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of edges) { s.add(e.from); s.add(e.to); }
    return [...s];
  }, [edges]);

  if (edges.length === 0) {
    return <div className="viz-panel viz-empty">フローデータがありません</div>;
  }

  // Simple left→right layout: partition into source / sink layers
  const sourceSet = new Set(edges.map((e) => e.from));
  const sinkSet = new Set(edges.map((e) => e.to));
  const sourceOnly = [...sourceSet].filter((n) => !sinkSet.has(n));
  const sinkOnly = [...sinkSet].filter((n) => !sourceSet.has(n));
  const bothSets = nodeSet.filter((n) => sourceSet.has(n) && sinkSet.has(n));

  // 3-column layout: sources | middle | sinks
  const col0 = sourceOnly.length > 0 ? sourceOnly : nodeSet.slice(0, Math.ceil(nodeSet.length / 2));
  const col1 = bothSets.length > 0 ? bothSets : [];
  const col2 = sinkOnly.length > 0 ? sinkOnly : nodeSet.slice(Math.ceil(nodeSet.length / 2));

  const positions = new Map<string, { x: number; y: number }>();

  const layoutColumn = (nodes: string[], colX: number) => {
    const spacing = (H - PAD * 2) / Math.max(nodes.length, 1);
    nodes.forEach((n, i) => {
      positions.set(n, {
        x: colX,
        y: PAD + i * spacing + spacing / 2 - NODE_H / 2,
      });
    });
  };

  if (col1.length > 0) {
    layoutColumn(col0, PAD);
    layoutColumn(col1, (W - NODE_W) / 2);
    layoutColumn(col2, W - NODE_W - PAD);
  } else {
    layoutColumn(col0, PAD);
    layoutColumn(col2, W - NODE_W - PAD);
  }

  const maxWeight = Math.max(...edges.map((e) => e.weight), 1);

  return (
    <div className="viz-panel">
      {title && <div className="viz-title">{title}</div>}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* Edges */}
        {edges.map((edge, ei) => {
          const src = positions.get(edge.from);
          const dst = positions.get(edge.to);
          if (!src || !dst) return null;
          const x1 = src.x + NODE_W;
          const y1 = src.y + NODE_H / 2;
          const x2 = dst.x;
          const y2 = dst.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          const strokeW = Math.max(2, (edge.weight / maxWeight) * 14);

          return (
            <g key={ei}>
              <path
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={PALETTE[ei % PALETTE.length]}
                strokeWidth={strokeW}
                opacity={0.5}
              />
              {edge.label && (
                <text
                  x={mx}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {edge.label}
                </text>
              )}
              <text
                x={mx}
                y={(y1 + y2) / 2 + 8}
                textAnchor="middle"
                fontSize={9}
                fill="#94a3b8"
              >
                {edge.weight}名
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodeSet.map((node, ni) => {
          const pos = positions.get(node);
          if (!pos) return null;
          return (
            <g key={node}>
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={PALETTE[ni % PALETTE.length]}
                opacity={0.85}
              />
              <text
                x={pos.x + NODE_W / 2}
                y={pos.y + NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="#0f172a"
                fontWeight="600"
              >
                {node.length > 14 ? `${node.slice(0, 13)}…` : node}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
