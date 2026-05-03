import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WeatherAdapter } from "../adapters/_interface.js";
import { safeErrorMessage } from "../lib/errors.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "optimize_harvest_timing",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 7,
};

const inputSchema = z
  .object({
    crop: z
      .string()
      .min(1)
      .max(80)
      .describe("Crop name in Japanese (e.g. さつまいも, みかん, キャベツ)."),
    lat: z
      .number()
      .min(24)
      .max(46)
      .describe("Latitude of the field (decimal degrees, Japan range 24–46)."),
    lng: z
      .number()
      .min(122)
      .max(154)
      .describe("Longitude of the field (decimal degrees, Japan range 122–154)."),
    prefectureCode: z
      .string()
      .regex(/^JP-\d{2}$/)
      .optional()
      .describe(
        "ISO 3166-2:JP prefecture code for market price context (e.g. JP-46). " +
          "If supplied, origin-specific market notes are included.",
      ),
    targetMonth: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe(
        "Month (1-12) around which to evaluate harvest timing. " + "Defaults to current month ±1.",
      ),
  })
  .strict();

type OptimizeInput = z.infer<typeof inputSchema>;

interface HarvestWindow {
  month: number;
  label: string;
  score: number;
  weatherRisk: "low" | "medium" | "high";
  marketTrend: "high" | "average" | "low";
  laborDemand: "high" | "medium" | "low";
  notes: string[];
}

interface CropHarvestData {
  crop: string;
  harvestMonths: number[];
  laborPeakMonths: number[];
  marketSeasonality: Record<number, number>;
  weatherRisks: Record<number, string>;
}

