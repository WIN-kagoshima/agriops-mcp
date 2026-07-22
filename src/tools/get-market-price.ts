import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withVizHint } from "../lib/viz-hint.js";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "get_market_price",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 7,
};

const REGION_CODES = [
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
  "JP-23", // 愛知
  "JP-21", // 岐阜
  "JP-24", // 三重
] as const;

const inputSchema = z
  .object({
    crop: z
      .string()
      .min(1)
      .max(80)
      .describe(
        "Crop or product name in Japanese. Supports vegetables, fruits, rice, and timber. " +
          "Examples: さつまいも, キャベツ, みかん, 米, スギ丸太, ヒノキ丸太.",
      ),
    region: z
      .enum(REGION_CODES)
      .optional()
      .describe(
        "ISO 3166-2:JP prefecture code to filter origin-specific prices. " +
          "Supported: Kyushu (JP-40…JP-47), Shikoku (JP-36…JP-39), Tokai (JP-21, JP-23, JP-24). " +
          "If omitted, returns national average reference prices.",
      ),
    month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("Month (1-12) for seasonal price estimate. Defaults to current month."),
  })
  .strict();

type MarketPriceInput = z.infer<typeof inputSchema>;

interface PriceEntry {
  crop: string;
  aliases: string[];
  unit: string;
  category: "vegetable" | "fruit" | "grain" | "special" | "timber";
  nationalAvg: { minYen: number; maxYen: number; typicalYen: number };
  seasonality: { month: number; factor: number }[];
  origins: { region: string; note: string }[];
  notes: string;
  source: string;
}

