import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerRegionDispatchDemandPrompt(server: McpServer, _deps: Deps): void {
  server.registerPrompt(
    "region_dispatch_demand",
    {
      title: "SSW dispatch demand forecast by region",
      description:
        "Generates a multi-region SSW (特定技能外国人) dispatch demand forecast for Sugu-kuru. " +
        "Combines prefecture crop profiles, harvest calendars, and market prices to recommend " +
        "where and when to prioritize worker deployment.",
      argsSchema: {
        regions: z
          .string()
          .min(1)
          .describe(
            "Comma-separated list of prefecture codes or region names to evaluate. " +
              "Examples: 'JP-46,JP-38,JP-23', '九州全域', '四国+東海3県'.",
          ),
        period: z
          .string()
          .min(1)
          .describe(
            "Planning period in human-readable form. " +
              "Examples: '2026年10〜11月', '2026年Q4', '今から3ヶ月'.",
          ),
        available_staff: z
          .string()
          .optional()
          .describe(
            "Number of available SSW workers to allocate. " +
              "Example: '20人', '10〜15人'. Used for allocation recommendations.",
          ),
      },
    },
    async ({ regions, period, available_staff }) => {
      const staffStr = available_staff ? `\n派遣可能人数: ${available_staff}` : "";

      return {
        description: `SSW dispatch demand forecast for ${regions} during ${period}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたはスグクルの派遣計画責任者です。以下の条件で各地域のSSW派遣需要を評価し、最適な派遣計画案を作成してください。",
                "",
                "## 計画条件",
                `- 対象地域: ${regions}`,
                `- 計画期間: ${period}${staffStr}`,
                "",
                "## 実施手順（以下のツールを順に呼び出す）",
                "1. 各対象都道府県に対して **`get_prefecture_crop_profile`** を呼び出し、",
                "   収穫月・労働ピーク月・SSW派遣メモを取得する",
                "2. ピーク月に重なる主要作物について **`get_market_price`** を呼び出し、",
                "   価格水準（高い=農家が収穫に積極的、低い=需要低下の可能性）を確認する",
                "3. **`crop_calendar`** で各作物の計画期間中の作業ステージを詳細確認する",
                "",
                "## 出力形式",
                "",
                "### 地域別需要評価マトリクス",
                "| 都道府県 | 主要作物 | ピーク月（期間内） | 労働強度 | 市場価格傾向 | 派遣優先度 |",
                "|---------|---------|---------------|---------|-----------|---------|",
                "（各行に評価結果を記入）",
                "",
                "### 推奨派遣計画",
                "1. **最優先地域**: 理由とともに提示",
                "2. **次点地域**: 理由とともに提示",
                available_staff
                  ? `3. **人員配分案**: ${available_staff}の最適配分を地域×月別で示す`
                  : "3. **規模感**: 各地域で必要な人員の目安を示す",
                "",
                "### リスク・注意事項",
                "- 端境期・気象リスク・市場価格変動などを指摘",
                "- 複数地域をまたぐ場合の移動コスト・在留資格の農業種別制限への言及",
                "",
                "### アクションアイテム",
                "スグクルが今週中に着手すべき準備事項を3〜5項目でまとめる（農家との事前交渉、移動手配、書類準備など）",
                "",
                "出力はビジネス会議で共有できる水準のドラフトとしてください。",
                "すべての価格情報は「参考価格（ALIC/農林水産省統計ベース）」として明示してください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
