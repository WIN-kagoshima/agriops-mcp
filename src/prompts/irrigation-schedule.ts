import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

export function registerIrrigationSchedulePrompt(server: McpServer, deps: Deps): void {
  server.registerPrompt(
    "irrigation_schedule",
    {
      title: "Irrigation schedule from ET₀ and soil moisture",
      description:
        "User-controlled slash command. Uses the 7-day ET₀ evapotranspiration and volumetric soil-moisture " +
        "forecast to recommend an irrigation schedule for the specified field. " +
        "Requires get_weather_1km with Open-Meteo agricultural indicators.",
      argsSchema: {
        lat: z.string().min(1).describe("Latitude of the field in decimal degrees (e.g. '31.59')."),
        lng: z
          .string()
          .min(1)
          .describe("Longitude of the field in decimal degrees (e.g. '130.54')."),
        crop: z
          .string()
          .optional()
          .describe("Crop name in Japanese (e.g. さつまいも). Used to contextualise the advice."),
        field_area_ha: z
          .string()
          .optional()
          .describe("Field area in hectares (e.g. '0.8'). Used to estimate total water volume."),
      },
    },
    async ({ lat, lng, crop, field_area_ha }) => {
      const latNum = Number.parseFloat(lat);
      const lngNum = Number.parseFloat(lng);

      if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
        return {
          description: "Irrigation schedule (invalid coordinates).",
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

      // Fetch 168-hour forecast with ET₀ and soil moisture.
      let forecastLines: string[] = [];
      let attribution = "";

      try {
        const forecast = await deps.weather.getForecast({
          lat: latNum,
          lng: lngNum,
          hours: 168,
          timezone: "Asia/Tokyo",
        });
        attribution = forecast.attribution;

        // Aggregate daily ET₀ and soil moisture from hourly data.
        const dailyMap = new Map<
          string,
          { et0Sum: number; soilMoistureAvg: number; count: number; precipSum: number }
        >();

        for (const h of forecast.hourly) {
          const day = h.time.slice(0, 10); // YYYY-MM-DD
          const existing = dailyMap.get(day) ?? {
            et0Sum: 0,
            soilMoistureAvg: 0,
            count: 0,
            precipSum: 0,
          };
          existing.et0Sum += h.et0EvapotranspirationMm ?? 0;
          existing.soilMoistureAvg += h.soilMoisture ?? 0;
          existing.precipSum += h.precipitationMm ?? 0;
          existing.count += 1;
          dailyMap.set(day, existing);
        }

        forecastLines = Array.from(dailyMap.entries())
          .slice(0, 7)
          .map(([day, d]) => {
            const sm = d.count > 0 ? (d.soilMoistureAvg / d.count).toFixed(3) : "n/a";
            return (
              `- ${day}: ET₀ ${d.et0Sum.toFixed(1)} mm, ` +
              `降水量 ${d.precipSum.toFixed(1)} mm, ` +
              `土壌水分 ${sm} m³/m³`
            );
          });
      } catch {
        forecastLines = ["- (予報の取得に失敗しました)"];
      }

      const cropLine = crop ? `対象作物: **${crop}**` : "対象作物: 未指定";
      const areaLine = field_area_ha
        ? `圃場面積: **${field_area_ha} ha**（1 mm ET₀ ≈ ${(Number.parseFloat(field_area_ha) * 10).toFixed(0)} L/ha 換算）`
        : "圃場面積: 未指定";

      return {
        description: `Irrigation schedule for (${lat}, ${lng}).`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたは農業技術アドバイザーです。以下の ET₀ 蒸発散量・降水量・土壌水分の 7 日間予報をもとに、具体的な灌水スケジュールを提案してください。",
                "",
                `座標: ${lat}, ${lng}`,
                cropLine,
                areaLine,
                "",
                "## 7 日間気象予報（Open-Meteo, FAO-56 Penman-Monteith ET₀）",
                ...forecastLines,
                "",
                ...(attribution ? [`出典: ${attribution}`, ""] : []),
                "## 回答形式",
                "1. 各日の推奨灌水量（mm または L/ha）と灌水タイミング（朝/夕）を表形式で示す。",
                "2. 土壌水分が 0.15 m³/m³ を下回る日、または ET₀ が 5 mm を超える連続 2 日以上を **要注意** として強調する。",
                "3. 圃場面積が指定されている場合は総必要水量（L）も算出する。",
                "4. 回答は日本語で、A4 半ページ相当に収める。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
