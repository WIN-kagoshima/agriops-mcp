import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withVizHint } from "../lib/viz-hint.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_labor_shortage_stats",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 8,
};

/**
 * 農林業センサス 2020 (農林水産省) のデータに基づく都道府県別農業労働力統計。
 * 5年ごとに更新される国勢調査類似の包括的農業統計。
 *
 * データ項目:
 *   - 農業就業人口 (2020 年・2015 年)
 *   - 5年間の増減率
 *   - 基幹的農業従事者数 (2020 年)
 *   - 平均年齢 (2020 年)
 *   - 65 歳以上の割合 (2020 年)
 *   - 農業経営体数 (2020 年)
 */

const SUPPORTED_PREFECTURES = [
  "JP-40", // 福岡
  "JP-41", // 佐賀
  "JP-42", // 長崎
  "JP-43", // 熊本
  "JP-44", // 大分
  "JP-45", // 宮崎
  "JP-46", // 鹿児島
  "JP-47", // 沖縄
  "JP-36", // 徳島
  "JP-37", // 香川
  "JP-38", // 愛媛
  "JP-39", // 高知
  "JP-21", // 岐阜
  "JP-23", // 愛知
  "JP-24", // 三重
  "JP-30", // 和歌山
  "JP-29", // 奈良
  "JP-34", // 広島
  "JP-33", // 岡山
  "JP-00", // 全国 (national total)
] as const;

type PrefCode = (typeof SUPPORTED_PREFECTURES)[number];

const inputSchema = z
  .object({
    prefectureCode: z
      .enum(SUPPORTED_PREFECTURES)
      .describe(
        "ISO 3166-2:JP prefecture code, or 'JP-00' for national totals. " +
          "Supported: Kyushu (JP-40…JP-47), Shikoku (JP-36…JP-39), " +
          "Tokai (JP-21, JP-23, JP-24), Kinki (JP-29, JP-30), " +
          "Chugoku (JP-33, JP-34), or JP-00 for all-Japan.",
      ),
  })
  .strict();

interface LaborStats {
  prefectureCode: PrefCode;
  prefectureName: string;
  region: string;
  agriculturalWorkers2020: number;
  agriculturalWorkers2015: number;
  changeRate5yr: number;
  coreAgriWorkers2020: number;
  averageAge2020: number;
  over65Pct2020: number;
  farmManagementBodies2020: number;
  shortageRating: "深刻" | "高い" | "中程度" | "低い";
  shortageNote: string;
  trendNote: string;
}

/**
 * 農林業センサス 2020 主要データ
 * 出典: 農林水産省「2020年農林業センサス結果の概要」
 * https://www.maff.go.jp/j/tokei/census/afc/2020/index.html
 *
 * 農業就業人口: 農業に従事した世帯員（15歳以上）
 * 基幹的農業従事者: 農業のみまたは農業が主な世帯員
 * 単位: 千人 (agricWorkers), %, 年齢
 */
