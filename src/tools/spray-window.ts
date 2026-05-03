import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "spray_window",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 6,
};

const inputSchema = z
  .object({
    lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees, WGS84."),
    lng: z.number().min(-180).max(180).describe("Longitude in decimal degrees, WGS84."),
    hours: z
      .number()
      .int()
      .min(6)
      .max(120)
      .optional()
      .describe("Look-ahead hours (default: 48, max: 120)."),
    wind_threshold_ms: z
      .number()
      .min(0)
      .max(20)
      .optional()
      .describe("Max acceptable wind speed for spraying, m/s (default: 3.0)."),
  })
  .strict();

interface SpraySlot {
  start: string;
  end: string;
  durationHours: number;
  avgWindMs: number;
  avgHumidity: number;
  precipRisk: boolean;
}

const outputSchema = z.object({
  location: z.object({ lat: z.number(), lng: z.number() }),
  analysisHours: z.number().int(),
  windThresholdMs: z.number(),
  suitableSlots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      durationHours: z.number(),
      avgWindMs: z.number(),
      avgHumidity: z.number(),
      precipRisk: z.boolean(),
    }),
  ),
  totalSuitableHours: z.number().int(),
  recommendation: z.string(),
  attribution: z.string(),
});

export function registerSprayWindow(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Pesticide spray window finder",
      description:
        "Analyzes hourly weather to find safe time windows for pesticide spraying. " +
        "Evaluates wind speed (< threshold, default 3 m/s), precipitation (must be 0), " +
        "and humidity (40–90% optimal). Returns ranked slots. " +
        "For best results, call during the morning of the planned spray day. " +
        "Read-only and idempotent.",
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

      const { lat, lng, hours: requestedHours, wind_threshold_ms } = parsed.data;
      const hours = requestedHours ?? 48;
      const windThreshold = wind_threshold_ms ?? 3.0;

      let forecast: Awaited<ReturnType<typeof deps.weather.getForecast>>;
      try {
        forecast = await deps.weather.getForecast({ lat, lng, hours, timezone: "Asia/Tokyo" });
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch forecast: ${safeErrorMessage(err)}` }],
        };
      }

      const hourly = forecast.hourly;

      // Find contiguous windows where spraying is acceptable.
      const slots: SpraySlot[] = [];
      let currentSlotStart: number | null = null;

      for (let i = 0; i <= hourly.length; i++) {
        const h = hourly[i];
        const ok =
          h != null && (h.windSpeedMs ?? 0) <= windThreshold && (h.precipitationMm ?? 0) === 0;

        if (ok && currentSlotStart === null) {
          currentSlotStart = i;
        } else if (!ok && currentSlotStart !== null) {
          const slotHours = hourly.slice(currentSlotStart, i);
          const avgWind =
            slotHours.reduce((a, s) => a + (s.windSpeedMs ?? 0), 0) / slotHours.length;
          const avgHumidity =
            slotHours.reduce((a, s) => a + (s.relativeHumidity ?? 50), 0) / slotHours.length;

          // Check if rain is expected within 2 hours after the slot ends (washoff risk).
          const precipRisk = hourly
            .slice(i, Math.min(i + 2, hourly.length))
            .some((future) => (future.precipitationMm ?? 0) > 0);

          const slotStartHour = hourly[currentSlotStart];
          const slotEndHour = hourly[i - 1];
          slots.push({
            start: slotStartHour?.time ?? "",
            end: slotEndHour?.time ?? "",
            durationHours: slotHours.length,
            avgWindMs: Math.round(avgWind * 10) / 10,
            avgHumidity: Math.round(avgHumidity),
            precipRisk,
          });
          currentSlotStart = null;
        }
      }

      // Filter to slots >= 2 hours and sort: prefer longer, no precip risk, optimal humidity.
      const viableSlots = slots
        .filter((s) => s.durationHours >= 2)
        .sort((a, b) => {
          if (a.precipRisk !== b.precipRisk) return a.precipRisk ? 1 : -1;
          const aHumOk = a.avgHumidity >= 40 && a.avgHumidity <= 90 ? 1 : 0;
          const bHumOk = b.avgHumidity >= 40 && b.avgHumidity <= 90 ? 1 : 0;
          if (aHumOk !== bHumOk) return bHumOk - aHumOk;
          return b.durationHours - a.durationHours;
        })
        .slice(0, 8);

      const totalSuitableHours = viableSlots.reduce((a, s) => a + s.durationHours, 0);

      let recommendation: string;
      if (viableSlots.length === 0) {
        recommendation = `今後 ${hours} 時間に散布適期はありません。風速または降水の条件を満たせないため、日程の延期を検討してください。`;
      } else if (viableSlots[0]?.precipRisk) {
        recommendation =
          "散布可能な枠はありますが、直後に降雨リスクがあります。" +
          "薬剤の流亡に注意し、展着剤の使用または別日を検討してください。";
      } else {
        const best = viableSlots[0] as SpraySlot;
        recommendation = `最良の散布枠: ${best.start} 〜 ${best.end}（${best.durationHours}時間、平均風速 ${best.avgWindMs} m/s）。降雨リスクなし。`;
      }

      const result = {
        location: { lat, lng },
        analysisHours: hours,
        windThresholdMs: windThreshold,
        suitableSlots: viableSlots,
        totalSuitableHours,
        recommendation,
        attribution: forecast.attribution,
      };

      const slotLines =
        viableSlots.length > 0
          ? viableSlots.map(
              (s, i) =>
                `| ${i + 1} | ${s.start.slice(5, 16)} | ${s.end.slice(5, 16)} | ${s.durationHours}h | ` +
                `${s.avgWindMs} m/s | ${s.avgHumidity}% | ${s.precipRisk ? "あり" : "なし"} |`,
            )
          : ["| - | (適期なし) | - | - | - | - | - |"];

      return {
        content: [
          {
            type: "text",
            text: [
              `## 農薬散布適期判定 (${lat}, ${lng})`,
              `期間: 今後 ${hours} 時間 | 風速上限: ${windThreshold} m/s`,
              "",
              "| # | 開始 | 終了 | 時間 | 平均風速 | 平均湿度 | 降雨リスク |",
              "|---|------|------|------|----------|----------|-----------|",
              ...slotLines,
              "",
              `**判定**: ${recommendation}`,
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
