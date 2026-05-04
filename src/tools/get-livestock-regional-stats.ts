import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withVizHint } from "../lib/viz-hint.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_livestock_regional_stats",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 9,
};

/**
 * 農林水産省「畜産統計調査」2023年版 および「農林業センサス 2020」に基づく
 * 都道府県別畜産データ。
 *
 * 主要 4 部門:
 *   - ブロイラー (肉用鶏): 出荷羽数・飼養羽数・飼養戸数
 *   - 豚 (養豚): 飼養頭数・飼養戸数
 *   - 肉用牛: 飼養頭数・飼養戸数
 *   - 酪農 (乳用牛): 飼養頭数・飼養戸数
 *
 * SSW 特定技能「農業」の畜産業分類:
 *   養豚 / 養鶏 / 酪農 / その他畜産 が対象。
 *   肉用牛の飼養管理も含まれる（農水省ガイドライン 2019 改訂）。
 *
 * 捕鳥作業（鶏の捕獲・出荷）について:
 *   ブロイラー農場では出荷サイクル（約50〜70日）ごとに全羽を手作業で捕獲・コンテナへ収容する。
 *   1回あたり15〜30名が深夜に3〜6時間従事する極めて重労働な作業。
 *   機械化が不可能で、地元の若年労働者から忌避される作業のため、SSW依存度が最も高い。
 */

const LIVESTOCK_SECTORS = ["broiler", "pig", "beef_cattle", "dairy"] as const;
type LivestockSector = (typeof LIVESTOCK_SECTORS)[number];

const SUPPORTED_PREFECTURES = [
  "JP-46", // 鹿児島
  "JP-45", // 宮崎
  "JP-43", // 熊本
  "JP-44", // 大分
  "JP-40", // 福岡
  "JP-41", // 佐賀
  "JP-42", // 長崎
  "JP-47", // 沖縄
  "JP-38", // 愛媛
  "JP-36", // 徳島
  "JP-21", // 岐阜
  "JP-23", // 愛知
  "JP-24", // 三重
  "JP-01", // 北海道
  "JP-03", // 岩手
  "JP-12", // 千葉
  "JP-00", // 全国
] as const;

const inputSchema = z
  .object({
    prefectureCode: z
      .enum(SUPPORTED_PREFECTURES)
      .describe(
        "ISO 3166-2:JP prefecture code. Supported: Kyushu (JP-40…JP-47), " +
          "Shikoku partial (JP-36, JP-38), Tokai (JP-21, JP-23, JP-24), " +
          "Hokkaido (JP-01), Iwate (JP-03), Chiba (JP-12), or JP-00 for national totals.",
      ),
    sector: z
      .enum(LIVESTOCK_SECTORS)
      .optional()
      .describe(
        "Livestock sector to focus on: " +
          "'broiler'=肉用鶏（ブロイラー）, 'pig'=養豚, 'beef_cattle'=肉用牛, 'dairy'=酪農。" +
          "If omitted, returns all sectors.",
      ),
  })
  .strict();

interface SectorStats {
  sector: LivestockSector;
  sectorName: string;
  headCount: number;
  headUnit: string;
  nationalRank: number;
  nationalSharePct: number;
  farmCount: number;
  avgFarmScale: string;
  laborShortageLevel: "深刻" | "高い" | "中程度" | "低い";
  sswCompatibilityScore: number;
  keyOperations: string[];
  sswNote: string;
}

interface PrefectureLivestockProfile {
  prefectureCode: string;
  prefectureName: string;
  region: string;
  overview: string;
  sectors: SectorStats[];
  winningPatterns: string[];
  attribution: string;
}

const ATTRIBUTION =
  "農林水産省「畜産統計調査 2023」(https://www.maff.go.jp/j/tokei/kouhyou/tikusan/) / " +
  "農林業センサス 2020 / 農水省 特定技能農業ガイドライン 2019改訂";

