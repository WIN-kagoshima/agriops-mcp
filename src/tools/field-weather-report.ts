import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "field_weather_report",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 6,
};

const inputSchema = z
  .object({
    field_id: z.string().min(1).max(64).describe("eMAFF Fude polygon ID, e.g. K46-0001-0001."),
    hours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .optional()
      .describe("Forecast horizon in hours (default: 72, max: 168)."),
  })
  .strict();

const outputSchema = z.object({
  fieldId: z.string(),
  address: z.string(),
  registeredCrop: z.string().nullable(),
  areaHa: z.number(),
  forecast: z.object({
    hours: z.number().int(),
    tempMinC: z.number(),
    tempMaxC: z.number(),
    totalPrecipMm: z.number(),
    peakWindMs: z.number(),
    totalEt0Mm: z.number(),
    minSoilMoisture: z.number().nullable(),
    avgSoilMoisture: z.number().nullable(),
  }),
  jmaWarnings: z.array(
    z.object({
      kind: z.string(),
      severity: z.string(),
      areaName: z.string(),
    }),
  ),
  riskFlags: z.array(z.string()),
  attribution: z.string(),
});

export function registerFieldWeatherReport(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Integrated field weather report",
      description:
        "Given a single eMAFF field ID, fetches the field's location, runs a multi-day weather forecast, " +
        "checks for active JMA warnings in the field's prefecture, and returns a unified risk-flagged report. " +
        "Combines get_weather_1km + get_weather_warning into one call for agent convenience. " +
        "Requires eMAFF adapter. Read-only and idempotent.",
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

      const { field_id, hours: requestedHours } = parsed.data;
      const hours = requestedHours ?? 72;
      const emaff = deps.emaff;

      if (!emaff) {
        return {
          isError: true,
          content: [
            { type: "text", text: "eMAFF adapter is not configured. Cannot look up field." },
          ],
        };
      }

      let field: Awaited<ReturnType<typeof emaff.get>>;
      try {
        field = await emaff.get(field_id);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch field: ${safeErrorMessage(err)}` }],
        };
      }

      if (!field) {
        return {
          isError: true,
          content: [{ type: "text", text: `Field ${field_id} not found in eMAFF snapshot.` }],
        };
      }

      const [forecast, jmaResult] = await Promise.all([
        deps.weather
          .getForecast({
            lat: field.centroid.lat,
            lng: field.centroid.lng,
            hours,
            timezone: "Asia/Tokyo",
          })
          .catch(() => null),
        deps.jma
          ? deps.jma
              .getActiveWarnings({ prefectureCode: field.prefectureCode })
              .catch(() => ({ warnings: [], fetchedAt: "", attribution: "JMA" }))
          : { warnings: [], fetchedAt: "", attribution: "JMA" },
      ]);

      const hourly = forecast?.hourly ?? [];
      const tempMinC = hourly.length > 0 ? Math.min(...hourly.map((h) => h.temperatureC)) : 0;
      const tempMaxC = hourly.length > 0 ? Math.max(...hourly.map((h) => h.temperatureC)) : 0;
      const totalPrecipMm = hourly.reduce((a, h) => a + (h.precipitationMm ?? 0), 0);
      const peakWindMs =
        hourly.length > 0 ? Math.max(0, ...hourly.map((h) => h.windSpeedMs ?? 0)) : 0;
      const totalEt0Mm = hourly.reduce((a, h) => a + (h.et0EvapotranspirationMm ?? 0), 0);
      const soilMoistureValues = hourly
        .map((h) => h.soilMoisture)
        .filter((v): v is number => v != null);
      const minSoilMoisture =
        soilMoistureValues.length > 0 ? Math.min(...soilMoistureValues) : null;
      const avgSoilMoisture =
        soilMoistureValues.length > 0
          ? soilMoistureValues.reduce((a, b) => a + b, 0) / soilMoistureValues.length
          : null;

      const relevantWarnings = jmaResult.warnings
        .filter((w) => w.severity !== "info")
        .map((w) => ({ kind: w.kind, severity: w.severity, areaName: w.areaName }));

      const riskFlags: string[] = [];
      if (totalPrecipMm > 50) riskFlags.push("heavy_rain");
      if (peakWindMs > 10) riskFlags.push("strong_wind");
      if (totalEt0Mm > 5 * (hours / 24)) riskFlags.push("high_evapotranspiration");
      if (minSoilMoisture !== null && minSoilMoisture < 0.15) riskFlags.push("drought_stress");
      if (tempMaxC > 35) riskFlags.push("heat_stress");
      if (tempMinC < 3) riskFlags.push("frost_risk");
      if (relevantWarnings.length > 0) riskFlags.push("jma_warning_active");

      const areaHa = field.areaM2 / 10_000;
      const attribution = [field.attribution, forecast?.attribution, jmaResult.attribution]
        .filter(Boolean)
        .join(" | ");

      const result = {
        fieldId: field.fieldId,
        address: field.address || "(不明)",
        registeredCrop: field.registeredCrop,
        areaHa: Math.round(areaHa * 100) / 100,
        forecast: {
          hours,
          tempMinC: Math.round(tempMinC * 10) / 10,
          tempMaxC: Math.round(tempMaxC * 10) / 10,
          totalPrecipMm: Math.round(totalPrecipMm * 10) / 10,
          peakWindMs: Math.round(peakWindMs * 10) / 10,
          totalEt0Mm: Math.round(totalEt0Mm * 10) / 10,
          minSoilMoisture:
            minSoilMoisture !== null ? Math.round(minSoilMoisture * 1000) / 1000 : null,
          avgSoilMoisture:
            avgSoilMoisture !== null ? Math.round(avgSoilMoisture * 1000) / 1000 : null,
        },
        jmaWarnings: relevantWarnings,
        riskFlags,
        attribution,
      };

      const riskLine =
        riskFlags.length > 0 ? `**リスク**: ${riskFlags.join(", ")}` : "リスクフラグなし（安全圏）";

      const warningLines =
        relevantWarnings.length > 0
          ? [
              "",
              "### JMA 警報・注意報",
              ...relevantWarnings.map((w) => `- [${w.severity}] ${w.kind} — ${w.areaName}`),
            ]
          : [];

      return {
        content: [
          {
            type: "text",
            text: [
              `## 圃場気象レポート: ${field.fieldId}`,
              `所在地: ${field.address || "(不明)"} | 面積: ${areaHa.toFixed(2)} ha | 作物: ${field.registeredCrop ?? "未登録"}`,
              "",
              `### ${hours}時間予報サマリ`,
              `- 気温: ${result.forecast.tempMinC}°C 〜 ${result.forecast.tempMaxC}°C`,
              `- 合計降水量: ${result.forecast.totalPrecipMm} mm`,
              `- 最大風速: ${result.forecast.peakWindMs} m/s`,
              `- ET₀合計: ${result.forecast.totalEt0Mm} mm`,
              ...(minSoilMoisture !== null
                ? [
                    `- 土壌水分: 最小 ${result.forecast.minSoilMoisture} / 平均 ${result.forecast.avgSoilMoisture} m³/m³`,
                  ]
                : []),
              ...warningLines,
              "",
              riskLine,
              "",
              `出典: ${attribution}`,
            ].join("\n"),
          },
          { type: "text", text: JSON.stringify(result) },
        ],
      };
    },
  );
}
