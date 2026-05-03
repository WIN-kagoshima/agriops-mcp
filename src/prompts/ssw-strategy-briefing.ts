import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

/**
 * Sugu-kuru 戦略室 — SSW 派遣統合分析プロンプト
 *
 * このプロンプトは以下のツールの結果を統合して、スグクルの経営判断を支援する:
 *   - get_ssw_crop_compatibility  → 作物ごとのSSW適性スコア
 *   - get_labor_shortage_stats    → 都道府県別農業労働力不足統計
 *   - get_prefecture_crop_profile → 都道府県別作物プロフィール（収穫期・需要ピーク）
 *   - get_market_price            → 作物の市場価格・季節変動
 *   - crop_calendar               → 作型カレンダー（作業時期）
 *
 * 分析の3軸:
 *   1. 需要側: どの地域・作物で人手不足が深刻か（labor_shortage × crop_profile）
 *   2. 収益性: 高付加価値作物で農家の支払い余力があるか（market_price × ssw_compatibility）
 *   3. 実現性: SSWが短期間で戦力化できる作業か（ssw_compatibility × crop_calendar）
 */
export function registerSswStrategyBriefingPrompt(server: McpServer, _deps: Deps): void {
  server.registerPrompt(
    "ssw_strategy_briefing",
    {
      title: "Sugu-kuru SSW 戦略室 — 統合分析ブリーフィング",
      description:
        "Sugu-kuru の SSW (特定技能外国人) 農業派遣事業における戦略的意思決定を支援する統合分析プロンプト。 " +
        "作物適性スコア・農業労働力不足統計・市場価格・都道府県作物プロフィールを統合し、 " +
        "「どの地域・どの作物・いつ・何人」という具体的な派遣戦略を提言する。 " +
        "無料公開データ（農林業センサス2020・ALIC市場情報）を横断分析するため、 " +
        "経営判断・投資計画・営業戦略立案に直接活用できる。",
      argsSchema: {
        focus_region: z
          .string()
          .min(1)
          .describe(
            "分析対象地域（例: '九州全域', '愛媛+高知', 'JP-38,JP-30,JP-23', '東海+四国'）。 " +
              "スグクルの展開エリアに合わせて指定。",
          ),
        analysis_month: z
          .string()
          .optional()
          .describe(
            "分析基準月（1〜12。例: '5'で5月時点の分析）。省略時は現在の季節に基づく。",
          ),
        priority: z
          .enum(["urgent_shortage", "high_value", "year_round", "quick_onboarding"])
          .optional()
          .describe(
            "優先軸の選択: " +
              "'urgent_shortage'=最も人手不足が深刻な案件優先, " +
              "'high_value'=農家の支払い能力が高い高単価作物優先, " +
              "'year_round'=通年雇用可能案件優先（SSW定住化戦略）, " +
              "'quick_onboarding'=短期間で戦力化できる作物優先（新規参入）。",
          ),
        available_workers: z
          .string()
          .optional()
          .describe("配置可能なSSW人数の目安（例: '10', '20〜30'）。省略可。"),
        horizon: z
          .enum(["this_season", "next_6months", "annual", "3year"])
          .optional()
          .describe(
            "計画期間: 'this_season'=今シーズン, 'next_6months'=向こう半年, " +
              "'annual'=年間計画, '3year'=3ヵ年戦略。省略時は'annual'。",
          ),
      },
    },
    async ({ focus_region, analysis_month, priority, available_workers, horizon }) => {
      const month = analysis_month
        ? Number.parseInt(analysis_month, 10)
        : new Date().getMonth() + 1;
      const planHorizon = horizon ?? "annual";
      const priorityLabel = {
        urgent_shortage: "緊急人手不足対応（需要側優先）",
        high_value: "高付加価値作物・高収益優先",
        year_round: "通年雇用・定住化戦略",
        quick_onboarding: "短期戦力化・新規参入優先",
      };
      const priorityText = priority ? priorityLabel[priority] : "総合バランス（全軸評価）";
      const horizonLabel = {
        this_season: "今シーズン（直近1〜3ヶ月）",
        next_6months: "向こう半年",
        annual: "年間計画（12ヶ月）",
        "3year": "3ヵ年戦略",
      };

      const systemMessage = [
        "あなたはスグクル（農業SSW派遣会社）の戦略アナリストです。",
        "以下の分析依頼に対して、利用可能なMCPツールを組み合わせて包括的な戦略提言を行ってください。",
        "",
        "## 分析パラメータ",
        `- 対象地域: ${focus_region}`,
        `- 分析基準月: ${month}月`,
        `- 優先軸: ${priorityText}`,
        `- 計画期間: ${horizonLabel[planHorizon]}`,
        available_workers ? `- 配置可能SSW人数: ${available_workers}人` : "",
        "",
        "## 実行すべき分析ステップ（以下の順でツールを呼び出し、結果を統合してください）",
        "",
        "### Step 1: 作物適性スコアの全体把握",
        "まず `get_ssw_crop_compatibility` を引数なしで呼び出し、S・Aランク作物の一覧を取得する。",
        "",
        "### Step 2: 対象地域の労働力不足状況",
        `${focus_region} に含まれる都道府県ごとに \`get_labor_shortage_stats\` を呼び出し、` +
          "労働力不足の深刻度・減少率・高齢化率を確認する。",
        "",
        "### Step 3: 地域×作物の詳細プロフィール",
        `対象地域の都道府県について \`get_prefecture_crop_profile\` を呼び出し、` +
          "主要作物・収穫月・労働ピーク月・SSW派遣メモを取得する。",
        "",
        "### Step 4: 市場価格・収益性の確認",
        "Step 3 で特定した主要作物について `get_market_price` を呼び出し、" +
          `${month}月〜${Math.min(month + 5, 12)}月の価格水準・季節要因を確認する。`,
        "",
        "### Step 5: 作型カレンダーとのクロス分析",
        "最優先作物について `crop_calendar` を呼び出し、対象地域での具体的な作業時期を確認する。",
        "",
        "## 提言レポートの構成（以下の形式で最終アウトプットを作成してください）",
        "",
        "### 🎯 戦略サマリー（1枚ペーパー）",
        "- 最優先ターゲット（地域×作物×時期）TOP3",
        "- 期待収益規模の試算（概算）",
        "- 今すぐ動くべきアクション",
        "",
        "### 📊 地域別 スコアカード",
        "各都道府県について以下を一覧化:",
        "- 労働力不足度 🔴🟠🟡🟢",
        "- 主要作物とSSW適性スコア",
        "- 収穫ピーク月（営業アポイントのタイミング）",
        "- 農家の支払い余力（市場価格から推定）",
        "",
        "### 🌾 作物別 SSW マッチング分析",
        "上位5作物について:",
        "- なぜこの作物がSSW派遣に向いているか（3要素で説明）",
        "- 具体的な作業内容と習熟期間",
        "- 1シーズン雇用 vs 通年雇用の比較",
        "- リスク・注意点",
        "",
        "### 📅 月別 派遣需要カレンダー",
        "1月〜12月の各月について:",
        "- 需要ピーク地域・作物",
        "- 必要人数の目安",
        "- 前月にすべき準備",
        "",
        "### 💡 スグクル固有の競争優位性",
        "この地域・作物の組み合わせで、スグクルが他の人材派遣会社より優位に立てる理由",
        "",
        "### ⚠️ リスクと対策",
        "- 天候リスク（収穫期の変動）",
        "- 農家側リスク（廃業・縮小）",
        "- 市場価格リスク",
        "- 中長期的な機械化リスク",
        "",
        "## 重要な分析視点",
        "1. **SSW に最も向いている作物は「機械化できない × 高付加価値 × 季節集中」の組み合わせ**",
        "   例: みかん手摘み（和歌山・愛媛）、すだち収穫（徳島）、いちごパック詰め（愛知・福岡）",
        "",
        "2. **農業労働力不足と SSW 受入需要は完全に一致しない**",
        "   - 高齢農家は SSW 受入のペーパーワークを避ける傾向がある",
        "   - 農業法人・集落営農組合は受入体制が整っている",
        "   - スグクルの付加価値は「受入手続きの代行」にある",
        "",
        "3. **「お茶」の特殊性**",
        "   - 一番茶（5月）の2週間に需要が集中",
        "   - 機械摘採の補助作業が主（完全手作業ではない）",
        "   - 高値かつ農家の利益率が高い → SSW賃金を払える",
        "   - 鹿児島知覧・三重伊勢（スグクルの地元）が主産地",
        "",
        "4. **「高級みかん」と「すだち」の違い**",
        "   - みかん（愛媛・和歌山）: 3ヶ月収穫期 → 中期派遣向き",
        "   - すだち（徳島）: 6週間集中 → 超短期集中型派遣向き",
        "   - どちらも機械化不可 × 高単価 × 農家高齢化 = 最高のSSWターゲット",
        "",
        "5. **花き（愛知）の戦略的重要性**",
        "   - 唯一の「通年雇用」が可能な主要作物",
        "   - SSWの定住化・スキルアップ・長期関係構築に最適",
        "   - 法人農家が多く、安定した取引先になりやすい",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: systemMessage,
            },
          },
        ],
      };
    },
  );
}
