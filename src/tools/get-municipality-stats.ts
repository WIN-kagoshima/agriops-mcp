/**
 * get_municipality_stats — v1.10.0
 *
 * 市町村レベルの農業統計・SSW適性情報を返す。
 * スグクル展開圏 (九州/四国/東海/近畿/中国) 19都道府県内の
 * 主要 ~150 市町村をカバーする。圏外は "data_pending" ステータスを返す。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ATTRIBUTION,
  COVERED_PREF_CODES,
  getAllMunicipalities,
  getMunicipalitiesByPref,
  getMunicipalityByCode,
  searchMunicipalities,
} from "../data/municipality-db.js";
import { withVizHint } from "../lib/viz-hint.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_municipality_stats",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 10,
};

const inputSchemaBase = z
  .object({
    cityCode: z
      .string()
      .regex(/^\d{5}$/)
      .optional()
      .describe("全国地方公共団体コード（5桁）。例: '46203' (鹿屋市)"),
    prefectureCode: z
      .string()
      .regex(/^JP-\d{2}$/)
      .optional()
      .describe(
        "都道府県コード (ISO 3166-2:JP)。指定時はその県の全市町村リストを返す。例: 'JP-46'",
      ),
    cityName: z.string().max(40).optional().describe("市区町村名の部分一致検索。例: '鹿屋'"),
  })
  .strict();

export const inputSchema = inputSchemaBase.refine(
  (d) => d.cityCode || d.prefectureCode || d.cityName,
  "cityCode, prefectureCode, cityName のいずれか1つ以上を指定してください。",
);

export function registerGetMunicipalityStats(server: McpServer, _deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "市町村別農業統計・SSW適性情報",
      description:
        "農林業センサス2020ベースの市町村レベル農業統計（農業就業人口・経営体数・主要作物）と " +
        "SSW派遣適性トップ作物を返す。cityCode・prefectureCode・cityName で絞り込み可能。 " +
        `データカバレッジ: ${COVERED_PREF_CODES.length}都道府県内の主要市町村。読み取り専用。`,
      inputSchema: inputSchemaBase.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            { type: "text", text: `入力エラー: ${parsed.error.issues[0]?.message ?? "不明"}` },
          ],
        };
      }

      const { cityCode, prefectureCode, cityName } = parsed.data;

      // ── 単一市町村取得 ──────────────────────────────────────────────────
      if (cityCode) {
        const record = getMunicipalityByCode(cityCode);
        if (!record) {
          return {
            content: [
              {
                type: "text",
                text:
                  `cityCode ${cityCode} の市町村データは準備中です。\n` +
                  `カバー対象: ${COVERED_PREF_CODES.join(", ")}`,
              },
            ],
            structuredContent: {
              status: "data_pending",
              cityCode,
              coveredPrefectures: COVERED_PREF_CODES,
              attribution: ATTRIBUTION,
            },
          };
        }

        const change = record.agriWorkers2015
          ? (((record.agriWorkers2020 - record.agriWorkers2015) / record.agriWorkers2015) * 100).toFixed(1)
          : "N/A";

        const structured = {
          ...record,
          agriWorkersChange5yr: `${change}%`,
          attribution: ATTRIBUTION,
        };

        return {
          content: [
            {
              type: "text",
              text: [
                `## ${record.cityName}（${record.prefectureName}）農業統計`,
                `地域区分: ${record.region}`,
                "",
                "### 農業就業人口",
                `- 2020年: ${record.agriWorkers2020.toLocaleString()} 人`,
                `- 2015年: ${record.agriWorkers2015.toLocaleString()} 人`,
                `- 5年変化: ${change}%`,
                `- 農業経営体数: ${record.farmBodies2020.toLocaleString()} 経営体`,
                "",
                `### 主要作物: ${record.mainCrops.join("・")}`,
                "",
                "### SSW 適性トップ作物",
                `- **${record.topSswCrop}** (スコア ${record.topSswScore}/100)`,
                `- ${record.sswMemo}`,
                "",
                `中心座標: ${record.lat}°N, ${record.lng}°E`,
                "",
                `出典: ${ATTRIBUTION}`,
              ].join("\n"),
            },
          ],
          structuredContent: withVizHint(
            structured as unknown as Record<string, unknown>,
            {
              preferredView: "radar",
              axes: [
                "農業就業人口(千人)",
                "経営体数(百)",
                "SSWスコア",
                "5年減少率逆数",
                "主要作物数",
              ],
              title: `${record.cityName} 農業プロフィール`,
            },
          ),
        };
      }

      // ── 都道府県一覧 ───────────────────────────────────────────────────
      if (prefectureCode) {
        const records = getMunicipalitiesByPref(prefectureCode);
        if (records.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `${prefectureCode} のデータは準備中です。\n` +
                  `現在のカバレッジ: ${COVERED_PREF_CODES.join(", ")}`,
              },
            ],
            structuredContent: {
              status: "data_pending",
              prefectureCode,
              coveredPrefectures: COVERED_PREF_CODES,
              attribution: ATTRIBUTION,
            },
          };
        }

        const rows = records
          .sort((a, b) => b.topSswScore - a.topSswScore)
          .map(
            (r) =>
              `| ${r.cityName} | ${r.mainCrops.slice(0, 2).join("・")} | ${r.topSswCrop} | ${r.topSswScore} |`,
          );

        const structured = {
          prefectureCode,
          municipalities: records,
          count: records.length,
          attribution: ATTRIBUTION,
        };

        return {
          content: [
            {
              type: "text",
              text: [
                `## ${records[0]?.prefectureName}（${prefectureCode}）市町村別農業統計`,
                `対象市町村数: ${records.length}`,
                "",
                "| 市町村 | 主要作物 | SSWトップ作物 | SSWスコア |",
                "|-------|--------|------------|---------|",
                ...rows,
                "",
                `出典: ${ATTRIBUTION}`,
              ].join("\n"),
            },
          ],
          structuredContent: withVizHint(
            structured as unknown as Record<string, unknown>,
            {
              preferredView: "choropleth",
              metric: "topSswScore",
              geoLevel: "city",
              title: `${records[0]?.prefectureName} 市町村別 SSW適性スコア`,
              legend: { unit: "点", min: 60, max: 100, tone: "success" },
            },
          ),
        };
      }

      // ── 名前検索 ──────────────────────────────────────────────────────
      const results = searchMunicipalities(cityName ?? "");
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `「${cityName}」に一致する市町村データが見つかりません。\nカバー対象: ${COVERED_PREF_CODES.join(", ")}`,
            },
          ],
          structuredContent: {
            status: "not_found",
            query: cityName,
            municipalities: [],
            attribution: ATTRIBUTION,
          },
        };
      }

      const structured = {
        query: cityName,
        municipalities: results,
        count: results.length,
        attribution: ATTRIBUTION,
      };

      return {
        content: [
          {
            type: "text",
            text: [
              `## 検索結果: 「${cityName}」(${results.length}件)`,
              "",
              ...results.map((r) => `- **${r.prefectureName}/${r.cityName}** — ${r.topSswCrop} (${r.topSswScore}点)`),
              "",
              `出典: ${ATTRIBUTION}`,
            ].join("\n"),
          },
        ],
        structuredContent: withVizHint(
          structured as unknown as Record<string, unknown>,
          {
            preferredView: "bar_compare",
            labelKey: "cityName",
            valueKeys: ["topSswScore"],
            dataPath: "municipalities",
            threshold: 75,
            title: `「${cityName}」検索結果 SSWスコア`,
            legend: { unit: "点", tone: "success" },
          },
        ),
      };
    },
  );
}

/** getAllMunicipalities の再エクスポート (list_municipalities から利用) */
export { getAllMunicipalities, getMunicipalitiesByPref };
