import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerDataFreshnessCheckPrompt(server: McpServer, _deps: Deps): void {
  server.registerPrompt(
    "data_freshness_check",
    {
      title: "Data freshness and quality report",
      description:
        "Operator slash command. Calls the snapshot_status tool and formats the result as a plain-language " +
        "data-quality bulletin. Use before important operational decisions to confirm that farmland and " +
        "pesticide data are current.",
      argsSchema: {
        stale_after_days: z
          .string()
          .optional()
          .describe(
            "Consider snapshots stale after this many days (default: 90). E.g. '30' for seasonal updates.",
          ),
      },
    },
    async ({ stale_after_days }) => {
      const days = stale_after_days ? Number.parseInt(stale_after_days, 10) : 90;
      const staleAfterHours = Number.isNaN(days) ? 2160 : days * 24;

      return {
        description: "Data freshness check prompt.",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたはデータ品質モニタリングエージェントです。以下の手順でスナップショットの鮮度を確認し、日本語でレポートしてください。",
                "",
                "## 手順",
                `1. \`snapshot_status\` ツールを呼び出してください（引数: \`{ "staleAfterHours": ${staleAfterHours} }\`）。`,
                "2. 結果を次の形式でまとめてください：",
                "",
                "   - **確認日時**: (checkedAt の値)",
                "   - **スナップショット一覧**: 各スナップショットの名前・最終更新日・経過時間・行数を表形式で",
                "   - **総合判定**: allPresent と allFresh に基づき「✅ 正常」または「⚠️ 要確認」",
                "   - **推奨アクション**: stale なスナップショットがある場合は再ビルドコマンド (`npm run snapshots:build`) を提示",
                "",
                "3. 問題がない場合は「データ品質: 正常。farmland・農薬データは最新状態です。」と1行で結論を述べてください。",
                "",
                "回答は A4 半ページ以内に収め、技術的でない担当者にも読みやすい表現を使ってください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
