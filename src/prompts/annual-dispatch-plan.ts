import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerAnnualDispatchPlanPrompt(server: McpServer, _deps: Deps): void {
  server.registerPrompt(
    "annual_dispatch_plan",
    {
      title: "Annual SSW dispatch plan (12-month draft)",
      description:
        "Generates a full-year SSW (特定技能外国人) dispatch plan for Sugu-kuru covering all 12 months. " +
        "Synthesizes prefecture crop profiles, harvest calendars, and market price seasonality " +
        "to produce a month-by-month deployment schedule across target regions.",
      argsSchema: {
        regions: z
          .string()
          .min(1)
          .describe(
            "Target regions as prefecture codes or labels. " +
              "Examples: 'JP-46,JP-38,JP-23,JP-30', '九州全域+四国+東海+近畿'. " +
              "Include all regions Sugu-kuru covers or plans to expand into.",
          ),
        year: z
          .string()
          .min(4)
          .max(4)
          .optional()
          .describe("Target year (e.g. '2027'). Defaults to next calendar year."),
        total_staff: z
          .string()
          .optional()
          .describe(
            "Total SSW headcount available for the year. " +
              "Example: '50人', '30〜40人'. Used to create a realistic allocation plan.",
          ),
        constraints: z
          .string()
          .optional()
          .describe(
            "Any operational constraints. " +
              "Example: '島嶼部への派遣は費用対効果を考慮', '農閑期は研修に充てる'.",
          ),
      },
    },
    async ({ regions, year, total_staff, constraints }) => {
      const targetYear = year ?? String(new Date().getFullYear() + 1);
      const staffLine = total_staff ? `\n派遣可能人数（年間）: ${total_staff}` : "";
      const constraintLine = constraints ? `\n制約条件: ${constraints}` : "";

      return {
        description: `Annual SSW dispatch plan for ${regions} in ${targetYear}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたはスグクルの年間経営計画担当者です。以下の条件で、SSW（特定技能外国人）の年間派遣計画ドラフトを作成してください。",
                "",
                "## 計画条件",
                `- 対象地域: ${regions}`,
                `- 対象年度: ${targetYear}年${staffLine}${constraintLine}`,
                "",
                "## 実施手順（以下のツールを月次×地域の組み合わせで呼び出す）",
                "1. 各対象都道府県に **`get_prefecture_crop_profile`** を呼び出し、",
                "   12ヶ月分の収穫月・ピーク月・労働強度を取得する",
                "2. ピーク作物について **`get_market_price`** を呼び出し、",
                "   各月の価格水準（高い月 = 農家の収穫意欲が高い = SSW需要大）を確認する",
                "3. **`crop_calendar`** で主要作物の月別作業内容を確認する",
                "",
                "## 出力形式",
                "",
                "### 年間サマリー",
                "最大派遣需要月・最低需要月・全体の特徴を3〜5行で示す",
                "",
                "### 月別派遣スケジュール（12行 × 地域列）",
                "| 月 | 最優先地域 | 主要作物（作業） | 推奨派遣人数 | 労働強度 | 市場傾向 |",
                "|---|---------|--------------|-----------|---------|---------|",
                "（1〜12月を全行埋める。「-」や「農閑期」の月も明記）",
                "",
                "### 四半期ごとの重点戦略",
                "- Q1（1〜3月）: ...",
                "- Q2（4〜6月）: ...",
                "- Q3（7〜9月）: ...",
                "- Q4（10〜12月）: ...",
                "",
                "### 農閑期活用プラン",
                "派遣需要が低い月の SSW の活用方法（技能研修・資格取得・他業種シフトなど）",
                "",
                "### リスクカレンダー",
                "台風シーズン（8〜9月）・梅雨期（6〜7月）・霜害期（11〜2月）など気象リスクが集中する時期と対策",
                "",
                "### スグクル経営へのインパクト",
                "収益が見込める繁忙期と人件費が発生するが売上が立ちにくい農閑期のバランス評価",
                "",
                "出力はボードに提示できる経営資料レベルのドラフトとしてください。",
                "すべての価格情報は「参考価格（ALIC/農林水産省統計ベース）」として明示してください。",
                "このドラフトは非確定であり、最終確定は現地農家との交渉後であることを注記してください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
