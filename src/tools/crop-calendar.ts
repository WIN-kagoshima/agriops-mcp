import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "crop_calendar",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 6,
};

const inputSchema = z
  .object({
    crop: z
      .string()
      .min(1)
      .max(80)
      .describe("Crop name in Japanese (e.g. さつまいも, 稲, キャベツ)."),
    region: z
      .enum([
        "hokkaido",
        "tohoku",
        "kanto",
        "chubu",
        "kinki",
        "chugoku",
        "shikoku",
        "kyushu",
        "okinawa",
      ])
      .optional()
      .describe("Climate region. Defaults to kyushu. Shifts timing windows accordingly."),
  })
  .strict();

type CropCalendarInput = z.infer<typeof inputSchema>;

interface SeasonalWindow {
  activity: string;
  startMonth: number;
  endMonth: number;
  notes: string;
}

interface CropEntry {
  crop: string;
  aliases: string[];
  windows: Record<string, SeasonalWindow[]>;
}

const DEFAULT_REGION = "kyushu";

const SHIFT: Record<string, number> = {
  hokkaido: 1,
  tohoku: 1,
  kanto: 0,
  chubu: 0,
  kinki: 0,
  chugoku: 0,
  shikoku: 0,
  kyushu: 0,
  okinawa: -1,
};

function clampMonth(m: number): number {
  if (m < 1) return m + 12;
  if (m > 12) return m - 12;
  return m;
}

const CROP_DB: CropEntry[] = [
  {
    crop: "稲",
    aliases: ["米", "水稲", "コシヒカリ", "ヒノヒカリ"],
    windows: {
      kyushu: [
        { activity: "育苗", startMonth: 3, endMonth: 4, notes: "ハウス育苗。水温管理が鍵" },
        { activity: "田植え", startMonth: 5, endMonth: 6, notes: "梅雨前の安定期を狙う" },
        { activity: "中干し", startMonth: 6, endMonth: 7, notes: "分げつ抑制・根の活性化" },
        { activity: "穂肥", startMonth: 7, endMonth: 7, notes: "出穂 20 日前目安" },
        { activity: "防除（いもち病）", startMonth: 6, endMonth: 8, notes: "高温多湿時に要注意" },
        { activity: "収穫", startMonth: 9, endMonth: 10, notes: "黄化率 85%が目安" },
      ],
    },
  },
  {
    crop: "さつまいも",
    aliases: ["サツマイモ", "甘藷", "かんしょ", "紅はるか", "安納芋"],
    windows: {
      kyushu: [
        {
          activity: "苗床づくり",
          startMonth: 2,
          endMonth: 3,
          notes: "伏せ込み。土壌温度 15°C 以上",
        },
        {
          activity: "挿苗（定植）",
          startMonth: 5,
          endMonth: 6,
          notes: "梅雨明け前まで。畝立て＋マルチ推奨",
        },
        { activity: "つる返し", startMonth: 7, endMonth: 8, notes: "不定根の養分分散を防ぐ" },
        {
          activity: "防除（アブラムシ・ヨトウムシ）",
          startMonth: 6,
          endMonth: 9,
          notes: "FAMIC 登録を確認",
        },
        { activity: "試し掘り", startMonth: 9, endMonth: 9, notes: "肥大確認。収穫判断の材料" },
        { activity: "収穫", startMonth: 10, endMonth: 11, notes: "霜前に完了。キュアリング推奨" },
      ],
    },
  },
  {
    crop: "キャベツ",
    aliases: ["きゃべつ", "cabbage"],
    windows: {
      kyushu: [
        { activity: "播種（秋冬作）", startMonth: 7, endMonth: 8, notes: "セルトレイ育苗" },
        { activity: "定植（秋冬作）", startMonth: 8, endMonth: 9, notes: "株間 35cm。活着後追肥" },
        {
          activity: "防除（アオムシ・コナガ）",
          startMonth: 9,
          endMonth: 12,
          notes: "BT 剤や IGR 剤のローテーション",
        },
        { activity: "収穫（秋冬作）", startMonth: 11, endMonth: 2, notes: "結球硬度で判断" },
        { activity: "播種（春作）", startMonth: 1, endMonth: 2, notes: "トンネル被覆で保温" },
        { activity: "収穫（春作）", startMonth: 5, endMonth: 6, notes: "抽台前に収穫" },
      ],
    },
  },
  {
    crop: "トマト",
    aliases: ["とまと", "ミニトマト", "大玉トマト"],
    windows: {
      kyushu: [
        { activity: "播種", startMonth: 2, endMonth: 3, notes: "ハウス育苗。発芽適温 25〜30°C" },
        { activity: "定植", startMonth: 4, endMonth: 5, notes: "接ぎ木苗推奨。支柱・誘引準備" },
        {
          activity: "整枝・わき芽かき",
          startMonth: 5,
          endMonth: 9,
          notes: "週 1〜2 回。1 本仕立て",
        },
        {
          activity: "防除（疫病・灰色かび病）",
          startMonth: 5,
          endMonth: 9,
          notes: "雨よけ栽培で軽減可能",
        },
        { activity: "収穫", startMonth: 6, endMonth: 10, notes: "着色 8 割で収穫。追熟可" },
      ],
    },
  },
  {
    crop: "茶",
    aliases: ["お茶", "緑茶", "煎茶", "抹茶"],
    windows: {
      kyushu: [
        { activity: "整枝（秋整枝）", startMonth: 9, endMonth: 10, notes: "翌年の芽揃いに影響" },
        { activity: "防霜対策", startMonth: 3, endMonth: 4, notes: "送風ファン・被覆資材" },
        { activity: "一番茶摘採", startMonth: 4, endMonth: 5, notes: "八十八夜前後が目安" },
        { activity: "二番茶摘採", startMonth: 6, endMonth: 7, notes: "一番茶後 45〜50 日" },
        {
          activity: "防除（チャノミドリヒメヨコバイ）",
          startMonth: 5,
          endMonth: 9,
          notes: "IPM で天敵温存",
        },
        { activity: "秋肥", startMonth: 9, endMonth: 10, notes: "翌年の品質に直結" },
      ],
    },
  },
];

