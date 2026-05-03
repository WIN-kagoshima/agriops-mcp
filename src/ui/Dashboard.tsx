/**
 * Dashboard.tsx — 戦略室 UI 2.0 (v1.10.0)
 *
 * シェル + Breadcrumb + ViewDispatcher で構成される。
 * ツールの structuredContent に viz_hint があれば最適ビューが自動選択され、
 * 国 → 都道府県 → 市町村 → 圃場 のドリルダウンに対応する。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BreadcrumbItem } from "./breadcrumb/Breadcrumb.js";
import { Breadcrumb } from "./breadcrumb/Breadcrumb.js";
import type { ToolResult } from "./useAppBridge.js";
import { useAppBridge } from "./useAppBridge.js";
import { ViewDispatcher } from "./views/_dispatch.js";
import { extractVizHint, type VizHint } from "../lib/viz-hint.js";

// ── State shape ────────────────────────────────────────────────────────────

interface DashboardState {
  prefectureCode: string;
  cityCode: string | null;
  fieldId: string | null;
  /** The viz_hint from the last tool result */
  vizHint: VizHint | null;
  /** Raw structuredContent from the last tool result */
  vizData: unknown;
  /** Human-readable summary text */
  summaryText: string;
  /** view_spec forwarded from open_dashboard */
  viewSpec?: string;
}

const INITIAL: DashboardState = {
  prefectureCode: "JP-46",
  cityCode: null,
  fieldId: null,
  vizHint: null,
  vizData: null,
  summaryText: "",
};

// Prefecture name lookup
const PREF_NAMES: Record<string, string> = {
  "JP-40": "福岡", "JP-41": "佐賀", "JP-42": "長崎", "JP-43": "熊本",
  "JP-44": "大分", "JP-45": "宮崎", "JP-46": "鹿児島", "JP-47": "沖縄",
  "JP-36": "徳島", "JP-37": "香川", "JP-38": "愛媛", "JP-39": "高知",
  "JP-21": "岐阜", "JP-23": "愛知", "JP-24": "三重",
  "JP-29": "奈良", "JP-30": "和歌山",
  "JP-33": "岡山", "JP-34": "広島", "JP-35": "山口",
};

// Prefecture selector options (Sugu-kuru zones)
const PREF_OPTIONS = [
  { code: "JP-46", name: "鹿児島" }, { code: "JP-45", name: "宮崎" },
  { code: "JP-43", name: "熊本" }, { code: "JP-44", name: "大分" },
  { code: "JP-40", name: "福岡" }, { code: "JP-41", name: "佐賀" },
  { code: "JP-42", name: "長崎" }, { code: "JP-38", name: "愛媛" },
  { code: "JP-36", name: "徳島" }, { code: "JP-39", name: "高知" },
  { code: "JP-37", name: "香川" }, { code: "JP-23", name: "愛知" },
  { code: "JP-21", name: "岐阜" }, { code: "JP-24", name: "三重" },
  { code: "JP-30", name: "和歌山" }, { code: "JP-29", name: "奈良" },
  { code: "JP-33", name: "岡山" }, { code: "JP-34", name: "広島" },
  { code: "JP-35", name: "山口" },
];

// Quick actions for navigation
const QUICK_ACTIONS = [
  { label: "全国コロプレス", tool: "get_labor_shortage_stats", args: { prefectureCode: "JP-00" } },
  { label: "SSW適性スコア", tool: "get_ssw_crop_compatibility", args: { crop: "all" } },
  { label: "畜産マップ", tool: "get_livestock_regional_stats", args: { prefectureCode: "JP-46" } },
  { label: "市場価格", tool: "get_market_price", args: { crop: "みかん" } },
];

