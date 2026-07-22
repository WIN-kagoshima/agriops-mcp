/**
 * select_dispatch_sales_targets — v1.0.0
 *
 * リアルタイム/数年の市場単価傾向と、市町村別の農業就業人口減少データを掛け合わせ、
 * 人材派遣営業先（最優先のアタック先）の選抜リストを自動生成する。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAllMunicipalities } from "../data/municipality-db.js";
import { withVizHint } from "../lib/viz-hint.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "select_dispatch_sales_targets",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 10, // 新規スピンアウト版フェーズ10
};

const REGION_CODES = [
  "JP-40",
  "JP-41",
  "JP-42",
  "JP-43",
  "JP-44",
  "JP-45",
  "JP-46",
  "JP-47", // 九州
  "JP-36",
  "JP-37",
  "JP-38",
  "JP-39", // 四国
  "JP-21",
  "JP-23",
  "JP-24", // 東海
] as const;

const inputSchema = z
  .object({
    region: z
      .enum(["九州", "四国", "東海", "近畿", "中国"])
      .optional()
      .describe("地方区分でフィルタリングします。例: '九州', '四国'"),
    prefectureCode: z
      .enum(REGION_CODES)
      .optional()
      .describe("ISO 3166-2:JP 都道府県コードでフィルタリングします。例: 'JP-46' (鹿児島)"),
    month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("分析対象月（1-12）。作物の繁忙期や市場単価傾向の算出に使用。指定なし時は現在の月"),
    priorityMetric: z
      .enum(["shortage", "market_price", "balanced"])
      .default("balanced")
      .optional()
      .describe(
        "営業アタック優先度の評価基準。" +
          "'shortage' は農業労働人口減少深刻度を重視、" +
          "'market_price' は市場単価の高い高付加価値作物の栽培規模を重視、" +
          "'balanced' はそれらを統合したバランス型（デフォルト）",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(10)
      .optional()
      .describe("出力する優先アタック先市町村の最大件数（デフォルト: 10）"),
  })
  .strict();

type SalesTargetInput = z.infer<typeof inputSchema>;

// get-market-price.ts からの価格参照情報 (PRICE_DB) の縮小・統合コピー
interface PriceRef {
  crop: string;
  aliases: string[];
  unit: string;
  typicalYen: number;
  seasonality: { month: number; factor: number }[];
}

const PRICE_DB_REF: PriceRef[] = [
  {
    crop: "さつまいも",
    aliases: ["サツマイモ", "甘藷", "かんしょ", "紅はるか", "安納芋"],
    unit: "kg",
    typicalYen: 220,
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
  },
  {
    crop: "キャベツ",
    aliases: ["きゃべつ", "cabbage"],
    unit: "kg",
    typicalYen: 90,
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
  },
  {
    crop: "みかん",
    aliases: ["かんきつ", "柑橘", "温州ミカン", "ミカン", "citrus"],
    unit: "kg",
    typicalYen: 280,
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
  },
  {
    crop: "トマト",
    aliases: ["とまと", "ミニトマト", "大玉トマト"],
    unit: "kg",
    typicalYen: 300,
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
  },
  {
    crop: "いちご",
    aliases: ["イチゴ", "strawberry", "あまおう", "紅ほっぺ"],
    unit: "kg",
    typicalYen: 1500,
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
  },
  {
    crop: "たまねぎ",
    aliases: ["タマネギ", "玉ねぎ", "onion"],
    unit: "kg",
    typicalYen: 80,
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
  },
  {
    crop: "稲",
    aliases: ["米", "水稲", "コメ", "rice"],
    unit: "60kg玄米",
    typicalYen: 26000,
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
  },
  {
    crop: "茶",
    aliases: ["お茶", "緑茶", "煎茶", "荒茶"],
    unit: "kg",
    typicalYen: 2800,
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
  },
  {
    crop: "花き",
    aliases: ["花卉", "切り花", "菊", "キク", "ユリ", "バラ"],
    unit: "本",
    typicalYen: 70,
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
  },
  {
    crop: "すいか",
    aliases: ["スイカ", "西瓜", "watermelon"],
    unit: "kg",
    typicalYen: 280,
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
  },
  {
    crop: "メロン",
    aliases: ["めろん", "アンデスメロン", "マスクメロン"],
    unit: "kg",
    typicalYen: 700,
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
  },
  {
    crop: "ぶどう",
    aliases: ["葡萄", "ブドウ", "grape", "シャインマスカット"],
    unit: "kg",
    typicalYen: 1800,
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
  },
  {
    crop: "なし",
    aliases: ["梨", "ナシ", "二十世紀梨", "幸水"],
    unit: "kg",
    typicalYen: 380,
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
  },
  {
    crop: "りんご",
    aliases: ["林檎", "リンゴ", "ふじ", "apple"],
    unit: "kg",
    typicalYen: 320,
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
  },
  {
    crop: "梅",
    aliases: ["ウメ", "南高梅"],
    unit: "kg",
    typicalYen: 650,
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
  },
];

function findRefProduct(cropName: string): PriceRef | null {
  const lower = cropName.toLowerCase();
  for (const entry of PRICE_DB_REF) {
    if (entry.crop === cropName || entry.aliases.some((a) => a.toLowerCase() === lower)) {
      return entry;
    }
  }
  for (const entry of PRICE_DB_REF) {
    if (
      entry.crop.includes(cropName) ||
      cropName.includes(entry.crop) ||
      entry.aliases.some((a) => a.includes(cropName) || cropName.includes(a))
    ) {
      return entry;
    }
  }
  return null;
}

export function registerSelectDispatchSalesTargets(server: McpServer, _deps: any): void {
  server.registerTool(
    meta.name,
    {
      title: "派遣営業アタック先（最優先営業候補地）の自動選抜ツール",
      description:
        "農業就業人口が5年で急減している市町村（人手不足リスクが高い）と、" +
        "指定月に市場参考価格が高騰している、または繁忙期を迎えている作物をマッチングし、" +
        "派遣営業先の最優先ターゲット（市町村・作物・アプローチのヒント）を選抜・推奨するビジネス創出ツール。",
      inputSchema: inputSchema.shape,
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

      const { region, prefectureCode, month, priorityMetric, limit } =
        parsed.data as SalesTargetInput;
      const targetMonth = month ?? new Date().getMonth() + 1;
      const metric = priorityMetric ?? "balanced";
      const countLimit = limit ?? 10;

      // すべての市町村を取得
      const municipalities = getAllMunicipalities();

      // フィルタリング処理
      let filtered = municipalities;
      if (region) {
        filtered = filtered.filter((m) => m.region === region);
      }
      if (prefectureCode) {
        filtered = filtered.filter((m) => m.prefectureCode === prefectureCode);
      }

      if (filtered.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `指定された条件に合致する市町村データが見つかりません。（region: ${region ?? "指定なし"}, pref: ${prefectureCode ?? "指定なし"}）`,
            },
          ],
        };
      }

      // 各市町村の営業アプローチ指標を計算
      const targets = filtered.map((m) => {
        // 1. 労働力減少度スコア (5年間の農業就業人口減少率ベース)
        const decrease = m.agriWorkers2015 - m.agriWorkers2020;
        const decreaseRate = m.agriWorkers2015 > 0 ? decrease / m.agriWorkers2015 : 0;

        // 減少率が30%以上を100点とし、0%以下を0点として正規化
        const laborShortageScore = Math.round(
          Math.min(100, Math.max(0, ((decreaseRate * 100) / 30) * 100)),
        );

        // 2. 市場価格プレミアムスコア
        // 主要作物 (mainCrops) の中から指定月の価格・繁忙期スコアを計算
        let maxCropScore = 50; // デフォルト中間値（データ登録がない場合）
        let targetCrop = m.topSswCrop || "野菜";
        let targetCropPrice = 0;
        let targetCropFactor = 1.0;

        for (const crop of m.mainCrops) {
          const priceRef = findRefProduct(crop);
          if (priceRef) {
            const factor = priceRef.seasonality.find((s) => s.month === targetMonth)?.factor ?? 1.0;
            const estimatedPrice = Math.round(priceRef.typicalYen * factor);

            // 作物単価と繁忙期(factor)を掛け合わせたスコア設計
            // 2000円/kg以上で100点となる基準。
            const priceScore = Math.min(100, (estimatedPrice / 2000) * 100);
            const score = Math.round(priceScore * 0.5 + factor * 50); // 単価寄与と季節要因(繁忙期)のバランス

            if (score > maxCropScore) {
              maxCropScore = score;
              targetCrop = priceRef.crop;
              targetCropPrice = estimatedPrice;
              targetCropFactor = factor;
            }
          }
        }

        const marketPriceScore = maxCropScore;

        // 3. SSW適性スコア (0-100)
        const sswFitScore = m.topSswScore;

        // 4. 統合アプローチスコア (priorityScore) 計算
        let priorityScore = 0;
        if (metric === "shortage") {
          priorityScore = Math.round(
            laborShortageScore * 0.6 + marketPriceScore * 0.2 + sswFitScore * 0.2,
          );
        } else if (metric === "market_price") {
          priorityScore = Math.round(
            laborShortageScore * 0.2 + marketPriceScore * 0.6 + sswFitScore * 0.2,
          );
        } else {
          // balanced
          priorityScore = Math.round(
            laborShortageScore * 0.4 + marketPriceScore * 0.3 + sswFitScore * 0.3,
          );
        }

        // 5. 具体的な派遣営業向けセールストークアドバイス自動構築
        const decreasePercent = (decreaseRate * 100).toFixed(1);
        let whySelected = "";
        let salesScript = "";

        if (priorityScore >= 80) {
          whySelected = `就業人口減少が5年で ${decreasePercent}% と極めて深刻で、即戦力人材が今すぐ必要です。`;
        } else {
          whySelected = `就業人口が5年で ${decreasePercent}% 減少しており、慢性的な労働力難に直面しています。`;
        }

        if (targetCropPrice > 0) {
          whySelected += ` 加えて、主要作物の「${targetCrop}」は${targetMonth}月の市場参考価格が約 ${targetCropPrice.toLocaleString()} 円と高水準（季節係数 ${targetCropFactor.toFixed(2)}）であり、収益が最大化する繁忙期のため、労働力確保への投資意欲が極めて強い状態です。`;
          salesScript = `「${targetMonth}月は『${targetCrop}』の出荷繁忙期かつ市場高値が期待できる最重要時期ですが、地域の農業就業人口は5年で ${decreasePercent}% 急減しています。機会損失を防ぐため、即戦力となる特定技能 (SSW) 派遣をご提案いたします。」`;
        } else {
          whySelected += ` 特に、適性度が極めて高い「${m.topSswCrop}」をフックにしたアプローチが極めて有効です。`;
          salesScript = `「現在、この地域では ${m.topSswCrop} の担い手難が深刻化しており、就業人口は5年で ${decreasePercent}% 減少しています。スグクルでは最適なSSW人材をチームで手配可能ですが、繁忙期を前にご用意いかがでしょうか？」`;
        }

        return {
          cityName: m.cityName,
          prefectureName: m.prefectureName,
          prefectureCode: m.prefectureCode,
          region: m.region,
          agriWorkers2020: m.agriWorkers2020,
          agriWorkers2015: m.agriWorkers2015,
          laborDecreaseRatePercent: decreasePercent,
          mainCrops: m.mainCrops,
          topSswCrop: m.topSswCrop,
          topSswScore: m.topSswScore,
          sswMemo: m.sswMemo,
          targetCrop,
          targetCropPrice:
            targetCropPrice > 0 ? `${targetCropPrice.toLocaleString()} 円` : "参考データなし",
          targetCropFactor,
          scores: {
            laborShortage: laborShortageScore,
            marketPrice: marketPriceScore,
            sswFit: sswFitScore,
            priorityScore,
          },
          whySelected,
          salesScript,
          lat: m.lat,
          lng: m.lng,
        };
      });

      // 優先スコア降順でソート
      const sortedTargets = targets
        .sort((a, b) => b.scores.priorityScore - a.scores.priorityScore)
        .slice(0, countLimit);

      const rows = sortedTargets.map(
        (t, idx) =>
          `| ${idx + 1} | **${t.prefectureName} ${t.cityName}** | ${t.scores.priorityScore}点 | ${t.targetCrop} (${t.targetCropPrice}) | ${t.laborDecreaseRatePercent}% | ${t.scores.sswFit}点 |`,
      );

      const detailedOutputs = sortedTargets
        .map((t, idx) => {
          return [
            `### 順位 ${idx + 1}: ${t.prefectureName} ${t.cityName} （優先スコア: ${t.scores.priorityScore}/100）`,
            `- **地方/都道府県**: ${t.region} / ${t.prefectureCode}`,
            `- **主要作物**: ${t.mainCrops.join("、")}`,
            `- **派遣アタック対象作物**: ${t.targetCrop} （${targetMonth}月参考価格: ${t.targetCropPrice}）`,
            `- **労働力減少率**: 5年間で **-${t.laborDecreaseRatePercent}%** (${t.agriWorkers2015.toLocaleString()}人 → ${t.agriWorkers2020.toLocaleString()}人)`,
            `- **SSW適性**: ${t.topSswCrop} (${t.scores.sswFit}点)`,
            `- **選抜理由**: ${t.whySelected}`,
            "- **スグクル営業アプローチトーク例**:",
            `  > *${t.salesScript}*`,
            `- **現場メモ**: ${t.sswMemo}`,
            "",
          ].join("\n");
        })
        .join("\n");

      const structured = {
        month: targetMonth,
        metric,
        targets: sortedTargets.map((t) => ({
          cityName: t.cityName,
          prefectureName: t.prefectureName,
          prefectureCode: t.prefectureCode,
          priorityScore: t.scores.priorityScore,
          laborDecreaseRatePercent: t.laborDecreaseRatePercent,
          targetCrop: t.targetCrop,
          targetCropPrice: t.targetCropPrice,
          topSswCrop: t.topSswCrop,
          topSswScore: t.scores.sswFit,
          lat: t.lat,
          lng: t.lng,
        })),
        count: sortedTargets.length,
      };

      const regionText = region
        ? `【${region}地方】`
        : prefectureCode
          ? `【${prefectureCode}】`
          : "【全国カバー圏内】";

      return {
        content: [
          {
            type: "text",
            text: [
              `## 🎯 スグクル特定技能派遣 営業アタック優先ターゲット選抜リスト （${targetMonth}月度）`,
              `**抽出地域**: ${regionText} | **優先評価重視指標**: ${metric === "shortage" ? "労働力減少深刻度" : metric === "market_price" ? "市場取引単価" : "バランス型"}`,
              "",
              "| 順位 | ターゲット市町村 | 営業優先度 | 最優先作物 (価格) | 5年労働減少率 | SSW適性スコア |",
              "|---|---|---|---|---|---|",
              ...rows,
              "",
              "---",
              "## 🔎 各選抜ターゲットの営業詳細プロファイル",
              "",
              detailedOutputs,
              "---",
              "※本リストは農畜産業振興機構 (ALIC) の市場参考価格トレンドと、農林業センサスの市町村別農業統計、およびスグクルSSW適性スコアを統合して自動算出された営業支援用のAIスコアです。",
            ].join("\n"),
          },
        ],
        structuredContent: withVizHint(structured as unknown as Record<string, unknown>, {
          preferredView: "bar_compare",
          labelKey: "cityName",
          valueKeys: ["priorityScore", "topSswScore"],
          dataPath: "targets",
          title: `スグクル派遣営業アタック優先スコア（${targetMonth}月度）`,
          legend: { unit: "スコア", tone: "success" },
        }),
      };
    },
  );
}
