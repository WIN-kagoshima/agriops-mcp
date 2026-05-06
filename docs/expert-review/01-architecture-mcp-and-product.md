# 資料 1：アーキテクチャ・MCP 準拠・OSS としての整理

**対象読者**: MCP 実装者、TypeScript/Node バックエンド、API 設計、OSS メンテナンス、セキュリティレビューに慣れた技術者

**プロジェクト**: AgriOps MCP（npm: `@sugukuru/agriops-mcp`）Version **1.10.1**  
**リポジトリ**: https://github.com/WIN-kagoshima/agriops-mcp

---

## 1. 一言サマリ

日本の農地・気象・農薬・**市場・SSW（特定技能）派遣に使える統計層**を、**MCP（Model Context Protocol）**でツール / リソース / プロンプトとして公開するサーバ。**MCP Apps** 向けに単一 HTML のダッシュボード（戦略室 UI 2.0）も同梱する。

---

## 2. 技術スタックと制約

- **ランタイム**: Node.js 22+、TypeScript ESM、`@modelcontextprotocol/sdk`
- **トランスポート**: stdio / Streamable HTTP
- **UI バンドル**: Vite + `vite-plugin-singlefile` → `dist/ui/dashboard.html` を `ui://agriops/dashboard.html` として配信
- **バンドル目安**: ダッシュボード gzip **約 266 KB**（2026-05 時点のビルドログ基準、目標 400 KB 未満）

---

## 3. v1.10.x で追加した中核概念

### 3.1 `viz_hint` プロトコル（独自拡張）

ツールの `structuredContent` に任意フィールド `viz_hint` を載せ、ホスト側ダッシュボードが **8 種のビュー**（コロプレス、`map_zoom`、レーダー、時系列、棒比較、サンキー、カレンダーヒートマップ、テーブル）へディスパッチする。

- **利点**: 新ツールは「データ + hint」だけで可視化を指示できる  
- **課題**: MCP 標準スキーマ外のため、**クロスホスト互換性はホスト実装依存**

### 3.2 境界データ（TopoJSON）

- **配信**: `resource://agriops/topojson/...` として MCP リソース登録（バンドルに巨大 Geo を埋め込まない）
- **UI 側**: `fetch_topojson_resource`（app-only ツール）でファイルを取得する迂回パスあり
- **スタブ**: リポジトリ内に簡略 TopoJSON を同梱；本番精度は `scripts/build-topojson.mjs` + 国土数値情報 N03 で再生成を想定

### 3.3 市町村層

- **`get_municipality_stats`**: 展開圏 19 道府県中心の内蔵 DB（件数は README/CHANGELOG 参照）
- **`list_municipalities`**: app-only、内蔵 DB ベースで市町村一覧を返す

---

## 4. 可観測性・ガバナンス（確認してほしい点）

- ツールの **visibility**（model / app）split、Server Card と実際の `tools/list` の一致（conformance テストあり）
- **`outputSchema` / SemVer**: ツール名・URI の安定方針
- **リソース URI スキーム**: `ui://`、`resource://`、`tasks://` の併用

---

## 5. 意図的に残している「ホワイトボックス」論点

1. `viz_hint` を **公式 MCP 拡張**としてドキュメント化する価値と、命名の一般化（`preferredView` vs MIME/type 駆動）
2. TopoJSON を **リソース**と**ファイル直読み（fetch_topojson_resource）**の二系統にしている理由と、将来の一本化
3. 外部タイル（OpenStreetMap）依存と **MCP Apps CSP** のリスク（計画書上の既知リスク）

---

## 6. 参照ドキュメント（リポジトリ内）

- `CHANGELOG.md`（v1.10.0 セクション）
- `docs/architecture.md`
- `docs/data-license.md`
- `src/lib/viz-hint.ts`（型定義の実体）

---

**評価プロンプト**は 3 資料共通の **1 本**にまとめています → [`README.md` の「統合評価プロンプト」](./README.md#統合評価プロンプトコピペ用)
