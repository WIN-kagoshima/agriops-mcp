# AgriOps MCP（日本語）

<p align="center">
  <img src="./assets/logo.png" alt="AgriOps MCP" width="220" />
</p>

> 公式 MCP Spec 2025-11-25 / MCP Apps Extension 2026-01-26 / MCP TypeScript SDK v1.x に準拠した **参照実装** MCP サーバ。
> Apache-2.0 · TypeScript ESM · Node.js 22+ · stdio + Streamable HTTP。
>
> English: [README.md](./README.md)

AgriOps MCP は、日本の農業データ（eMAFF 筆ポリゴン、Open-Meteo / 気象庁の 1km メッシュ気象、FAMIC 農薬登録情報）を MCP 経由で AI エージェントに公開します。農業に特定技能外国人を派遣する派遣会社や、農業改良普及員のデジタルツール活用を想定しています。

## ステータス

**`1.0.0` から安定版**。ツール名・プロンプト名・リソース URI・入出力スキーマは SemVer のもと凍結されています。破壊的変更は `2.0.0` 以降。詳細は [CHANGELOG.md](./CHANGELOG.md)。

| Phase | バージョン | 主な機能 |
|---|---|---|
| 0 | `0.1.0` | stdio transport · `get_weather_1km` |
| 1 | `0.1.x` | + Streamable HTTP · Server Card · `search_farmland` ほか 4 ツール |
| 2 | `0.2.x` | + ユーザー発火型 prompt 5 本（slash コマンド） |
| 3 | `0.3.x` | + Elicitation Form mode |
| 4 | `0.4.x` | + Elicitation URL mode + OAuth Client Credentials |
| 5 | `0.5.x` | + MCP Apps UI ダッシュボード（地図 + 気象オーバレイ） |
| 6–9 | `1.x` | + 作期カレンダー・市場価格・SSW適性スコア・農業労働力統計・畜産統計 |
| 10 | `1.10.0` | + **戦略室 UI 2.0**: 市町村ドリルダウン · 8 種アダプティブビジュアライゼーション · viz_hint プロトコル · TopoJSON リソース |

## クイックスタート（stdio）

Node.js 22+ と npm（pnpm/yarn でも可）が必要です。

```bash
git clone https://github.com/WIN-kagoshima/agriops-mcp.git
cd agriops-mcp
npm install
npm run build
npm run dev
```

### Claude Desktop の設定例

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/agriops-mcp/dist/server.js", "--stdio"]
    }
  }
}
```

## クイックスタート（Streamable HTTP, Phase 1+）

```bash
npm run build
npm run start:http        # $PORT (default 3001) で待ち受け
```

公開エンドポイント：

- `POST /mcp` — JSON-RPC over Streamable HTTP
- `GET /mcp` — server-initiated SSE 通知
- `DELETE /mcp` — セッション終了
- `GET /.well-known/mcp-server.json` — Server Card（registries 用）
- `GET /livez` — ヘルスチェック
- `GET /readyz` — 準備完了チェック
- `GET /metrics` — Prometheus 形式メトリクス

### デプロイ済み参照エンドポイント

初回の本番 Cloud Run デプロイは以下で稼働しています。

```text
https://agriops-mcp-n5vdix22hq-an.a.run.app
```

デフォルトでは IAM 保護されています。運用者は次で確認できます。

```bash
TOKEN="$(gcloud auth print-identity-token)"
npm run deploy:smoke -- \
  --base-url=https://agriops-mcp-n5vdix22hq-an.a.run.app \
  --health-path=/livez \
  --expected-version="$(node -p "require('./package.json').version")" \
  --auth-bearer="$TOKEN"
