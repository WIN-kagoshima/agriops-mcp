/**
 * get_estat_stats — v1.11.0
 *
 * e-Stat (政府統計の総合窓口) API を使って農林水産省の統計データを
 * ライブ取得する。農林業センサス・作物統計・畜産統計など。
 *
 * 利用にはアプリケーションID（無料登録）が必要。
 * ESTAT_APP_ID が未設定の場合、ツール自体が登録されない。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withVizHint } from "../lib/viz-hint.js";

import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_estat_stats",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 11,
};

/**
 * Convenience aliases for commonly-used agricultural statistics.
 * Maps a human-friendly name to a getStatsList search.
 */
const PRESET_STATS: Record<string, { searchWord: string; statsCode: string; description: string }> =
  {
    census_workers: {
      searchWord: "農業労働力",
      statsCode: "00500209",
      description: "農林業センサス — 農業就業人口・経営体数",
    },
    crop_output: {
      searchWord: "作付面積",
      statsCode: "00500215",
      description: "作物統計調査 — 作付面積・収穫量",
    },
    livestock: {
      searchWord: "飼養",
      statsCode: "00500222",
      description: "畜産統計 — 飼養頭羽数・戸数",
    },
  };

/** ISO 3166-2:JP code → e-Stat 5-digit area code (padded with trailing 000) */
const PREF_CODE_MAP: Record<string, string> = {
  "JP-01": "01000",
  "JP-02": "02000",
  "JP-03": "03000",
  "JP-04": "04000",
  "JP-05": "05000",
  "JP-06": "06000",
  "JP-07": "07000",
  "JP-08": "08000",
  "JP-09": "09000",
  "JP-10": "10000",
  "JP-11": "11000",
  "JP-12": "12000",
  "JP-13": "13000",
  "JP-14": "14000",
  "JP-15": "15000",
  "JP-16": "16000",
  "JP-17": "17000",
  "JP-18": "18000",
  "JP-19": "19000",
  "JP-20": "20000",
  "JP-21": "21000",
  "JP-22": "22000",
  "JP-23": "23000",
  "JP-24": "24000",
  "JP-25": "25000",
  "JP-26": "26000",
  "JP-27": "27000",
  "JP-28": "28000",
  "JP-29": "29000",
  "JP-30": "30000",
  "JP-31": "31000",
  "JP-32": "32000",
  "JP-33": "33000",
  "JP-34": "34000",
  "JP-35": "35000",
  "JP-36": "36000",
  "JP-37": "37000",
  "JP-38": "38000",
  "JP-39": "39000",
  "JP-40": "40000",
  "JP-41": "41000",
  "JP-42": "42000",
  "JP-43": "43000",
  "JP-44": "44000",
  "JP-45": "45000",
  "JP-46": "46000",
  "JP-47": "47000",
};

const inputSchema = z
  .object({
    mode: z
      .enum(["search", "data"])
      .default("search")
      .describe(
        "Mode: 'search' lists available statistics tables. 'data' fetches actual data values. " +
          "Start with 'search' to find a statsDataId, then use 'data' to retrieve it.",
      ),

    // ── search mode params ───────────────────────────────────────
    preset: z
      .enum(["census_workers", "crop_output", "livestock"] as const)
      .optional()
      .describe(
        "Convenience preset to search for common agricultural statistics. " +
          "census_workers = 農林業センサス就業人口, crop_output = 作物統計, livestock = 畜産統計.",
      ),
    searchWord: z
      .string()
      .max(200)
      .optional()
      .describe("Free-text keyword search (Japanese). e.g. '農業就業人口', '水稲 収穫量'."),
    statsCode: z
      .string()
      .regex(/^\d{8}$/)
      .optional()
      .describe("8-digit government statistics code. e.g. '00500209' (農林業センサス)."),

    // ── data mode params ─────────────────────────────────────────
    statsDataId: z
      .string()
      .regex(/^\d{10}$/)
      .optional()
      .describe(
        "10-digit statistics table ID obtained from search results. " + "Required for mode='data'.",
      ),
    prefectureCode: z
      .string()
      .regex(/^JP-\d{2}$/)
      .optional()
      .describe(
        "ISO 3166-2:JP prefecture code to filter data by area. " +
          "e.g. 'JP-46' (鹿児島). Converted to e-Stat area code automatically.",
      ),
    cdCat01: z.string().max(20).optional().describe("Category 1 filter code."),
    cdCat02: z.string().max(20).optional().describe("Category 2 filter code."),
    cdTime: z.string().max(20).optional().describe("Time axis filter code. e.g. '2020000000'."),

    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Max results. Default 20, max 100."),
  })
  .strict();

