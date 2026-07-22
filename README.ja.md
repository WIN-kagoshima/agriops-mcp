# AgriOps MCP（日本語）

<p align="center">
  <img src="./assets/logo.png" alt="AgriOps MCP" width="220" />
</p>

> 公式 MCP Spec 2025-11-25 / MCP Apps Extension 2026-01-26 / MCP TypeScript SDK v1.x に準拠した **参照実装** MCP サーバ。
> Apache-2.0 · TypeScript ESM · Node.js 22+ · stdio + Streamable HTTP。
>
> English: [README.md](./README.md)  
> npm パッケージ: [`@sugukuru/agriops-mcp`](https://www.npmjs.com/package/@sugukuru/agriops-mcp)（公開後・[メンテナ手順](docs/npm-first-publish.md)）

AgriOps MCP は、日本の農業データ（eMAFF 筆ポリゴン、Open-Meteo / 気象庁の 1km メッシュ気象、FAMIC 農薬登録情報）を MCP 経由で AI エージェントに公開します。農業に特定技能外国人を派遣する派遣会社や、農業改良普及員のデジタルツール活用を想定しています。

## デモ

<!-- TODO(maintainer): Claude Desktop での実画面収録（30秒以内）に置き換える。「鹿児島の農地を検索」→天気確認→農薬確認→ダッシュボード表示、の流れ。 -->

収録予定の30秒デモの流れ: 「鹿児島の農地を検索して」→ その週の天気を確認 → 登録作物に使える農薬を確認 → 戦略ダッシュボード（`ui://agriops/dashboard.html`）を開いて可視化。今すぐ試すには:

```bash
npx -y @sugukuru/agriops-mcp --stdio
```

技術解説記事: [7プリミティブの設計記録（Zenn）](docs/articles/zenn-mcp-7-primitives.ja.md) · [特定技能派遣の現場向け（note）](docs/articles/note-ssw-placement.ja.md)。

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

**Node.js 22 LTS** と npm（pnpm/yarn でも可）が必要です。リポジトリの `.nvmrc` に Node 22 が指定されています。

> **Windows / OneDrive ユーザーへ:** `better-sqlite3` は Node 22 LTS 向けにプリビルドバイナリを提供しており、C++ ツールチェーン不要です。Node 22 を使い、`npm ci` 実行前に OneDrive 同期を一時停止するか、OneDrive 外にクローンしてください（EPERM 防止）。詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。

```bash
git clone https://github.com/WIN-kagoshima/agriops-mcp.git
cd agriops-mcp
npm ci
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

## 提供ツール

**デフォルト面 — コア 8 本。** 環境変数なしで新規接続・MCP Inspector・Anthropic Connectors Directory のレビュワーが見る面はこれだけです。

| 名前 | Phase | 副作用 | 概要 |
|---|---|---|---|
| `get_weather_1km` | 0 | 読み取り | 緯度経度の時間別予報（最大 7 日）。ET₀・土壌水分・地温を含む農業指標付き |
| `get_weather_warning` | 1 | 読み取り | 気象庁の警報・注意報を都道府県別に取得（10 分キャッシュ） |
| `search_farmland` | 1 | 読み取り | eMAFF 筆ポリゴンを住所・都道府県・作物で検索 |
| `area_summary` | 1 | 読み取り | エリア（行政コード or polygon）の農地統計 |
| `nearby_farms` | 1 | 読み取り | 半径内の近隣農地 |
| `get_pesticide_rules` | 1 | 読み取り | FAMIC の農薬登録情報を作物・病害虫から検索 |
| `create_staff_deploy_plan` | 3 | ドラフト | 派遣計画の草案。情報不足時に Form elicitation で質問 |
| `open_dashboard` | 5 | 読み取り（UI） | MCP Apps UI ダッシュボードを開く。非対応ホストではテキスト fallback |

**拡張ツール**（`AGRIOPS_ENABLE_EXTENDED_TOOLS=true`）— Tasks Primitive（`create_task`/`get_task_status`）、`snapshot_status`、派生農業ツール（`crop_calendar`、`field_weather_report`、`spray_window`、`multi_field_compare`、`seasonal_risk_forecast`、`optimize_harvest_timing`）、Phase 12 IoT レイヤー。`1.12.0` からデフォルト面を軽くするため任意化されましたが、実際に使われている機能です。

**レガシーツール**（`AGRIOPS_ENABLE_LEGACY_TOOLS=true`）— `surface-catalog.ts` で既に `deprecated: true` の 7 本（市場価格・都道府県作物プロファイル・SSW適性・労働力/畜産統計・市町村統計・e-Stat）。

ツール名・スキーマの変更は一切ありません。詳細は [`docs/anthropic-directory-submission.md`](docs/anthropic-directory-submission.md) を参照してください。

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

## パフォーマンス

利用頻度の高いコアツール2本の `tools/call` エンドツーエンド遅延（インメモリ MCP トランスポート、決定的モックアダプタ使用 — ネットワーク/ファイルI/Oなしで MCP + Zod 検証のオーバーヘッドのみを計測）:

| ツール | p50 (ms) | p95 (ms) | p99 (ms) | ops/sec |
|---|---|---|---|---|
| `search_farmland` | 0.042 | 0.057 | 0.123 | 約22,800 |
| `get_weather_1km` | 0.042 | 0.055 | 0.116 | 約22,800 |

Node v24, darwin/arm64, [tinybench](https://github.com/tinylibs/tinybench) 使用。`npm run bench`（[`scripts/bench.ts`](scripts/bench.ts)）で再現可能。実運用の遅延は Open-Meteo / eMAFF / FAMIC 等の上流 API 呼び出しが支配的で、本サーバー自体のオーバーヘッドはごく小さい。

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
テストファイル: 49   テストケース: 270
```

`npm test` で全テストを実行できます（外部ネットワーク不要）。

## エンタープライズ運用

- Cloud Run 本番デプロイ手順は [docs/runbook.md](docs/runbook.md)。
- Google Cloud Agent Platform / Smart Storage への対応方針は [docs/cloud-next26-agent-readiness.md](docs/cloud-next26-agent-readiness.md)。
- Agent Gateway / Apigee / Cloud Armor などのリバースプロキシ導入時の前提とポリシーは [docs/agent-gateway-deployment.md](docs/agent-gateway-deployment.md)。

**npm への初回公開（メンテナ）:** [docs/npm-first-publish.md](docs/npm-first-publish.md) を参照してください。

## ロードマップ

- Anthropic Connectors Directory への掲載（現状は [docs/anthropic-directory-submission.md](docs/anthropic-directory-submission.md) を参照）。
- Phase 6+: 長時間処理向けの `tasks` プリミティブ（公式仕様の capability を嘘なく宣言できる状態になってから対応）。
- 検討中の次の一歩: 農地・天気・農薬の検索結果を、社内の配置管理システム（aios）と SuguVisa のビザステータス管理と接続し、「この農地に配置すると在留資格の更新期限はいつ来るか」まで一つの会話で確認できるようにする。

## ライセンス

Apache-2.0. © 2026 WIN Kagoshima
