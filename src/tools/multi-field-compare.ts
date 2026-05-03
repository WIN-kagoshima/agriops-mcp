import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "multi_field_compare",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 6,
};

const inputSchema = z
  .object({
    field_ids: z.string().min(1).describe("Comma-separated eMAFF field IDs to compare (max 10)."),
    hours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .optional()
      .describe("Forecast horizon in hours (default: 24)."),
  })
  .strict();

const fieldComparisonSchema = z.object({
  fieldId: z.string(),
  address: z.string(),
  registeredCrop: z.string().nullable(),
  areaHa: z.number(),
  forecast: z.object({
    tempRange: z.string(),
    totalPrecipMm: z.number(),
    peakWindMs: z.number(),
    totalEt0Mm: z.number(),
  }),
  riskLevel: z.enum(["safe", "caution", "danger"]),
  riskFlags: z.array(z.string()),
});

const outputSchema = z.object({
  fields: z.array(fieldComparisonSchema),
  comparedAt: z.string(),
  forecastHours: z.number().int(),
  bestFieldForWork: z.string().nullable(),
  attribution: z.string(),
});

export function registerMultiFieldCompare(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Compare conditions across multiple fields",
      description:
        "Takes up to 10 eMAFF field IDs and returns a side-by-side comparison of " +
        "current weather conditions, risk levels, and work suitability. " +
        "Designed for dispatch managers deciding which fields to work today, " +
        "and extension officers comparing conditions across their portfolio. " +
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

      const emaff = deps.emaff;
      if (!emaff) {
        return {
          isError: true,
          content: [{ type: "text", text: "eMAFF adapter is not configured." }],
        };
      }

      const ids = parsed.data.field_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      const hours = parsed.data.hours ?? 24;

      if (ids.length === 0) {
        return {
          isError: true,
          content: [{ type: "text", text: "field_ids が空です。" }],
        };
      }

      type FieldComparison = z.infer<typeof fieldComparisonSchema>;
      const results: FieldComparison[] = [];
      const attributions: string[] = [];

      await Promise.all(
        ids.map(async (fieldId) => {
          try {
            const field = await emaff.get(fieldId);
            if (!field) return;

            const fc = await deps.weather
              .getForecast({
                lat: field.centroid.lat,
                lng: field.centroid.lng,
                hours,
                timezone: "Asia/Tokyo",
              })
              .catch(() => null);

            const hourly = fc?.hourly ?? [];
            const temps = hourly.map((h) => h.temperatureC);
            const tMin = temps.length > 0 ? Math.min(...temps) : 0;
            const tMax = temps.length > 0 ? Math.max(...temps) : 0;
            const totalPrecip = hourly.reduce((a, h) => a + (h.precipitationMm ?? 0), 0);
            const peakWind =
              hourly.length > 0 ? Math.max(0, ...hourly.map((h) => h.windSpeedMs ?? 0)) : 0;
            const totalEt0 = hourly.reduce((a, h) => a + (h.et0EvapotranspirationMm ?? 0), 0);

            if (fc?.attribution && !attributions.includes(fc.attribution)) {
              attributions.push(fc.attribution);
            }
            if (!attributions.includes(field.attribution)) {
              attributions.push(field.attribution);
            }

            const riskFlags: string[] = [];
            if (totalPrecip > 20) riskFlags.push("rain");
            if (peakWind > 8) riskFlags.push("wind");
            if (tMax > 35) riskFlags.push("heat");
            if (tMin < 3) riskFlags.push("frost");

            let riskLevel: "safe" | "caution" | "danger" = "safe";
            if (totalPrecip > 50 || peakWind > 15) riskLevel = "danger";
            else if (riskFlags.length > 0) riskLevel = "caution";

            results.push({
              fieldId: field.fieldId,
              address: field.address || "(不明)",
              registeredCrop: field.registeredCrop,
              areaHa: Math.round((field.areaM2 / 10_000) * 100) / 100,
              forecast: {
                tempRange: `${tMin.toFixed(1)}〜${tMax.toFixed(1)}°C`,
                totalPrecipMm: Math.round(totalPrecip * 10) / 10,
                peakWindMs: Math.round(peakWind * 10) / 10,
                totalEt0Mm: Math.round(totalEt0 * 10) / 10,
              },
              riskLevel,
              riskFlags,
            });
          } catch (err) {
            results.push({
              fieldId,
              address: `(エラー: ${safeErrorMessage(err)})`,
              registeredCrop: null,
              areaHa: 0,
              forecast: { tempRange: "-", totalPrecipMm: 0, peakWindMs: 0, totalEt0Mm: 0 },
              riskLevel: "danger",
              riskFlags: ["fetch_error"],
            });
          }
        }),
      );

      // Sort: safe first, then caution, then danger.
      const order = { safe: 0, caution: 1, danger: 2 };
      results.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);

      const bestField = results.find((f) => f.riskLevel === "safe")?.fieldId ?? null;

      const output = {
        fields: results,
        comparedAt: new Date().toISOString(),
        forecastHours: hours,
        bestFieldForWork: bestField,
        attribution: attributions.join(" | "),
      };

      const riskEmoji = { safe: "☀️", caution: "⚠️", danger: "🚫" };
      const tableRows = results.map(
        (f) =>
          `| ${riskEmoji[f.riskLevel]} | ${f.fieldId} | ${f.registeredCrop ?? "-"} | ${f.forecast.tempRange} | ${f.forecast.totalPrecipMm} | ${f.forecast.peakWindMs} | ${f.riskFlags.join(",") || "-"} |`,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `## 圃場比較レポート（${hours}時間予報）`,
              "",
              "| 判定 | 圃場ID | 作物 | 気温 | 降水(mm) | 最大風速(m/s) | リスク |",
              "|------|--------|------|------|---------|-------------|--------|",
              ...tableRows,
              "",
              bestField
                ? `**推奨**: ${bestField} が最も作業条件が良好です。`
                : "**注意**: 全圃場に何らかのリスクがあります。優先順位を慎重に検討してください。",
              "",
              `出典: ${output.attribution}`,
            ].join("\n"),
          },
          { type: "text", text: JSON.stringify(output) },
        ],
      };
    },
  );
}