export function registerGetEstatStats(server: McpServer, any: any): void {
  server.registerTool(
    meta.name,
    {
      title: "e-Stat 政府統計データ取得",
      description:
        "政府統計の総合窓口(e-Stat) API を通じて農林水産省の統計データをライブ取得する。" +
        "農林業センサス（就業人口・経営体数）、作物統計（作付面積・収穫量）、畜産統計（飼養頭羽数）などに対応。" +
        "mode='search' で統計表を検索し statsDataId を取得 → mode='data' で実データを取得、の2ステップで利用。" +
        "preset パラメータで主要農業統計にワンタッチアクセス可能。読み取り専用。",
      inputSchema: inputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
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

      const estat = any.estat;
      if (!estat) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "e-Stat API が設定されていません。ESTAT_APP_ID 環境変数を設定してください。",
            },
          ],
        };
      }

      const input = parsed.data;

      // ── Search mode ──────────────────────────────────────────────
      if (input.mode === "search") {
        const preset = input.preset ? PRESET_STATS[input.preset] : null;
        const searchWord = input.searchWord ?? preset?.searchWord;
        const statsCode = input.statsCode ?? preset?.statsCode;

        if (!searchWord && !statsCode) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `searchWord, statsCode, または preset のいずれかを指定してください。\n利用可能な preset: ${Object.entries(
                  PRESET_STATS,
                )
                  .map(([k, v]) => `${k} (${v.description})`)
                  .join(", ")}`,
              },
            ],
          };
        }

        try {
          const result = await estat.searchStats({
            searchWord,
            statsCode,
            limit: input.limit,
          });

          if (result.tables.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `検索条件に一致する統計表が見つかりませんでした。\nキーワード: ${searchWord ?? "なし"}\n統計コード: ${statsCode ?? "なし"}`,
                },
              ],
              structuredContent: {
                mode: "search",
                tables: [],
                totalCount: 0,
                attribution: result.attribution,
              },
            };
          }

          const rows = result.tables.map(
            (t: any) =>
              `| ${t.id} | ${t.statName} | ${t.title.slice(0, 60)}${t.title.length > 60 ? "…" : ""} | ${t.surveyDate} | ${t.overallTotalNumber.toLocaleString()} |`,
          );

          const structured = {
            mode: "search",
            tables: result.tables,
            totalCount: result.totalCount,
            attribution: result.attribution,
          };

          return {
            content: [
              {
                type: "text",
                text: [
                  `## e-Stat 統計表検索結果（${result.totalCount}件中 ${result.tables.length}件表示）`,
                  "",
                  "| 統計表ID | 調査名 | タイトル | 調査年月 | 総件数 |",
                  "|----------|--------|---------|---------|--------|",
                  ...rows,
                  "",
                  "**次のステップ**: `mode='data'` と `statsDataId` を指定してデータを取得してください。",
                  "",
                  `出典: ${result.attribution}`,
                ].join("\n"),
              },
            ],
            structuredContent: withVizHint(structured as unknown as Record<string, unknown>, {
              preferredView: "table",
              title: `e-Stat 統計表検索: ${searchWord ?? statsCode ?? ""}`,
            }),
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `e-Stat API エラー: ${err instanceof Error ? err.message : "不明なエラー"}`,
              },
            ],
          };
        }
      }

      // ── Data mode ────────────────────────────────────────────────
      if (!input.statsDataId) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "mode='data' には statsDataId（10桁）が必要です。先に mode='search' で統計表IDを検索してください。",
            },
          ],
        };
      }

      const cdArea = input.prefectureCode ? PREF_CODE_MAP[input.prefectureCode] : undefined;

      try {
        const result = await estat.getStatsData({
          statsDataId: input.statsDataId,
          cdArea,
          cdCat01: input.cdCat01,
          cdCat02: input.cdCat02,
          cdTime: input.cdTime,
          limit: input.limit,
        });

        if (result.values.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `統計表 ${input.statsDataId} のデータが見つかりません（フィルタ条件に一致なし）。`,
              },
            ],
            structuredContent: {
              mode: "data",
              statsDataId: input.statsDataId,
              values: [],
              totalCount: 0,
              attribution: result.attribution,
            },
          };
        }

        // Build code→name lookup maps for readable output
        const codeLookup = new Map<string, Map<string, string>>();
        for (const cls of result.classInfo) {
          const map = new Map<string, string>();
          for (const c of cls.classes) {
            map.set(c.code, c.name);
          }
          codeLookup.set(cls.id, map);
        }

        const resolveName = (classId: string, code: string): string => {
          return codeLookup.get(classId)?.get(code) ?? code;
        };

        // Format a limited number of values as a table
        const displayLimit = Math.min(result.values.length, 50);
        const displayValues = result.values.slice(0, displayLimit);

        // Determine which category axes are present
        const axes = new Set<string>();
        for (const v of displayValues) {
          for (const key of Object.keys(v.categories)) {
            axes.add(key);
          }
        }
        const axesList = [...axes].sort();

        // Build table header
        const headers = [
          ...axesList.map((a) => {
            const cls = result.classInfo.find((c: any) => c.id === a);
            return cls?.name ?? a;
          }),
          "値",
        ];

        const headerRow = `| ${headers.join(" | ")} |`;
        const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;

        const dataRows = displayValues.map((v: any) => {
          const cells = axesList.map((a) => {
            const code = v.categories[a];
            return code ? resolveName(a, code) : "-";
          });
          cells.push(v.value);
          return `| ${cells.join(" | ")} |`;
        });

        const structured = {
          mode: "data",
          statsDataId: input.statsDataId,
          title: result.title,
          surveyDate: result.surveyDate,
          classInfo: result.classInfo,
          values: result.values,
          totalCount: result.totalCount,
          fromNumber: result.fromNumber,
          toNumber: result.toNumber,
          prefectureFilter: input.prefectureCode ?? null,
          attribution: result.attribution,
        };

        const moreNote =
          result.values.length > displayLimit
            ? `\n\n_表示は先頭 ${displayLimit} 件です。全 ${result.totalCount.toLocaleString()} 件のうち ${result.fromNumber}〜${result.toNumber} を取得。_`
            : "";

        return {
          content: [
            {
              type: "text",
              text: [
                `## ${result.title}`,
                `調査年月: ${result.surveyDate}`,
                `取得件数: ${result.values.length}/${result.totalCount.toLocaleString()}`,
                input.prefectureCode ? `地域フィルタ: ${input.prefectureCode}` : "",
                "",
                headerRow,
                separatorRow,
                ...dataRows,
                moreNote,
                "",
                `出典: ${result.attribution}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          structuredContent: withVizHint(structured as unknown as Record<string, unknown>, {
            preferredView: "table",
            title: result.title,
          }),
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `e-Stat API エラー: ${err instanceof Error ? err.message : "不明なエラー"}`,
            },
          ],
        };
      }
    },
  );
}
