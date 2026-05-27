import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withVizHint } from "../lib/viz-hint.js";

import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_prefecture_crop_profile",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 7,
};

const SUPPORTED_PREFECTURES = [
  // Kyushu
  "JP-40", // 福岡
  "JP-41", // 佐賀
  "JP-42", // 長崎
  "JP-43", // 熊本
  "JP-44", // 大分
  "JP-45", // 宮崎
  "JP-46", // 鹿児島
  "JP-47", // 沖縄
  // Shikoku
  "JP-36", // 徳島
  "JP-37", // 香川
  "JP-38", // 愛媛
  "JP-39", // 高知
  // Tokai
  "JP-21", // 岐阜
  "JP-23", // 愛知
  "JP-24", // 三重
  // Kinki
  "JP-30", // 和歌山
  "JP-29", // 奈良
  // Chugoku
  "JP-34", // 広島
  "JP-33", // 岡山
] as const;

type PrefCode = (typeof SUPPORTED_PREFECTURES)[number];

const inputSchema = z
  .object({
    prefectureCode: z
      .enum(SUPPORTED_PREFECTURES)
      .describe(
        "ISO 3166-2:JP prefecture code. " +
          "Kyushu: JP-40(福岡) JP-41(佐賀) JP-42(長崎) JP-43(熊本) JP-44(大分) JP-45(宮崎) JP-46(鹿児島) JP-47(沖縄). " +
          "Shikoku: JP-36(徳島) JP-37(香川) JP-38(愛媛) JP-39(高知). " +
          "Tokai: JP-21(岐阜) JP-23(愛知) JP-24(三重). " +
          "Kinki: JP-30(和歌山) JP-29(奈良). " +
          "Chugoku: JP-34(広島) JP-33(岡山).",
      ),
  })
  .strict();

interface CropProfile {
  crop: string;
  rank: number;
  harvestMonths: number[];
  peakLaborMonths: number[];
  laborIntensity: "low" | "medium" | "high" | "very_high";
  laborNotes: string;
  marketNote: string;
}

interface PrefectureProfile {
  prefectureCode: PrefCode;
  prefectureName: string;
  region: "kyushu" | "shikoku" | "tokai" | "kinki" | "chugoku";
  mainCrops: CropProfile[];
  peakLaborMonths: number[];
  ssw_dispatch_note: string;
  attribution: string;
}

