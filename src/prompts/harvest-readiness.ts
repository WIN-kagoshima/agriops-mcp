import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerHarvestReadinessPrompt(server: McpServer, deps: Deps): void {
  server.registerPrompt(
    "harvest_readiness",
    {
      title: "Harvest readiness assessment",
      description:
        "User-controlled slash command. Cross-references the 7-day weather outlook with FAMIC pesticide pre-harvest " +
        "interval rules to advise whether a field is safe to harvest. Uses get_weather_1km, get_pesticide_rules, " +
        "and optionally field data from eMAFF.",
      argsSchema: {
        crop: z.string().min(1).max(80).describe("Crop name in Japanese (e.g. さつまいも)."),
        lat: z.string().min(1).describe("Latitude of the field (e.g. '31.59')."),
        lng: z.string().min(1).describe("Longitude of the field (e.g. '130.54')."),
        last_spray_date: z
          .string()
          .optional()
          .describe(
            "Date of last pesticide application (YYYY-MM-DD). Used for pre-harvest interval check.",
          ),
        pesticide_name: z
          .string()
          .optional()
          .describe(
            "Name or registration ID of the last applied pesticide. Used for FAMIC lookup.",
          ),
      },
    },
    async ({ crop, lat, lng, last_spray_date, pesticide_name }) => {
      const latNum = Number.parseFloat(lat);
      const lngNum = Number.parseFloat(lng);

      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        return {
          description: "Harvest readiness (invalid coordinates).",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "座標が正しくありません。lat / lng を数値で再入力してください。",
              },
            },
          ],
        };
      }

      // Fetch 7-day weather for harvest-day conditions.
      let weatherLines: string[] = [];
      let attribution = "";
      try {
        const forecast = await deps.weather.getForecast({
          lat: latNum,
          lng: lngNum,
          hours: 168,
          timezone: "Asia/Tokyo",
        });
        attribution = forecast.attribution;

        const dailyMap = new Map<
          string,
          { tempMax: number; tempMin: number; precipSum: number; windMax: number }
        >();
        for (const h of forecast.hourly) {
          const day = h.time.slice(0, 10);
          const d = dailyMap.get(day) ?? {
            tempMax: Number.NEGATIVE_INFINITY,
            tempMin: Number.POSITIVE_INFINITY,
            precipSum: 0,
            windMax: 0,
          };
          d.tempMax = Math.max(d.tempMax, h.temperatureC);
          d.tempMin = Math.min(d.tempMin, h.temperatureC);
          d.precipSum += h.precipitationMm ?? 0;
          d.windMax = Math.max(d.windMax, h.windSpeedMs ?? 0);
          dailyMap.set(day, d);
        }

        weatherLines = Array.from(dailyMap.entries())
          .slice(0, 7)
          .map(
            ([day, d]) =>
              `| ${day} | ${d.tempMin.toFixed(1)} | ${d.tempMax.toFixed(1)} | ${d.precipSum.toFixed(1)} | ${d.windMax.toFixed(1)} |`,
          );
      } catch {
        weatherLines = ["| (予報取得失敗) | - | - | - | - |"];
      }

      // Fetch FAMIC rules for this crop.
      let pesticideLines: string[] = [];
      let famicAttribution = "";
      if (deps.famic) {
        try {
          const result = await deps.famic.search({ crop, limit: 5 });
          famicAttribution = result.attribution;
          pesticideLines = result.rules.map(
            (r) =>
              `- ${r.productName}（収穫前日数: ${r.preHarvestIntervalDays ?? "不明"}日, 最大適用回数: ${r.maxApplicationsPerSeason ?? "不明"}回）`,
          );
        } catch {
          // non-fatal
        }
      }
      if (pesticideLines.length === 0) {
        pesticideLines = ["- (FAMIC データ未取得)"];
      }

      const sprayInfo = last_spray_date
        ? `最終散布日: **${last_spray_date}**${pesticide_name ? ` / 使用農薬: **${pesticide_name}**` : ""}`
        : "最終散布日: 未指定（残留期間チェックをスキップ）";

      return {
        description: `Harvest readiness for ${crop} at (${lat}, ${lng}).`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `あなたは農業アドバイザーです。**${crop}** の収穫適期を判断してください。`,
                "",
                `座標: ${lat}, ${lng}`,
                sprayInfo,
                "",
                "## 7 日間天気予報",
                "| 日付 | 最低気温(°C) | 最高気温(°C) | 降水量(mm) | 最大風速(m/s) |",
                "|------|-------------|-------------|-----------|-------------|",
                ...weatherLines,
                "",
                ...(attribution ? [`出典: ${attribution}`, ""] : []),
                "## この作物に使われる主な農薬と収穫前日数（FAMIC 登録）",
                ...pesticideLines,
                ...(famicAttribution ? [`出典: ${famicAttribution}`] : []),
                "",
                "## 回答形式",
                "1. **収穫可否の判定**: 気象条件（降雨で作業不可・乾燥不足のリスク）と農薬残留期間を総合して、「収穫可」「要待機」「要確認」の 3 段階で判定。",
                "2. **推奨収穫日**: 7 日間の中で最も条件が良い日を 1〜2 日提案。理由も付記。",
                "3. **農薬残留リスク**: 最終散布日が指定されている場合、収穫前日数を満たしているか計算。未指定なら「農薬使用履歴の確認を推奨」と明記。",
                "4. **作業上の注意点**: 朝露・夕方の湿度・機械搬入可否などの実務的助言。",
                "5. 回答は日本語で、A4 半ページ以内に収めてください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
