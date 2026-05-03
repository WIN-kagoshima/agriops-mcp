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
  {
    crop: "ナス",
    aliases: ["なす", "茄子", "eggplant"],
    windows: {
      kyushu: [
        {
          activity: "播種（育苗）",
          startMonth: 1,
          endMonth: 2,
          notes: "ハウス育苗。発芽適温 28°C",
        },
        { activity: "定植", startMonth: 4, endMonth: 5, notes: "晩霜後。深植え避ける" },
        {
          activity: "整枝（3本仕立て）",
          startMonth: 5,
          endMonth: 10,
          notes: "主枝 3 本仕立てで風通し確保",
        },
        {
          activity: "更新剪定",
          startMonth: 7,
          endMonth: 8,
          notes: "切り戻しで秋ナス再生。追肥と同時に",
        },
        {
          activity: "防除（アブラムシ・ハダニ）",
          startMonth: 5,
          endMonth: 10,
          notes: "高温乾燥でハダニ多発。葉裏散布を徹底",
        },
        { activity: "収穫", startMonth: 6, endMonth: 11, notes: "25〜30g で早採り推奨" },
      ],
    },
  },
  {
    crop: "きゅうり",
    aliases: ["キュウリ", "cucumber"],
    windows: {
      kyushu: [
        { activity: "播種（春作）", startMonth: 3, endMonth: 4, notes: "育苗は約 3 週間" },
        {
          activity: "定植（春作）",
          startMonth: 4,
          endMonth: 5,
          notes: "地温 15°C 以上。支柱・ネット設置",
        },
        {
          activity: "誘引・摘葉",
          startMonth: 5,
          endMonth: 9,
          notes: "週 1〜2 回。下位葉と古葉を除去",
        },
        {
          activity: "防除（べと病・うどんこ病）",
          startMonth: 5,
          endMonth: 9,
          notes: "雨よけ栽培で軽減可。FAMIC 登録剤を確認",
        },
        { activity: "収穫（春作）", startMonth: 5, endMonth: 9, notes: "20cm 前後で毎日収穫" },
        { activity: "播種（秋作）", startMonth: 8, endMonth: 8, notes: "8 月下旬播種が目安" },
        { activity: "収穫（秋作）", startMonth: 10, endMonth: 11, notes: "秋作は低温で肥大鈍化" },
      ],
    },
  },
  {
    crop: "たまねぎ",
    aliases: ["タマネギ", "玉ねぎ", "onion"],
    windows: {
      kyushu: [
        {
          activity: "播種",
          startMonth: 9,
          endMonth: 10,
          notes: "セルトレイ育苗。播種量過多に注意",
        },
        {
          activity: "定植",
          startMonth: 11,
          endMonth: 12,
          notes: "鉛筆太さの苗。深植え厳禁",
        },
        {
          activity: "追肥（1 回目）",
          startMonth: 1,
          endMonth: 2,
          notes: "年明けの生育再開に合わせる",
        },
        {
          activity: "追肥（2 回目）",
          startMonth: 2,
          endMonth: 3,
          notes: "肥大促進。倒伏 2 週前に打ち切り",
        },
        {
          activity: "防除（べと病）",
          startMonth: 1,
          endMonth: 4,
          notes: "低温多湿で多発。予防散布が有効",
        },
        {
          activity: "収穫",
          startMonth: 4,
          endMonth: 5,
          notes: "葉の 80%倒伏後 7〜10 日。晴天収穫",
        },
      ],
    },
  },
  {
    crop: "大豆",
    aliases: ["だいず", "soybean", "枝豆"],
    windows: {
      kyushu: [
        {
          activity: "播種",
          startMonth: 6,
          endMonth: 7,
          notes: "地温 15°C 以上。30cm 条播き",
        },
        {
          activity: "中耕培土",
          startMonth: 7,
          endMonth: 7,
          notes: "本葉 3 枚時。倒伏防止と雑草抑制",
        },
        {
          activity: "防除（カメムシ・マメシンクイガ）",
          startMonth: 8,
          endMonth: 9,
          notes: "開花〜着莢期が被害の大半。早朝散布",
        },
        {
          activity: "収穫",
          startMonth: 11,
          endMonth: 12,
          notes: "茎葉が黄化し莢が振れて音がしたら収穫適期",
        },
      ],
    },
  },
  {
    crop: "じゃがいも",
    aliases: ["ジャガイモ", "馬鈴薯", "ばれいしょ", "potato"],
    windows: {
      kyushu: [
        {
          activity: "植付け（春作）",
          startMonth: 2,
          endMonth: 3,
          notes: "元肥施用後すぐ植付け。5cm 覆土",
        },
        {
          activity: "芽かき・追肥（春作）",
          startMonth: 3,
          endMonth: 4,
          notes: "2〜3 芽に整理。芽かき後すぐ追肥",
        },
        {
          activity: "防除（疫病・マメコガネ）",
          startMonth: 4,
          endMonth: 5,
          notes: "雨天後は疫病に要注意",
        },
        {
          activity: "収穫（春作）",
          startMonth: 5,
          endMonth: 6,
          notes: "茎葉が黄化したら収穫。雨後 2〜3 日空ける",
        },
        {
          activity: "植付け（秋作）",
          startMonth: 9,
          endMonth: 9,
          notes: "残暑対策で午後植付け推奨",
        },
        { activity: "収穫（秋作）", startMonth: 11, endMonth: 12, notes: "霜前に収穫完了" },
      ],
    },
  },
  {
    crop: "さとうきび",
    aliases: ["サトウキビ", "sugarcane"],
    windows: {
      kyushu: [
        {
          activity: "植付け（春植え）",
          startMonth: 2,
          endMonth: 4,
          notes: "茎節 2〜3 節を斜め植え。奄美・種子島で栽培",
        },
        {
          activity: "培土（土寄せ）",
          startMonth: 6,
          endMonth: 7,
          notes: "倒伏防止。台風前に実施",
        },
        {
          activity: "防除（メイガ・アブラムシ）",
          startMonth: 5,
          endMonth: 9,
          notes: "ズイムシ被害に注意",
        },
        {
          activity: "葉枯らし（乾燥促進）",
          startMonth: 10,
          endMonth: 11,
          notes: "収穫直前に枯れ葉を燃やして糖度向上",
        },
        {
          activity: "収穫",
          startMonth: 12,
          endMonth: 3,
          notes: "糖度 13 以上が目安。製糖工場搬入スケジュールに合わせる",
        },
      ],
    },
  },
  {
    crop: "かんきつ",
    aliases: ["柑橘", "みかん", "ミカン", "温州ミカン", "ポンカン", "デコポン", "citrus"],
    windows: {
      kyushu: [
        {
          activity: "剪定（冬）",
          startMonth: 2,
          endMonth: 3,
          notes: "枯れ枝・弱小枝を除去。樹形整理",
        },
        { activity: "摘果（第 1 回）", startMonth: 7, endMonth: 7, notes: "小玉・傷果を落とす" },
        {
          activity: "防除（ミカンハダニ・黒点病）",
          startMonth: 5,
          endMonth: 9,
          notes: "高温期はハダニ多発。展着剤併用で効果向上",
        },
        {
          activity: "摘果（第 2 回）",
          startMonth: 8,
          endMonth: 8,
          notes: "最終着果数の調整。隔年結果防止",
        },
        {
          activity: "着色管理（マルチ敷設）",
          startMonth: 10,
          endMonth: 11,
          notes: "反射マルチで糖度・着色促進",
        },
        {
          activity: "収穫（温州ミカン）",
          startMonth: 10,
          endMonth: 12,
          notes: "品種により時期が異なる。早生〜晩生の順",
        },
      ],
    },
  },
  {
    crop: "とうもろこし",
    aliases: ["トウモロコシ", "スイートコーン", "corn", "maize"],
    windows: {
      kyushu: [
        {
          activity: "播種（春作）",
          startMonth: 3,
          endMonth: 4,
          notes: "地温 10°C 以上。点播き 30cm 間隔",
        },
        {
          activity: "間引き・追肥（春作）",
          startMonth: 4,
          endMonth: 5,
          notes: "本葉 5 枚時に 1 本立て。追肥で肥大促進",
        },
        {
          activity: "防除（アワノメイガ）",
          startMonth: 5,
          endMonth: 8,
          notes: "穂に産卵。絹糸出穂期に予防散布",
        },
        {
          activity: "収穫（春作）",
          startMonth: 6,
          endMonth: 7,
          notes: "絹糸出穂後 20〜25 日。早朝収穫で甘み保持",
        },
        {
          activity: "播種（秋作）",
          startMonth: 8,
          endMonth: 8,
          notes: "残暑に注意。遮光ネット活用",
        },
        { activity: "収穫（秋作）", startMonth: 10, endMonth: 11, notes: "気温低下でゆっくり肥大" },
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
        "Built-in database covers 13 crops (稲, さつまいも, キャベツ, トマト, 茶, ナス, きゅうり, たまねぎ, 大豆, じゃがいも, さとうきび, かんきつ, とうもろこし) with regional time-shifts for other areas. " +
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