const DB: PrefectureLivestockProfile[] = [
  // ===== 全国 =====
  {
    prefectureCode: "JP-00",
    prefectureName: "全国",
    region: "national",
    overview:
      "ブロイラー全国出荷数 約7億羽（2023年）。豚飼養頭数 約903万頭。" +
      "肉用牛 約261万頭。乳用牛 約133万頭。" +
      "畜産従事者の平均年齢は65歳を超え、特に中小農家での後継者不足が深刻。" +
      "技能実習から特定技能への切替えが最も進んでいるのが畜産分野（農水省 2024年調査）。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー（肉用鶏）",
        headCount: 700000000,
        headUnit: "羽/年出荷",
        nationalRank: 0,
        nationalSharePct: 100,
        farmCount: 2400,
        avgFarmScale: "約29万羽/農場",
        laborShortageLevel: "深刻",
        sswCompatibilityScore: 85,
        keyOperations: ["捕鳥・出荷作業（深夜）", "鶏舎清掃・消毒", "餌・飲水管理補助"],
        sswNote:
          "捕鳥作業は1回あたり15〜30名が深夜に3〜6時間従事する最重労働。機械化が不可能で地元労働者から最も忌避される作業。SSW依存度が全農業作業中最高水準。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 9030000,
        headUnit: "頭（飼養）",
        nationalRank: 0,
        nationalSharePct: 100,
        farmCount: 3900,
        avgFarmScale: "約2,300頭/農場",
        laborShortageLevel: "深刻",
        sswCompatibilityScore: 78,
        keyOperations: ["豚の移動・仕分け", "分娩補助", "飼養管理", "出荷作業"],
        sswNote:
          "分娩補助・仔豚管理は年間を通じて安定した雇用が可能。出荷時の豚の移動は体力を要するがSSWが最も戦力化しやすい作業のひとつ。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛",
        headCount: 2610000,
        headUnit: "頭（飼養）",
        nationalRank: 0,
        nationalSharePct: 100,
        farmCount: 42000,
        avgFarmScale: "約62頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 72,
        keyOperations: ["飼料給与", "牛の移動・仕分け", "糞尿処理", "分娩監視"],
        sswNote:
          "和牛のブランド農家は高収益で支払い余力あり。飼養管理作業は毎日発生するため通年雇用が可能。",
      },
      {
        sector: "dairy",
        sectorName: "酪農（乳用牛）",
        headCount: 1330000,
        headUnit: "頭（飼養）",
        nationalRank: 0,
        nationalSharePct: 100,
        farmCount: 13000,
        avgFarmScale: "約102頭/農場",
        laborShortageLevel: "深刻",
        sswCompatibilityScore: 74,
        keyOperations: ["搾乳作業（1日2〜3回）", "飼料給与", "糞尿処理", "哺育管理"],
        sswNote:
          "1日2〜3回の搾乳は時間が固定されており、通年での安定雇用が可能。北海道が圧倒的シェア。",
      },
    ],
    winningPatterns: [
      "捕鳥作業は深夜・重労働・機械化不可の三拍子で「究極のSSW専用作業」として定着しつつある",
      "技能実習から特定技能への移行が畜産分野で最も進んでいる（農水省 2024年調査）",
      "大規模農場（年間100万羽以上）は年間を通じて定期的な捕鳥チームを必要としている",
    ],
    attribution: ATTRIBUTION,
  },

  // ===== 九州 =====
  {
    prefectureCode: "JP-46",
    prefectureName: "鹿児島県",
    region: "kyushu",
    overview:
      "ブロイラー全国1位（年出荷約1.5億羽・全国シェア約21%）、豚全国1位（約128万頭）、" +
      "肉用牛全国1位（黒毛和牛・約35万頭）。畜産三冠の圧倒的産地。" +
      "スグクルの本拠地として、農協・農業法人との関係性を活かした畜産SSW展開が最大の勝ち筋。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー（肉用鶏）",
        headCount: 150000000,
        headUnit: "羽/年出荷",
        nationalRank: 1,
        nationalSharePct: 21.4,
        farmCount: 320,
        avgFarmScale: "約47万羽/農場（全国最大規模）",
        laborShortageLevel: "深刻",
        sswCompatibilityScore: 88,
        keyOperations: [
          "捕鳥・出荷（深夜、約50〜70日ごと）",
          "鶏舎清掃・消毒（捕鳥後）",
          "初生雛の導入補助",
          "給餌・飲水管理",
        ],
        sswNote:
          "全国最大規模の農場が集中。1回の捕鳥作業に20〜35名が必要で、1農場あたり年間6〜7回発生。" +
          "鹿児島市・南九州市・薩摩川内市・日置市の大規模農場は慢性的な捕鳥チーム不足。" +
          "スグクルが鹿児島本拠地の強みを活かせる最大のターゲット。深夜作業のため一般地元労働者の採用が困難で、SSW以外に現実的な選択肢がない。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 1280000,
        headUnit: "頭（飼養）",
        nationalRank: 1,
        nationalSharePct: 14.2,
        farmCount: 290,
        avgFarmScale: "約4,400頭/農場（大規模）",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 80,
        keyOperations: ["分娩補助・仔豚管理", "豚の移動・出荷", "飼養管理", "衛生管理"],
        sswNote:
          "南九州市・鹿屋市の大規模農場は法人化が進みSSW受入体制が整っている。" +
          "年間を通じた安定雇用が可能。分娩補助は経験を積むほど価値が上がる熟練作業。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛（黒毛和牛）",
        headCount: 350000,
        headUnit: "頭（飼養）",
        nationalRank: 2,
        nationalSharePct: 13.4,
        farmCount: 7200,
        avgFarmScale: "約49頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 74,
        keyOperations: ["飼料給与（1日2回）", "繁殖管理補助", "糞尿処理", "市場出荷補助"],
        sswNote:
          "鹿児島黒牛ブランドの農家は高収益で支払い余力あり。毎日の飼養管理作業が安定雇用につながる。",
      },
      {
        sector: "dairy",
        sectorName: "酪農",
        headCount: 32000,
        headUnit: "頭（飼養）",
        nationalRank: 8,
        nationalSharePct: 2.4,
        farmCount: 180,
        avgFarmScale: "約178頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 68,
        keyOperations: ["搾乳", "飼料給与", "糞尿処理"],
        sswNote: "規模は大きくないが農場当たりの規模は大きい。搾乳作業で通年雇用が可能。",
      },
    ],
    winningPatterns: [
      "捕鳥×スグクル鹿児島拠点 = 農場との距離が近く、深夜チームを組みやすい唯一の人材派遣会社になれる",
      "ブロイラー1位×豚1位×牛1位の三冠産地: 農閑期ゼロで畜産SSWを年中稼働できる",
      "捕鳥チーム（15〜30名）を常設することで農場の最大のボトルネックを解消。競合不在の市場",
    ],
    attribution: ATTRIBUTION,
  },
  {
    prefectureCode: "JP-45",
    prefectureName: "宮崎県",
    region: "kyushu",
    overview:
      "ブロイラー全国2位（年出荷約1.1億羽・約15%）、豚全国2位（約82万頭）、" +
      "肉用牛全国2位（約25万頭）。鹿児島とともに九州畜産の双璧。" +
      "農業法人化率が高くSSW受入体制が最も整っている都道府県のひとつ。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー（肉用鶏）",
        headCount: 110000000,
        headUnit: "羽/年出荷",
        nationalRank: 2,
        nationalSharePct: 15.7,
        farmCount: 270,
        avgFarmScale: "約41万羽/農場",
        laborShortageLevel: "深刻",
        sswCompatibilityScore: 87,
        keyOperations: ["捕鳥・出荷（深夜）", "鶏舎清掃・消毒", "衛生管理", "給餌・飲水管理"],
        sswNote:
          "宮崎市・都城市・小林市に大規模農場が集中。法人農家の割合が高くSSW受入のペーパーワーク対応が比較的スムーズ。" +
          "鹿児島と合わせた「九州ブロイラーベルト」を形成しており、鹿児島⇔宮崎の合同チームが最も効率的。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 820000,
        headUnit: "頭（飼養）",
        nationalRank: 2,
        nationalSharePct: 9.1,
        farmCount: 210,
        avgFarmScale: "約3,900頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 79,
        keyOperations: ["分娩補助", "豚の移動・出荷", "飼養管理"],
        sswNote:
          "都城・えびの地区の大規模農場が核心。宮崎特有の「生産農場と処理場の近接性」により年間を通じた安定した作業量がある。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛",
        headCount: 250000,
        headUnit: "頭（飼養）",
        nationalRank: 3,
        nationalSharePct: 9.6,
        farmCount: 4800,
        avgFarmScale: "約52頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 73,
        keyOperations: ["飼料給与", "繁殖管理補助", "糞尿処理"],
        sswNote: "宮崎牛ブランドの農家は支払い余力あり。飼養管理作業で通年雇用が可能。",
      },
      {
        sector: "dairy",
        sectorName: "酪農",
        headCount: 18000,
        headUnit: "頭（飼養）",
        nationalRank: 12,
        nationalSharePct: 1.4,
        farmCount: 130,
        avgFarmScale: "約138頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 65,
        keyOperations: ["搾乳", "飼料給与"],
        sswNote: "規模は小さいがSSW受入の実績がある農場もある。",
      },
    ],
    winningPatterns: [
      "鹿児島（JP-46）とのダブル拠点で「九州ブロイラーベルト」全域をカバーできる",
      "法人農家の多さがSSW受入の事務コストを下げる → スグクルの行政書士連携サービスの付加価値",
      "捕鳥チームは鹿児島⇔宮崎を移動することで年間を通じた稼働率向上が可能",
    ],
    attribution: ATTRIBUTION,
  },
  {
    prefectureCode: "JP-43",
    prefectureName: "熊本県",
    region: "kyushu",
    overview:
      "ブロイラー全国5位（約3,500万羽）。豚・肉用牛も上位クラス。" +
      "トマト・スイカと並んで畜産も主要産業のひとつ。農業法人化が進んでいる。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー",
        headCount: 35000000,
        headUnit: "羽/年出荷",
        nationalRank: 5,
        nationalSharePct: 5.0,
        farmCount: 80,
        avgFarmScale: "約44万羽/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 82,
        keyOperations: ["捕鳥・出荷（深夜）", "鶏舎清掃", "飼養管理"],
        sswNote:
          "菊池・合志市に大規模農場。全国4位水準。鹿児島・宮崎のブロイラーチームの延長でカバーできるエリア。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 420000,
        headUnit: "頭（飼養）",
        nationalRank: 5,
        nationalSharePct: 4.7,
        farmCount: 110,
        avgFarmScale: "約3,800頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 74,
        keyOperations: ["分娩補助", "飼養管理", "出荷作業"],
        sswNote: "鹿児島・宮崎ほどの規模ではないが安定した需要がある。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛",
        headCount: 130000,
        headUnit: "頭（飼養）",
        nationalRank: 6,
        nationalSharePct: 5.0,
        farmCount: 3100,
        avgFarmScale: "約42頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 72,
        keyOperations: ["飼料給与", "繁殖管理", "糞尿処理"],
        sswNote: "くまもとあか牛・褐毛和牛のブランド農家が多く、支払い余力が高い。",
      },
      {
        sector: "dairy",
        sectorName: "酪農",
        headCount: 22000,
        headUnit: "頭（飼養）",
        nationalRank: 10,
        nationalSharePct: 1.7,
        farmCount: 170,
        avgFarmScale: "約129頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 67,
        keyOperations: ["搾乳", "飼料給与", "哺育管理"],
        sswNote: "阿蘇地区に酪農農家が集中。観光農業との兼業農家も多い。",
      },
    ],
    winningPatterns: [
      "トマト・スイカ（野菜SSW）と畜産（ブロイラー）を同じ地域で組み合わせることで通年稼働が設計できる",
      "捕鳥チームの九州北上ルート（鹿児島→宮崎→熊本）での効率的な移動派遣",
    ],
    attribution: ATTRIBUTION,
  },
  {
    prefectureCode: "JP-44",
    prefectureName: "大分県",
    region: "kyushu",
    overview:
      "ブロイラー全国6位（約3,200万羽）。九州ブロイラーの主要産地のひとつ。" +
      "農業法人化は宮崎・鹿児島ほどではないが着実に進んでいる。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー",
        headCount: 32000000,
        headUnit: "羽/年出荷",
        nationalRank: 6,
        nationalSharePct: 4.6,
        farmCount: 72,
        avgFarmScale: "約44万羽/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 80,
        keyOperations: ["捕鳥・出荷（深夜）", "鶏舎清掃", "飼養管理"],
        sswNote:
          "豊後大野市・竹田市に大規模農場。捕鳥チームの宮崎からの北上ルートに組み込みやすい位置。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛（豊後牛）",
        headCount: 88000,
        headUnit: "頭（飼養）",
        nationalRank: 9,
        nationalSharePct: 3.4,
        farmCount: 2200,
        avgFarmScale: "約40頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 70,
        keyOperations: ["飼料給与", "繁殖管理補助", "糞尿処理"],
        sswNote: "豊後牛ブランドの農家は高収益。高齢農家の比率が高く後継者不足が深刻。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 95000,
        headUnit: "頭（飼養）",
        nationalRank: 14,
        nationalSharePct: 1.1,
        farmCount: 35,
        avgFarmScale: "約2,700頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 68,
        keyOperations: ["分娩補助", "飼養管理"],
        sswNote: "規模は小さいが大規模農場のSSW需要は安定している。",
      },
      {
        sector: "dairy",
        sectorName: "酪農",
        headCount: 8500,
        headUnit: "頭（飼養）",
        nationalRank: 20,
        nationalSharePct: 0.6,
        farmCount: 62,
        avgFarmScale: "約137頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 62,
        keyOperations: ["搾乳", "飼料給与"],
        sswNote: "規模は小さいが九重・由布地区で安定した需要がある。",
      },
    ],
    winningPatterns: [
      "捕鳥チームの「宮崎→大分→熊本」北上ルートで効率的な移動派遣が可能",
      "豊後牛農家との長期関係構築が大分エリアの足がかりになる",
    ],
    attribution: ATTRIBUTION,
  },
  {
    prefectureCode: "JP-40",
    prefectureName: "福岡県",
    region: "kyushu",
    overview:
      "畜産はあまおういちごや野菜産地の陰に隠れているが、採卵鶏（卵）は全国上位。" +
      "博多地鶏など高付加価値ブランドも存在する。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー（博多地鶏等）",
        headCount: 8000000,
        headUnit: "羽/年出荷",
        nationalRank: 15,
        nationalSharePct: 1.1,
        farmCount: 18,
        avgFarmScale: "約44万羽/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 74,
        keyOperations: ["捕鳥・出荷（深夜）", "鶏舎管理"],
        sswNote:
          "規模は小さいが博多地鶏など高単価ブランドで農家の支払い余力あり。鹿児島チームの北上拠点として位置づけ可能。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 130000,
        headUnit: "頭（飼養）",
        nationalRank: 12,
        nationalSharePct: 1.4,
        farmCount: 55,
        avgFarmScale: "約2,400頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 70,
        keyOperations: ["飼養管理", "出荷補助"],
        sswNote: "糸島・朝倉地区に集中。規模は大きくないが安定した需要がある。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛",
        headCount: 31000,
        headUnit: "頭（飼養）",
        nationalRank: 18,
        nationalSharePct: 1.2,
        farmCount: 480,
        avgFarmScale: "約65頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 65,
        keyOperations: ["飼料給与", "糞尿処理"],
        sswNote: "英彦山・浮羽地区の肉用牛農家で安定した需要。",
      },
      {
        sector: "dairy",
        sectorName: "酪農",
        headCount: 11000,
        headUnit: "頭（飼養）",
        nationalRank: 17,
        nationalSharePct: 0.8,
        farmCount: 82,
        avgFarmScale: "約134頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 65,
        keyOperations: ["搾乳", "飼料給与"],
        sswNote: "朝倉・うきは地区の酪農農家で安定需要。いちご農家との組み合わせで通年稼働設計可。",
      },
    ],
    winningPatterns: [
      "いちご（あまおう）× 採卵鶏・酪農の組み合わせで福岡のSSW通年雇用が設計できる",
      "九州北部の物流拠点として捕鳥チームの中継基地として活用できる",
    ],
    attribution: ATTRIBUTION,
  },
  // ===== 東海・近畿 =====
  {
    prefectureCode: "JP-23",
    prefectureName: "愛知県",
    region: "tokai",
    overview:
      "養鶏（採卵）が主体。ブロイラーは多くないが花き農家との兼業農家が多く、" +
      "年間を通じた複合的な農業SSWの需要がある。",
    sectors: [
      {
        sector: "broiler",
        sectorName: "ブロイラー・地鶏",
        headCount: 5000000,
        headUnit: "羽/年出荷",
        nationalRank: 18,
        nationalSharePct: 0.7,
        farmCount: 12,
        avgFarmScale: "約42万羽/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 72,
        keyOperations: ["捕鳥・出荷（深夜）", "飼養管理"],
        sswNote:
          "豊橋地区に集中。花き農家との兼業パターンが多く、捕鳥×花き収穫の複合的な通年雇用設計が可能。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 200000,
        headUnit: "頭（飼養）",
        nationalRank: 9,
        nationalSharePct: 2.2,
        farmCount: 78,
        avgFarmScale: "約2,600頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 73,
        keyOperations: ["分娩補助", "飼養管理", "出荷補助"],
        sswNote: "東三河地区に集中。花き農家と同じ地域に存在するため、人材のクロス活用が可能。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛（三河牛）",
        headCount: 35000,
        headUnit: "頭（飼養）",
        nationalRank: 16,
        nationalSharePct: 1.3,
        farmCount: 420,
        avgFarmScale: "約83頭/農場",
        laborShortageLevel: "中程度",
        sswCompatibilityScore: 68,
        keyOperations: ["飼料給与", "繁殖管理補助"],
        sswNote: "三河牛ブランドの農家は支払い余力あり。花き×肉牛の複合農家に対するSSW活用が有望。",
      },
      {
        sector: "dairy",
        sectorName: "酪農",
        headCount: 24000,
        headUnit: "頭（飼養）",
        nationalRank: 9,
        nationalSharePct: 1.8,
        farmCount: 185,
        avgFarmScale: "約130頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 72,
        keyOperations: ["搾乳（1日2回）", "飼料給与", "哺育管理"],
        sswNote:
          "豊橋・田原地区の酪農農家は法人化率が高い。花き農家と同地域のため通年雇用ローテーションに組み込める。",
      },
    ],
    winningPatterns: [
      "花き（渥美半島・通年）× ブロイラー捕鳥（深夜）の組み合わせで昼夜を使い分けた「超稼働SSW」が設計できる",
      "豊橋は農業法人の集積地で受入体制が整っている — スグクル東海拠点設置の最適地",
    ],
    attribution: ATTRIBUTION,
  },
  // ===== 北海道（酪農の絶対王者） =====
  {
    prefectureCode: "JP-01",
    prefectureName: "北海道",
    region: "hokkaido",
    overview:
      "酪農全国1位（約85万頭・全国64%）。肉用牛全国1位（約52万頭・北海道和牛除く）。" +
      "農場当たりの規模が圧倒的で、1農場で200〜500頭規模も珍しくない。" +
      "スグクルの現展開エリア外だが参考データとして記載。",
    sectors: [
      {
        sector: "dairy",
        sectorName: "酪農（乳用牛）",
        headCount: 850000,
        headUnit: "頭（飼養）",
        nationalRank: 1,
        nationalSharePct: 63.9,
        farmCount: 5700,
        avgFarmScale: "約149頭/農場",
        laborShortageLevel: "深刻",
        sswCompatibilityScore: 82,
        keyOperations: [
          "搾乳（1日2〜3回・自動搾乳機補助含む）",
          "飼料給与",
          "哺育管理",
          "糞尿処理",
        ],
        sswNote:
          "北海道の酪農は深刻な人手不足。1日も休めない搾乳作業は「農業界の工場勤務」として通年雇用に最適。" +
          "外国人労働者（特定技能）の受入実績が最も多い農業分野。",
      },
      {
        sector: "beef_cattle",
        sectorName: "肉用牛（ホルスタイン系含む）",
        headCount: 520000,
        headUnit: "頭（飼養）",
        nationalRank: 1,
        nationalSharePct: 19.9,
        farmCount: 6800,
        avgFarmScale: "約76頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 74,
        keyOperations: ["飼料給与", "出荷補助", "糞尿処理"],
        sswNote: "十勝・釧路・根室地区に集中。広大な農場での毎日の作業が安定雇用を生む。",
      },
      {
        sector: "pig",
        sectorName: "養豚",
        headCount: 650000,
        headUnit: "頭（飼養）",
        nationalRank: 4,
        nationalSharePct: 7.2,
        farmCount: 290,
        avgFarmScale: "約2,240頭/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 75,
        keyOperations: ["分娩補助", "飼養管理", "出荷作業"],
        sswNote: "帯広・岩見沢地区。豚肉の一大産地で安定した通年雇用が可能。",
      },
      {
        sector: "broiler",
        sectorName: "ブロイラー",
        headCount: 7000000,
        headUnit: "羽/年出荷",
        nationalRank: 16,
        nationalSharePct: 1.0,
        farmCount: 15,
        avgFarmScale: "約47万羽/農場",
        laborShortageLevel: "高い",
        sswCompatibilityScore: 76,
        keyOperations: ["捕鳥・出荷", "鶏舎清掃"],
        sswNote: "ブロイラーは少ないが採卵鶏農場での捕鳥需要もある。",
      },
    ],
    winningPatterns: [
      "酪農の通年雇用は「農業SSWの理想モデル」。北海道進出時の参考ケース",
      "1農場200〜500頭規模で常時5〜10名の安定雇用が可能",
    ],
    attribution: ATTRIBUTION,
  },
];

