import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerAreaBriefingPrompt(server: McpServer, deps: Deps): void {
  server.registerPrompt(
    "area_briefing",
    {
      title: "Prefectural agriculture briefing",
      description:
        "User-controlled slash command. Generates a brief prefectural agriculture overview using eMAFF aggregates.",
      argsSchema: {
        prefecture: z
          .string()
          .min(1)
          .describe("Prefecture name (e.g. '鹿児島県') or ISO code (e.g. JP-46)."),
      },
    },
    async ({ prefecture }) => {
      const code = normalisePrefectureCode(prefecture);
      const summary =
        deps.emaff && code
          ? await deps.emaff.areaSummary({ prefectureCode: code }).catch(() => null)
          : null;

      const summaryLines = summary
        ? [
            `- 総農地ポリゴン数: ${summary.totalFields}`,
            `- 総面積: ${summary.totalAreaHa.toFixed(1)} ha`,
            `- 主な登録作物: ${
              summary.topCrops
                .slice(0, 5)
                .map((c) => `${c.crop} (${c.count})`)
                .join("、 ") || "n/a"
            }`,
          ]
        : ["- (eMAFF データ未取得)"];

      return {
        description: `Area briefing for ${prefecture}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `あなたは農業派遣管理者向けに、${prefecture} の農業概況ブリーフを書きます。`,
                "",
                "## eMAFF 集計",
                ...summaryLines,
                "",
                `${summary?.attribution ? `出典: ${summary.attribution}` : ""}`,
                "",
                "上記をもとに、派遣需要・季節リスク・想定スタッフ規模の観点から、A4 半ページの簡潔なブリーフを書いてください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}

/**
 * All 47 Japanese prefectures (ISO 3166-2:JP).
 * Both the full name (e.g. "鹿児島県") and the short name (e.g. "鹿児島") are accepted.
 */
const PREFECTURE_NAME_TO_CODE: ReadonlyArray<readonly [string, string]> = [
  ["北海道", "JP-01"],
  ["青森県", "JP-02"],
  ["青森", "JP-02"],
  ["岩手県", "JP-03"],
  ["岩手", "JP-03"],
  ["宮城県", "JP-04"],
  ["宮城", "JP-04"],
  ["秋田県", "JP-05"],
  ["秋田", "JP-05"],
  ["山形県", "JP-06"],
  ["山形", "JP-06"],
  ["福島県", "JP-07"],
  ["福島", "JP-07"],
  ["茨城県", "JP-08"],
  ["茨城", "JP-08"],
  ["栃木県", "JP-09"],
  ["栃木", "JP-09"],
  ["群馬県", "JP-10"],
  ["群馬", "JP-10"],
  ["埼玉県", "JP-11"],
  ["埼玉", "JP-11"],
  ["千葉県", "JP-12"],
  ["千葉", "JP-12"],
  ["東京都", "JP-13"],
  ["東京", "JP-13"],
  ["神奈川県", "JP-14"],
  ["神奈川", "JP-14"],
  ["新潟県", "JP-15"],
  ["新潟", "JP-15"],
  ["富山県", "JP-16"],
  ["富山", "JP-16"],
  ["石川県", "JP-17"],
  ["石川", "JP-17"],
  ["福井県", "JP-18"],
  ["福井", "JP-18"],
  ["山梨県", "JP-19"],
  ["山梨", "JP-19"],
  ["長野県", "JP-20"],
  ["長野", "JP-20"],
  ["岐阜県", "JP-21"],
  ["岐阜", "JP-21"],
  ["静岡県", "JP-22"],
  ["静岡", "JP-22"],
  ["愛知県", "JP-23"],
  ["愛知", "JP-23"],
  ["三重県", "JP-24"],
  ["三重", "JP-24"],
  ["滋賀県", "JP-25"],
  ["滋賀", "JP-25"],
  ["京都府", "JP-26"],
  ["京都", "JP-26"],
  ["大阪府", "JP-27"],
  ["大阪", "JP-27"],
  ["兵庫県", "JP-28"],
  ["兵庫", "JP-28"],
  ["奈良県", "JP-29"],
  ["奈良", "JP-29"],
  ["和歌山県", "JP-30"],
  ["和歌山", "JP-30"],
  ["鳥取県", "JP-31"],
  ["鳥取", "JP-31"],
  ["島根県", "JP-32"],
  ["島根", "JP-32"],
  ["岡山県", "JP-33"],
  ["岡山", "JP-33"],
  ["広島県", "JP-34"],
  ["広島", "JP-34"],
  ["山口県", "JP-35"],
  ["山口", "JP-35"],
  ["徳島県", "JP-36"],
  ["徳島", "JP-36"],
  ["香川県", "JP-37"],
  ["香川", "JP-37"],
  ["愛媛県", "JP-38"],
  ["愛媛", "JP-38"],
  ["高知県", "JP-39"],
  ["高知", "JP-39"],
  ["福岡県", "JP-40"],
  ["福岡", "JP-40"],
  ["佐賀県", "JP-41"],
  ["佐賀", "JP-41"],
  ["長崎県", "JP-42"],
  ["長崎", "JP-42"],
  ["熊本県", "JP-43"],
  ["熊本", "JP-43"],
  ["大分県", "JP-44"],
  ["大分", "JP-44"],
  ["宮崎県", "JP-45"],
  ["宮崎", "JP-45"],
  ["鹿児島県", "JP-46"],
  ["鹿児島", "JP-46"],
  ["沖縄県", "JP-47"],
  ["沖縄", "JP-47"],
];

function normalisePrefectureCode(input: string): string | null {
  if (/^JP-\d{2}$/.test(input)) return input;
  for (const [name, code] of PREFECTURE_NAME_TO_CODE) {
    if (input === name || input.startsWith(name)) return code;
  }
  return null;
}
