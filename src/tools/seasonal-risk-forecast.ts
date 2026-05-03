import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "seasonal_risk_forecast",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 6,
};

const inputSchema = z
  .object({
    lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
    lng: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
    crop: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe("Crop name for crop-specific risk assessment (e.g. さつまいも)."),
  })
  .strict();

interface DailyRisk {
  date: string;
  tempMin: number;
  tempMax: number;
  totalPrecipMm: number;
  peakWindMs: number;
  totalEt0Mm: number;
  minSoilMoisture: number | null;
  risks: string[];
}

const outputSchema = z.object({
  location: z.object({ lat: z.number(), lng: z.number() }),
  crop: z.string().nullable(),
  days: z.array(
    z.object({
      date: z.string(),
      tempMin: z.number(),
      tempMax: z.number(),
      totalPrecipMm: z.number(),
      peakWindMs: z.number(),
      totalEt0Mm: z.number(),
      minSoilMoisture: z.number().nullable(),
      risks: z.array(z.string()),
    }),
  ),
  weekSummary: z.object({
    totalPrecipMm: z.number(),
    totalEt0Mm: z.number(),
    daysWithRain: z.number().int(),
    maxRiskDay: z.string().nullable(),
    overallRisk: z.enum(["low", "moderate", "high"]),
  }),
  attribution: z.string(),
});

export function registerSeasonalRiskForecast(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Weekly seasonal risk forecast",
      description:
        "Provides a 7-day agricultural risk forecast broken down by day. " +
        "Evaluates heat stress, frost risk, heavy rain, drought stress, strong wind, " +
        "and optionally crop-specific risks. Returns a day-by-day breakdown and a " +
        "week summary with an overall risk level. " +
        "Designed for farmers planning their week ahead. Read-only and idempotent.",
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
            },
          ],
        };
      }

      const { lat, lng, crop } = parsed.data;

      let forecast: Awaited<ReturnType<typeof deps.weather.getForecast>>;
      try {
        forecast = await deps.weather.getForecast({ lat, lng, hours: 168, timezone: "Asia/Tokyo" });
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch forecast: ${safeErrorMessage(err)}` }],
        };
      }

      // Aggregate hourly to daily.
      const dailyMap = new Map<string, DailyRisk>();
      for (const h of forecast.hourly) {
        const date = h.time.slice(0, 10);
        const d = dailyMap.get(date) ?? {
          date,
          tempMin: Number.POSITIVE_INFINITY,
          tempMax: Number.NEGATIVE_INFINITY,
          totalPrecipMm: 0,
          peakWindMs: 0,
          totalEt0Mm: 0,
          minSoilMoisture: null as number | null,
          risks: [],
        };
        d.tempMin = Math.min(d.tempMin, h.temperatureC);
        d.tempMax = Math.max(d.tempMax, h.temperatureC);
        d.totalPrecipMm += h.precipitationMm ?? 0;
        d.peakWindMs = Math.max(d.peakWindMs, h.windSpeedMs ?? 0);
        d.totalEt0Mm += h.et0EvapotranspirationMm ?? 0;
        if (h.soilMoisture != null) {
          d.minSoilMoisture =
            d.minSoilMoisture !== null
              ? Math.min(d.minSoilMoisture, h.soilMoisture)
              : h.soilMoisture;
        }
        dailyMap.set(date, d);
      }

      const days = Array.from(dailyMap.values()).slice(0, 7);

      // Assess risks per day.
      const currentMonth = new Date().getMonth() + 1;
      for (const d of days) {
        if (d.tempMax > 35) d.risks.push("猛暑（熱中症・高温障害）");
        if (d.tempMax > 30 && crop === "茶") d.risks.push("茶の高温焼け注意");
        if (d.tempMin < 5) d.risks.push("低温注意");
        if (d.tempMin < 0) d.risks.push("霜害リスク");
        if (d.totalPrecipMm > 50) d.risks.push("大雨（冠水・土砂流出）");
        else if (d.totalPrecipMm > 20) d.risks.push("まとまった雨（散布不可）");
        if (d.peakWindMs > 10) d.risks.push("強風（支柱点検・散布不可）");
        if (d.totalEt0Mm > 6) d.risks.push("蒸発散大（灌水必要）");
        if (d.minSoilMoisture !== null && d.minSoilMoisture < 0.12) d.risks.push("乾燥ストレス");
        if (currentMonth >= 6 && currentMonth <= 9 && d.totalPrecipMm > 10 && d.tempMax > 25) {
          d.risks.push("病害発生リスク（高温多湿）");
        }

        d.tempMin = Math.round(d.tempMin * 10) / 10;
        d.tempMax = Math.round(d.tempMax * 10) / 10;
        d.totalPrecipMm = Math.round(d.totalPrecipMm * 10) / 10;
        d.peakWindMs = Math.round(d.peakWindMs * 10) / 10;
        d.totalEt0Mm = Math.round(d.totalEt0Mm * 10) / 10;
        if (d.minSoilMoisture !== null) {
          d.minSoilMoisture = Math.round(d.minSoilMoisture * 1000) / 1000;
        }
      }

      const totalPrecip = days.reduce((a, d) => a + d.totalPrecipMm, 0);
      const totalEt0 = days.reduce((a, d) => a + d.totalEt0Mm, 0);
      const daysWithRain = days.filter((d) => d.totalPrecipMm > 1).length;
      const maxRiskDay = days.reduce(
        (max, d) => (d.risks.length > (max?.risks.length ?? 0) ? d : max),
        null as DailyRisk | null,
      );

      const totalRiskCount = days.reduce((a, d) => a + d.risks.length, 0);
      let overallRisk: "low" | "moderate" | "high" = "low";
      if (totalRiskCount > 10 || days.some((d) => d.risks.length >= 3)) overallRisk = "high";
      else if (totalRiskCount > 4) overallRisk = "moderate";

      const result = {
        location: { lat, lng },
        crop: crop ?? null,
        days,
        weekSummary: {
          totalPrecipMm: Math.round(totalPrecip * 10) / 10,
          totalEt0Mm: Math.round(totalEt0 * 10) / 10,
          daysWithRain,
          maxRiskDay: maxRiskDay?.date ?? null,
          overallRisk,
        },
        attribution: forecast.attribution,
      };

      const riskBadge = { low: "🟢 低", moderate: "🟡 中", high: "🔴 高" };
      const tableRows = days.map(
        (d) =>
          `| ${d.date} | ${d.tempMin}〜${d.tempMax} | ${d.totalPrecipMm} | ${d.peakWindMs} | ${d.risks.length > 0 ? d.risks.join("、") : "☀️ なし"} |`,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `## 週間リスク予報${crop ? `（${crop}）` : ""}`,
              `総合リスク: **${riskBadge[overallRisk]}**`,
              "",
              "| 日付 | 気温(°C) | 降水(mm) | 風速(m/s) | リスク |",
              "|------|---------|---------|----------|--------|",
              ...tableRows,
              "",
              "### 週間サマリ",
              `- 合計降水量: ${result.weekSummary.totalPrecipMm} mm（雨の日: ${daysWithRain} 日）`,
              `- 合計 ET₀: ${result.weekSummary.totalEt0Mm} mm`,
              ...(maxRiskDay
                ? [`- 最もリスクが高い日: **${maxRiskDay.date}**（${maxRiskDay.risks.join("、")}）`]
                : []),
              "",
              `出典: ${forecast.attribution}`,
            ].join("\n"),
          },
          { type: "text", text: JSON.stringify(result) },
        ],
      };
    },
  );
}
