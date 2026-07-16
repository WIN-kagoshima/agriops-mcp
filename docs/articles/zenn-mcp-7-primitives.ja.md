---
title: "農業の公的データをMCPの7つのプリミティブで接続する — AgriOps MCPの設計記録"
emoji: "🌾"
type: "tech"
topics: ["mcp", "modelcontextprotocol", "typescript", "agriculture", "claude"]
published: false
---

<!--
Canonical source for the Zenn article. Publish by copy-pasting this body
(without the front matter, which Zenn's own editor manages) to
https://zenn.dev/new. dev.to translation lives at
./devto-mcp-7-primitives.en.md — keep both in sync when this changes.
-->

## この記事のスコープ

MCP（Model Context Protocol）のサーバーを作るとき、多くの実装は `tools` だけで止まる。仕様には `tools` 以外に `prompts` / `resources` / `resource templates` / `completion` / `logging` / `pagination` という6つの仲間がいて、これを合わせて7プリミティブと呼んでいる。

[AgriOps MCP](https://github.com/WIN-kagoshima/agriops-mcp) は、日本の農地ポリゴン（eMAFF Fude）、1kmメッシュ気象（Open-Meteo / 気象庁）、農薬登録情報（FAMIC）を特定技能派遣の現場で使うために作ったMCPサーバーだ。この記事は「7プリミティブを全部、嘘なく動かす」までに実際に踏んだ設計判断の記録。コードは全部OSS（Apache-2.0）なので、リンク先を読めば同じ実装に辿り着ける。

## なぜ「Tools だけ」で止まってはいけないのか

LLMエージェントから見ると `tools` は関数呼び出しの集合に過ぎない。だが実運用のMCPサーバーには、Tools単体では表現しづらい要求が必ず出てくる:

- **ユーザーが直接叩きたい定型フロー**（「今日の巡回ブリーフィングをくれ」）→ `prompts`（スラッシュコマンド）
- **キャッシュ可能な読み取り専用データ**（都道府県一覧、利用規約）→ `resources`
- **IDでピンポイントに引ける読み取り**（この農地ポリゴンだけ）→ `resource templates`
- **入力補完**（都道府県名を打ち始めたら候補が出る）→ `completion`
- **進行状況やレート制限の通知**→ `logging`
- **大量データの安全な返却**→ `pagination`

これらを後回しにすると、結局クライアント側（≒モデルのプロンプト）に押し付ける形になり、コンテキスト消費と誤操作のリスクが増える。「Capability over compensation」— モデルの限界を隠れたヒントツールで補うのではなく、プロトコルが用意している機能で解決する、というのが今回一貫させた原則。

## Tools: あえて「約8本」に絞る

最初のバージョンは実装した機能をそのままツール化していったので、モデル可視のツールが30本近くまで増えた（deprecated 7本を含む）。これは [Anthropic Connectors Directory の審査基準](https://claude.com/docs/connectors/building/review-criteria) と真っ向から矛盾する。レビュアーは「全ツールを1回ずつ叩いて成功することを確認する」ので、ツール数はそのまま審査コストであり、モデルにとっての選択コストでもある。

実際にユーザーがやりたいジョブ（農地を探す → 天気/リスクを見る → 農薬を確認する → 配置案を作る → ダッシュボードを開く）を並べると、コアは8本で足りた:

```
search_farmland / nearby_farms / area_summary
get_weather_1km / get_weather_warning
get_pesticide_rules
create_staff_deploy_plan
open_dashboard
```

派生・複合ツール（作物カレンダー、散布可否判定、複数圃場比較など）とレガシーツール（旧市場価格・旧SSW系）は削除も改名もしていない。`AGRIOPS_ENABLE_EXTENDED_TOOLS` / `AGRIOPS_ENABLE_LEGACY_TOOLS` という環境変数フラグの裏に隠して、セルフホストする既存ユーザーは今までと同じように使える。ツール名やスキーマは一度公開したら壊さない、というのが `03-mcp-tool-rules.mdc` に書いた自分たちのルールで、Directory 提出用の「モデルから見える面」を絞るのとは別の話、という整理をした。

MCP Apps のUI専用ツール（ダッシュボードが内部で叩く `fetch_topojson_resource` など）は `_meta["ui/visibility"] = ["app"]` を付けて、そもそもモデルの `tools/list` の判断材料から外している。UIの内部実装詳細をモデルに読ませる理由はどこにもない。

## Prompts: スラッシュコマンドは「ユーザーの入口」

Toolsは「モデルが必要な時に選ぶ」もの、Promptsは「ユーザーが明示的に呼ぶ」もの、という役割分担をした。`area_briefing`（都道府県の農業ブリーフィング）、`staff_deploy_plan`、`weather_risk_alert` など15本あるが、READMEと提出パケットでは代表3本だけを前面に出している。全部を平等に見せると、結局ユーザーは選べない。

## Resources / Resource Templates: IDで引く読み取り専用データ

都道府県一覧や `docs/data-license.md` 相当の帰属情報は `resources` として固定URIで公開している。一方「この農地ポリゴンだけ知りたい」というのはIDが可変なので `resource templates` の出番だ:

```
farmland://{fude_id}
```

`fude_id` が未知のIDなら、プロトコルエラーではなく `{ "error": "farmland_not_found" }` という構造化ペイロードを返す。エージェントが失敗を人間可読なテキストとして処理できるようにするための意図的な選択で、「Tool結果の中でエラーを表現する」というMCPの一般的な作法をResource側にも合わせた。

## Completion: 「見つかったら足す」を守る

7プリミティブの中で最後まで欠けていたのが `completions` capability だった。理由は単純で、Completionが要るのはPromptの引数やResource Templateの引数を補完したい時だけで、それまで両方に「補完してほしい可変引数」が存在しなかったから。

今回は2箇所で活性化した:

1. `area_briefing` プロンプトの `prefecture` 引数を SDK の `completable()` でラップし、都道府県名の前方一致・ISOコード（`JP-46` 等）の前方一致どちらでも補完できるようにした。
2. `farmland://{fude_id}` Resource Template に `complete` ハンドラを実装し、部分的なIDから `emaff.search` にプロキシして実在するIDだけを返す。

```ts
prefecture: completable(z.string(), completePrefectureName)
```

capabilityは「宣言してあるから動く」のではなく「補完できる引数が実在するから宣言される」という順序を守った。使っていない機能を宣言するのは、Server Cardを読むクライアントに対する小さな嘘になる。

## Logging / Pagination: 地味だが壊れやすい

`notifications/message` は元から実装していたので、今回やったのは「壊れていないことをconformanceテストで固定する」ことと、`cursor` / `nextCursor` を返すページネーションを2アダプタ（eMAFF・FAMIC）で共通化することだった。

```ts
// src/lib/pagination.ts
export function encodeOffsetCursor(offset: number): string { ... }
export function decodeOffsetCursor(cursor: string | undefined): number { ... }
export function clampLimit(limit: number | undefined, max: number): number { ... }
```

同じロジックが2ファイルにコピペされていたので、共通化した上で [fast-check](https://github.com/dubzzz/fast-check) のproperty-based testで「どんな壊れたcursor文字列を渡しても例外を投げずに有効なoffsetへフォールバックする」ことを証明した。ページネーションはLLMが生成した `cursor` 文字列がそのまま渡ってくる可能性があるので、堅牢性のテストとしてPBTが特に効く場所だと感じている。

## 品質の見せ方: Property-Based Testing とベンチマーク

主観的な「テストがある」という主張より、何を検証したかを具体的に示す方が信頼される。今回追加したのは:

- `tests/unit/geo.pbt.test.ts`: haversine距離の対称性・三角不等式・境界値
- `tests/unit/pagination.pbt.test.ts`: cursorの往復性・ゴミ入力への耐性
- `tests/conformance/attribution.test.ts`: 全ライセンス付きデータの `attribution` フィールドが空文字を許さないことをスキーマレベルで保証
- `scripts/bench.ts`（[tinybench](https://github.com/tinylibs/tinybench)）: `search_farmland` / `get_weather_1km` のp50/p95/p99を計測し、READMEに表として公開

CIでは MCP Inspector の `tools/list` smoke テストを `continue-on-error: true` を外して hard gate にした。ツール面が壊れたらCIが赤くなる、という当たり前のことを当たり前にした。

## まとめ

7プリミティブを全部揃えることそのものが目的ではない。目的は「モデルが選ぶもの（Tools）」「人が呼ぶもの（Prompts）」「IDで引くもの（Resources/Templates）」「入力を助けるもの（Completion）」「壊れたら分かるもの（Logging/CI gate）」を、それぞれ適切な場所に配置することだった。結果として、ツール数は約3分の1に減り、Directory審査もしやすくなり、コードは前より読みやすくなった。

コードは [github.com/WIN-kagoshima/agriops-mcp](https://github.com/WIN-kagoshima/agriops-mcp)（Apache-2.0）。`npx -y @sugukuru/agriops-mcp` で今すぐ試せる。Issue・PRも歓迎です。