const HARVEST_DB: CropHarvestData[] = [
  {
    crop: "さつまいも",
    aliases: ["サツマイモ", "甘藷", "かんしょ", "紅はるか", "安納芋", "なると金時"],
    harvestMonths: [9, 10, 11],
    laborPeakMonths: [10, 11],
    marketSeasonality: {
      9: 0.9,
      10: 0.9,
      11: 1.0,
      12: 1.1,
      1: 1.2,
      2: 1.3,
      3: 1.3,
    },
    weatherRisks: {
      9: "台風シーズン後半。収穫前の大雨で土壌水分過多に注意",
      10: "概ね安定。朝晩の冷え込みで甘み増加",
      11: "霜の前に収穫完了を目指す。11月下旬以降は霜害リスク",
    },
  } as unknown as CropHarvestData,
  {
    crop: "みかん",
    aliases: [
      "かんきつ",
      "柑橘",
      "温州ミカン",
      "ミカン",
      "ポンカン",
      "デコポン",
      "citrus",
      "伊予柑",
      "せとか",
    ],
    harvestMonths: [10, 11, 12, 1, 2],
    laborPeakMonths: [10, 11, 12],
    marketSeasonality: {
      10: 0.9,
      11: 1.0,
      12: 1.1,
      1: 1.1,
      2: 1.2,
      3: 1.1,
    },
    weatherRisks: {
      10: "収穫初期。雨後の裂果に注意",
      11: "早生温州が最盛。晴天続きで糖度上昇",
      12: "中晩生品種へ移行。寒波による凍害リスク",
      1: "晩生・伊予柑。低温でハウス加温コスト増",
      2: "せとか・デコポン最盛。強風で落果注意",
    },
  } as unknown as CropHarvestData,
  {
    crop: "キャベツ",
    aliases: ["きゃべつ", "cabbage"],
    harvestMonths: [11, 12, 1, 2, 3, 4, 5, 6],
    laborPeakMonths: [12, 1, 2],
    marketSeasonality: {
      11: 0.9,
      12: 1.0,
      1: 1.1,
      2: 1.1,
      3: 1.0,
      4: 0.9,
      5: 0.8,
      6: 1.0,
    },
    weatherRisks: {
      11: "秋冬作収穫開始。生育良好期",
      12: "年内収穫を目指す。凍害前に完了",
      1: "低温で結球固まる。霜害と強風に注意",
      2: "価格高値期。収穫のピーク",
      3: "春作と秋冬作の端境。抽台前に完了",
    },
  } as unknown as CropHarvestData,
  {
    crop: "トマト",
    aliases: ["とまと", "ミニトマト", "大玉トマト"],
    harvestMonths: [6, 7, 8, 9, 10, 11, 12, 1, 2, 3],
    laborPeakMonths: [1, 2, 3, 4],
    marketSeasonality: {
      6: 0.8,
      7: 0.9,
      8: 1.0,
      9: 1.0,
      10: 1.0,
      11: 1.1,
      12: 1.2,
      1: 1.3,
      2: 1.3,
      3: 1.1,
    },
    weatherRisks: {
      6: "梅雨期。灰色かび病・疫病リスク高",
      7: "高温乾燥で着果不良リスク",
      8: "猛暑で収穫ペース落ちることあり",
      11: "ハウス加温開始。燃料費増加",
      12: "低温管理が重要。凍害リスク",
    },
  } as unknown as CropHarvestData,
  {
    crop: "稲",
    aliases: ["米", "水稲", "コメ", "rice", "コシヒカリ", "ヒノヒカリ"],
    harvestMonths: [8, 9, 10],
    laborPeakMonths: [9],
    marketSeasonality: { 8: 0.9, 9: 0.9, 10: 1.0 },
    weatherRisks: {
      8: "早期収穫。台風前に刈り取る戦略もあり",
      9: "主力収穫月。台風・長雨による倒伏・穂発芽に注意",
      10: "晩生品種。気温低下で乾燥遅延リスク",
    },
  } as unknown as CropHarvestData,
  {
    crop: "いちご",
    aliases: ["イチゴ", "strawberry", "あまおう", "紅ほっぺ", "章姫"],
    harvestMonths: [11, 12, 1, 2, 3, 4, 5],
    laborPeakMonths: [12, 1, 2],
    marketSeasonality: {
      11: 0.9,
      12: 1.1,
      1: 1.2,
      2: 1.3,
      3: 1.2,
      4: 1.0,
      5: 0.8,
    },
    weatherRisks: {
      11: "収穫初期。ハウス管理が安定している時期",
      12: "クリスマス需要。天候影響少ない（ハウス栽培）",
      1: "低温期。加温管理が重要",
      2: "最高値期。品質管理を徹底",
    },
  } as unknown as CropHarvestData,
  {
    crop: "花き",
    aliases: ["花卉", "切り花", "菊", "キク", "ユリ", "バラ", "flowers"],
    harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    laborPeakMonths: [3, 8, 12],
    marketSeasonality: {
      1: 1.3,
      2: 1.2,
      3: 1.3,
      4: 1.1,
      5: 1.0,
      6: 0.9,
      7: 0.9,
      8: 1.1,
      9: 0.9,
      10: 0.9,
      11: 1.1,
      12: 1.3,
    },
    weatherRisks: {
      8: "盆需要で最繁忙。熱中症対策必須（ハウス内高温）",
      12: "正月需要。年末年始の出荷集中で繁忙",
    },
  } as unknown as CropHarvestData,
  {
    crop: "すだち",
    aliases: ["スダチ", "酢橘", "徳島すだち"],
    harvestMonths: [8, 9, 10, 11],
    laborPeakMonths: [8, 9],
    marketSeasonality: {
      8: 1.2,
      9: 1.3,
      10: 1.0,
      11: 0.9,
    },
    weatherRisks: {
      8: "収穫最盛。熱中症・集中豪雨に注意",
      9: "需要ピーク（サンマの季節）。価格最高期",
    },
  } as unknown as CropHarvestData,
];

interface AliasedCropData extends CropHarvestData {
  aliases: string[];
}

function findCropData(name: string): CropHarvestData | null {
  const lower = name.toLowerCase();
  for (const entry of HARVEST_DB) {
    const e = entry as AliasedCropData;
    if (e.crop === name || e.aliases?.some((a: string) => a.toLowerCase() === lower)) return entry;
  }
  for (const entry of HARVEST_DB) {
    const e = entry as AliasedCropData;
    if (
      e.crop.includes(name) ||
      name.includes(e.crop) ||
      e.aliases?.some((a: string) => a.includes(name) || name.includes(a))
    ) {
      return entry;
    }
  }
  return null;
}

function scoringNote(
  weatherRisk: "low" | "medium" | "high",
  marketTrend: "high" | "average" | "low",
  laborDemand: "high" | "medium" | "low",
): number {
  const weatherScore = weatherRisk === "low" ? 3 : weatherRisk === "medium" ? 2 : 1;
  const marketScore = marketTrend === "high" ? 3 : marketTrend === "average" ? 2 : 1;
  const laborScore = laborDemand === "high" ? 3 : laborDemand === "medium" ? 2 : 1;
  return weatherScore + marketScore * 1.5 + laborScore;
}

