/**
 * strategy-room-dashboard.ts — v1.10.0
 *
 * 「戦略室ダッシュボードを開く」プロンプト。
 * LLM が分析目的を宣言すると、最適なビュー・ツール・都道府県を選んで
 * open_dashboard を起動し、インタラクティブなビジュアライゼーションを提供する。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerStrategyRoomDashboardPrompt(server: McpServer, _deps: Deps): void {
  server.registerPrompt(
    "strategy_room_dashboard",
    {
      title: "AgriOps 戦略室ダッシュボード — 最適ビュー選択起動",
      description:
        "分析目的（労働力不足可視化・SSW適性レーダー・畜産マップ・市場価格推移など）を受け取り、 " +
        "最適な viz_hint ビューとツール呼び出しを選定して open_dashboard を起動する。 " +
        "v1.10.0 の 8 種ビュー（コロプレスマップ・レーダー・棒比較・折れ線・サンキー・カレンダーヒートマップ・テーブル・ズームドリル）に対応。",
      argsSchema: z.object({
        analysis_goal: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "分析目的の説明。例: '全国農業労働力不足を地図で見たい' / " +
              "'みかんのSSW適性を5軸レーダーで確認' / " +
              "'鹿児島の市町村別ブロイラー農場数を比較' / " +
              "'愛媛から和歌山へのSSW通年ローテーションを可視化'",
          ),
        prefecture_code: z
          .string()
          .regex(/^JP-\d{2}$/)
          .optional()
          .describe("分析対象の都道府県コード。未指定の場合は目的から自動推定。"),
        crop_or_sector: z
          .string()
          .max(40)
          .optional()
          .describe("分析対象の作物または畜産部門。例: 'みかん', 'ブロイラー', 'お茶'"),
      }).shape,
    },
    async ({ analysis_goal, prefecture_code, crop_or_sector }) => {
      const pref = prefecture_code ?? "JP-46";

      // Determine best view specification from goal description
      const goalLower = analysis_goal.toLowerCase();
      let viewSpec = "municipality_drill";
      let toolHint = `get_municipality_stats({ prefectureCode: "${pref}" })`;
      let vizDesc = "市町村別 SSW 適性スコア（コロプレスマップ）";

      if (
        goalLower.includes("全国") ||
        goalLower.includes("労働力不足") ||
        goalLower.includes("choropleth")
      ) {
        viewSpec = "national_labor_choropleth";
        toolHint = 'get_labor_shortage_stats({ prefectureCode: "JP-00" })';
        vizDesc = "全国農業就業人口 5年変化率（コロプレスマップ）";
      } else if (
        goalLower.includes("レーダー") ||
        goalLower.includes("radar") ||
        goalLower.includes("適性") ||
        goalLower.includes("ssw")
      ) {
        const crop = crop_or_sector ?? "みかん";
        viewSpec = `ssw_radar:${crop}`;
        toolHint = `get_ssw_crop_compatibility({ crop: "${crop}" })`;
        vizDesc = `${crop} SSW 適性レーダー（5軸ペンタゴン）`;
      } else if (
        goalLower.includes("畜産") ||
        goalLower.includes("ブロイラー") ||
        goalLower.includes("捕鳥") ||
        goalLower.includes("livestock")
      ) {
        viewSpec = `livestock_bar:${pref}`;
        toolHint = `get_livestock_regional_stats({ prefectureCode: "${pref}" })`;
        vizDesc = `${pref} 畜産 SSW 適性スコア比較（棒グラフ）`;
      } else if (
        goalLower.includes("市場価格") ||
        goalLower.includes("timeseries") ||
        goalLower.includes("価格")
      ) {
        const crop = crop_or_sector ?? "みかん";
        viewSpec = `market_price:${crop}`;
        toolHint = `get_market_price({ crop: "${crop}" })`;
        vizDesc = `${crop} 市場価格推移（時系列グラフ）`;
      } else if (
        goalLower.includes("サンキー") ||
        goalLower.includes("ローテーション") ||
        goalLower.includes("sankey")
      ) {
        viewSpec = "ssw_rotation_sankey";
        toolHint =
          'ssw_strategy_briefing({ focus_region: "愛媛+和歌山+徳島", priority: "year_round" })';
        vizDesc = "SSW 通年ローテーション フロー図（サンキー）";
      } else if (
        goalLower.includes("カレンダー") ||
        goalLower.includes("作物カレンダー") ||
        goalLower.includes("heatmap")
      ) {
        viewSpec = `crop_calendar:${pref}`;
        toolHint = `get_prefecture_crop_profile({ prefectureCode: "${pref}" })`;
        vizDesc = `${pref} 作物カレンダー（年間ヒートマップ）`;
      }

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "# 戦略室ダッシュボード起動リクエスト",
                "",
                `**分析目的:** ${analysis_goal}`,
                prefecture_code ? `**対象都道府県:** ${prefecture_code}` : "",
                crop_or_sector ? `**対象作物/部門:** ${crop_or_sector}` : "",
                "",
                "## 推奨アクション",
                "",
                `最適ビュー: **${vizDesc}**`,
                "",
                "以下のツール呼び出しを実行してからダッシュボードを起動してください:",
                "",
                "```",
                "// Step 1: データ取得",
                toolHint,
                "",
                "// Step 2: ダッシュボード起動",
                "open_dashboard({",
                `  initialPrefectureCode: "${pref}",`,
                `  viewSpec: "${viewSpec}",`,
                "})",
                "```",
                "",
                "ダッシュボードが開いたら:",
                "- 都道府県セレクターで対象地域を切り替えられます",
                "- 地図上のマーカーをクリックすると市町村レベルにドリルダウンします",
                "- ブレッドクラムで上位階層に戻れます",
                "- クイックアクションボタンで他のビューに素早く切り替えられます",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
        ],
      };
    },
  );
}