const PREFECTURE_DB: PrefectureProfile[] = [
  // ===== 九州 =====
  {
    prefectureCode: "JP-40",
    prefectureName: "福岡県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "いちご（あまおう）",
        rank: 1,
        harvestMonths: [12, 1, 2, 3, 4, 5],
        peakLaborMonths: [12, 1, 2, 3],
        laborIntensity: "very_high",
        laborNotes: "収穫・選果・パック詰めで大量の手作業。週7日の交代制。12〜3月がSSW受入の最繁忙",
        marketNote: "あまおうブランドで高単価。贈答需要に対応する丁寧な選果が必要",
      },
      {
        crop: "水稲（元気つくし）",
        rank: 2,
        harvestMonths: [8, 9, 10],
        peakLaborMonths: [9],
        laborIntensity: "medium",
        laborNotes: "コンバイン収穫が主体。乾燥・調製作業に人手",
        marketNote: "早期米の需要が高い。先物市場に連動",
      },
      {
        crop: "花き（菊・バラ）",
        rank: 3,
        harvestMonths: [1, 2, 3, 8, 9, 12],
        peakLaborMonths: [8, 12],
        laborIntensity: "high",
        laborNotes: "ハウス内での切り花収穫・調製作業。盆・正月前は突発的な増員要請",
        marketNote: "盆・正月・彼岸の需要期に価格高騰",
      },
    ],
    peakLaborMonths: [12, 1, 2, 3, 8, 9],
    ssw_dispatch_note:
      "いちご農家への冬季派遣がメイン。糸島・飯塚・八女地区に大規模農家が集積。" +
      "外国人技能実習生の受入実績が多く、SSW切替え需要が高まっている。",
    attribution: "農林水産省 作物統計 / 福岡県農林水産部",
  },
  {
    prefectureCode: "JP-41",
    prefectureName: "佐賀県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "たまねぎ",
        rank: 1,
        harvestMonths: [4, 5],
        peakLaborMonths: [4, 5],
        laborIntensity: "very_high",
        laborNotes: "収穫・コンテナ積み込みに大人数が必要。約2〜4週間の集中作業",
        marketNote: "佐賀玉ねぎは九州シェア最大。4〜5月の短期集中収穫",
      },
      {
        crop: "いちご（さがほのか）",
        rank: 2,
        harvestMonths: [11, 12, 1, 2, 3, 4],
        peakLaborMonths: [12, 1, 2],
        laborIntensity: "high",
        laborNotes: "ハウスいちごの収穫・パック詰め",
        marketNote: "さがほのか・よつぼしが主力品種",
      },
      {
        crop: "水稲",
        rank: 3,
        harvestMonths: [9, 10],
        peakLaborMonths: [9, 10],
        laborIntensity: "medium",
        laborNotes: "大規模法人が多く機械化が進んでいるが乾燥・袋詰めに人手",
        marketNote: "佐賀米（夢しずく）は全国ブランド",
      },
    ],
    peakLaborMonths: [4, 5, 12, 1, 2],
    ssw_dispatch_note: "たまねぎの春収穫と冬いちごで需要が二分。神埼・鹿島・嬉野エリアが産地中心。",
    attribution: "農林水産省 作物統計 / 佐賀県農業振興部",
  },
  {
    prefectureCode: "JP-42",
    prefectureName: "長崎県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "じゃがいも",
        rank: 1,
        harvestMonths: [5, 6],
        peakLaborMonths: [5, 6],
        laborIntensity: "high",
        laborNotes: "島原・雲仙地区の大規模圃場。収穫・選別に多数の人手",
        marketNote: "長崎産馬鈴薯は全国最大級。早掘り品が高値",
      },
      {
        crop: "みかん（ハウスみかん）",
        rank: 2,
        harvestMonths: [6, 7, 8, 9],
        peakLaborMonths: [7, 8],
        laborIntensity: "high",
        laborNotes: "ハウス内での収穫・管理。夏季のSSWニーズあり",
        marketNote: "長崎のハウスみかんは夏季出荷で高値を獲得",
      },
      {
        crop: "びわ",
        rank: 3,
        harvestMonths: [5, 6],
        peakLaborMonths: [5, 6],
        laborIntensity: "very_high",
        laborNotes: "摘果・袋掛け・収穫すべて手作業。非常に労働集約的",
        marketNote: "長崎びわは日本最大産地。高級果実で単価高い",
      },
    ],
    peakLaborMonths: [5, 6, 7, 8],
    ssw_dispatch_note: "島原半島・五島列島・対馬など離島農業も多い。SSW派遣は移動コストを要検討。",
    attribution: "農林水産省 作物統計 / 長崎県農林部",
  },
  {
    prefectureCode: "JP-43",
    prefectureName: "熊本県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "トマト",
        rank: 1,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5, 6],
        peakLaborMonths: [1, 2, 3, 4],
        laborIntensity: "very_high",
        laborNotes: "大規模ハウストマト（八代地区）。収穫・誘引・芽かきの通年作業",
        marketNote: "熊本産は全国1位。八代・宇城地区に大型法人農家多数",
      },
      {
        crop: "すいか",
        rank: 2,
        harvestMonths: [4, 5, 6, 7],
        peakLaborMonths: [5, 6],
        laborIntensity: "high",
        laborNotes: "摘果・玉返し・収穫。重量物の運搬に体力が必要",
        marketNote: "熊本産すいかは全国1位。4〜6月の集中出荷",
      },
      {
        crop: "水稲",
        rank: 3,
        harvestMonths: [8, 9, 10],
        peakLaborMonths: [9],
        laborIntensity: "medium",
        laborNotes: "機械化進展。乾燥・精米施設での作業",
        marketNote: "森のくまさんが人気ブランド",
      },
    ],
    peakLaborMonths: [1, 2, 3, 4, 5, 6],
    ssw_dispatch_note:
      "八代・宇城のトマト農家は年間を通じてSSW需要が高い。農業法人の組織化が進んでおりSSW受入体制が整っている地区が多い。",
    attribution: "農林水産省 作物統計 / 熊本県農政部",
  },
  {
    prefectureCode: "JP-44",
    prefectureName: "大分県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "かぼす",
        rank: 1,
        harvestMonths: [7, 8, 9, 10, 11],
        peakLaborMonths: [8, 9, 10],
        laborIntensity: "high",
        laborNotes: "収穫はすべて手摘み。急斜面の果樹園での作業が多い",
        marketNote: "大分産かぼすは全国シェア95%超。9〜10月に出荷最盛",
      },
      {
        crop: "ねぎ",
        rank: 2,
        harvestMonths: [1, 2, 3, 10, 11, 12],
        peakLaborMonths: [11, 12, 1],
        laborIntensity: "high",
        laborNotes: "収穫・調製（皮むき・根切り）に多くの人手",
        marketNote: "九重・竹田地区が産地",
      },
      {
        crop: "大豆",
        rank: 3,
        harvestMonths: [11, 12],
        peakLaborMonths: [11],
        laborIntensity: "medium",
        laborNotes: "収穫は機械だが乾燥・選別に人手",
        marketNote: "フクユタカが主品種。豆腐用国産大豆として高値",
      },
    ],
    peakLaborMonths: [8, 9, 10, 11, 12],
    ssw_dispatch_note:
      "かぼす収穫は急斜面での手摘みが多く、経験者が重宝される。竹田・豊後大野エリアが集積地。",
    attribution: "農林水産省 作物統計 / 大分県農林水産部",
  },
  {
    prefectureCode: "JP-45",
    prefectureName: "宮崎県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "きゅうり",
        rank: 1,
        harvestMonths: [10, 11, 12, 1, 2, 3, 4, 5],
        peakLaborMonths: [11, 12, 1, 2],
        laborIntensity: "very_high",
        laborNotes: "収穫は毎日。大型ハウスでの通年作業。宮崎中央農協管内に大規模産地",
        marketNote: "宮崎産きゅうりは冬春の全国出荷量トップクラス",
      },
      {
        crop: "マンゴー",
        rank: 2,
        harvestMonths: [4, 5, 6, 7],
        peakLaborMonths: [5, 6],
        laborIntensity: "very_high",
        laborNotes: "袋掛け・摘果・収穫すべて手作業。高価な果実のため丁寧な取り扱いが必須",
        marketNote: "宮崎マンゴーは高級ブランド。1玉2000〜5000円の高単価",
      },
      {
        crop: "スギ丸太（飫肥杉）",
        rank: 3,
        harvestMonths: [4, 5, 6, 7, 10, 11],
        peakLaborMonths: [4, 5, 6],
        laborIntensity: "high",
        laborNotes: "間伐・搬出・チップ化。重機操作可能な人材が優先",
        marketNote: "飫肥杉は全国1位の産出量。木材価格は建材需要に左右される",
      },
    ],
    peakLaborMonths: [11, 12, 1, 2, 5, 6],
    ssw_dispatch_note:
      "きゅうり農家への冬季派遣とマンゴー農家への春季派遣で二大需要。宮崎市・都城市・延岡市が主要産地。",
    attribution: "農林水産省 作物統計 / 宮崎県農政水産部",
  },
  {
    prefectureCode: "JP-46",
    prefectureName: "鹿児島県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "さつまいも（紅はるか・安納芋）",
        rank: 1,
        harvestMonths: [9, 10, 11],
        peakLaborMonths: [10, 11],
        laborIntensity: "very_high",
        laborNotes: "収穫・コンテナ積み込み・キュアリング貯蔵が主作業。10〜11月は大量動員",
        marketNote: "全国シェア35%。紅はるかは高級品として市場に定着",
      },
      {
        crop: "茶（知覧茶・頴娃茶）",
        rank: 2,
        harvestMonths: [4, 5, 6, 7],
        peakLaborMonths: [4, 5],
        laborIntensity: "high",
        laborNotes: "摘採機オペレーターとコンテナ運搬が主体。一番茶期（4〜5月）が最繁忙",
        marketNote: "一番茶は高値。鹿児島産は全国2位の生産量",
      },
      {
        crop: "さとうきび",
        rank: 3,
        harvestMonths: [12, 1, 2, 3],
        peakLaborMonths: [1, 2],
        laborIntensity: "high",
        laborNotes: "奄美地方・種子島での機械収穫補助と搬出作業",
        marketNote: "製糖工場のスケジュールに合わせた搬入が必須",
      },
    ],
    peakLaborMonths: [10, 11, 4, 5],
    ssw_dispatch_note:
      "さつまいも収穫期（10〜11月）が最大の需要期。霧島・指宿・大隅地区が主産地。" +
      "スグクルの本拠地として農家との信頼関係が最も強いエリア。",
    attribution: "農林水産省 作物統計 / 鹿児島県農政部",
  },
  {
    prefectureCode: "JP-47",
    prefectureName: "沖縄県",
    region: "kyushu",
    mainCrops: [
      {
        crop: "さとうきび",
        rank: 1,
        harvestMonths: [1, 2, 3],
        peakLaborMonths: [1, 2, 3],
        laborIntensity: "high",
        laborNotes: "ハーベスター収穫が主体だが圃場整備・搬出に人手",
        marketNote: "沖縄の基幹作物。製糖会社の買取価格は国が支持",
      },
      {
        crop: "ゴーヤー",
        rank: 2,
        harvestMonths: [3, 4, 5, 6, 7, 8, 9, 10],
        peakLaborMonths: [5, 6, 7],
        laborIntensity: "high",
        laborNotes: "誘引・収穫の繰り返し作業。夏季の高温下での作業が多い",
        marketNote: "本土出荷量が多く夏季に高値",
      },
    ],
    peakLaborMonths: [1, 2, 3, 5, 6, 7],
    ssw_dispatch_note: "那覇から産地まで移動が必要。離島（宮古・石垣）も産地だが渡航費が発生。",
    attribution: "農林水産省 作物統計 / 沖縄県農林水産部",
  },

  // ===== 四国 =====
  {
    prefectureCode: "JP-36",
    prefectureName: "徳島県",
    region: "shikoku",
    mainCrops: [
      {
        crop: "なると金時（さつまいも）",
        rank: 1,
        harvestMonths: [9, 10, 11],
        peakLaborMonths: [10, 11],
        laborIntensity: "very_high",
        laborNotes: "鳴門・板野地区の大規模圃場。収穫・選別・コンテナ積みに多数",
        marketNote: "ブランドさつまいも。高値が安定しており農家収入も高水準",
      },
      {
        crop: "すだち",
        rank: 2,
        harvestMonths: [8, 9],
        peakLaborMonths: [8, 9],
        laborIntensity: "very_high",
        laborNotes: "手摘み収穫。全国産出の98%が徳島産のため需要集中",
        marketNote: "8〜9月に収穫が集中。需要期の9月第1週に価格がピーク",
      },
      {
        crop: "レタス",
        rank: 3,
        harvestMonths: [10, 11, 12, 1, 2, 3, 4],
        peakLaborMonths: [11, 12, 1],
        laborIntensity: "high",
        laborNotes: "収穫・選別・箱詰め。西日本有数の冬春レタス産地",
        marketNote: "徳島産は冬春の全国流通量に大きく貢献",
      },
    ],
    peakLaborMonths: [8, 9, 10, 11],
    ssw_dispatch_note:
      "なると金時収穫とすだち収穫が8〜11月に重なる。鳴門・板野地区でのSSW需要高まりつつあり。",
    attribution: "農林水産省 作物統計 / 徳島県農林水産部",
  },
  {
    prefectureCode: "JP-37",
    prefectureName: "香川県",
    region: "shikoku",
    mainCrops: [
      {
        crop: "たまねぎ",
        rank: 1,
        harvestMonths: [4, 5],
        peakLaborMonths: [4, 5],
        laborIntensity: "high",
        laborNotes: "収穫・乾燥・選別。佐賀と並ぶ西日本の主要産地",
        marketNote: "香川玉ねぎは甘みが強く関西市場で評価高い",
      },
      {
        crop: "オリーブ",
        rank: 2,
        harvestMonths: [10, 11, 12],
        peakLaborMonths: [10, 11],
        laborIntensity: "very_high",
        laborNotes: "小豆島のオリーブ農家。手摘み収穫が主体。ブランド価値が高く丁寧な取り扱い必須",
        marketNote: "国産オリーブオイルは高級品。1kg数千円の単価",
      },
      {
        crop: "キャベツ",
        rank: 3,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5],
        peakLaborMonths: [12, 1, 2],
        laborIntensity: "medium",
        laborNotes: "冬春作のキャベツ収穫・箱詰め",
        marketNote: "関西向け冬春キャベツの産地",
      },
    ],
    peakLaborMonths: [4, 5, 10, 11],
    ssw_dispatch_note:
      "たまねぎ収穫の春とオリーブ収穫の秋で二大ピーク。小豆島へのアクセスにフェリー利用が必要。",
    attribution: "農林水産省 作物統計 / 香川県農政水産部",
  },
  {
    prefectureCode: "JP-38",
    prefectureName: "愛媛県",
    region: "shikoku",
    mainCrops: [
      {
        crop: "みかん（温州・伊予柑・せとか）",
        rank: 1,
        harvestMonths: [10, 11, 12, 1, 2, 3],
        peakLaborMonths: [10, 11, 12],
        laborIntensity: "very_high",
        laborNotes: "収穫はすべて手摘み。急傾斜の段々畑での作業が多く経験者優遇",
        marketNote: "全国1位の柑橘産地。宇和島・松山地区の大規模農家多数",
      },
      {
        crop: "いちご（紅ほっぺ）",
        rank: 2,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5],
        peakLaborMonths: [12, 1, 2],
        laborIntensity: "high",
        laborNotes: "ハウスいちごの収穫・選果・パック詰め",
        marketNote: "四国いちごの代表産地。ブランド力が向上中",
      },
      {
        crop: "ヒノキ丸太（四国材）",
        rank: 3,
        harvestMonths: [3, 4, 5, 10, 11],
        peakLaborMonths: [4, 5],
        laborIntensity: "high",
        laborNotes: "間伐・搬出・土場での作業。重機オペレーター優先",
        marketNote: "四国材は中部・関西向けに安定需要。尾鷲ヒノキと並ぶ産地",
      },
    ],
    peakLaborMonths: [10, 11, 12, 1, 2],
    ssw_dispatch_note:
      "みかん収穫（10〜12月）がスグクルの四国派遣における最重要需要。宇和島・八幡浜・松山南部が主産地。" +
      "急傾斜園が多く農作業の経験値が重要。スグクルの愛媛派遣拠点として検討価値が高い。",
    attribution: "農林水産省 作物統計 / 愛媛県農林水産研究所",
  },
  {
    prefectureCode: "JP-39",
    prefectureName: "高知県",
    region: "shikoku",
    mainCrops: [
      {
        crop: "トマト（施設）",
        rank: 1,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5, 6],
        peakLaborMonths: [12, 1, 2, 3],
        laborIntensity: "very_high",
        laborNotes: "大型ガラス温室での周年栽培。国内最大規模の施設トマト産地（安芸・香美）",
        marketNote: "高知産トマト・ミニトマトは全国トップ。冬春に出荷最盛",
      },
      {
        crop: "ゆず",
        rank: 2,
        harvestMonths: [10, 11, 12],
        peakLaborMonths: [11],
        laborIntensity: "very_high",
        laborNotes: "収穫は手摘み。棘があり手袋必着。馬路村・北川村が有名産地",
        marketNote: "全国1位の産地。高知ゆずのブランド価値は高い",
      },
      {
        crop: "スギ丸太（土佐材）",
        rank: 3,
        harvestMonths: [4, 5, 6, 10, 11],
        peakLaborMonths: [4, 5],
        laborIntensity: "high",
        laborNotes: "四国山地での間伐・搬出。林業機械オペレーター需要",
        marketNote: "高知は全国有数の林業県。土佐材は安定した需要",
      },
    ],
    peakLaborMonths: [11, 12, 1, 2, 3],
    ssw_dispatch_note:
      "施設野菜（トマト・きゅうり）の通年作業とゆず収穫期（11月）が主要需要。安芸・香美エリアが農業集積地。",
    attribution: "農林水産省 作物統計 / 高知県農業振興部",
  },

  // ===== 東海 =====
  {
    prefectureCode: "JP-21",
    prefectureName: "岐阜県",
    region: "tokai",
    mainCrops: [
      {
        crop: "トマト（飛騨）",
        rank: 1,
        harvestMonths: [7, 8, 9, 10],
        peakLaborMonths: [8, 9],
        laborIntensity: "high",
        laborNotes: "高冷地の飛騨トマト。夏季の大量収穫・選別作業",
        marketNote: "夏季の高原トマトは高値傾向。飛騨・高山エリアが産地",
      },
      {
        crop: "柿（富有柿）",
        rank: 2,
        harvestMonths: [10, 11],
        peakLaborMonths: [10, 11],
        laborIntensity: "high",
        laborNotes: "収穫・選果・箱詰め。岐阜は富有柿の発祥地",
        marketNote: "富有柿は全国1位の産地（瑞穂市）。10〜11月に集中出荷",
      },
      {
        crop: "ヒノキ丸太（東濃材）",
        rank: 3,
        harvestMonths: [3, 4, 5, 9, 10, 11],
        peakLaborMonths: [4, 5],
        laborIntensity: "high",
        laborNotes: "東濃地方の林業。間伐・造材・搬出作業",
        marketNote: "東濃ヒノキは建築材として安定需要。中部・首都圏向け",
      },
    ],
    peakLaborMonths: [8, 9, 10, 11],
    ssw_dispatch_note:
      "飛騨地方の夏野菜と東濃地方の柿収穫が主要ピーク。中山間地域が多く移動距離に留意。",
    attribution: "農林水産省 作物統計 / 岐阜県農政部",
  },
  {
    prefectureCode: "JP-23",
    prefectureName: "愛知県",
    region: "tokai",
    mainCrops: [
      {
        crop: "花き（菊・バラ・洋ラン）",
        rank: 1,
        harvestMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        peakLaborMonths: [3, 8, 12],
        laborIntensity: "very_high",
        laborNotes: "ハウス内での通年作業。収穫・調製・箱詰めを毎日実施。渥美半島に集積",
        marketNote: "全国1位の花き産地。年間を通じて安定した雇用需要が最大の特徴",
      },
      {
        crop: "キャベツ",
        rank: 2,
        harvestMonths: [12, 1, 2, 3, 4, 5],
        peakLaborMonths: [1, 2, 3],
        laborIntensity: "high",
        laborNotes: "渥美半島の大規模農地。収穫・コンテナ積み込み",
        marketNote: "冬春キャベツの全国最大産地（渥美半島）。全国シェア25%",
      },
      {
        crop: "いちご（章姫・紅ほっぺ）",
        rank: 3,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5],
        peakLaborMonths: [12, 1, 2],
        laborIntensity: "high",
        laborNotes: "豊川・田原地区のハウスいちご。収穫・選果・パック詰め",
        marketNote: "愛知は全国3位のいちご産地",
      },
    ],
    peakLaborMonths: [1, 2, 3, 8, 12],
    ssw_dispatch_note:
      "花き農家は年間を通じてSSW需要が安定しており、スグクルの東海拠点として最有力。" +
      "渥美半島（田原市）に大規模農業法人が集積。通年雇用可能。",
    attribution: "農林水産省 作物統計 / 愛知県農業水産局",
  },
  {
    prefectureCode: "JP-24",
    prefectureName: "三重県",
    region: "tokai",
    mainCrops: [
      {
        crop: "茶（伊勢茶）",
        rank: 1,
        harvestMonths: [4, 5, 6, 7],
        peakLaborMonths: [5],
        laborIntensity: "high",
        laborNotes: "一番茶期（5月）は短期集中。摘採機のオペレーター補助と運搬作業",
        marketNote: "全国3位の茶産地。伊勢茶ブランドは高付加価値",
      },
      {
        crop: "みかん・温州",
        rank: 2,
        harvestMonths: [10, 11, 12],
        peakLaborMonths: [11, 12],
        laborIntensity: "high",
        laborNotes: "熊野地方の段々畑でのみかん収穫。手摘み作業",
        marketNote: "紀伊半島南部の温暖な気候を活かした柑橘産地",
      },
      {
        crop: "ヒノキ丸太（尾鷲ヒノキ）",
        rank: 3,
        harvestMonths: [3, 4, 5, 9, 10],
        peakLaborMonths: [4, 5],
        laborIntensity: "high",
        laborNotes: "尾鷲・紀北エリアの林業。最高品質のヒノキ産地",
        marketNote: "尾鷲ヒノキは年輪が詰まり節が少ない高級材。建築・社寺仏閣向け",
      },
    ],
    peakLaborMonths: [5, 11, 12],
    ssw_dispatch_note:
      "茶の一番茶（5月）とみかん収穫（11〜12月）が二大ピーク。津・松阪エリアから熊野・尾鷲への移動が必要。",
    attribution: "農林水産省 作物統計 / 三重県農林水産部",
  },

  // ===== 近畿 =====
  {
    prefectureCode: "JP-30",
    prefectureName: "和歌山県",
    region: "kinki",
    mainCrops: [
      {
        crop: "みかん（有田みかん）",
        rank: 1,
        harvestMonths: [10, 11, 12, 1],
        peakLaborMonths: [10, 11, 12],
        laborIntensity: "very_high",
        laborNotes:
          "有田地区の段々畑。急斜面での手摘み収穫が主体。みかんとモノレール・運搬作業も多い",
        marketNote: "有田みかんは全国ブランド。全国2位の産地。糖度重視の選果基準が厳しい",
      },
      {
        crop: "柿（富有柿・刀根早生）",
        rank: 2,
        harvestMonths: [10, 11],
        peakLaborMonths: [10, 11],
        laborIntensity: "high",
        laborNotes: "収穫・選果・箱詰め。高所作業が多く脚立使用。刀根早生は10月初旬",
        marketNote: "和歌山は全国1位の柿産地。刀根早生は早期出荷で高値",
      },
      {
        crop: "梅（南高梅）",
        rank: 3,
        harvestMonths: [6, 7],
        peakLaborMonths: [6],
        laborIntensity: "very_high",
        laborNotes:
          "みなべ・田辺地区が産地。落下した梅を拾う作業と木から収穫する作業の両方あり。短期集中",
        marketNote: "南高梅は全国最高級ブランド。全国シェア約60%",
      },
    ],
    peakLaborMonths: [6, 10, 11, 12],
    ssw_dispatch_note:
      "有田みかんの秋収穫（10〜12月）と南高梅の梅雨期収穫（6月）が二大ピーク。" +
      "近畿圏のスグクル展開拠点として有田・御坊エリアを検討価値あり。段々畑経験者が重宝される。",
    attribution: "農林水産省 作物統計 / 和歌山県農林水産部",
  },
  {
    prefectureCode: "JP-29",
    prefectureName: "奈良県",
    region: "kinki",
    mainCrops: [
      {
        crop: "柿（富有柿・御所柿）",
        rank: 1,
        harvestMonths: [10, 11],
        peakLaborMonths: [10, 11],
        laborIntensity: "high",
        laborNotes: "五條・御所地区が産地。収穫・干し柿加工（あんぽ柿）への対応も",
        marketNote: "奈良は全国2〜3位の柿産地。御所柿・富有柿・あんぽ柿で多様なブランド",
      },
      {
        crop: "いちご（古都華）",
        rank: 2,
        harvestMonths: [12, 1, 2, 3, 4, 5],
        peakLaborMonths: [1, 2],
        laborIntensity: "high",
        laborNotes: "奈良市・大和郡山地区のハウスいちご。古都華は県オリジナル品種",
        marketNote: "古都華は高糖度・大粒で市場評価高い。12〜5月が出荷期",
      },
      {
        crop: "大和茶",
        rank: 3,
        harvestMonths: [4, 5, 6],
        peakLaborMonths: [5],
        laborIntensity: "medium",
        laborNotes: "山添村・大和高原の茶産地。一番茶期（5月）に集中",
        marketNote: "大和茶は京都・宇治ブレンド向けの高品質茶葉。産地ブランドとして確立",
      },
    ],
    peakLaborMonths: [5, 10, 11, 1, 2],
    ssw_dispatch_note:
      "柿収穫（10〜11月）といちご収穫（冬季）で二分。大阪・京都へのアクセスが良く拠点を置きやすいエリア。",
    attribution: "農林水産省 作物統計 / 奈良県農林部",
  },

  // ===== 中国 =====
  {
    prefectureCode: "JP-34",
    prefectureName: "広島県",
    region: "chugoku",
    mainCrops: [
      {
        crop: "レモン（瀬戸田レモン）",
        rank: 1,
        harvestMonths: [10, 11, 12, 1, 2, 3],
        peakLaborMonths: [11, 12],
        laborIntensity: "high",
        laborNotes: "尾道・因島・大崎上島などの島嶼部。船でのアクセスが必要なケースも",
        marketNote: "国産レモンの全国シェア約60%。瀬戸田レモンは最高ブランド。輸入レモンより高値",
      },
      {
        crop: "みかん・柑橘（瀬戸内）",
        rank: 2,
        harvestMonths: [10, 11, 12],
        peakLaborMonths: [11, 12],
        laborIntensity: "high",
        laborNotes: "因島・江田島・大崎上島の段々畑。手摘み収穫",
        marketNote: "瀬戸内の温暖な気候で高糖度。地域ブランドとして価値向上中",
      },
      {
        crop: "キャベツ・野菜",
        rank: 3,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5],
        peakLaborMonths: [12, 1, 2],
        laborIntensity: "medium",
        laborNotes: "三原・東広島の平野部農業。機械化進展",
        marketNote: "関西・中国市場向け冬春野菜",
      },
    ],
    peakLaborMonths: [11, 12, 1],
    ssw_dispatch_note:
      "レモン収穫（11〜12月）が最大の需要。島嶼部へのアクセスにフェリー利用が必要なケースあり。" +
      "尾道・三原エリアを拠点とすれば複数の離島産地をカバーできる。",
    attribution: "農林水産省 作物統計 / 広島県農林水産局",
  },
  {
    prefectureCode: "JP-33",
    prefectureName: "岡山県",
    region: "chugoku",
    mainCrops: [
      {
        crop: "ぶどう（マスカット・ピオーネ）",
        rank: 1,
        harvestMonths: [7, 8, 9, 10],
        peakLaborMonths: [8, 9],
        laborIntensity: "very_high",
        laborNotes:
          "笠岡・倉敷・赤磐地区。摘粒・袋掛け・収穫すべて手作業。繊細な果実のため丁寧さが必須",
        marketNote: "マスカット・オブ・アレキサンドリアは最高級品。ピオーネも全国1位の産地",
      },
      {
        crop: "白桃・もも",
        rank: 2,
        harvestMonths: [7, 8],
        peakLaborMonths: [7, 8],
        laborIntensity: "very_high",
        laborNotes: "袋掛け・収穫・選果。傷つきやすく手作業が絶対。高所作業梯子使用",
        marketNote: "岡山白桃は全国最高ブランド。1玉1000〜3000円の高単価",
      },
      {
        crop: "トマト（倉敷・総社）",
        rank: 3,
        harvestMonths: [11, 12, 1, 2, 3, 4, 5],
        peakLaborMonths: [1, 2, 3],
        laborIntensity: "high",
        laborNotes: "施設トマトの収穫・誘引作業。冬春の通年需要",
        marketNote: "岡山のハウストマトは関西市場で評価高い",
      },
    ],
    peakLaborMonths: [7, 8, 9, 1, 2],
    ssw_dispatch_note:
      "ぶどう・白桃の夏季収穫（7〜9月）が最大需要。非常に繊細な作業が要求されるため経験者優遇。" +
      "倉敷・総社エリアに農業法人が集積。JR 沿線でアクセス良好。",
    attribution: "農林水産省 作物統計 / 岡山県農林水産部",
  },
];