```

この smoke test は `/livez`, `/readyz`, Server Card, MCP `initialize`,
`tools/list`, `prompts/list`, `resources/list` を確認します。

## 提供ツール（モデル可視 16 本）

| 名前 | Phase | 副作用 | 概要 |
|---|---|---|---|
| `get_weather_1km` | 0 | 読み取り | 緯度経度の時間別予報（最大 7 日）。ET₀・土壌水分・地温を含む農業指標付き |
| `search_farmland` | 1 | 読み取り | eMAFF 筆ポリゴンを住所・都道府県・作物で検索 |
| `area_summary` | 1 | 読み取り | エリア（行政コード or polygon）の農地統計 |
| `nearby_farms` | 1 | 読み取り | 半径内の近隣農地 |
| `get_pesticide_rules` | 1 | 読み取り | FAMIC の農薬登録情報を作物・病害虫から検索 |
| `create_staff_deploy_plan` | 3 | ドラフト | 派遣計画の草案。情報不足時に Form elicitation で質問 |
| `create_task` | 4 | 変更 | バックグラウンドタスクを作成（task_id を即時返却） |
| `get_task_status` | 4 | 読み取り | バックグラウンドタスクの状態をポーリング |
| `snapshot_status` | 5 | 読み取り | eMAFF・FAMIC SQLite スナップショットの鮮度・整合性確認 |
| `open_dashboard` | 5 | 読み取り（UI） | MCP Apps UI ダッシュボードを開く。非対応ホストではテキスト fallback |
| `crop_calendar` | 6 | 読み取り | 作物×気候地域の月別作業カレンダー（13 作物・9 地域） |
| `field_weather_report` | 6 | 読み取り | eMAFF 圃場 ID から気象レポート＋JMA 警報を統合取得 |
| `spray_window` | 6 | 読み取り | 農薬散布適期（風速・降水・湿度分析）を時間別に算出 |
| `multi_field_compare` | 6 | 読み取り | 最大 10 圃場の気象・リスクを一覧比較 |
| `seasonal_risk_forecast` | 6 | 読み取り | 7 日間農業リスク予報（日別内訳＋週次サマリ） |

## Prompt（Phase 2+）

ユーザーが slash コマンドで発火するテンプレート。LLM は自走で発火しません。

| Slash | 必須引数 | 追加バージョン |
|---|---|---|
| `/field_summary` | `field_id` | 1.0.0 |
| `/pesticide_advice` | `crop`, `pest_or_disease` | 1.0.0 |
| `/staff_deploy_plan` | `farm_ids[]`, `period` | 1.0.0 |
| `/area_briefing` | `prefecture` | 1.1.0 |
| `/weather_risk_alert` | `farm_ids[]` | 1.1.0 |
| `/irrigation_schedule` | `lat`, `lng` | 1.3.0 |
| `/data_freshness_check` | —（任意: `stale_after_days`） | 1.3.0 |
| `/harvest_readiness` | `crop`, `lat`, `lng`, `last_spray_date` | 1.4.0 |
| `/daily_briefing` | `lat`, `lng` | 1.5.0 |
| `/field_visit_checklist` | `field_id` | 1.5.0 |

## データソースとライセンス

詳細は [docs/data-license.md](docs/data-license.md) を参照。

| データソース | ライセンス | 備考 |
|---|---|---|
| eMAFF 筆ポリゴン | オープンデータ | SQLite snapshot をローカルでビルド |
| Open-Meteo | CC-BY 4.0 | API 直叩き。出典をツール出力に明記 |
| FAMIC 農薬登録 | オープンデータ | SQLite snapshot をローカルでビルド |
| 気象庁防災 XML | 気象業務法に基づく利用 | Phase 1+ で短期キャッシュのみ |
| WAGRI | 会員規約 | **本 OSS リリースでは対象外**（Phase 7+ の別パッケージ） |

## テストカバレッジ

```
テストファイル: 41   テストケース: 208
```

`npm test` で全テストを実行できます（外部ネットワーク不要）。

## エンタープライズ運用

- Cloud Run 本番デプロイ手順は [docs/runbook.md](docs/runbook.md)。
- Google Cloud Agent Platform / Smart Storage への対応方針は [docs/cloud-next26-agent-readiness.md](docs/cloud-next26-agent-readiness.md)。
- Agent Gateway / Apigee / Cloud Armor などのリバースプロキシ導入時の前提とポリシーは [docs/agent-gateway-deployment.md](docs/agent-gateway-deployment.md)。

## ライセンス

Apache-2.0. © 2026 WIN Kagoshima