function findCrop(name: string): CropEntry | null {
  const lower = name.toLowerCase();
  for (const entry of CROP_DB) {
    if (entry.crop === name || entry.aliases.some((a) => a.toLowerCase() === lower)) {
      return entry;
    }
  }
  for (const entry of CROP_DB) {
    if (
      entry.crop.includes(name) ||
      name.includes(entry.crop) ||
      entry.aliases.some((a) => a.includes(name) || name.includes(a))
    ) {
      return entry;
    }
  }
  return null;
}

const outputSchema = z.object({
  crop: z.string(),
  region: z.string(),
  calendar: z.array(
    z.object({
      activity: z.string(),
      startMonth: z.number().int().min(1).max(12),
      endMonth: z.number().int().min(1).max(12),
      notes: z.string(),
    }),
  ),
  availableCrops: z.array(z.string()),
  attribution: z.string(),
});

export function registerCropCalendar(server: McpServer, _deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Crop seasonal calendar",
      description:
        "Returns a month-by-month farming calendar for a given crop and climate region. " +
        "Covers sowing, transplanting, pest control windows, and harvest timing. " +
        "Built-in database covers major Kyushu crops with regional time-shifts for other areas. " +
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
      const { crop, region } = parsed.data as CropCalendarInput;
      const selectedRegion = region ?? DEFAULT_REGION;
      const entry = findCrop(crop);

      if (!entry) {
        const available = CROP_DB.map((e) => e.crop);
        const result = {
          crop,
          region: selectedRegion,
          calendar: [],
          availableCrops: available,
          attribution: "AgriOps MCP built-in crop calendar (general guidance, not formal advisory)",
        };
        return {
          content: [
            {
              type: "text",
              text: `「${crop}」のカレンダーデータはまだ登録されていません。\n登録済みの作物: ${available.join("、")}\n今後のアップデートで追加予定です。`,
            },
          ],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      }

      const baseWindows = entry.windows.kyushu ?? [];
      const shift = SHIFT[selectedRegion] ?? 0;
      const calendar = baseWindows.map((w) => ({
        activity: w.activity,
        startMonth: clampMonth(w.startMonth + shift),
        endMonth: clampMonth(w.endMonth + shift),
        notes: w.notes,
      }));

      const result = {
        crop: entry.crop,
        region: selectedRegion,
        calendar,
        availableCrops: CROP_DB.map((e) => e.crop),
        attribution: "AgriOps MCP built-in crop calendar (general guidance, not formal advisory)",
      };

      const monthName = (m: number) => `${m}月`;
      const lines = calendar.map(
        (c) =>
          `| ${c.activity} | ${monthName(c.startMonth)}〜${monthName(c.endMonth)} | ${c.notes} |`,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `## ${entry.crop}の作期カレンダー（${selectedRegion}）`,
              "",
              "| 作業 | 時期 | ポイント |",
              "|------|------|----------|",
              ...lines,
              "",
              "※ 一般的な目安です。品種・標高・年次変動で ±2〜4 週間のずれがあります。",
              `出典: ${result.attribution}`,
            ].join("\n"),
          },
        ],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    },
  );
}