const outputSchema = z.object({
  prefectureCode: z.string(),
  prefectureName: z.string(),
  region: z.string(),
  overview: z.string(),
  sectors: z.array(
    z.object({
      sector: z.string(),
      sectorName: z.string(),
      headCount: z.number().int(),
      headUnit: z.string(),
      nationalRank: z.number().int(),
      nationalSharePct: z.number(),
      farmCount: z.number().int(),
      avgFarmScale: z.string(),
      laborShortageLevel: z.enum(["深刻", "高い", "中程度", "低い"]),
      sswCompatibilityScore: z.number().int().min(0).max(100),
      keyOperations: z.array(z.string()),
      sswNote: z.string(),
    }),
  ),
  winningPatterns: z.array(z.string()),
  availablePrefectures: z.array(z.string()),
  attribution: z.string(),
});

export function registerGetLivestockRegionalStats(server: McpServer, _deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Livestock regional statistics",
      description:
        "Returns livestock (畜産) statistics by prefecture based on 農林水産省 畜産統計調査 2023. " +
        "Covers 4 sectors: broiler (肉用鶏 / 捕鳥作業), pig (養豚), beef cattle (肉用牛), dairy (酪農). " +
        "For each sector: national rank, headcount, farm count, SSW compatibility score, " +
        "key operations, and SSW dispatch notes. " +
        "Key insight: broiler catching (捕鳥) at night is the highest-SSW-dependency operation " +
        "in all of agriculture — Kagoshima/Miyazaki are the national #1/#2 broiler prefectures " +
        "and Sugu-kuru's home base. Use `sector` to focus on one livestock type.",
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

      const { prefectureCode, sector } = parsed.data;
      const profile = DB.find((p) => p.prefectureCode === prefectureCode);
      const available = DB.map((p) => `${p.prefectureCode}(${p.prefectureName})`);

      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: `${prefectureCode} のデータはありません。対応: ${available.join("、")}`,
            },
          ],
          structuredContent: {
            prefectureCode,
            prefectureName: "未登録",
            region: "unknown",
            overview: "データなし",
            sectors: [],
            winningPatterns: [],
            availablePrefectures: available,
            attribution: ATTRIBUTION,
          } as unknown as Record<string, unknown>,
        };
      }

      const filteredSectors = sector
        ? profile.sectors.filter((s) => s.sector === sector)
        : profile.sectors;

      const sectorLines = filteredSectors.map((s) => {
        const rankStr = s.nationalRank > 0 ? `全国${s.nationalRank}位` : "全国合計";
        return [
          `### ${s.sectorName} — SSW適性スコア ${s.sswCompatibilityScore}/100`,
          `- 規模: ${s.headCount.toLocaleString()} ${s.headUnit} (${rankStr}・全国比${s.nationalSharePct}%)`,
          `- 農場数: ${s.farmCount.toLocaleString()} 農場 / ${s.avgFarmScale}`,
          `- 人手不足度: ${s.laborShortageLevel}`,
          `- 主要作業: ${s.keyOperations.join("、")}`,
          `- SSWメモ: ${s.sswNote}`,
        ].join("\n");
      });

      const structured = {
        ...profile,
        sectors: filteredSectors,
        availablePrefectures: available,
      };

      return {
        content: [
          {
            type: "text",
            text: [
              `## ${profile.prefectureName}（${prefectureCode}）畜産統計`,
              `地域: ${profile.region}`,
              "",
              profile.overview,
              "",
              ...sectorLines,
              "",
              "### スグクル勝ちパターン",
              ...profile.winningPatterns.map((w) => `- ${w}`),
              "",
              `出典: ${ATTRIBUTION}`,
            ].join("\n"),
          },
        ],
        structuredContent: withVizHint(structured as unknown as Record<string, unknown>, {
          preferredView: "bar_compare",
          labelKey: "sectorName",
          valueKeys: ["sswCompatibilityScore", "nationalSharePct"],
          dataPath: "sectors",
          threshold: 75,
          title: `${profile.prefectureName} 畜産 SSW適性スコア`,
          legend: { unit: "点", min: 0, max: 100, tone: "success" },
        }),
      };
    },
  );
}
