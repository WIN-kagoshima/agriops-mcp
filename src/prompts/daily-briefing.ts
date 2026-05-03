import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

/**
 * Persona targets:
 *   - 田中 誠一（農業派遣マネージャー）: 朝 5 時に全圃場の Go/NoGo を知りたい
 *   - 鮫島 隼人（中規模農家）: 今日やるべきことを AI に聞きたい
 */
export function registerDailyBriefingPrompt(server: McpServer, deps: Deps): void {
  server.registerPrompt(
    "daily_briefing",
    {
      title: "Daily morning farming briefing",
      description:
        "Generates a comprehensive morning briefing that combines weather forecasts, JMA warnings, " +
        "soil conditions, and seasonal context into actionable work priorities. " +
        "Designed for the farmer or dispatch manager who needs a single view of " +
        '"what should I do today?" before heading to the field.',
      argsSchema: {
        lat: z.string().min(1).describe("Latitude of the primary farm or base (e.g. '31.59')."),
        lng: z.string().min(1).describe("Longitude of the primary farm or base (e.g. '130.54')."),
        prefecture: z
          .string()
          .optional()
          .describe(
            "Prefecture name or ISO code (e.g. '鹿児島県' or 'JP-46'). For JMA warning lookup.",
          ),
        crops: z
          .string()
          .optional()
          .describe(
            "Comma-separated crops currently in production (e.g. 'さつまいも,茶'). Adds crop-specific advice.",
          ),
        num_fields: z
          .string()
          .optional()
          .describe("Number of fields managed (e.g. '12'). Used to contextualize dispatch advice."),
      },
    },
    async ({ lat, lng, prefecture, crops, num_fields }) => {
      const latNum = Number.parseFloat(lat);
      const lngNum = Number.parseFloat(lng);

      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        return {
          description: "Daily briefing (invalid coordinates).",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "座標が不正です。lat / lng を数値で指定してください。",
              },
            },
          ],
        };
      }

      // Fetch 48-hour forecast for today + tomorrow.
      let weatherBlock = "";
      let attribution = "";
      try {
        const fc = await deps.weather.getForecast({
          lat: latNum,
          lng: lngNum,
          hours: 48,
          timezone: "Asia/Tokyo",
        });
        attribution = fc.attribution;

        const dailyMap = new Map<
          string,
          {
            tMin: number;
            tMax: number;
            precip: number;
            windMax: number;
            et0: number;
            smMin: number;
            smCount: number;
          }
        >();
        for (const h of fc.hourly) {
          const day = h.time.slice(0, 10);
          const d = dailyMap.get(day) ?? {
            tMin: Number.POSITIVE_INFINITY,
            tMax: Number.NEGATIVE_INFINITY,
            precip: 0,
            windMax: 0,
            et0: 0,
            smMin: 1,
            smCount: 0,
          };
          d.tMin = Math.min(d.tMin, h.temperatureC);
          d.tMax = Math.max(d.tMax, h.temperatureC);
          d.precip += h.precipitationMm ?? 0;
          d.windMax = Math.max(d.windMax, h.windSpeedMs ?? 0);
          d.et0 += h.et0EvapotranspirationMm ?? 0;
          if (h.soilMoisture != null) {
            d.smMin = Math.min(d.smMin, h.soilMoisture);
            d.smCount++;
          }
          dailyMap.set(day, d);
        }

        const rows = Array.from(dailyMap.entries())
          .slice(0, 2)
          .map(([day, d]) => {
            const sm = d.smCount > 0 ? `${d.smMin.toFixed(3)}` : "-";
            return `| ${day} | ${d.tMin.toFixed(1)}〜${d.tMax.toFixed(1)} | ${d.precip.toFixed(1)} | ${d.windMax.toFixed(1)} | ${d.et0.toFixed(1)} | ${sm} |`;
          });

        weatherBlock = [
          "| 日付 | 気温(°C) | 降水量(mm) | 最大風速(m/s) | ET₀(mm) | 最低土壌水分(m³/m³) |",
          "|------|---------|-----------|-------------|---------|-------------------|",
          ...rows,
        ].join("\n");
      } catch {
        weatherBlock = "(天気予報の取得に失敗しました)";
      }

      // Fetch JMA warnings if prefecture is given.
      let warningBlock = "";
      if (deps.jma && prefecture) {
        try {
          const prefCode = /^JP-\d{2}$/.test(prefecture) ? prefecture : undefined;
          const result = await deps.jma.getActiveWarnings({
            prefectureCode: prefCode,
          });
          const active = result.warnings.filter((w) => w.severity !== "info");
          if (active.length > 0) {
            warningBlock = [
              "## 現在発令中の警報・注意報",
              ...active.map((w) => `- **[${w.severity}]** ${w.kind} — ${w.areaName}`),
              `出典: ${result.attribution}`,
            ].join("\n");
          } else {
            warningBlock = "## 警報・注意報: なし（通常営農可）";
          }
        } catch {
          warningBlock = "## 警報確認: (JMA 取得失敗)";
        }
      }

      const cropLine = crops ? `栽培中の作物: **${crops}**` : "栽培中の作物: 未指定";
      const fieldsLine = num_fields ? `管理圃場数: **${num_fields} 圃場**` : "";

      return {
        description: `Daily briefing for (${lat}, ${lng}).`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたは農業現場の「朝のブリーフィング AI」です。以下のデータから、**今日やるべきこと**を優先順位付きで提案してください。",
                "",
                `拠点: ${lat}, ${lng}`,
                cropLine,
                fieldsLine,
                "",
                "## 48 時間天気予報（Open-Meteo 1km メッシュ）",
                weatherBlock,
                "",
                ...(attribution ? [`出典: ${attribution}`, ""] : []),
                ...(warningBlock ? [warningBlock, ""] : []),
                "## 回答フォーマット",
                "",
                "### 今日の総合判定",
                "天候・リスクに基づき、今日の農作業可否を **☀️ 通常営農** / **⚠️ 注意営農** / **🚫 作業中止推奨** の 3 段階で判定。",
                "",
                "### 今日の優先アクション（最大 5 件）",
                "1. [最優先] 具体的な作業内容と理由",
                "2. ...",
                "",
                "### 明日の見通し（1〜2 行）",
                "",
                "### 灌水・散布メモ",
                "- ET₀ と土壌水分から灌水の要否を判断",
                "- 風速から農薬散布の可否を判断（3 m/s 以下で推奨）",
                "",
                "回答は**日本語**で、**スマホの 1 画面で読める量**（400 字以内）に収めてください。" +
                  "数値には必ず単位をつけ、根拠を 1 行で添えてください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
