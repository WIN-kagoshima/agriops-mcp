# AgriOps MCP — Go-to-Market 戦略

> 対象: `@sugukuru/agriops-mcp` v1.10.1
> 作成日: 2026-05-04
> ゴール: **MCP エコシステム内で「日本の農業 AI といえば AgriOps」のポジションを確立する**

---

## 目次

1. [現状分析](#1-現状分析)
2. [ターゲットセグメント](#2-ターゲットセグメント)
3. [Phase 1: MCP マーケットプレイス制覇 (Week 1–2)](#3-phase-1-mcp-マーケットプレイス制覇)
4. [Phase 2: npm + GitHub 最適化 (Week 1–2)](#4-phase-2-npm--github-最適化)
5. [Phase 3: コンテンツマーケティング (Week 2–4)](#5-phase-3-コンテンツマーケティング)
6. [Phase 4: 日本農業 AI コミュニティ (Week 3–8)](#6-phase-4-日本農業-ai-コミュニティ)
7. [Phase 5: デベロッパーリレーション (Week 4–12)](#7-phase-5-デベロッパーリレーション)
8. [Phase 6: パートナーシップ・事業化 (Month 3–6)](#8-phase-6-パートナーシップ事業化)
9. [KPI・成功指標](#9-kpi成功指標)
10. [リスクと対策](#10-リスクと対策)

---

## 1. 現状分析

### 強み (Strengths)

| 要素 | 状態 |
|------|------|
| MCP Spec 準拠 | 2025-11-25 + MCP Apps 2026-01-26 完全準拠 |
| テスト品質 | 42 ファイル / 220 テスト前後（`npm test`）、CI 準拠 |
| セキュリティ | CodeQL + OpenSSF Scorecard + red-team テスト |
| ライセンス | Apache-2.0 (企業採用に最適) |
| クライアント例 | Claude Desktop / Cursor / ADK / Python / curl 全カバー |
| ツール数 | 16 model-visible ツール + 複数プロンプト（詳細は README / api-reference） |
| 差別化 | **日本農業に特化した唯一の MCP サーバー** |

### 弱み (Weaknesses)

| 要素 | 対策 |
|------|------|
| npm 未公開 | **初回手順: [docs/npm-first-publish.md](npm-first-publish.md)** → タグで CI 公開 |
| MCP レジストリ未登録 | Phase 1 で全主要マーケットプレイスに登録 |
| 英語コンテンツ不足 | README.md は英語だが、ブログ・デモ動画が未作成 |
| ユーザーコミュニティ未形成 | GitHub Discussions + Discord で立ち上げ |

---

## 2. ターゲットセグメント

| セグメント | 優先度 | 規模 | 獲得チャネル |
|-----------|--------|------|-------------|
| **MCP 開発者** (AI ツール開発者) | ★★★ | 全世界 10万+ | MCP レジストリ, GitHub, npm |
| **AgriTech スタートアップ** | ★★★ | 国内 500+, 海外多数 | J-AGRI, JSAI, Zenn, note |
| **JA・営農指導員** | ★★☆ | 全国 700+ JA | JAISA, 農業新聞, 展示会 |
| **特定技能派遣会社** | ★★☆ | 全国 200+ | 直接営業, ウェビナー |
| **中規模農家** | ★☆☆ | 全国 100万+ | JA 経由, SNS |

---

## 3. Phase 1: MCP マーケットプレイス制覇

**期間: Week 1–2 | 担当: 開発者 | コスト: 無料**

### 3.1 登録先一覧とアクション

| # | レジストリ | URL | 登録方法 | 優先度 |
|---|-----------|-----|---------|--------|
| 1 | **Official MCP Registry** | registry.modelcontextprotocol.io | npm パッケージから自動収集 or PR | ★★★ |
| 2 | **Smithery** | smithery.ai/new | Cloud Run URL を登録 + Server Card 自動スキャン | ★★★ |
| 3 | **Glama** | glama.ai/mcp/servers | GitHub リポジトリから自動インデックス | ★★★ |
| 4 | **MCP.so** | mcp.so | GitHub リポジトリ提出 | ★★☆ |
| 5 | **MCP Market** | mcpmarket.com | サーバー提出フォーム | ★★☆ |
| 6 | **MCP.Bar** | mcp.bar | npm パッケージ名で自動検出 | ★★☆ |
| 7 | **ServerHub** | serverhub.digital | GitHub URL で登録 | ★☆☆ |

### 3.2 Smithery 登録手順

```bash
# 1. Cloud Run エンドポイントを公開 (既にデプロイ済み)
# 2. Smithery CLI で登録
npx smithery mcp publish "https://agriops-mcp-n5vdix22hq-an.a.run.app/mcp" \
  -n @sugukuru/agriops-mcp

# 3. /.well-known/mcp-server.json が自動スキャンされる
# 4. Verified badge 申請 (GitHub org オーナー確認)
```

### 3.3 Official MCP Registry

```bash
# npm に公開後、registry.modelcontextprotocol.io に自動インデックスされる
# 手動登録が必要な場合は GitHub PR:
# https://github.com/modelcontextprotocol/servers
```

### 3.4 最適化ポイント

- **Server Card** (`/.well-known/mcp-server.json`) が既に完備 → Smithery / Glama の自動スキャンで有利
- **GitHub Topics** を追加: `mcp`, `model-context-protocol`, `agriculture`, `japan`, `mcp-server`
- **リポジトリ Description** を最適化: "Japanese agricultural MCP server — farmland, weather, pesticide data for AI agents"

---

## 4. Phase 2: npm + GitHub 最適化

**期間: Week 1–2 | 担当: 開発者 | コスト: 無料**

### 4.1 npm 公開

```bash
# 1. リポジトリ Variables: PUBLISH_TO_NPM=true
# 2. リポジトリ Secrets: NPM_TOKEN（npm の granular token 等）
# 3. タグプッシュで自動公開（package.json / CHANGELOG と一致させる）
git tag v1.10.1   # or current version
git push origin v1.10.1
# → release.yml が npm publish --access public --provenance を実行
```

npm 公開後のメリット:
- `npx @sugukuru/agriops-mcp --stdio` でワンコマンド起動
- MCP.Bar / Official Registry が npm パッケージを自動検出
- OpenSSF Scorecard の npm provenance スコアが向上

### 4.2 GitHub リポジトリ最適化

| 設定 | 現状 | アクション |
|------|------|-----------|
| Topics | 未設定 | `mcp` `model-context-protocol` `agriculture` `japan` `weather` `farmland` `pesticide` `ai-agent` `typescript` `claude` `cursor` を追加 |
| Description | 未確認 | "🌾 Japanese agricultural MCP server — farmland polygons, 1km weather, pesticide rules for AI agents" |
| Social Preview | 未設定 | OGP 画像を作成・設定 (ロゴ + ツール一覧 + バッジ) |
| Website | homepage のみ | GitHub Pages or ランディングページ |
| Discussions | 未有効 | 有効化 → Q&A / Show & Tell / Feature Request カテゴリ |
| Sponsor button | FUNDING.yml がコメントアウト | 有効化 (任意) |
| Releases | GitHub Release 資産添付 | 初回 npm は [npm-first-publish.md](npm-first-publish.md) |

### 4.3 GitHub Stars 獲得戦略

1. **awesome-mcp-servers** リストに PR を提出
2. **awesome-agriculture** リストに PR を提出
3. **Made in Japan** 系リストに PR を提出
4. GitHub Trending 入りを目指す → README の魅力的なデモセクション追加

---

## 5. Phase 3: コンテンツマーケティング

**期間: Week 2–4 | 担当: 開発者 + マーケター | コスト: 低**

### 5.1 テックブログ記事

| # | プラットフォーム | 記事タイトル案 | 言語 | ターゲット |
|---|----------------|---------------|------|-----------|
| 1 | **Zenn** | 「農業 × AI エージェント: MCP で日本の農業データを LLM に接続する」 | 日本語 | 国内エンジニア |
| 2 | **note** | 「特定技能派遣の現場を変える AgriOps MCP の全貌」 | 日本語 | 農業関係者 |
| 3 | **Dev.to** | "Building an Agriculture MCP Server: Lessons from AgriOps" | English | 海外 MCP 開発者 |
| 4 | **Qiita** | 「MCP サーバーを OSS として公開するまでの全工程」 | 日本語 | 国内エンジニア |
| 5 | **Medium** | "How AI Agents Can Help Japanese Farmers: The AgriOps MCP Story" | English | AgriTech 関係者 |

### 5.2 デモ動画

| # | 内容 | 尺 | プラットフォーム |
|---|------|-----|----------------|
| 1 | **30 秒デモ**: Claude で「鹿児島の農地を検索して」→ 結果表示 | 30s | X (Twitter), GitHub README |
| 2 | **3 分チュートリアル**: インストール → Claude Desktop 接続 → 農薬検索 | 3min | YouTube, Zenn |
| 3 | **10 分深堀り**: アーキテクチャ解説 + MCP Inspector デモ | 10min | YouTube |

### 5.3 SNS 戦略

| チャネル | 投稿頻度 | コンテンツ |
|---------|---------|-----------|
| **X (Twitter)** | 週 2–3 回 | リリースノート、デモ GIF、ユースケース紹介 |
| **LinkedIn** | 週 1 回 | AgriTech × AI の洞察記事 + AgriOps 紹介 |
| **Discord (MCP)** | 随時 | MCP 公式 Discord の #showcase チャンネルに投稿 |

### 5.4 ハッシュタグ戦略

```
#MCP #ModelContextProtocol #AgriTech #スマート農業 #AI農業
#Claude #Cursor #AIAgent #TypeScript #OpenSource
#特定技能 #農業DX #eMAFF #JMA
```

---

## 6. Phase 4: 日本農業 AI コミュニティ

**期間: Week 3–8 | 担当: 事業開発 | コスト: 中**

### 6.1 イベント・カンファレンス

| イベント | 日程 | 場所 | アクション |
|---------|------|------|-----------|
| **JAISA スマートアグリシンポジウム** | 2026/5/14 | 東京 日比谷 | 参加 + ネットワーキング |
| **農業情報学会 (JSAI) 年次大会** | 2026/5/30 | 近畿大学 | 口頭/ポスター発表申し込み |
| **J-AGRI TECH 九州** | 2026/5/27–29 | 九州 | 展示 or ライトニングトーク |
| **J-AGRI TECH 東京** | 2026/10/7–9 | 幕張メッセ | 展示ブース出展 |

### 6.2 農業関連組織へのアプローチ

| 組織 | アプローチ | 期待効果 |
|------|-----------|---------|
| **JAISA** (日本農業情報システム協会) | 会員登録 + 技術紹介 | 農業 IT 関係者への認知 |
| **農研機構 (NARO)** | 共同研究提案 | 公的データ連携 + 信頼性 |
| **各地 JA** (特に鹿児島) | デモ実施 | 営農指導員の実利用 |
| **農林水産省 MAFF** | eMAFF データ活用報告 | 政策アライン + PR |

### 6.3 大学・研究機関連携

- 九州大学農学部 — AI × 農業の共同研究
- 鹿児島大学 — 地域農業データの実証
- 近畿大学情報学部 — JSAI 年次大会つながり

---

## 7. Phase 5: デベロッパーリレーション

**期間: Week 4–12 | 担当: 開発者 | コスト: 低〜中**

### 7.1 MCP エコシステム内での存在感

| アクション | 詳細 |
|-----------|------|
| **MCP 公式 Discord** | #showcase に投稿、質問への回答、他サーバー開発者との交流 |
| **Anthropic DevRel** | AgriOps を Claude のドキュメントに MCP 例として紹介してもらう提案 |
| **MCP SDK への貢献** | バグ報告 / PR で SDK コミュニティでの信頼構築 |
| **他の MCP サーバー作者との連携** | 天気系、地図系サーバーとのインテグレーション例 |

### 7.2 テンプレート・ボイラープレート化

AgriOps の構造を「MCP サーバー開発のベストプラクティス」として発信:

- **Zenn Book**: 「MCP サーバーを本格的に作る — AgriOps に学ぶ設計パターン」
- **GitHub Template Repository**: AgriOps のアーキテクチャをテンプレート化
- **ハンズオンワークショップ**: 「あなたの業界データを MCP サーバー化しよう」

### 7.3 インテグレーションパートナー

| パートナー候補 | 連携内容 |
|--------------|---------|
| **Claude Desktop** | 公式 MCP サーバーディレクトリに掲載 |
| **Cursor** | Featured MCP Server として紹介 |
| **Google ADK** | ADK 公式サンプルとして PR |
| **Dify / LangChain** | MCP ツール連携プラグイン |

---

## 8. Phase 6: パートナーシップ・事業化

**期間: Month 3–6 | 担当: 経営 | コスト: 中〜高**

### 8.1 マネタイズモデル

| モデル | 説明 | 対象 |
|-------|------|------|
| **OSS Core + SaaS Premium** | 基本機能は無料、プレミアムツール (AI 収穫予測、自動スケジューリング) は月額課金 | AgriTech 企業 |
| **マネージド MCP サーバー** | Cloud Run デプロイ + SLA + サポートをパッケージ化 | JA / 派遣会社 |
| **データ API ライセンス** | リアルタイム衛星画像、高精度気象データの付加価値レイヤー | 大規模農業法人 |
| **コンサルティング** | MCP サーバー開発支援 (他業界への横展開) | SIer / スタートアップ |

### 8.2 戦略的パートナーシップ

| パートナー | Win-Win |
|-----------|---------|
| **WeatherNews** | 高精度気象データ提供 → AgriOps の精度向上 → WeatherNews の AI エージェント市場参入 |
| **農業 SaaS (AgriNote, KSAS 等)** | 既存ユーザーベース → AgriOps の配布 → SaaS の AI 機能強化 |
| **Google Cloud Japan** | AgriOps を GCP 農業ソリューションの事例に → GCP クレジット + 共同マーケティング |
| **鹿児島県/薩摩川内市** | 自治体 DX 事例 → 補助金 + 実証実験フィールド |

---

## 9. KPI・成功指標

### 短期 (3ヶ月)

| 指標 | 目標値 |
|------|--------|
| GitHub Stars | 500+ |
| npm weekly downloads | 200+ |
| MCP レジストリ登録数 | 5+ マーケットプレイス |
| テックブログ記事 | 5+ 記事 |
| デモ動画再生数 | 1,000+ |

### 中期 (6ヶ月)

| 指標 | 目標値 |
|------|--------|
| GitHub Stars | 2,000+ |
| npm weekly downloads | 1,000+ |
| 外部コントリビューター | 5+ 人 |
| 実利用組織 | 10+ |
| カンファレンス登壇 | 3+ 回 |

### 長期 (12ヶ月)

| 指標 | 目標値 |
|------|--------|
| GitHub Stars | 5,000+ |
| npm weekly downloads | 5,000+ |
| 有料顧客 | 10+ |
| MCP 農業カテゴリ No.1 | 確立 |

---

## 10. リスクと対策

| リスク | 影響 | 対策 |
|-------|------|------|
| **競合 MCP サーバーの登場** | シェア喪失 | 先行者優位を活かし、コミュニティ構築で囲い込み |
| **MCP 仕様の大幅変更** | 互換性破壊 | SDK チームとの密な連携、早期対応体制 |
| **eMAFF データの利用規約変更** | データ配信停止 | 複数データソースの確保、MAFF との良好な関係構築 |
| **開発リソース不足** | 機能追加遅延 | OSS コントリビューターの獲得、GSoC 参加検討 |
| **日本市場の小ささ** | 成長の頭打ち | 東南アジア農業への横展開 (多言語化) |

---

## 即時アクションリスト (今週中)

- [ ] npm publish を有効化（[npm-first-publish.md](npm-first-publish.md): `PUBLISH_TO_NPM=true` + `NPM_TOKEN` → タグプッシュ）
- [ ] GitHub Topics / Description / Social Preview を設定
- [ ] GitHub Discussions を有効化
- [ ] Smithery に Cloud Run URL を登録
- [ ] Glama / MCP.so / MCP Market にリポジトリを提出
- [ ] awesome-mcp-servers に PR を提出
- [ ] MCP 公式 Discord #showcase に投稿
- [ ] Zenn に紹介記事の下書き開始
- [ ] JAISA スマートアグリシンポジウム (5/14) の参加申し込み
