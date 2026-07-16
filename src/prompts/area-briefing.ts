import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { completePrefectureName, normalisePrefectureCode } from "../lib/prefectures.js";
import type { Deps } from "../server/deps.js";

export function registerAreaBriefingPrompt(server: McpServer, deps: Deps): void {
  server.registerPrompt(
    "area_briefing",
    {
      title: "Prefectural agriculture briefing",
      description:
        "User-controlled slash command. Generates a brief prefectural agriculture overview using eMAFF aggregates.",
      argsSchema: {
        // `completable()` activates the Completion primitive (`completions`
        // capability + `completion/complete` handler) — see
        // `src/lib/prefectures.ts` and `docs/phase-plan.md` Phase 13.
        prefecture: completable(
          z.string().min(1).describe("Prefecture name (e.g. '鹿児島県') or ISO code (e.g. JP-46)."),
          (value) => completePrefectureName(value),
        ),
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