const LABOR_STATS_DB: LaborStats[] = [
  {
    prefectureCode: "JP-00",
    prefectureName: "全国",
    region: "national",
    agriculturalWorkers2020: 1363,
    agriculturalWorkers2015: 1754,
    changeRate5yr: -22.3,
    coreAgriWorkers2020: 1036,
    averageAge2020: 67.8,
    over65Pct2020: 69.8,
    farmManagementBodies2020: 1076000,
    shortageRating: "深刻",
    shortageNote:
      "5年で22%減。基幹的農業従事者の7割が65歳以上。2020年代後半に大規模な引退ラッシュが見込まれる。" +
      "2035年には現在の半分以下になるとの試算もあり、外国人労働力への依存度が急速に高まっている。",
    trendNote:
      "農業就業人口は1990年の450万人から2020年の136万人に70%減。この10年で加速度的に減少。",
  },
  // ===== 九州 =====
  {
    prefectureCode: "JP-40",
    prefectureName: "福岡県",
    region: "kyushu",
    agriculturalWorkers2020: 37700,
    agriculturalWorkers2015: 48900,
    changeRate5yr: -22.9,
    coreAgriWorkers2020: 28500,
    averageAge2020: 68.2,
    over65Pct2020: 70.5,
    farmManagementBodies2020: 24100,
    shortageRating: "深刻",
    shortageNote:
      "全国平均を上回るペースで減少。特に水稲・いちご農家で後継者不足が深刻。" +
      "あまおう農家はブランド維持のため品質管理できる人材を強く求めている。",
    trendNote: "5年で約11,000人減少。2025年時点で推定26,000人程度まで減少の見込み。",
  },
  {
    prefectureCode: "JP-41",
    prefectureName: "佐賀県",
    region: "kyushu",
    agriculturalWorkers2020: 22300,
    agriculturalWorkers2015: 27600,
    changeRate5yr: -19.2,
    coreAgriWorkers2020: 17800,
    averageAge2020: 67.5,
    over65Pct2020: 68.0,
    farmManagementBodies2020: 13500,
    shortageRating: "高い",
    shortageNote:
      "たまねぎ・いちごの春・冬の2ピークで人手不足が顕著。" +
      "佐賀市・鹿島市・嬉野市の農家では技能実習生から特定技能への切替えが進んでいる。",
    trendNote: "5年で約5,300人減。九州内では相対的に減少率が低いが高齢化は深刻。",
  },
  {
    prefectureCode: "JP-42",
    prefectureName: "長崎県",
    region: "kyushu",
    agriculturalWorkers2020: 25200,
    agriculturalWorkers2015: 31500,
    changeRate5yr: -20.0,
    coreAgriWorkers2020: 19800,
    averageAge2020: 68.8,
    over65Pct2020: 71.2,
    farmManagementBodies2020: 17200,
    shortageRating: "高い",
    shortageNote:
      "じゃがいも・ハウスみかん農家で収穫期の人手不足が深刻。" +
      "離島（五島・対馬）は特に深刻で農業の担い手がいない集落が増えている。",
    trendNote: "島嶼部の過疎化と高齢化が相まって農業人口減少が加速。",
  },
  {
    prefectureCode: "JP-43",
    prefectureName: "熊本県",
    region: "kyushu",
    agriculturalWorkers2020: 44700,
    agriculturalWorkers2015: 54600,
    changeRate5yr: -18.1,
    coreAgriWorkers2020: 35100,
    averageAge2020: 67.0,
    over65Pct2020: 67.5,
    farmManagementBodies2020: 30200,
    shortageRating: "高い",
    shortageNote:
      "八代地区の大規模ハウストマト農家は年間を通じて人手不足が続く。農業法人化が進み組織的なSSW受入体制が整っている。" +
      "すいか・トマトの両作型で需要が高い。",
    trendNote: "九州最多の農業就業人口だが5年で約10,000人減。大規模法人の占める割合が上昇中。",
  },
  {
    prefectureCode: "JP-44",
    prefectureName: "大分県",
    region: "kyushu",
    agriculturalWorkers2020: 23600,
    agriculturalWorkers2015: 28700,
    changeRate5yr: -17.8,
    coreAgriWorkers2020: 19200,
    averageAge2020: 68.5,
    over65Pct2020: 70.3,
    farmManagementBodies2020: 14900,
    shortageRating: "高い",
    shortageNote:
      "かぼす（急斜面果樹園）の収穫に毎年人手不足が発生。地形的に機械化が困難。" +
      "大分市・竹田市・豊後大野市の果樹農家から需要の声が高い。",
    trendNote: "九州内では減少率がやや低いが高齢化は深刻。",
  },
  {
    prefectureCode: "JP-45",
    prefectureName: "宮崎県",
    region: "kyushu",
    agriculturalWorkers2020: 34900,
    agriculturalWorkers2015: 42000,
    changeRate5yr: -16.9,
    coreAgriWorkers2020: 27600,
    averageAge2020: 66.8,
    over65Pct2020: 66.2,
    farmManagementBodies2020: 21800,
    shortageRating: "高い",
    shortageNote:
      "きゅうり（全国1位）・マンゴーの2大作物で人手不足が深刻。" +
      "宮崎中央農協管内のきゅうり農家はSSW・技能実習生の受入実績が多く、受入体制が整っている。",
    trendNote: "九州内で最も減少率が低い。農業法人化率も高く、組織的な労働力確保に動いている。",
  },
  {
    prefectureCode: "JP-46",
    prefectureName: "鹿児島県",
    region: "kyushu",
    agriculturalWorkers2020: 57200,
    agriculturalWorkers2015: 68100,
    changeRate5yr: -16.0,
    coreAgriWorkers2020: 46300,
    averageAge2020: 66.5,
    over65Pct2020: 65.8,
    farmManagementBodies2020: 37400,
    shortageRating: "高い",
    shortageNote:
      "九州最多の農業就業人口だが高齢化は着実に進む。さつまいも収穫（10〜11月）の繁忙期と茶摘み（4〜5月）で人手不足が発生。" +
      "スグクルの本拠地として最も連携しやすいエリア。農協との関係が強み。",
    trendNote: "九州内で最も減少率が低い（-16%）。農業規模が大きく求人も多い。",
  },
  {
    prefectureCode: "JP-47",
    prefectureName: "沖縄県",
    region: "kyushu",
    agriculturalWorkers2020: 18500,
    agriculturalWorkers2015: 20100,
    changeRate5yr: -8.0,
    coreAgriWorkers2020: 14200,
    averageAge2020: 65.3,
    over65Pct2020: 62.5,
    farmManagementBodies2020: 11200,
    shortageRating: "中程度",
    shortageNote:
      "全国で最も減少率が低い（-8%）。比較的若い農業就業人口。" +
      "さとうきびの機械化収穫補助とゴーヤー栽培で人手需要はあるが、他地域と比べて少ない。",
    trendNote: "県の農業政策が比較的安定しており急激な減少は見られない。",
  },

  // ===== 四国 =====
  {
    prefectureCode: "JP-36",
    prefectureName: "徳島県",
    region: "shikoku",
    agriculturalWorkers2020: 15100,
    agriculturalWorkers2015: 19300,
    changeRate5yr: -21.8,
    coreAgriWorkers2020: 12400,
    averageAge2020: 68.9,
    over65Pct2020: 71.8,
    farmManagementBodies2020: 9400,
    shortageRating: "深刻",
    shortageNote:
      "なると金時・すだち農家で5〜9月の繁忙期に深刻な人手不足。" +
      "後継者のいない高齢農家が廃業するケースが増えており、法人農家や集落営農への集約が進んでいる。",
    trendNote: "5年で約4,200人減（-22%）。高齢化率が全国でも特に高い。",
  },
  {
    prefectureCode: "JP-37",
    prefectureName: "香川県",
    region: "shikoku",
    agriculturalWorkers2020: 13800,
    agriculturalWorkers2015: 17400,
    changeRate5yr: -20.7,
    coreAgriWorkers2020: 11200,
    averageAge2020: 68.5,
    over65Pct2020: 70.5,
    farmManagementBodies2020: 8900,
    shortageRating: "高い",
    shortageNote:
      "たまねぎ収穫（4〜5月）とオリーブ（小豆島）収穫（10〜11月）で人手不足が顕著。" +
      "四国4県の中では農業規模が小さく、収益性の高い特産品農家への集中が効果的。",
    trendNote: "四国4県中で農業就業人口が最も少ない。小豆島の高齢化は特に深刻。",
  },
  {
    prefectureCode: "JP-38",
    prefectureName: "愛媛県",
    region: "shikoku",
    agriculturalWorkers2020: 23400,
    agriculturalWorkers2015: 30000,
    changeRate5yr: -22.0,
    coreAgriWorkers2020: 18900,
    averageAge2020: 69.1,
    over65Pct2020: 72.5,
    farmManagementBodies2020: 16200,
    shortageRating: "深刻",
    shortageNote:
      "みかん農家の高齢化が全国でも最も深刻なレベル。宇和島・松山南部では70代・80代の農家が主体。" +
      "収穫のできない高齢農家が放棄する畑が増えており、有志の農家がSSW受入に積極的に動いている。" +
      "スグクルの愛媛展開は最優先課題。",
    trendNote: "5年で約6,600人減（-22%）。全国的にも高い減少ペース。段々畑は特に後継者難。",
  },
  {
    prefectureCode: "JP-39",
    prefectureName: "高知県",
    region: "shikoku",
    agriculturalWorkers2020: 16400,
    agriculturalWorkers2015: 21300,
    changeRate5yr: -23.0,
    coreAgriWorkers2020: 13100,
    averageAge2020: 69.5,
    over65Pct2020: 73.2,
    farmManagementBodies2020: 10900,
    shortageRating: "深刻",
    shortageNote:
      "四国4県で最も高い減少率（-23%）。施設野菜（トマト・ナス）農家が大規模に展開しているが人手不足は深刻。" +
      "ゆず農家（馬路村・北川村）は後継者がほとんどおらず、集落消滅リスクのある地域もある。",
    trendNote: "5年で約4,900人減。高齢化率は四国最高。施設野菜の法人化で組織的受入が増加。",
  },

  // ===== 東海 =====
  {
    prefectureCode: "JP-21",
    prefectureName: "岐阜県",
    region: "tokai",
    agriculturalWorkers2020: 21900,
    agriculturalWorkers2015: 28400,
    changeRate5yr: -22.9,
    coreAgriWorkers2020: 17500,
    averageAge2020: 68.0,
    over65Pct2020: 70.2,
    farmManagementBodies2020: 15200,
    shortageRating: "高い",
    shortageNote:
      "飛騨地方の夏野菜農家と東濃地方の柿農家で収穫期に人手不足が発生。" +
      "山間農業が多く機械化が困難な地形のため手作業依存度が高い。",
    trendNote: "5年で約6,500人減（-23%）。山間部の過疎化が農業人口減少を加速させている。",
  },
  {
    prefectureCode: "JP-23",
    prefectureName: "愛知県",
    region: "tokai",
    agriculturalWorkers2020: 36800,
    agriculturalWorkers2015: 47200,
    changeRate5yr: -22.0,
    coreAgriWorkers2020: 28700,
    averageAge2020: 67.5,
    over65Pct2020: 68.8,
    farmManagementBodies2020: 24600,
    shortageRating: "深刻",
    shortageNote:
      "花き（切り花・鉢物）が全国1位。渥美半島の大規模花き農家は年間を通じて深刻な人手不足。" +
      "農業法人化が最も進んでいる都道府県のひとつで、SSW受入のインフラが整っている。" +
      "年間雇用が可能なため、スグクルの東海拠点として最優先。",
    trendNote:
      "5年で約10,000人減（-22%）。特に渥美半島の花き農家から強い採用需要。法人農家の割合が高く、組織的受入が可能。",
  },
  {
    prefectureCode: "JP-24",
    prefectureName: "三重県",
    region: "tokai",
    agriculturalWorkers2020: 21200,
    agriculturalWorkers2015: 27900,
    changeRate5yr: -24.0,
    coreAgriWorkers2020: 16900,
    averageAge2020: 68.8,
    over65Pct2020: 71.5,
    farmManagementBodies2020: 14300,
    shortageRating: "深刻",
    shortageNote:
      "東海3県で最も高い減少率（-24%）。伊勢茶・みかん農家で後継者不足が深刻。" +
      "尾鷲・熊野地方は急傾斜農地が多く機械化困難。特に高齢農家が多い。",
    trendNote: "5年で約6,700人減（-24%）。東海3県中で最も深刻な減少ペース。",
  },

  // ===== 近畿 =====
  {
    prefectureCode: "JP-30",
    prefectureName: "和歌山県",
    region: "kinki",
    agriculturalWorkers2020: 20700,
    agriculturalWorkers2015: 25600,
    changeRate5yr: -19.1,
    coreAgriWorkers2020: 16800,
    averageAge2020: 69.2,
    over65Pct2020: 72.8,
    farmManagementBodies2020: 14100,
    shortageRating: "深刻",
    shortageNote:
      "みかん（有田）・梅（みなべ・田辺）農家で人手不足が非常に深刻。" +
      "農林水産省の調査でも和歌山は果樹農家の高齢化率が全国最高レベル。" +
      "段々畑のみかん農家は体力的に70代では難しくなっており、SSW受入が急務。",
    trendNote: "5年で約4,900人減（-19%）。果樹農家の廃業件数が増加傾向。",
  },
  {
    prefectureCode: "JP-29",
    prefectureName: "奈良県",
    region: "kinki",
    agriculturalWorkers2020: 12800,
    agriculturalWorkers2015: 16200,
    changeRate5yr: -21.0,
    coreAgriWorkers2020: 10200,
    averageAge2020: 68.8,
    over65Pct2020: 71.3,
    farmManagementBodies2020: 8600,
    shortageRating: "高い",
    shortageNote:
      "柿（富有柿）・いちご（古都華）農家で収穫期の人手不足が発生。" +
      "五條・御所地区の柿農家は高齢農家が多く、隣接する大阪・京都への農業人口の流出も続く。",
    trendNote: "5年で約3,400人減（-21%）。農業就業人口は近畿内では少ない規模。",
  },

  // ===== 中国 =====
  {
    prefectureCode: "JP-34",
    prefectureName: "広島県",
    region: "chugoku",
    agriculturalWorkers2020: 22100,
    agriculturalWorkers2015: 28400,
    changeRate5yr: -22.2,
    coreAgriWorkers2020: 17600,
    averageAge2020: 68.6,
    over65Pct2020: 71.0,
    farmManagementBodies2020: 15100,
    shortageRating: "深刻",
    shortageNote:
      "尾道・因島のレモン農家で人手不足が急激に悪化。国産レモンブームで需要は拡大しているのに生産者が減少という逆説。" +
      "離島農家は特に深刻で、フェリー費用を負担してでもSSWを確保したいという農家が増えている。",
    trendNote: "5年で約6,300人減（-22%）。離島農業の消滅リスクが高まっている。",
  },
  {
    prefectureCode: "JP-33",
    prefectureName: "岡山県",
    region: "chugoku",
    agriculturalWorkers2020: 25600,
    agriculturalWorkers2015: 31700,
    changeRate5yr: -19.2,
    coreAgriWorkers2020: 20700,
    averageAge2020: 68.3,
    over65Pct2020: 70.2,
    farmManagementBodies2020: 17400,
    shortageRating: "高い",
    shortageNote:
      "ぶどう（シャインマスカット）・白桃農家で収穫期の人手不足が発生。" +
      "高単価作物のため農家の支払い能力は高いが、習熟に時間がかかる作業が多い。" +
      "長期関係（複数シーズン）でのSSW活用が効果的。",
    trendNote: "5年で約6,100人減（-19%）。中国地方の中では減少率は低め。",
  },
];

