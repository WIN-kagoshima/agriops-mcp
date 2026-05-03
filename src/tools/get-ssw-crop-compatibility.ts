import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_ssw_crop_compatibility",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 8,
};

const inputSchema = z
  .object({
    crop: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe(
        "Crop name in Japanese to evaluate. If omitted, returns the full compatibility ranking " +
          "of all crops in the database sorted by SSW score descending.",
      ),
  })
  .strict();

/**
 * SSW 特定技能「農業」の許容作業分類 (農林水産省 運用ガイドライン 2019 改訂)
 *
 * 耕種農業: 施設栽培・畑作野菜・果樹
 * 畜産農業: 養豚・養鶏・酪農・その他
 *
 * 各スコアは以下の5軸で構成（各 0〜20 点、合計 100 点満点）:
 *   A. 自動化困難度  — 機械収穫が難しく手作業が必要な度合い
 *   B. 価値密度      — 産出額/栽培面積（高い＝農家が賃金を払える余裕）
 *   C. 季節集中度    — 収穫期が短く集中するほど「派遣」モデルに合う
 *   D. 技能習得速度  — 短期間でも戦力になれる（高い＝短期でOK）
 *   E. 労働力不足度  — 現場が人手不足と感じている度合い（実態調査ベース）
 */
interface CropCompatibility {
  crop: string;
  aliases: string[];
  sswCategory: "耕種農業_施設" | "耕種農業_畑作野菜" | "耕種農業_果樹" | "畜産農業" | "林業";
  scores: {
    automationResistance: number;
    valueDensity: number;
    seasonalConcentration: number;
    skillAcquisitionSpeed: number;
    laborShortageLevel: number;
  };
  totalScore: number;
  harvestMonths: number[];
  keyActivities: string[];
  sswNote: string;
  caveat: string;
  bestPrefectures: string[];
}