async function fetchWeatherRisk(
  weather: WeatherAdapter,
  lat: number,
  lng: number,
  month: number,
): Promise<{ precipMm: number; windKph: number; tempMax: number }> {
  try {
    const data = await weather.getForecast({ lat, lng, hours: 168 }); // 7 days
    const hourly = data.hourly;
    if (!hourly || hourly.length === 0) return { precipMm: 0, windKph: 0, tempMax: 25 };
    const totalPrecip = hourly.reduce((a, h) => a + (h.precipitationMm ?? 0), 0);
    const maxWind = Math.max(...hourly.map((h) => (h.windSpeedMs ?? 0) * 3.6));
    const maxTemp = Math.max(...hourly.map((h) => h.temperatureC ?? 25));
    return { precipMm: totalPrecip, windKph: maxWind, tempMax: maxTemp };
  } catch {
    const precipByMonth: Record<number, number> = {
      6: 180,
      7: 200,
      8: 160,
      9: 220,
      10: 80,
      11: 60,
      12: 50,
      1: 40,
      2: 50,
      3: 100,
      4: 120,
      5: 140,
    };
    return {
      precipMm: precipByMonth[month] ?? 80,
      windKph: month === 9 ? 40 : 15,
      tempMax: month >= 6 && month <= 9 ? 35 : 20,
    };
  }
}

const outputSchema = z.object({
  crop: z.string(),
  lat: z.number(),
  lng: z.number(),
  evaluatedMonth: z.number().int().min(1).max(12),
  windows: z.array(
    z.object({
      month: z.number().int().min(1).max(12),
      label: z.string(),
      score: z.number(),
      weatherRisk: z.enum(["low", "medium", "high"]),
      marketTrend: z.enum(["high", "average", "low"]),
      laborDemand: z.enum(["high", "medium", "low"]),
      notes: z.array(z.string()),
    }),
  ),
  recommendedMonth: z.number().int().min(1).max(12),
  recommendedLabel: z.string(),
  reasoning: z.string(),
  sswDispatchNote: z.string(),
  attribution: z.string(),
});