const outputSchema = z.object({
  prefectureCode: z.string(),
  prefectureName: z.string(),
  region: z.enum(["kyushu", "shikoku", "tokai", "kinki", "chugoku"]),
  mainCrops: z.array(
    z.object({
      crop: z.string(),
      rank: z.number().int(),
      harvestMonths: z.array(z.number().int().min(1).max(12)),
      peakLaborMonths: z.array(z.number().int().min(1).max(12)),
      laborIntensity: z.enum(["low", "medium", "high", "very_high"]),
      laborNotes: z.string(),
      marketNote: z.string(),
    }),
  ),
  peakLaborMonths: z.array(z.number().int().min(1).max(12)),
  ssw_dispatch_note: z.string(),
  availablePrefectures: z.array(z.string()),
  attribution: z.string(),
});

export function registerGetPrefectureCropProfile(server: McpServer, _deps: any): void {
  server.registerTool(
    meta.name,
    {
      title: "Prefecture crop & SSW dispatch profile",
      description:
        "Returns the main agricultural crops, harvest seasons, labor intensity, and SSW dispatch notes " +
        "for a given prefecture. Covers all of Kyushu (JP-40…JP-47), Shikoku (JP-36…JP-39), " +
        "Tokai 3 prefectures (JP-21 Gifu, JP-23 Aichi, JP-24 Mie), " +
        "Kinki 2 prefectures (JP-30 Wakayama, JP-29 Nara), " +
        "and Chugoku 2 prefectures (JP-34 Hiroshima, JP-33 Okayama). " +
        "Designed for Sugu-kuru dispatch planning: identifies peak labor months, crop-specific demand, " +
        "and regional notes for SSW worker deployment decisions. Read-only and idempotent.",
      inputSchema: inputSchema.shape,
      outputSchema: outputSchema.shape,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
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
      const profile = PREFECTURE_DB.find((p) => p.prefectureCode === prefectureCode);

      const available = PREFECTURE_DB.map((p) => `${p.prefectureCode}(${p.prefectureName})`);

      if (!profile) {
        return {
          content: [
            {
              type: "text",
              text: `${prefectureCode} のプロフィールはまだ登録されていません。\n対応都道府県: ${available.join("、")}`,
            },
          ],
          structuredContent: {
            prefectureCode,
            prefectureName: "未登録",
            region: "kyushu",
            mainCrops: [],
            peakLaborMonths: [],
            ssw_dispatch_note: "データなし",
            availablePrefectures: available,
            attribution: "AgriOps MCP built-in prefecture database",
          } as unknown as Record<string, unknown>,
        };
      }

      const structured = {
        ...profile,
        availablePrefectures: available,
      };

      const intensityLabel: Record<string, string> = {
        low: "低",
        medium: "中",
        high: "高",
        very_high: "非常に高い",
      };

      const cropTable = profile.mainCrops
        .map((c) => {
          const months = c.harvestMonths.map((m) => `${m}月`).join("・");
          const peak = c.peakLaborMonths.map((m) => `${m}月`).join("・");
          return (
            `| ${c.rank} | ${c.crop} | ${months} | ピーク: ${peak} | ` +
            `${intensityLabel[c.laborIntensity] ?? c.laborIntensity} | ${c.marketNote} |`
          );
        })
        .join("\n");

      const peakMonths = profile.peakLaborMonths.map((m) => `${m}月`).join("・");

      return {
        content: [
          {
            type: "text",
            text: [
              `## ${profile.prefectureName}（${prefectureCode}）農業プロフィール`,
              `地域区分: ${profile.region}`,
              "",
              "### 主要作物・収穫期・労働需要",
              "| 順位 | 作物 | 収穫月 | 労働ピーク | 労働強度 | 市場メモ |",
              "|------|------|--------|-----------|---------|---------|",
              cropTable,
              "",
              `### 労働ピーク月（通年）: ${peakMonths}`,
              "",
              "### スグクル派遣メモ",
              profile.ssw_dispatch_note,
              "",
              `出典: ${profile.attribution}`,
            ].join("\n"),
          },
        ],
        structuredContent: withVizHint(structured as unknown as Record<string, unknown>, {
          preferredView: "calendar_heatmap",
          dataPath: "mainCrops",
          rowLabelKey: "crop",
          title: `${structured.prefectureName} 作物カレンダー（月別労働需要）`,
          legend: { unit: "労働強度", tone: "warning" },
        }),
      };
    },
  );
}
