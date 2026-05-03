import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";

/**
 * Persona target:
 *   - 山本 あゆみ（JA 営農指導員）: 訪問先の圃場 ID だけで全データを一括取得
 */
export function registerFieldVisitChecklistPrompt(server: McpServer, deps: Deps): void {
  server.registerPrompt(
    "field_visit_checklist",
    {
      title: "Field visit preparation checklist",
      description:
        "Generates a comprehensive pre-visit checklist for agricultural extension officers. " +
        "Given a field ID, combines farmland info, weather forecast, JMA warnings, " +
        "pesticide candidates, and risk flags into a single printable briefing sheet. " +
        "Saves 30+ minutes of manual data gathering per farm visit.",
      argsSchema: {
        field_id: z
          .string()
          .min(1)
          .max(64)
          .describe("eMAFF Fude polygon ID of the field to visit (e.g. K46-0001-0001)."),
        visit_purpose: z
          .string()
          .optional()
          .describe(
            "Purpose of the visit (e.g. '防除指導', '収穫前確認', '定期巡回'). Tailors advice.",
          ),
        farmer_crops: z
          .string()
          .optional()
          .describe(
            "Comma-separated crops the farmer grows (e.g. 'さつまいも,茶'). For pesticide lookup.",
          ),
      },
    },
    async ({ field_id, visit_purpose, farmer_crops }) => {
      const adapter = deps.emaff;
      if (!adapter) {
        return {
          description: "Field visit checklist (eMAFF unavailable).",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "eMAFF アダプタが未設定です。圃場情報を取得できません。",
              },
            },
          ],
        };
      }

      const field = await adapter.get(field_id).catch(() => null);
      if (!field) {
        return {
          description: `Field ${field_id} not found.`,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `圃場 ${field_id} がスナップショット内に見つかりません。ID を確認してください。`,
              },
            },
          ],
        };
      }

      // Weather.
      let weatherSection = "";
      try {
        const fc = await deps.weather.getForecast({
          lat: field.centroid.lat,
          lng: field.centroid.lng,
          hours: 72,
          timezone: "Asia/Tokyo",
        });
        const totalPrecip = fc.hourly.reduce((a, h) => a + (h.precipitationMm ?? 0), 0);
        const peakWind = Math.max(0, ...fc.hourly.map((h) => h.windSpeedMs ?? 0));
        const totalEt0 = fc.hourly.reduce((a, h) => a + (h.et0EvapotranspirationMm ?? 0), 0);
        const smValues = fc.hourly.map((h) => h.soilMoisture).filter((v): v is number => v != null);
        const minSm = smValues.length > 0 ? Math.min(...smValues) : null;

        weatherSection = [
          "## 72 時間天気予報",
          `- 降水量合計: ${totalPrecip.toFixed(1)} mm`,
          `- 最大風速: ${peakWind.toFixed(1)} m/s`,
          `- ET₀合計: ${totalEt0.toFixed(1)} mm`,
          ...(minSm !== null ? [`- 最低土壌水分: ${minSm.toFixed(3)} m³/m³`] : []),
          `出典: ${fc.attribution}`,
        ].join("\n");
      } catch {
        weatherSection = "## 天気予報: (取得失敗)";
      }

      // JMA warnings.
      let warningSection = "";
      if (deps.jma) {
        try {
          const result = await deps.jma.getActiveWarnings({
            prefectureCode: field.prefectureCode,
          });
          const active = result.warnings.filter((w) => w.severity !== "info");
          warningSection =
            active.length > 0
              ? [
                  "## JMA 警報・注意報",
                  ...active.map((w) => `- [${w.severity}] ${w.kind} — ${w.areaName}`),
                ].join("\n")
              : "## JMA 警報: なし";
        } catch {
          warningSection = "## JMA: (取得失敗)";
        }
      }

      // Pesticide candidates.
      let pesticideSection = "";
      const cropList = farmer_crops
        ? farmer_crops
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : field.registeredCrop
          ? [field.registeredCrop]
          : [];

      if (deps.famic && cropList.length > 0) {
        const allLines: string[] = [];
        for (const crop of cropList.slice(0, 3)) {
          try {
            const result = await deps.famic.search({ crop, limit: 3 });
            if (result.rules.length > 0) {
              allLines.push(`### ${crop}`);
              for (const r of result.rules) {
                allLines.push(
                  `- ${r.productName}（収穫前 ${r.preHarvestIntervalDays ?? "?"}日 / 最大 ${r.maxApplicationsPerSeason ?? "?"}回）`,
                );
              }
            }
          } catch {
            // non-fatal
          }
        }
        pesticideSection =
          allLines.length > 0
            ? ["## 主な登録農薬候補", ...allLines].join("\n")
            : "## 農薬候補: (該当なし)";
      }

      // Nearby farms.
      let nearbySection = "";
      try {
        const nearby = await adapter.nearby(field.centroid, 1_000, 5);
        if (nearby.fields.length > 1) {
          nearbySection = [
            "## 近隣圃場 (1km 以内)",
            ...nearby.fields
              .filter((f) => f.fieldId !== field.fieldId)
              .slice(0, 4)
              .map(
                (f) =>
                  `- ${f.fieldId}: ${f.registeredCrop ?? "未登録"} / ${(f.areaM2 / 10_000).toFixed(2)} ha`,
              ),
          ].join("\n");
        }
      } catch {
        // non-fatal
      }

      const purposeLine = visit_purpose
        ? `訪問目的: **${visit_purpose}**`
        : "訪問目的: 未指定（一般巡回）";

      return {
        description: `Field visit checklist for ${field_id}.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "あなたは JA 営農指導員の訪問準備をサポートする AI です。以下のデータから、印刷して持っていける**訪問チェックリスト**を作成してください。",
                "",
                "## 圃場基本情報",
                `- 筆ポリゴン ID: ${field.fieldId}`,
                `- 所在地: ${field.address || "(不明)"}`,
                `- 面積: ${(field.areaM2 / 10_000).toFixed(2)} ha`,
                `- 登録作物: ${field.registeredCrop ?? "未登録"}`,
                `- 座標: ${field.centroid.lat}, ${field.centroid.lng}`,
                purposeLine,
                "",
                weatherSection,
                "",
                warningSection,
                "",
                pesticideSection,
                "",
                nearbySection,
                "",
                "## 回答フォーマット（A4 1 枚に収まる量）",
                "",
                "### 1. 訪問前チェック",
                "- [ ] 持参物リスト（訪問目的に応じて）",
                "- [ ] 当日の天候リスク確認結果",
                "",
                "### 2. 現場での確認ポイント（5 項目以内）",
                "- 作物の生育ステージに応じた具体的な観察項目",
                "",
                "### 3. 農家への助言ドラフト（3 項目以内）",
                "- 天候データに基づく灌水・防除の具体的アドバイス",
                "- 次回訪問までに農家にやっておいてほしいこと",
                "",
                "### 4. 次回訪問の推奨時期と理由",
                "",
                "回答は日本語で、実務的で具体的な内容にしてください。",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