export function Dashboard() {
  const bridge = useAppBridge<DashboardState>(INITIAL);
  const { state, setState, callTool, hasHost } = bridge;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { label: "全国", level: "nation" },
  ]);
  const lastCallRef = useRef<string>("");

  // ── Tool call helper ────────────────────────────────────────────────────

  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const key = `${name}:${JSON.stringify(args)}`;
      if (lastCallRef.current === key) return;
      lastCallRef.current = key;

      setLoading(true);
      setError(null);
      try {
        const result: ToolResult = await callTool(name, args);
        if (!result) return;
        if (result.isError) {
          setError(result.content?.[0]?.text ?? "エラーが発生しました");
          return;
        }
        const sc = result.structuredContent as Record<string, unknown> | null;
        const hint = extractVizHint(sc);
        const textContent = result.content?.find((c) => c.type === "text");

        setState((prev) => ({
          ...prev,
          vizHint: hint,
          vizData: sc,
          summaryText: textContent?.text ?? "",
        }));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [callTool, setState],
  );

  // ── Prefecture change ───────────────────────────────────────────────────

  const handlePrefChange = useCallback(
    (code: string) => {
      setState((prev) => ({ ...prev, prefectureCode: code, cityCode: null, fieldId: null }));
      setBreadcrumbs([
        { label: "全国", level: "nation" },
        { label: PREF_NAMES[code] ?? code, level: "prefecture", code },
      ]);
      void runTool("get_municipality_stats", { prefectureCode: code });
    },
    [runTool, setState],
  );

  // ── Drill-down handler ──────────────────────────────────────────────────

  const handleDrillDown = useCallback(
    (info: { level: string; code: string; name: string }) => {
      if (info.level === "city" && info.code) {
        setState((prev) => ({ ...prev, cityCode: info.code }));
        setBreadcrumbs((prev) => [
          ...prev.filter((b) => b.level !== "city" && b.level !== "field"),
          { label: info.name, level: "city", code: info.code },
        ]);
        void runTool("get_municipality_stats", { cityCode: info.code });
      }
    },
    [runTool, setState],
  );

  // ── Breadcrumb navigation ───────────────────────────────────────────────

  const handleBreadcrumb = useCallback(
    (index: number) => {
      const item = breadcrumbs[index];
      if (!item) return;
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      if (item.level === "nation") {
        setState((prev) => ({ ...prev, cityCode: null, fieldId: null }));
        void runTool("get_labor_shortage_stats", { prefectureCode: "JP-00" });
      } else if (item.level === "prefecture" && item.code) {
        setState((prev) => ({ ...prev, cityCode: null, fieldId: null }));
        void runTool("get_municipality_stats", { prefectureCode: item.code });
      }
    },
    [breadcrumbs, runTool, setState],
  );

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    void runTool("get_municipality_stats", { prefectureCode: state.prefectureCode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-logo">
          <span className="header-title">AgriOps 戦略室</span>
          <span className="header-badge">v1.10.0</span>
          {!hasHost && <span className="header-badge preview">Preview</span>}
        </div>

        {/* Prefecture selector */}
        <div className="header-controls">
          <select
            className="pref-select"
            value={state.prefectureCode}
            onChange={(e) => handlePrefChange(e.target.value)}
          >
            {PREF_OPTIONS.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="breadcrumb-bar">
        <Breadcrumb items={breadcrumbs} onNavigate={handleBreadcrumb} />
      </div>

      {/* Quick actions */}
      <div className="quick-actions">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.label}
            type="button"
            className="quick-action-btn"
            onClick={() => void runTool(qa.tool, { ...qa.args, prefectureCode: qa.args.prefectureCode ?? state.prefectureCode })}
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <main className="dashboard-content">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <span>データ取得中…</span>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <strong>エラー:</strong> {error}
          </div>
        )}

        {/* View dispatcher — renders the best visualisation for the current data */}
        <div className="viz-container">
          <ViewDispatcher
            hint={state.vizHint}
            data={state.vizData}
            onDrillDown={handleDrillDown}
          />
        </div>

        {/* Summary text panel */}
        {state.summaryText && (
          <div className="summary-panel">
            <pre className="summary-text">{state.summaryText}</pre>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <span>データ出典: 農林業センサス2020 · eMAFF · Open-Meteo · 農水省統計</span>
      </footer>
    </div>
  );
}
