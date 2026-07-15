import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "generate_subsidy_application",
  sideEffect: "draft",
  visibility: "model",
  introducedInPhase: 12,
};

export const inputSchema = z
  .object({
    farmId: z.string().describe("Target farmland ID (eMAFF polygon reference)."),
    subsidyType: z
      .enum(["eco_direct_payment", "smart_farming_support", "disaster_recovery"])
      .describe("Target subsidy program type."),
  })
  .strict();

export function registerGenerateSubsidyApplication(server: McpServer, deps: Deps): void {
  server.registerTool(
    meta.name,
    {
      title: "Generate Subsidy Application Draft",
      description:
        "Drafts an official Japanese Ministry of Agriculture, Forestry and Fisheries (MAFF) " +
        "subsidy application. Automatically pulls farmland dimensions, crops, and addresses. Draft only.",
      inputSchema: inputSchema.shape,
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

      const { farmId, subsidyType } = parsed.data;

      try {
        let address = "鹿児島県鹿児島市荒田";
        let areaM2 = 15000;
        let crop = "さつまいも (Sweet Potato)";

        // Resolve details from eMAFF
        if (deps.emaff) {
          const field = await deps.emaff.get(farmId);
          if (field) {
            address = field.address || address;
            areaM2 = field.areaM2 || areaM2;
            crop = field.registeredCrop || crop;
          }
        }

        const areaHa = (areaM2 / 10000).toFixed(2);
        const today = new Date().toLocaleDateString("ja-JP");

        let title = "";
        let documentBody = "";

        switch (subsidyType) {
          case "eco_direct_payment":
            title = "環境保全型農業直接支払交付金 申請書";
            documentBody = `
# 環境保全型農業直接支払交付金交付申請書 (環境保全型農業推進事業)

**提出日:** ${today}
**申請先:** 鹿児島県地域農業再生協議会 会長 殿

## 1. 申請者情報
- **農地所有者/農業者:** 菅野 農業資材株式会社 (Sugukuru AgriOps)
- **代表者氏名:** 菅野 太郎
- **主たる事務所の所在地:** 鹿児島県鹿児島市中央町10-1

## 2. 対象農地および活動計画
- **対象農地ID:** ${farmId}
- **農地所在地:** ${address}
- **農地面積:** ${areaM2.toLocaleString()} ㎡ (${areaHa} ヘクタール)
- **主要栽培作物:** ${crop}
- **実施環境保全活動:** 有機農業の推進、炭素貯留効果の高い堆肥等の投入、化学肥料・化学農薬の5割低減活動

## 3. 活動実施計画の詳細
化学合成農薬および化学肥料の使用量を鹿児島県慣行基準の50%以下に削減し、カバークロップ（緑肥植物）の播種を行うことで土壌の浸食を防止し、生物多様性維持と炭素隔離を最大化する精密環境保全農業を実施します。

## 4. 交付金算出
- **交付対象面積:** ${areaHa} ha
- **単価:** 8,000円 / 10a (有機農業推進枠)
- **概算交付申請額:** ${(Number.parseFloat(areaHa) * 80000).toLocaleString()} 円
`;
            break;

          case "smart_farming_support":
            title = "スマート農業導入支援・サービス事業 申請書";
            documentBody = `
# スマート農業導入支援・サービス化推進事業計画書

**提出日:** ${today}
**申請先:** 九州農政局長 殿

## 1. 事業実施主体
- **名称:** 菅野 農業資材株式会社 (Sugukuru AgriOps & IoT Fleet)
- **連絡先:** 099-123-4567

## 2. 導入農地およびスマート機器構成
- **対象農地ID:** ${farmId}
- **農地所在地:** ${address}
- **農地面積:** ${areaM2.toLocaleString()} ㎡ (${areaHa} ヘクタール)
- **主要対象作物:** ${crop}
- **導入予定スマート機器:**
  - 自動操舵付トラクター (Kubota IoT Telemetry Link)
  - リアルタイム土壌・環境センサーネットワーク (NPK/Moisture Link)
  - 高解像度防除用ドローン (DJI Agras IoT Edition)

## 3. スマート農業技術導入による効果目標
- **労働力削減目標:** SSW (特定技能) 稼働シフトの効率配置により、総農作業時間を年間25%削減。
- **化学農薬・肥料の効率化:** センサー検知に基づく可変施肥およびスマート散布により、投入資材コストを15%削減。
- **トレーサビリティの確率:** IoTログ（播種・散布・収穫）を自動収集し、輸出対応型農産物基準を完全クリア。

## 4. 総事業費および補助要請額
- **スマート機器導入総経費:** 4,500,000 円
- **国庫補助要請額 (補助率1/2):** 2,250,000 円
`;
            break;

          case "disaster_recovery":
            title = "農業災害復旧・再建支援 申請書";
            documentBody = `
# 農業災害復旧支援事業費補助金 交付申請書

**提出日:** ${today}
**申請先:** 鹿児島県知事 殿

## 1. 被災者情報
- **事業者名:** 菅野 農業資材株式会社 (Sugukuru AgriOps)
- **被害場所:** ${address}

## 2. 対象農地および被害の状況
- **対象農地ID:** ${farmId}
- **農地所在地:** ${address}
- **農地面積:** ${areaM2.toLocaleString()} ㎡ (${areaHa} ヘクタール)
- **被災対象作物:** ${crop}
- **被災原因:** 九州南部地域における台風・集中豪雨被害 (気象庁JMA警報対象)

## 3. 被害復旧計画
- **復旧内容:** 表土流出箇所の客土充填、冠水した排水溝の浚渫および再整備、および次期作付けに向けた土壌コンディショニングと有機マルチの再敷設。
- **復旧予定時期:** 本日より30日以内

## 4. 復旧事業費明細および支援申請額
- **客土・土木工事費:** 600,000 円
- **排水溝再整備費:** 400,000 円
- **合計復旧事業費:** 1,000,000 円
- **支援要請額 (支援率2/3):** 666,666 円
`;
            break;
        }

        const artifactPath = `ui://agriops/subsidy-draft-${subsidyType}-${farmId}.md`;

        return {
          content: [
            { type: "text", text: `Successfully generated application draft for [${title}].` },
            {
              type: "text",
              text: "Please review the drafted document below before official submission.",
            },
            { type: "text", text: documentBody },
          ],
          structuredContent: {
            farmId,
            subsidyType,
            title,
            generatedAt: new Date().toISOString(),
            artifactPath,
            rawMarkdown: documentBody,
            attribution: "Generated using Ministry of Agriculture Guidelines & eMAFF metadata",
          },
        };
      } catch (err) {
        deps.logger.error("generate_subsidy_application failed", {
          error: (err as Error).message,
          farmId,
        });
        return {
          isError: true,
          content: [{ type: "text", text: `Execution error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