const PRICE_DB: PriceEntry[] = [
  {
    crop: "さつまいも",
    aliases: ["サツマイモ", "甘藷", "かんしょ", "紅はるか", "安納芋"],
    unit: "kg",
    category: "vegetable",
    nationalAvg: { minYen: 120, maxYen: 320, typicalYen: 220 },
    seasonality: [
      { month: 1, factor: 1.2 },
      { month: 2, factor: 1.3 },
      { month: 3, factor: 1.3 },
      { month: 4, factor: 1.1 },
      { month: 5, factor: 0.9 },
      { month: 6, factor: 0.8 },
      { month: 7, factor: 0.8 },
      { month: 8, factor: 0.8 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 0.9 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.1 },
    ],
    origins: [
      { region: "JP-46", note: "鹿児島産（紅はるか・安納芋）が全国シェア約35%。10〜11月収穫" },
      { region: "JP-36", note: "徳島産（なると金時）。9〜11月が出荷最盛期" },
      { region: "JP-45", note: "宮崎産。秋・春の2作体制" },
    ],
    notes: "近年の猛暑・干ばつ影響で2024〜2026年は高値傾向。キュアリング後の貯蔵品が冬〜春に流通。",
    source: "農畜産業振興機構 (ALIC) 野菜情報 / 農林水産省 作況調査",
  },
  {
    crop: "キャベツ",
    aliases: ["きゃべつ", "cabbage"],
    unit: "kg",
    category: "vegetable",
    nationalAvg: { minYen: 50, maxYen: 160, typicalYen: 90 },
    seasonality: [
      { month: 1, factor: 1.1 },
      { month: 2, factor: 1.1 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 0.9 },
      { month: 5, factor: 0.8 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 1.2 },
      { month: 8, factor: 1.3 },
      { month: 9, factor: 1.1 },
      { month: 10, factor: 0.9 },
      { month: 11, factor: 0.9 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      { region: "JP-23", note: "愛知産が全国シェア約25%。冬春キャベツの主産地（渥美半島）" },
      { region: "JP-43", note: "熊本産。秋冬作が主体" },
      { region: "JP-46", note: "鹿児島産。12〜2月に出荷集中" },
    ],
    notes: "夏場は群馬・長野の高原キャベツに切り替わり九州産は端境期。",
    source: "農畜産業振興機構 (ALIC) 野菜情報",
  },
  {
    crop: "みかん",
    aliases: ["かんきつ", "柑橘", "温州ミカン", "ミカン", "citrus"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 150, maxYen: 450, typicalYen: 280 },
    seasonality: [
      { month: 1, factor: 1.1 },
      { month: 2, factor: 1.2 },
      { month: 3, factor: 1.1 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 0.9 },
      { month: 6, factor: 0.8 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 0.9 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.1 },
    ],
    origins: [
      { region: "JP-38", note: "愛媛産が全国1位。みかん・いよかん・せとかが主力。10〜2月出荷" },
      { region: "JP-42", note: "長崎産（ハウスみかん）。5〜8月の夏みかん" },
      { region: "JP-45", note: "宮崎産（日南1号）。10月から早生" },
      { region: "JP-46", note: "鹿児島産（ポンカン・タンカン）。1〜3月が最盛" },
    ],
    notes: "ハウス栽培品は夏季も高値。土耕栽培の露地品は秋〜冬が主体。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
  {
    crop: "トマト",
    aliases: ["とまと", "ミニトマト", "大玉トマト"],
    unit: "kg",
    category: "vegetable",
    nationalAvg: { minYen: 180, maxYen: 450, typicalYen: 300 },
    seasonality: [
      { month: 1, factor: 1.2 },
      { month: 2, factor: 1.3 },
      { month: 3, factor: 1.1 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 0.9 },
      { month: 6, factor: 0.8 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 1.0 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.1 },
      { month: 12, factor: 1.2 },
    ],
    origins: [
      { region: "JP-43", note: "熊本産が全国トップ。ハウス栽培で通年出荷" },
      { region: "JP-39", note: "高知産ミニトマト。施設栽培が盛ん" },
      { region: "JP-23", note: "愛知産（豊橋）。冬春トマトの主産地" },
    ],
    notes: "夏季は北海道・東北産に移行するため九州産は4〜6月が多い。",
    source: "農畜産業振興機構 (ALIC) 野菜情報",
  },
  {
    crop: "いちご",
    aliases: ["イチゴ", "strawberry", "とよのか", "あまおう", "紅ほっぺ"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 800, maxYen: 2500, typicalYen: 1500 },
    seasonality: [
      { month: 1, factor: 1.2 },
      { month: 2, factor: 1.3 },
      { month: 3, factor: 1.2 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 0.8 },
      { month: 6, factor: 0.6 },
      { month: 7, factor: 0.5 },
      { month: 8, factor: 0.5 },
      { month: 9, factor: 0.6 },
      { month: 10, factor: 0.7 },
      { month: 11, factor: 0.9 },
      { month: 12, factor: 1.1 },
    ],
    origins: [
      { region: "JP-40", note: "福岡産（あまおう）が最高級ブランド。12〜5月" },
      { region: "JP-38", note: "愛媛産（紅ほっぺ）。ハウス栽培で11〜5月" },
      { region: "JP-23", note: "愛知産（章姫・紅ほっぺ）。温暖な渥美・豊川が主産地" },
    ],
    notes: "贈答用の高級品と業務用で価格帯が大きく異なる。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
  {
    crop: "たまねぎ",
    aliases: ["タマネギ", "玉ねぎ", "onion"],
    unit: "kg",
    category: "vegetable",
    nationalAvg: { minYen: 50, maxYen: 120, typicalYen: 80 },
    seasonality: [
      { month: 1, factor: 1.1 },
      { month: 2, factor: 1.1 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 0.8 },
      { month: 6, factor: 0.7 },
      { month: 7, factor: 0.8 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 1.1 },
      { month: 10, factor: 1.1 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.1 },
    ],
    origins: [
      { region: "JP-41", note: "佐賀産（佐賀玉ねぎ）が九州最大産地。4〜5月収穫" },
      { region: "JP-38", note: "愛媛産。香川と並ぶ四国産地。3〜5月" },
      { region: "JP-37", note: "香川産。春たまねぎ。3〜5月出荷" },
    ],
    notes: "5〜6月は北海道産との端境期。貯蔵性が高く北海道産が通年流通するため秋以降は競合。",
    source: "農畜産業振興機構 (ALIC) 野菜情報",
  },
  {
    crop: "稲",
    aliases: ["米", "水稲", "コメ", "rice", "コシヒカリ", "ヒノヒカリ"],
    unit: "60kg玄米",
    category: "grain",
    nationalAvg: { minYen: 18000, maxYen: 35000, typicalYen: 26000 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 0.9 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 0.9 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      { region: "JP-40", note: "福岡産（夢つくし・元気つくし）。9月早期収穫" },
      { region: "JP-43", note: "熊本産（森のくまさん）。9〜10月収穫" },
      { region: "JP-46", note: "鹿児島産（ヒノヒカリ）。9〜10月収穫" },
      { region: "JP-23", note: "愛知産（あいちのかおり）。9月収穫" },
    ],
    notes: "2024〜2026年は猛暑と作付け減少で価格が過去10年で最高水準。単位は60kg玄米（1俵）。",
    source: "農林水産省 米の相対取引価格・数量（月次公表）",
  },
  {
    crop: "大豆",
    aliases: ["だいず", "soybean", "枝豆"],
    unit: "kg",
    category: "grain",
    nationalAvg: { minYen: 250, maxYen: 420, typicalYen: 320 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 1.0 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 1.0 },
      { month: 10, factor: 0.9 },
      { month: 11, factor: 0.9 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      { region: "JP-44", note: "大分産フクユタカ。九州の主要品種。11〜12月収穫" },
      { region: "JP-21", note: "岐阜産フクユタカ。11月収穫。飛騨地方で有機大豆も" },
    ],
    notes: "国産大豆は輸入品の約6倍の価格。豆腐・味噌メーカー向け契約取引が主流。",
    source: "農林水産省 大豆の生産費調査",
  },
  {
    crop: "花き",
    aliases: ["花卉", "切り花", "菊", "キク", "百合", "ユリ", "バラ"],
    unit: "本",
    category: "special",
    nationalAvg: { minYen: 30, maxYen: 150, typicalYen: 70 },
    seasonality: [
      { month: 1, factor: 1.3 },
      { month: 2, factor: 1.2 },
      { month: 3, factor: 1.3 },
      { month: 4, factor: 1.1 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 0.9 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 1.1 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 0.9 },
      { month: 11, factor: 1.1 },
      { month: 12, factor: 1.3 },
    ],
    origins: [
      {
        region: "JP-23",
        note: "愛知産が全国1位（切り花・鉢物とも）。渥美半島のキク・バラが有名",
      },
      { region: "JP-40", note: "福岡産（小菊・ユリ）。全国3位規模" },
      { region: "JP-45", note: "宮崎産（ユリ・トルコキキョウ）。全国上位" },
    ],
    notes:
      "盆（8月）・彼岸（3・9月）・正月に需要急増。愛知産は周年安定供給が特徴。SSWの雇用機会多い。",
    source: "農林水産省 花き生産出荷統計",
  },
  {
    crop: "茶",
    aliases: ["お茶", "緑茶", "煎茶", "抹茶", "荒茶"],
    unit: "kg",
    category: "special",
    nationalAvg: { minYen: 1500, maxYen: 5000, typicalYen: 2800 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 0.9 },
      { month: 5, factor: 0.8 },
      { month: 6, factor: 0.9 },
      { month: 7, factor: 1.0 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 1.0 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.1 },
    ],
    origins: [
      { region: "JP-22", note: "静岡産が全国1位（掛川茶・本山茶）。※JP-22は静岡" },
      { region: "JP-46", note: "鹿児島産が全国2位。知覧茶・頴娃茶が有名。一番茶5月" },
      { region: "JP-24", note: "三重産（伊勢茶）。全国3位。5月一番茶が主力" },
    ],
    notes: "荒茶1kgの価格。一番茶（5月）が最高値。収穫作業は機械化されているが手摘みは高単価。",
    source: "農林水産省 作物統計（茶）",
  },
  {
    crop: "スギ丸太",
    aliases: ["杉丸太", "スギ", "杉材", "cedar log"],
    unit: "m³",
    category: "timber",
    nationalAvg: { minYen: 7000, maxYen: 18000, typicalYen: 12000 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.1 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 0.9 },
      { month: 9, factor: 1.0 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      { region: "JP-45", note: "宮崎産スギが全国1位（飫肥杉）。4〜7月が搬出最盛期" },
      { region: "JP-44", note: "大分産スギ。日田杉が有名ブランド" },
      { region: "JP-39", note: "高知産スギ（土佐材）。四国最大の林業産地" },
      { region: "JP-21", note: "岐阜産スギ・ヒノキ（東濃材）。中部圏への供給地" },
    ],
    notes: "ウッドショック後の2021〜2023年は急騰。2024〜2026年は調整局面だが建材需要で底堅い。",
    source: "林野庁 木材需給報告書 / 農林水産省 木材統計",
  },
  {
    crop: "ヒノキ丸太",
    aliases: ["檜丸太", "ヒノキ", "桧材", "hinoki log"],
    unit: "m³",
    category: "timber",
    nationalAvg: { minYen: 12000, maxYen: 28000, typicalYen: 18000 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.1 },
      { month: 4, factor: 1.1 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 0.9 },
      { month: 9, factor: 1.0 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      { region: "JP-24", note: "三重産（尾鷲ヒノキ）が最高ブランド。年輪細かく香り高い" },
      { region: "JP-21", note: "岐阜産ヒノキ（東濃材）。中部・関東向け建材" },
      { region: "JP-38", note: "愛媛産（四国材）。南四国のヒノキ林業" },
      { region: "JP-39", note: "高知産ヒノキ。土佐材の高品質品種" },
    ],
    notes: "建築・社寺仏閣向け高級材。スギより高価。乾燥材は付加価値が高い。",
    source: "林野庁 木材需給報告書 / 農林水産省 木材統計",
  },
  {
    crop: "なると金時",
    aliases: ["鳴門金時", "なると", "徳島さつまいも"],
    unit: "kg",
    category: "vegetable",
    nationalAvg: { minYen: 200, maxYen: 480, typicalYen: 320 },
    seasonality: [
      { month: 1, factor: 1.3 },
      { month: 2, factor: 1.4 },
      { month: 3, factor: 1.2 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 0.9 },
      { month: 6, factor: 0.8 },
      { month: 7, factor: 0.8 },
      { month: 8, factor: 0.8 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.1 },
      { month: 12, factor: 1.2 },
    ],
    origins: [
      {
        region: "JP-36",
        note: "徳島産が産地ブランド。鳴門・板野地区が主産地。9〜11月収穫",
      },
    ],
    notes: "さつまいもの高級品種。ホクホク系で甘みが強い。さつまいもの全国価格より高値傾向。",
    source: "農畜産業振興機構 (ALIC) 野菜情報",
  },
  {
    crop: "すいか",
    aliases: ["スイカ", "西瓜", "watermelon"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 150, maxYen: 450, typicalYen: 280 },
    seasonality: [
      { month: 1, factor: 1.2 },
      { month: 2, factor: 1.1 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 0.9 },
      { month: 5, factor: 0.8 },
      { month: 6, factor: 0.8 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 1.1 },
      { month: 10, factor: 1.2 },
      { month: 11, factor: 1.2 },
      { month: 12, factor: 1.2 },
    ],
    origins: [
      { region: "JP-43", note: "熊本産が全国1位（植木・益城地区）。4〜6月に集中出荷" },
      { region: "JP-45", note: "宮崎産（都城地区）。春すいかが主体" },
    ],
    notes:
      "熊本産の春すいかが全国最大。夏は山形・千葉産に移行。価格は1kg単価表示（選果時の重量基準）。",
    source: "農畜産業振興機構 (ALIC) 野菜情報",
  },
  {
    crop: "メロン",
    aliases: ["めろん", "アンデスメロン", "マスクメロン", "網干メロン", "mellon"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 400, maxYen: 1500, typicalYen: 700 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 0.9 },
      { month: 5, factor: 0.9 },
      { month: 6, factor: 0.9 },
      { month: 7, factor: 1.0 },
      { month: 8, factor: 1.1 },
      { month: 9, factor: 1.1 },
      { month: 10, factor: 1.1 },
      { month: 11, factor: 1.1 },
      { month: 12, factor: 1.2 },
    ],
    origins: [
      { region: "JP-43", note: "熊本産アンデスメロン。ハウス栽培で4〜6月と8〜9月の2作" },
      { region: "JP-40", note: "福岡産アムスメロン。施設栽培" },
    ],
    notes:
      "ブランドにより価格帯が大きく異なる。マスクメロン（静岡産）は1玉8000〜20000円だが産地出荷価格はkg単価で算出。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
  {
    crop: "ぶどう",
    aliases: ["葡萄", "ブドウ", "grape", "マスカット", "ピオーネ", "シャインマスカット"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 800, maxYen: 3500, typicalYen: 1800 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 0.9 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.1 },
      { month: 12, factor: 1.2 },
    ],
    origins: [
      {
        region: "JP-33",
        note: "岡山産（マスカット・ピオーネ・シャインマスカット）が最高ブランド。7〜10月",
      },
      {
        region: "JP-20",
        note: "山梨産が全国1位の生産量。甲州・ピオーネ・巨峰が主力。※JP-20は山梨",
      },
    ],
    notes:
      "シャインマスカット（種なし・皮ごと食べられる）が価格をリードしている。岡山のマスカット・オブ・アレキサンドリアは幻の高級品。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
  {
    crop: "なし",
    aliases: ["梨", "ナシ", "二十世紀梨", "幸水", "豊水", "pear"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 200, maxYen: 600, typicalYen: 380 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 1.0 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 0.9 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.1 },
      { month: 12, factor: 1.1 },
    ],
    origins: [
      { region: "JP-31", note: "鳥取産（二十世紀梨・新甘泉）が全国1位。8〜10月。※JP-31は鳥取" },
      { region: "JP-12", note: "千葉産（幸水・豊水）。首都圏向け。※JP-12は千葉" },
    ],
    notes:
      "幸水（8月）・豊水（9月）・二十世紀梨（9〜10月）で収穫時期が異なる。棚栽培のため摘果・袋掛けに多数の人手が必要。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
  {
    crop: "りんご",
    aliases: ["林檎", "リンゴ", "ふじ", "サンふじ", "apple"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 200, maxYen: 500, typicalYen: 320 },
    seasonality: [
      { month: 1, factor: 1.1 },
      { month: 2, factor: 1.1 },
      { month: 3, factor: 1.1 },
      { month: 4, factor: 1.1 },
      { month: 5, factor: 1.1 },
      { month: 6, factor: 1.0 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 0.9 },
      { month: 9, factor: 0.9 },
      { month: 10, factor: 0.9 },
      { month: 11, factor: 0.9 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      { region: "JP-02", note: "青森産が全国シェア約60%。ふじ（11月〜）が主力品種。※JP-02は青森" },
      {
        region: "JP-20",
        note: "長野産が全国2位。シナノスイート・シナノゴールドが人気。※JP-20は長野",
      },
    ],
    notes:
      "ふじ品種が全体の50%以上を占める。冷蔵保存で春まで流通するため通年で比較的安定した価格水準。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
  {
    crop: "梅",
    aliases: ["ウメ", "南高梅", "梅干し", "plum"],
    unit: "kg",
    category: "fruit",
    nationalAvg: { minYen: 300, maxYen: 1500, typicalYen: 650 },
    seasonality: [
      { month: 1, factor: 1.0 },
      { month: 2, factor: 1.0 },
      { month: 3, factor: 1.0 },
      { month: 4, factor: 1.0 },
      { month: 5, factor: 0.9 },
      { month: 6, factor: 0.8 },
      { month: 7, factor: 0.9 },
      { month: 8, factor: 1.0 },
      { month: 9, factor: 1.0 },
      { month: 10, factor: 1.0 },
      { month: 11, factor: 1.0 },
      { month: 12, factor: 1.0 },
    ],
    origins: [
      {
        region: "JP-30",
        note: "和歌山産（南高梅）が全国シェア約60%。みなべ・田辺が産地中心。6月収穫",
      },
      { region: "JP-43", note: "熊本産（肥後うめ）。九州でも一定の産地規模あり。6月収穫" },
    ],
    notes:
      "南高梅は梅干し・梅酒向け高級品。落下梅の拾い取りと木からの手摘み収穫が混在。収穫期（6月）は非常に短期集中。",
    source: "農畜産業振興機構 (ALIC) 果実情報",
  },
];

const outputSchema = z.object({
  crop: z.string(),
  unit: z.string(),
  category: z.enum(["vegetable", "fruit", "grain", "special", "timber"]),
  region: z.string().nullable(),
  month: z.number().int().min(1).max(12),
  estimatedPriceYen: z.number(),
  priceRangeYen: z.object({ min: z.number(), max: z.number() }),
  seasonalFactor: z.number(),
  regionNote: z.string().nullable(),
  marketNotes: z.string(),
  availableProducts: z.array(z.string()),
  attribution: z.string(),
  disclaimer: z.string(),
  /**
   * Full 12-month reference curve — added so the `timeseries` `viz_hint`
   * (declared since 1.10.0, see CHANGELOG "12-month price curve") has an
   * actual array to point `dataPath` at. Previously `structuredContent` only
   * ever carried the single requested/current month, so the dashboard's
   * TimeSeries view always rendered empty against real (non-fixture) data.
   * Additive field — every field above is unchanged, so existing consumers
   * that only read the flat top-level fields are unaffected.
   */
  monthlySeries: z.array(
    z.object({
      month: z.number().int().min(1).max(12),
      estimatedPriceYen: z.number(),
      seasonalFactor: z.number(),
    }),
  ),
});

function buildMonthlySeries(
  entry: PriceEntry,
): { month: number; estimatedPriceYen: number; seasonalFactor: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const factor = entry.seasonality.find((s) => s.month === month)?.factor ?? 1.0;
    return {
      month,
      estimatedPriceYen: Math.round(entry.nationalAvg.typicalYen * factor),
      seasonalFactor: factor,
    };
  });
}

function findProduct(name: string): PriceEntry | null {
  const lower = name.toLowerCase();
  for (const entry of PRICE_DB) {
    if (entry.crop === name || entry.aliases.some((a) => a.toLowerCase() === lower)) return entry;
  }
  for (const entry of PRICE_DB) {
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

export function registerGetMarketPrice(server: McpServer, _deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Agricultural & timber market price reference",
      description:
        "Returns reference wholesale price data for agricultural products and timber. " +
        "Covers vegetables, fruits, rice, specialty crops (tea, flowers), and timber (cedar/hinoki). " +
        "Prices are based on ALIC (農畜産業振興機構) and Forestry Agency statistics — " +
        "reference values only, NOT live market prices. " +
        "Supports regional origin filtering for Kyushu, Shikoku, and Tokai prefectures. " +
        "Use for Sugu-kuru dispatch demand forecasting and harvest season planning.",
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

      const { crop, region, month } = parsed.data as MarketPriceInput;
      const currentMonth = month ?? new Date().getMonth() + 1;

      const entry = findProduct(crop);
      if (!entry) {
        const available = PRICE_DB.map((e) => e.crop);
        return {
          content: [
            {
              type: "text",
              text: `「${crop}」の価格データはまだ登録されていません。\n登録済み: ${available.join("、")}`,
            },
          ],
          structuredContent: {
            crop,
            unit: "-",
            category: "vegetable",
            region: region ?? null,
            month: currentMonth,
            estimatedPriceYen: 0,
            priceRangeYen: { min: 0, max: 0 },
            seasonalFactor: 1.0,
            regionNote: null,
            marketNotes: `「${crop}」の価格データはまだ登録されていません。`,
            availableProducts: available,
            attribution: "AgriOps MCP 参照価格DB",
            disclaimer:
              "これは参考価格です。実際の取引価格とは異なります。最新情報はALIC・農林水産省の公表データを参照してください。",
            monthlySeries: [],
          } as unknown as Record<string, unknown>,
        };
      }

      const seasonFactor = entry.seasonality.find((s) => s.month === currentMonth)?.factor ?? 1.0;
      const estimatedPrice = Math.round(entry.nationalAvg.typicalYen * seasonFactor);
      const priceMin = Math.round(entry.nationalAvg.minYen * seasonFactor);
      const priceMax = Math.round(entry.nationalAvg.maxYen * seasonFactor);

      const regionOrigin = region ? entry.origins.find((o) => o.region === region) : null;

      const structured = {
        crop: entry.crop,
        unit: entry.unit,
        category: entry.category,
        region: region ?? null,
        month: currentMonth,
        estimatedPriceYen: estimatedPrice,
        priceRangeYen: { min: priceMin, max: priceMax },
        seasonalFactor: seasonFactor,
        regionNote: regionOrigin?.note ?? null,
        marketNotes: entry.notes,
        availableProducts: PRICE_DB.map((e) => e.crop),
        attribution: entry.source,
        disclaimer:
          "これは参考価格です。実際の取引価格とは異なります。最新情報はALIC・農林水産省の公表データを参照してください。",
        monthlySeries: buildMonthlySeries(entry),
      };

      const trendLabel = seasonFactor > 1.1 ? "高め" : seasonFactor < 0.9 ? "低め" : "平年並み";
      const regionLine = regionOrigin ? `\n- **${region} 産地情報**: ${regionOrigin.note}` : "";

      return {
        content: [
          {
            type: "text",
            text: [
              `## ${entry.crop} の市場参考価格（${currentMonth}月）`,
              "",
              `- **参考単価**: ${estimatedPrice.toLocaleString()} 円/${entry.unit}`,
              `- **価格帯**: ${priceMin.toLocaleString()}〜${priceMax.toLocaleString()} 円/${entry.unit}`,
              `- **季節傾向**: ${trendLabel}（季節係数 ${seasonFactor.toFixed(2)}）`,
              regionLine,
              "",
              `**市場メモ**: ${entry.notes}`,
              "",
              `※ ${structured.disclaimer}`,
              `出典: ${entry.source}`,
            ].join("\n"),
          },
        ],
        structuredContent: withVizHint(structured as unknown as Record<string, unknown>, {
          preferredView: "timeseries",
          timeKey: "month",
          valueKeys: ["estimatedPriceYen"],
          dataPath: "monthlySeries",
          title: `${structured.crop} 市場価格（月別推計）`,
          legend: { unit: "円/kg", tone: "success" },
        }),
      };
    },
  );
}