const CROP_COMPATIBILITY_DB: CropCompatibility[] = [
  {
    crop: "いちご",
    aliases: ["イチゴ", "strawberry", "あまおう", "紅ほっぺ", "章姫", "古都華"],
    sswCategory: "耕種農業_施設",
    scores: {
      automationResistance: 20,
      valueDensity: 18,
      seasonalConcentration: 14,
      skillAcquisitionSpeed: 15,
      laborShortageLevel: 18,
    },
    totalScore: 85,
    harvestMonths: [11, 12, 1, 2, 3, 4, 5],
    keyActivities: ["収穫（毎日）", "選果・パック詰め", "ハウス管理・電照"],
    sswNote:
      "最高ランク。完全手作業・毎日収穫・高単価の三拍子。冬季（12〜2月）は農閑期の少ない安定稼働。" +
      "あまおう（福岡）・紅ほっぺ（愛媛・愛知）・古都華（奈良）など各地でブランド展開。" +
      "パック詰め・選果作業は比較的早期に戦力化できる。",
    caveat: "ハウス内作業のため冬季は低温。繊細な果実のため丁寧さ指導が必要。",
    bestPrefectures: ["JP-40(福岡)", "JP-38(愛媛)", "JP-23(愛知)", "JP-29(奈良)", "JP-41(佐賀)"],
  },
  {
    crop: "みかん",
    aliases: ["かんきつ", "柑橘", "温州ミカン", "有田みかん", "せとか", "伊予柑", "citrus"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 20,
      valueDensity: 15,
      seasonalConcentration: 18,
      skillAcquisitionSpeed: 14,
      laborShortageLevel: 18,
    },
    totalScore: 85,
    harvestMonths: [10, 11, 12, 1, 2],
    keyActivities: ["手摘み収穫", "選果・箱詰め", "摘果（夏）"],
    sswNote:
      "最高ランク。機械収穫が物理的に不可能な段々畑での手摘みが主体。" +
      "10〜12月の3ヶ月に労働需要が集中し派遣モデルに最適。" +
      "和歌山有田・愛媛宇和島・熊本天草など高齢化が深刻な産地が多く、SSWの受入機運が高い。",
    caveat: "急斜面での作業が多く転倒リスクあり。安全教育必須。段々畑未経験者は慣れに時間がかかる。",
    bestPrefectures: [
      "JP-38(愛媛)",
      "JP-30(和歌山)",
      "JP-43(熊本)",
      "JP-42(長崎)",
      "JP-46(鹿児島)",
    ],
  },
  {
    crop: "マンゴー",
    aliases: ["まんごー", "アップルマンゴー", "mango"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 20,
      valueDensity: 20,
      seasonalConcentration: 17,
      skillAcquisitionSpeed: 10,
      laborShortageLevel: 15,
    },
    totalScore: 82,
    harvestMonths: [4, 5, 6, 7],
    keyActivities: ["袋掛け", "落下果回収（ネット管理）", "収穫・選果"],
    sswNote:
      "1玉2000〜5000円の超高単価作物。全工程が手作業で機械化の余地なし。" +
      "宮崎が全国1位。農家の支払い能力が高く、適正賃金でのSSW雇用が成立しやすい。" +
      "ただし品質管理の水準が高く、未経験者の即戦力化には2〜3シーズン必要。",
    caveat: "高温ハウス内作業（4〜6月）。品質管理の要求水準が非常に高い。熟練が必要。",
    bestPrefectures: ["JP-45(宮崎)", "JP-47(沖縄)"],
  },
  {
    crop: "花き",
    aliases: ["花卉", "切り花", "菊", "キク", "ユリ", "バラ", "flowers"],
    sswCategory: "耕種農業_施設",
    scores: {
      automationResistance: 19,
      valueDensity: 16,
      seasonalConcentration: 5,
      skillAcquisitionSpeed: 16,
      laborShortageLevel: 18,
    },
    totalScore: 74,
    harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    keyActivities: ["切り花収穫・調製", "電照・遮光管理", "箱詰め・出荷"],
    sswNote:
      "通年雇用が可能な唯一の主要作物カテゴリ。愛知（渥美半島）は規模が圧倒的で法人農家も多く、" +
      "SSW受入体制が整っている。季節変動が少ないため福利厚生・住宅手配のコストが分散できる。" +
      "スグクルの安定収益基盤として最重要候補。",
    caveat: "品種・栽培管理が複雑で品目知識の習得に時間がかかる。",
    bestPrefectures: ["JP-23(愛知)", "JP-40(福岡)", "JP-45(宮崎)", "JP-43(熊本)"],
  },
  {
    crop: "お茶",
    aliases: ["茶", "緑茶", "煎茶", "抹茶", "荒茶", "知覧茶", "伊勢茶", "大和茶"],
    sswCategory: "耕種農業_畑作野菜",
    scores: {
      automationResistance: 12,
      valueDensity: 17,
      seasonalConcentration: 17,
      skillAcquisitionSpeed: 13,
      laborShortageLevel: 17,
    },
    totalScore: 76,
    harvestMonths: [4, 5, 6, 7],
    keyActivities: ["摘採機オペレーター補助", "コンテナ運搬", "乾燥・選別補助"],
    sswNote:
      "一番茶（5月）の2〜3週間に労働需要が集中。高値かつ農家の利益率が高く支払い能力あり。" +
      "鹿児島（知覧・頴娃）は全国2位の産地で農業法人化が進み、SSW受入の先進事例あり。" +
      "三重・奈良も産地として有望。機械補助が主なため即戦力化しやすい。",
    caveat: "一番茶の時期は天候に左右され急な増員・減員が発生する。事前確約が難しい。",
    bestPrefectures: ["JP-46(鹿児島)", "JP-24(三重)", "JP-29(奈良)", "JP-22(静岡)"],
  },
  {
    crop: "きゅうり",
    aliases: ["キュウリ", "cucumber"],
    sswCategory: "耕種農業_施設",
    scores: {
      automationResistance: 18,
      valueDensity: 13,
      seasonalConcentration: 8,
      skillAcquisitionSpeed: 16,
      laborShortageLevel: 17,
    },
    totalScore: 72,
    harvestMonths: [10, 11, 12, 1, 2, 3, 4, 5],
    keyActivities: ["毎日収穫", "誘引・摘葉", "選別・出荷"],
    sswNote:
      "毎日収穫が必要な施設野菜。宮崎（全国1位）・高知の大規模農家は年間を通じて安定需要。" +
      "作業が定型的で習得しやすく、初めての農業SSWにも向いている。",
    caveat: "冬作は収穫量の変動が大きい。1日2〜3往復の収穫作業は体力を要する。",
    bestPrefectures: ["JP-45(宮崎)", "JP-39(高知)", "JP-21(岐阜)"],
  },
  {
    crop: "トマト",
    aliases: ["とまと", "ミニトマト", "大玉トマト"],
    sswCategory: "耕種農業_施設",
    scores: {
      automationResistance: 17,
      valueDensity: 14,
      seasonalConcentration: 8,
      skillAcquisitionSpeed: 14,
      laborShortageLevel: 16,
    },
    totalScore: 69,
    harvestMonths: [11, 12, 1, 2, 3, 4, 5, 6],
    keyActivities: ["収穫（毎日〜2日おき）", "整枝・芽かき", "誘引作業"],
    sswNote:
      "熊本（全国1位）・高知・愛知に大規模産地あり。大型農業法人が多くSSW受入体制が整っている。" +
      "整枝・誘引は習得に1〜2ヶ月かかるが収穫は早期戦力化できる。",
    caveat: "整枝・芽かきは訓練なしでは品質低下を招く。初期指導コストを考慮。",
    bestPrefectures: ["JP-43(熊本)", "JP-39(高知)", "JP-23(愛知)"],
  },
  {
    crop: "さつまいも",
    aliases: ["サツマイモ", "甘藷", "かんしょ", "紅はるか", "安納芋", "なると金時"],
    sswCategory: "耕種農業_畑作野菜",
    scores: {
      automationResistance: 15,
      valueDensity: 11,
      seasonalConcentration: 17,
      skillAcquisitionSpeed: 18,
      laborShortageLevel: 15,
    },
    totalScore: 76,
    harvestMonths: [9, 10, 11],
    keyActivities: ["コンバイン収穫補助", "コンテナ積み込み", "キュアリング作業"],
    sswNote:
      "10〜11月の集中収穫期に大量の人手が必要。スグクルの本拠・鹿児島が全国1位産地。" +
      "作業習得が最も速い作物のひとつ。1シーズンで即戦力になれる。" +
      "市場価格が上昇傾向で農家の採算が改善中。",
    caveat: "コンバイン補助以外は比較的単純作業。長期雇用には多様な作業経験が必要。",
    bestPrefectures: ["JP-46(鹿児島)", "JP-36(徳島)", "JP-45(宮崎)"],
  },
  {
    crop: "キャベツ",
    aliases: ["きゃべつ", "cabbage"],
    sswCategory: "耕種農業_畑作野菜",
    scores: {
      automationResistance: 12,
      valueDensity: 8,
      seasonalConcentration: 14,
      skillAcquisitionSpeed: 18,
      laborShortageLevel: 14,
    },
    totalScore: 66,
    harvestMonths: [11, 12, 1, 2, 3, 4, 5, 6],
    keyActivities: ["収穫・外葉除去", "コンテナ積み込み", "選別"],
    sswNote:
      "愛知（渥美半島）・鹿児島・熊本に大産地。収穫期が長く安定した雇用が可能。" +
      "習得が速く初めての農業SSWに向いている。ただし単価が低いため農家の支払い能力に注意。",
    caveat: "単価が低く、農家の賃金支払い余力が他作物より小さい場合がある。",
    bestPrefectures: ["JP-23(愛知)", "JP-46(鹿児島)", "JP-43(熊本)"],
  },
  {
    crop: "すだち",
    aliases: ["スダチ", "酢橘"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 20,
      valueDensity: 18,
      seasonalConcentration: 18,
      skillAcquisitionSpeed: 15,
      laborShortageLevel: 17,
    },
    totalScore: 88,
    harvestMonths: [8, 9],
    keyActivities: ["手摘み収穫", "選果", "コンテナ積み込み"],
    sswNote:
      "全国産出の98%が徳島。8〜9月の約4〜6週間に収穫が完全集中する。" +
      "手摘みのみで機械化が不可能。高単価かつ農家の利益率が高い。" +
      "短期集中型のため「夏の繁忙期派遣」として組みやすい。",
    caveat: "収穫期が非常に短いため、人員確保のタイムライン管理が重要。",
    bestPrefectures: ["JP-36(徳島)"],
  },
  {
    crop: "びわ",
    aliases: ["ビワ", "枇杷", "loquat"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 20,
      valueDensity: 17,
      seasonalConcentration: 17,
      skillAcquisitionSpeed: 12,
      laborShortageLevel: 16,
    },
    totalScore: 82,
    harvestMonths: [5, 6],
    keyActivities: ["摘蕾・袋掛け（冬〜春）", "手摘み収穫", "選果・箱詰め"],
    sswNote:
      "長崎が全国最大産地。非常に労働集約的で機械化が不可能。高単価。" +
      "袋掛け作業（1月〜）も含めると冬〜初夏まで派遣期間を確保できる。",
    caveat: "全工程が手作業で習熟に時間がかかる。1シーズン目は袋掛けから慣らすのが最適。",
    bestPrefectures: ["JP-42(長崎)", "JP-38(愛媛)"],
  },
  {
    crop: "梅",
    aliases: ["ウメ", "南高梅", "plum"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 18,
      valueDensity: 15,
      seasonalConcentration: 19,
      skillAcquisitionSpeed: 16,
      laborShortageLevel: 16,
    },
    totalScore: 84,
    harvestMonths: [6],
    keyActivities: ["落下梅の拾い取り", "手摘み収穫", "コンテナ運搬"],
    sswNote:
      "6月の約2〜3週間に完全集中。和歌山みなべ・田辺エリアが全国シェア60%。" +
      "農家の高齢化が深刻で後継者不足が顕著。拾い取り作業は習得が速く即戦力になれる。",
    caveat: "収穫期間が極めて短く、前後の季節に他の作物と組み合わせる必要がある。",
    bestPrefectures: ["JP-30(和歌山)", "JP-43(熊本)"],
  },
  // ===== 畜産 =====
  {
    crop: "ブロイラー（捕鳥・鶏舎管理）",
    aliases: ["肉用鶏", "ブロイラー", "地鶏", "鶏", "捕鳥", "養鶏", "broiler", "poultry"],
    sswCategory: "畜産農業",
    scores: {
      automationResistance: 20,
      valueDensity: 14,
      seasonalConcentration: 6,
      skillAcquisitionSpeed: 18,
      laborShortageLevel: 20,
    },
    totalScore: 78,
    harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    keyActivities: [
      "捕鳥・出荷（深夜23時〜翌6時、約50〜70日ごと）",
      "鶏舎清掃・消毒（捕鳥後）",
      "初生雛の導入補助",
      "給餌・飲水管理",
    ],
    sswNote:
      "人手不足スコア20/20 — 農業全作業中最高。深夜・重労働・機械化不可の「究極のSSW専用作業」。" +
      "1回の捕鳥に15〜30名が深夜3〜6時間従事。鹿児島・宮崎（全国1〜2位）はスグクルの地元で" +
      "農場との距離が近く、深夜チームを組める唯一の派遣会社になれる。" +
      "通年作業のため年間を通じた安定雇用が可能（捕鳥は約50〜70日ごとに発生）。" +
      "作業習得が速く、初めての畜産SSWに最適。",
    caveat:
      "深夜作業（23:00〜6:00が標準）のため住環境・睡眠サイクルへの配慮が必要。" +
      "農場内の衛生管理（防疫）ルールの徹底指導が必須。",
    bestPrefectures: ["JP-46(鹿児島)", "JP-45(宮崎)", "JP-43(熊本)", "JP-44(大分)", "JP-03(岩手)"],
  },
  {
    crop: "養豚（分娩補助・飼養管理）",
    aliases: ["豚", "養豚", "豚舎", "pig", "swine", "分娩補助"],
    sswCategory: "畜産農業",
    scores: {
      automationResistance: 16,
      valueDensity: 12,
      seasonalConcentration: 4,
      skillAcquisitionSpeed: 14,
      laborShortageLevel: 18,
    },
    totalScore: 64,
    harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    keyActivities: ["分娩補助・仔豚管理", "豚の移動・仕分け", "飼養管理", "衛生管理・消毒"],
    sswNote:
      "年間を通じた安定雇用が可能。分娩補助は経験を積むほど価値が高まる熟練作業。" +
      "鹿児島（全国1位）・宮崎（同2位）の大規模農場は法人化が進みSSW受入体制が整っている。" +
      "豚の移動・出荷作業は体力を要するがSSWが最も戦力化しやすい作業のひとつ。",
    caveat:
      "臭気・衛生環境への適応が必要。農場内の防疫ルール（踏み込み消毒等）の徹底が必須。" +
      "分娩補助の熟練には3〜6ヶ月の研修期間を見込む。",
    bestPrefectures: ["JP-46(鹿児島)", "JP-45(宮崎)", "JP-12(千葉)", "JP-01(北海道)"],
  },
  {
    crop: "酪農（搾乳・飼養管理）",
    aliases: ["乳用牛", "乳牛", "酪農", "搾乳", "dairy"],
    sswCategory: "畜産農業",
    scores: {
      automationResistance: 14,
      valueDensity: 13,
      seasonalConcentration: 3,
      skillAcquisitionSpeed: 12,
      laborShortageLevel: 18,
    },
    totalScore: 60,
    harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    keyActivities: [
      "搾乳（1日2〜3回・時間固定）",
      "飼料給与",
      "哺育管理（子牛）",
      "糞尿処理",
    ],
    sswNote:
      "1日も休めない搾乳作業は「農業界の工場勤務」。完全通年雇用が可能で定住化モデルに最適。" +
      "北海道が全国64%を占めるが、愛知・熊本・鹿児島にも安定した需要がある。" +
      "農水省の調査で、特定技能の受入実績が畜産分野で最も多い作業類型。",
    caveat:
      "早朝・夜間の搾乳が必要で不規則な生活サイクル。長期コミットが必要。" +
      "自動搾乳機（ロボット搾乳）の普及により将来の自動化リスクがある（特に北海道大規模農場）。",
    bestPrefectures: ["JP-01(北海道)", "JP-23(愛知)", "JP-43(熊本)", "JP-46(鹿児島)"],
  },
  {
    crop: "肉用牛（飼養管理・和牛）",
    aliases: ["和牛", "黒毛和牛", "肉牛", "beef cattle", "肉用牛", "牛"],
    sswCategory: "畜産農業",
    scores: {
      automationResistance: 15,
      valueDensity: 16,
      seasonalConcentration: 5,
      skillAcquisitionSpeed: 11,
      laborShortageLevel: 16,
    },
    totalScore: 63,
    harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    keyActivities: ["飼料給与（1日2回）", "繁殖管理補助", "糞尿処理", "市場出荷補助"],
    sswNote:
      "鹿児島黒牛・宮崎牛・豊後牛などブランド和牛農家は高収益でSSW賃金支払い余力あり。" +
      "毎日の飼養管理作業で通年雇用が可能。繁殖農家は技術習得に時間がかかるが肥育農家はSSWでも比較的早期に戦力化できる。",
    caveat:
      "繁殖管理（人工授精補助等）は専門技術が必要で即戦力化は難しい。肥育作業からのスタートを推奨。",
    bestPrefectures: ["JP-46(鹿児島)", "JP-45(宮崎)", "JP-44(大分)", "JP-01(北海道)"],
  },
  {
    crop: "稲",
    aliases: ["米", "水稲", "コメ", "rice"],
    sswCategory: "耕種農業_畑作野菜",
    scores: {
      automationResistance: 4,
      valueDensity: 5,
      seasonalConcentration: 14,
      skillAcquisitionSpeed: 14,
      laborShortageLevel: 8,
    },
    totalScore: 45,
    harvestMonths: [8, 9, 10],
    keyActivities: ["コンバイン補助", "乾燥・袋詰め補助", "苗代管理"],
    sswNote:
      "機械化が進んでいるため手作業の需要が少ない。価格も低く農家の支払い能力に制約。" +
      "ただし農業SSWの入門として経験を積む価値はある。",
    caveat: "収穫はほぼ機械。人手が必要な場面が限定的でSSW活用の費用対効果は低い。",
    bestPrefectures: [],
  },
  {
    crop: "ぶどう",
    aliases: ["葡萄", "ブドウ", "マスカット", "ピオーネ", "シャインマスカット", "grape"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 20,
      valueDensity: 19,
      seasonalConcentration: 15,
      skillAcquisitionSpeed: 9,
      laborShortageLevel: 15,
    },
    totalScore: 78,
    harvestMonths: [7, 8, 9, 10],
    keyActivities: ["摘粒（非常に繊細）", "袋掛け", "収穫・選果"],
    sswNote:
      "超高単価作物。岡山マスカット・シャインマスカットは1kg数千円。" +
      "摘粒は非常に繊細で失敗すると商品価値ゼロになるため習熟に時間がかかる。" +
      "2〜3シーズン経験したSSWは非常に高い価値を持つ。長期関係が重要。",
    caveat: "摘粒作業は習熟に2〜3シーズン必要。初年度は袋掛け・収穫補助からのスタートを推奨。",
    bestPrefectures: ["JP-33(岡山)"],
  },
  {
    crop: "レモン",
    aliases: ["れもん", "lemon", "瀬戸田レモン"],
    sswCategory: "耕種農業_果樹",
    scores: {
      automationResistance: 20,
      valueDensity: 16,
      seasonalConcentration: 15,
      skillAcquisitionSpeed: 14,
      laborShortageLevel: 17,
    },
    totalScore: 82,
    harvestMonths: [10, 11, 12, 1, 2, 3],
    keyActivities: ["手摘み収穫", "選果・箱詰め", "島嶼部の搬出作業"],
    sswNote:
      "広島（尾道・因島）が全国シェア60%。国産レモンブームで需要急増。" +
      "農家の高齢化が深刻で若手後継者が少ない。手摘みのみ。" +
      "島嶼部農家はフェリーアクセスが必要な点を考慮。",
    caveat: "離島産地への派遣はフェリー代・移動時間のコスト増を農家と協議要。",
    bestPrefectures: ["JP-34(広島)"],
  },
];

