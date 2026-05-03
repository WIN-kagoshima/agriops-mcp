import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerMarketTrendBriefingPrompt(server: McpServer, _deps: Deps): void {
  server.registerPrompt(
    "market_trend_briefing",
    {
      title: "Agricultural & timber market trend briefing",
      description:
        "Produces a structured market briefing for key agricultural products and timber " +
        "in the target region. Combines price seasonality, current month trends, " +
        "and harvest calendar data. Designed for Sugu-kuru decision-making.",
      argsSchema: {
        region: z
          .string()
          .min(1)
          .describe(
            "Target region or prefecture code(s). Examples: '九州全域', 'JP-38', '四国', '東海3県', 'JP-46,JP-38,JP-23'.",
          ),
        month: z
          .string()
          .optional()
          .describe("Target month (1-12). Defaults to current month if omitted."),
        focus: z
          .string()
          .optional()
          .describe(
            "Optional product focus. Examples: 'さつまいも,みかん', '木材', '花き'. If omitted, covers all key products.",
          ),
      },
    },
    async ({ region, month, focus }) => {
      const monthStr = month ? `${month}月` : "今月";
      const focusStr = focus ? `\n対象品目: ${focus}` : "";

      return {
        description: `Market trend briefing for ${region} in ${monthStr}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたはスグクル（特定技能外国人の農業派遣を行う会社）の意思決定を支援する農業市場アナリストです。",
                "",
                "## ブリーフィング条件",
                `- 対象地域: ${region}`,
                `- 対象月: ${monthStr}${focusStr}`,
                "",
                "## 実施手順",
                "1. **`get_market_price`** を呼び出して、対象地域の主要作物・木材の参考価格と季節傾向を取得する",
                "2. **`crop_calendar`** を呼び出して、その地域の${monthStr}時点での収穫・作業ステージを確認する",
                "3. **`get_weather_1km`** で現在の気象状況（収穫に影響する要素）を取得する（可能であれば）",
                "",
                "## 出力形式（以下の章立て）",
                "### 1. 価格動向サマリー",
                "主要品目の今月の価格帯と季節傾向（高め/平年並み/低め）を表形式で示す",
                "",
                "### 2. 収穫・作業カレンダー（今月）",
                "対象地域で今月発生している収穫・農作業を作物ごとにリストアップ",
                "",
                "### 3. スグクル派遣需要予測",
                "上記の価格傾向×作業ステージから、SSW（特定技能外国人）の派遣需要が",
                "「高い・中程度・低い」かを作物・地域ごとに評価し、その理由を説明する",
                "",
                "### 4. 注目トピック",
                "価格高騰・凶作リスク・端境期など、意思決定に影響する特記事項を挙げる",
                "",
                "最後に「出典・注意事項」として、参考価格であることと実際の取引価格との差異について明記してください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