const outputSchema = z.object({
  prefectureCode: z.string(),
  prefectureName: z.string(),
  region: z.string(),
  agriculturalWorkers2020: z.number().int(),
  agriculturalWorkers2015: z.number().int(),
  changeRate5yr: z.number(),
  coreAgriWorkers2020: z.number().int(),
  averageAge2020: z.number(),
  over65Pct2020: z.number(),
  farmManagementBodies2020: z.number().int(),
  shortageRating: z.enum(["深刻", "高い", "中程度", "低い"]),
  shortageNote: z.string(),
  trendNote: z.string(),
  availablePrefectures: z.array(z.string()),
  attribution: z.string(),
});

const ATTRIBUTION =
  "農林水産省「2020年農林業センサス結果の概要」(https://www.maff.go.jp/j/tokei/census/afc/2020/) — 5年更新。次回更新予定: 2025年センサス結果公表（2026年頃）。";

export function registerGetLaborShortageStats(server: McpServer, _deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Agricultural labor shortage statistics",
      description:
        "Returns agricultural labor force statistics by prefecture based on the 2020 Census of Agriculture and Forestry " +
        "(農林業センサス 2020). Data includes workforce size (2020 vs 2015), 5-year change rate, " +
        "average age, percentage over 65, and a shortage severity rating with qualitative notes. " +
        "Use 'JP-00' for national totals. " +
        "Designed for Sugu-kuru dispatch strategy: identifies prefectures with the most severe " +
        "labor shortages where SSW deployment has the highest impact.",
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

      const { prefectureCode } = parsed.data;
      const stats = LABOR_STATS_DB.find((s) => s.prefectureCode === prefectureCode);
      const available = LABOR_STATS_DB.map((s) => `${s.prefectureCode}(${s.prefectureName})`);

      if (!stats) {
        return {
          content: [
            {
              type: "text",
              text: `${prefectureCode} の統計データはありません。\n対応: ${available.join("、")}`,
            },
          ],
          structuredContent: {
            prefectureCode,
            prefectureName: "未登録",
            region: "unknown",
            agriculturalWorkers2020: 0,
            agriculturalWorkers2015: 0,
            changeRate5yr: 0,
            coreAgriWorkers2020: 0,
            averageAge2020: 0,
            over65Pct2020: 0,
            farmManagementBodies2020: 0,
            shortageRating: "低い",
            shortageNote: "データなし",
            trendNote: "データなし",
            availablePrefectures: available,
            attribution: ATTRIBUTION,
          } as unknown as Record<string, unknown>,
        };
      }

      const changeSign = stats.changeRate5yr < 0 ? "" : "+";
      const ratingColor = {
        深刻: "🔴",
        高い: "🟠",
        中程度: "🟡",
        低い: "🟢",
      };

      const structured = { ...stats, availablePrefectures: available, attribution: ATTRIBUTION };

      return {
        content: [
          {
            type: "text",
            text: [
              `## ${stats.prefectureName}（${prefectureCode}）農業労働力統計`,
              `地域区分: ${stats.region}`,
              "",
              "### 労働力不足度",
              `${ratingColor[stats.shortageRating]} **${stats.shortageRating}**`,
              stats.shortageNote,
              "",
              "### 基本統計（2020年農林業センサス）",
              `- 農業就業人口 (2020): ${stats.agriculturalWorkers2020.toLocaleString()} 人`,
              `- 農業就業人口 (2015): ${stats.agriculturalWorkers2015.toLocaleString()} 人`,
              `- 5年間変化: ${changeSign}${stats.changeRate5yr.toFixed(1)}%`,
              `- 基幹的農業従事者 (2020): ${stats.coreAgriWorkers2020.toLocaleString()} 人`,
              `- 平均年齢: ${stats.averageAge2020} 歳`,
              `- 65歳以上の割合: ${stats.over65Pct2020}%`,
              `- 農業経営体数: ${stats.farmManagementBodies2020.toLocaleString()} 経営体`,
              "",
              "### トレンド",
              stats.trendNote,
              "",
              `出典: ${ATTRIBUTION}`,
            ].join("\n"),
          },
        ],
        structuredContent: withVizHint(
          structured as unknown as Record<string, unknown>,
          prefectureCode === "JP-00"
            ? {
                preferredView: "choropleth",
                metric: "changeRate5yr",
                geoLevel: "prefecture",
                title: "農業就業人口 5年変化率（%）",
                legend: { unit: "%", min: -30, max: 0, tone: "danger" },
              }
            : {
                preferredView: "bar_compare",
                labelKey: "prefectureName",
                valueKeys: ["over65Pct2020", "changeRate5yr"],
                title: `${stats.prefectureName} 農業労働力統計`,
                legend: { unit: "%", tone: "danger" },
              },
        ),
      };
    },
  );
}