const outputSchema = z.object({
  crop: z.string().nullable(),
  results: z.array(
    z.object({
      crop: z.string(),
      sswCategory: z.string(),
      totalScore: z.number().int().min(0).max(100),
      rank: z.string(),
      scores: z.object({
        automationResistance: z.number(),
        valueDensity: z.number(),
        seasonalConcentration: z.number(),
        skillAcquisitionSpeed: z.number(),
        laborShortageLevel: z.number(),
      }),
      harvestMonths: z.array(z.number().int().min(1).max(12)),
      keyActivities: z.array(z.string()),
      sswNote: z.string(),
      caveat: z.string(),
      bestPrefectures: z.array(z.string()),
    }),
  ),
  methodology: z.string(),
  attribution: z.string(),
});

function rankLabel(score: number): string {
  if (score >= 85) return "S（最優先）";
  if (score >= 75) return "A（優先）";
  if (score >= 65) return "B（検討）";
  if (score >= 50) return "C（補助的）";
  return "D（非推奨）";
}

function findCrop(name: string): CropCompatibility | null {
  const lower = name.toLowerCase();
  for (const e of CROP_COMPATIBILITY_DB) {
    if (e.crop === name || e.aliases.some((a) => a.toLowerCase() === lower)) return e;
  }
  for (const e of CROP_COMPATIBILITY_DB) {
    if (
      e.crop.includes(name) ||
      name.includes(e.crop) ||
      e.aliases.some((a) => a.includes(name) || name.includes(a))
    ) {
      return e;
    }
  }
  return null;
}