export function registerOptimizeHarvestTiming(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Harvest timing optimizer",
      description:
        "Synthesizes weather forecast, crop seasonal calendar, and market price seasonality " +
        "to recommend the optimal harvest window for a given crop and field location. " +
        "Returns a scored evaluation for each candidate harvest month with weather risk, " +
        "market trend, labor demand, and a recommended timing with SSW dispatch note. " +
        "Designed for Sugu-kuru dispatch planning decisions. Read-only.",
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = inputSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid input: ${parsed.error.issues[0]?.message}` }],
        };
      }

      const { crop, lat, lng, prefectureCode, targetMonth } = parsed.data as OptimizeInput;
      const baseMonth = targetMonth ?? new Date().getMonth() + 1;

      const cropData = findCropData(crop);
      if (!cropData) {
        const available = HARVEST_DB.map((e) => (e as AliasedCropData).crop);
        return {
          content: [
            {
              type: "text",
              text: `「${crop}」の収穫最適化データはまだ登録されていません。\n登録済み: ${available.join("、")}`,
            },
          ],
          structuredContent: {
            crop,
            lat,
            lng,
            evaluatedMonth: baseMonth,
            windows: [],
            recommendedMonth: baseMonth,
            recommendedLabel: `${baseMonth}月`,
            reasoning: "作物データなし",
            sswDispatchNote: "データなし",
            attribution: "AgriOps MCP harvest optimizer",
          } as unknown as Record<string, unknown>,
        };
      }

      const candidateMonths = cropData.harvestMonths;

      try {
        const weatherData = await fetchWeatherRisk(deps.weather, lat, lng, baseMonth);

        const windows: HarvestWindow[] = candidateMonths.map((month) => {
          const notes: string[] = [];

          // Weather risk assessment
          let weatherRisk: "low" | "medium" | "high" = "low";
          if (month === baseMonth) {
            if (weatherData.precipMm > 150) {
              weatherRisk = "high";
              notes.push(`直近7日で${Math.round(weatherData.precipMm)}mmの降水予報`);
            } else if (weatherData.precipMm > 80) {
              weatherRisk = "medium";
              notes.push(`直近7日で${Math.round(weatherData.precipMm)}mmの降水予報`);
            }
            if (weatherData.windKph > 50) {
              weatherRisk = "high";
              notes.push(`最大風速${Math.round(weatherData.windKph)}km/h — 収穫作業に支障`);
            }
            if (weatherData.tempMax > 38) {
              weatherRisk = "high";
              notes.push(`最高気温${Math.round(weatherData.tempMax)}°C — 熱中症リスク`);
            }
          }

          const staticRisk = (cropData.weatherRisks as Record<number, string>)[month];
          if (staticRisk) notes.push(staticRisk);

          if (month === 9 && weatherRisk === "low") {
            weatherRisk = "medium";
            notes.push("9月は台風シーズン。気象情報を毎日確認");
          }

          // Market trend
          const factor = cropData.marketSeasonality[month] ?? 1.0;
          const marketTrend: "high" | "average" | "low" =
            factor >= 1.15 ? "high" : factor <= 0.88 ? "low" : "average";
          notes.push(
            `市場価格: ${marketTrend === "high" ? "高め" : marketTrend === "low" ? "低め" : "平年並み"}（季節係数 ${factor.toFixed(2)}）`,
          );

          if (prefectureCode) {
            notes.push(`産地: ${prefectureCode}`);
          }

          // Labor demand
          const laborDemand: "high" | "medium" | "low" = cropData.laborPeakMonths.includes(month)
            ? "high"
            : cropData.harvestMonths.includes(month)
              ? "medium"
              : "low";

          const score = scoringNote(weatherRisk, marketTrend, laborDemand);

          return {
            month,
            label: `${month}月`,
            score,
            weatherRisk,
            marketTrend,
            laborDemand,
            notes,
          };
        });

        windows.sort((a, b) => b.score - a.score);

        const best = windows[0];
        if (!best) {
          throw new Error("収穫月の評価結果が空です");
        }

        const weatherLabel = {
          low: "気象リスク低",
          medium: "気象リスク中程度",
          high: "気象リスク高",
        };
        const marketLabel = {
          high: "市場価格が高め",
          average: "市場価格は平年並み",
          low: "市場価格は低め",
        };

        const reasoning = `${best.label}を推奨: ${weatherLabel[best.weatherRisk]}・${marketLabel[best.marketTrend]}・労働需要${best.laborDemand === "high" ? "高い" : best.laborDemand === "medium" ? "中程度" : "低め"}。${best.notes[0] ? ` ${best.notes[0]}` : ""}`;

        const sswNote =
          best.laborDemand === "high"
            ? `${best.label}は収穫ピーク月 — SSW の優先派遣対象。早めの農家折衝と人員確保を推奨。`
            : `${best.label}は収穫月だが労働需要はピーク以外 — 他地域との調整を考慮しながら配分可能。`;

        const structured = {
          crop: (cropData as AliasedCropData).crop,
          lat,
          lng,
          evaluatedMonth: baseMonth,
          windows,
          recommendedMonth: best.month,
          recommendedLabel: best.label,
          reasoning,
          sswDispatchNote: sswNote,
          attribution:
            "AgriOps MCP harvest optimizer (weather: Open-Meteo, calendar: built-in, market: ALIC reference)",
        };

        const riskIcon = { low: "○", medium: "△", high: "×" };
        const marketIcon = { high: "↑", average: "→", low: "↓" };
        const laborIcon = { high: "◎", medium: "○", low: "△" };

        const tableRows = windows.map(
          (w) =>
            `| ${w.label} | ${riskIcon[w.weatherRisk]} ${w.weatherRisk} | ` +
            `${marketIcon[w.marketTrend]} ${w.marketTrend} | ${laborIcon[w.laborDemand]} | ${w.score.toFixed(1)} |`,
        );

        return {
          content: [
            {
              type: "text",
              text: [
                `## ${(cropData as AliasedCropData).crop} 収穫タイミング最適化 (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E)`,
                "",
                `### 推奨収穫月: **${best.label}**`,
                reasoning,
                "",
                "### 候補月スコア表",
                "| 月 | 気象リスク | 市場傾向 | 労働需要 | 総合スコア |",
                "|---|---------|---------|---------|---------|",
                ...tableRows,
                "",
                "### スグクル派遣メモ",
                sswNote,
                "",
                `出典: ${structured.attribution}`,
              ].join("\n"),
            },
          ],
          structuredContent: structured as unknown as Record<string, unknown>,
        };
      } catch (err) {
        deps.logger.error("optimize_harvest_timing failed", { error: safeErrorMessage(err) });
        return {
          isError: true,
          content: [{ type: "text", text: safeErrorMessage(err) }],
        };
      }
    },
  );
}