export function registerGetSswCropCompatibility(server: McpServer, _deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "SSW crop compatibility score",
      description:
        "Returns an SSW (特定技能外国人 agricultural worker) compatibility score for crops. " +
        "Scores each crop on 5 axes: automation resistance, value density, seasonal concentration, " +
        "skill acquisition speed, and labor shortage level (each 0-20, total 100). " +
        "Based on 農林水産省 特定技能ガイドライン, market data, and labor statistics. " +
        "If `crop` is omitted, returns the full ranking of all crops in descending order. " +
        "Use to identify which crops are best suited for SSW dispatch operations.",
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

      const { crop } = parsed.data;
      const methodology =
        "5軸評価 (各0-20点, 合計100点): " +
        "A.自動化困難度 — 機械収穫が困難で手作業が必須な度合い; " +
        "B.価値密度 — 産出額/栽培面積（農家の賃金支払い余力）; " +
        "C.季節集中度 — 収穫期の集中度（派遣モデルとの相性）; " +
        "D.技能習得速度 — 短期間での戦力化のしやすさ; " +
        "E.労働力不足度 — 現場の人手不足の深刻度。" +
        "データ根拠: 農水省特定技能ガイドライン・農林業センサス2020・ALIC市場情報・現地農家調査。";
      const attribution =
        "AgriOps MCP SSW互換性DB v1.8 — 農林水産省特定技能農業ガイドライン2019改訂 / 農林業センサス2020 / ALIC市場情報";

      if (!crop) {
        const sorted = [...CROP_COMPATIBILITY_DB].sort((a, b) => b.totalScore - a.totalScore);
        const results = sorted.map((e) => ({ ...e, rank: rankLabel(e.totalScore) }));

        const tableRows = results.map(
          (r) =>
            `| ${r.crop} | ${rankLabel(r.totalScore)} | ${r.totalScore} | ` +
            `${r.scores.automationResistance} | ${r.scores.valueDensity} | ` +
            `${r.scores.seasonalConcentration} | ${r.scores.skillAcquisitionSpeed} | ` +
            `${r.scores.laborShortageLevel} | ${r.sswCategory} |`,
        );

        const structured = { crop: null, results, methodology, attribution };

        return {
          content: [
            {
              type: "text",
              text: [
                "## 農業 SSW 派遣適性スコア ランキング",
                "",
                "| 作物 | ランク | 総合 | 自動化困難 | 価値密度 | 季節集中 | 習得速度 | 人手不足 | 分類 |",
                "|-----|------|-----|---------|--------|--------|-------|-------|-----|",
                ...tableRows,
                "",
                "**スコア基準**: S≥85（最優先） A≥75（優先） B≥65（検討） C≥50（補助的） D<50（非推奨）",
                "",
                `方法論: ${methodology}`,
              ].join("\n"),
            },
          ],
          structuredContent: structured as unknown as Record<string, unknown>,
        };
      }

      const entry = findCrop(crop);
      if (!entry) {
        const available = CROP_COMPATIBILITY_DB.map((e) => e.crop);
        return {
          content: [
            {
              type: "text",
              text: `「${crop}」のデータはありません。\n登録済み: ${available.join("、")}`,
            },
          ],
          structuredContent: {
            crop,
            results: [],
            methodology,
            attribution,
          } as unknown as Record<string, unknown>,
        };
      }

      const rank = rankLabel(entry.totalScore);
      const scoreBar = (v: number) => "█".repeat(Math.round(v / 2)) + "░".repeat(10 - Math.round(v / 2));

      const structured = {
        crop,
        results: [{ ...entry, rank }],
        methodology,
        attribution,
      };

      return {
        content: [
          {
            type: "text",
            text: [
              `## ${entry.crop} — SSW 派遣適性評価`,
              `### 総合スコア: **${entry.totalScore}/100** — ${rank}`,
              `分類: ${entry.sswCategory}`,
              "",
              "### スコア詳細",
              `- 自動化困難度   ${scoreBar(entry.scores.automationResistance)} ${entry.scores.automationResistance}/20`,
              `- 価値密度        ${scoreBar(entry.scores.valueDensity)} ${entry.scores.valueDensity}/20`,
              `- 季節集中度      ${scoreBar(entry.scores.seasonalConcentration)} ${entry.scores.seasonalConcentration}/20`,
              `- 技能習得速度    ${scoreBar(entry.scores.skillAcquisitionSpeed)} ${entry.scores.skillAcquisitionSpeed}/20`,
              `- 労働力不足度    ${scoreBar(entry.scores.laborShortageLevel)} ${entry.scores.laborShortageLevel}/20`,
              "",
              `### 収穫月: ${entry.harvestMonths.map((m) => `${m}月`).join("・")}`,
              "",
              "### 主要作業",
              ...entry.keyActivities.map((a) => `- ${a}`),
              "",
              "### SSW派遣メモ",
              entry.sswNote,
              "",
              "### 注意事項",
              entry.caveat,
              "",
              `### 有望産地: ${entry.bestPrefectures.join("、") || "—"}`,
              "",
              `出典: ${attribution}`,
            ].join("\n"),
          },
        ],
        structuredContent: structured as unknown as Record<string, unknown>,
      };
    },
  );
}
