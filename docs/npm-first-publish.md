# npm 公開（メンテナ向け）

パッケージ名は **`@sugukuru/agriops-mcp`**（npm アカウント: [sugukuru](https://www.npmjs.com/~sugukuru)）。registry に載せるための手順です。

## 0. 前提

- 公開は本来 **npm trusted publishing**（OIDC）を使用する設計です。1.15.3〜1.15.5 で `NPM_TOKEN` ベースの旧方式は一度削除しましたが、**1.15.6 時点では一時的に `NPM_TOKEN`（granular access token, package-scoped, 2FA bypass 有効）へフォールバックしています**。理由: `WIN-kagoshima/agriops-mcp` に対する OIDC 交換が、CI 側（npm CLI バージョン, `id-token: write`, 不要な `_authToken` 除去, `package.json#repository.url` の `git+` 除去）・npmjs.com 側（Trusted Publisher の org/repo/workflow filename/environment/Allowed actions を1フィールドずつ再確認済み）の両方を検証・修正してもなお `ENEEDAUTH` で失敗し続けており、スコープ付きパッケージに関する npm 側の未解決 issue（[npm/cli#8976](https://github.com/npm/cli/issues/8976), [npm/cli#9088](https://github.com/npm/cli/issues/9088)）と一致する挙動だったため。`.github/workflows/release.yml` は `NPM_TOKEN` が secrets に存在する限りそれを使い、存在しない場合は OIDC 経路にフォールバックする（コードはそのまま残っている）。**OIDC が動くようになったことを確認できたら、`NPM_TOKEN` secret を削除し、`release.yml` の `if: secrets.NPM_TOKEN == ''` 分岐と `env: NODE_AUTH_TOKEN` 行を外すこと** — 恒久的に両方残さない。
- **スコープ `@sugukuru`** は [sugukuru](https://www.npmjs.com/~sugukuru) ユーザに紐づく公開スコープです。

## A. npm trusted publishing の初回設定（メンテナが一度だけ行う）

1. **[npmjs.com](https://www.npmjs.com/)** に **sugukuru** でログインし、[`@sugukuru/agriops-mcp` の Settings → Publishing access](https://www.npmjs.com/package/@sugukuru/agriops-mcp/access) を開く。
2. **Trusted Publisher** を追加し、次を正確に入力する（`.github/workflows/release.yml` の実際の値と一致させること — ずれていると OIDC 交換が失敗する）:
   - **Publisher**: GitHub Actions
   - **Organization or user**: `WIN-kagoshima`
   - **Repository**: `agriops-mcp`
   - **Workflow filename**: `release.yml`
   - **Environment name**: (空 — このワークフローは GitHub Environment を使わない)
3. 保存する。これで `id-token: write` 権限を持つ `release.yml` の実行が、npm に対して短命トークンを自己証明できるようになる。**Secrets や Variables の設定は不要**（`NPM_TOKEN` / `PUBLISH_TO_NPM` は使わない）。

## B. リリース手順（タグをプッシュするだけ）

1. `main`（またはデフォルトブランチ）に、次が揃っていることを確認する。
   - `package.json` の `version`
   - 同じバージョンの `CHANGELOG.md` 見出し `## [x.y.z]`
   - CI が緑（`ci.yml` の `GitHub Actions workflow lint (hard gate)` ジョブが `.github/workflows/*.yml` を `actionlint` で検証する — `v1.15.6` はこれがまだ無い時期に `secrets` コンテキストをステップの `if:` に書いてしまい、タグを push してもジョブが一つも起動しない壊れたリリースになった）
2. タグを `package.json` のバージョンに合わせて作成し、リモートへプッシュする。

   ```bash
   npm run build:all
   npm run release:check -- --tag v1.15.3   # 例: version が 1.15.3 のとき
   git tag v1.15.3
   git push origin v1.15.3
   ```

3. GitHub の **Actions** → **Release** ワークフローで、**Publish to npm (trusted publishing, stable tags only)** ステップが成功したことを確認する。プレリリースタグ（例: `v1.15.3-beta.1` のようにタグ名に `-` が含まれる）はこのステップをスキップする — npm には上がらない。
4. 確認コマンド:

   ```bash
   npm view @sugukuru/agriops-mcp version
   npm view @sugukuru/agriops-mcp dist.integrity
   ```

   provenance が付いていることは npm のパッケージページ（"Provenance" バッジ）または `npm audit signatures` で確認できる。

### よくあるハマり

- **`npm error code ENEEDAUTH` / OIDC トークン交換に失敗する**
  → §A の Trusted Publisher 設定（organization/repository/workflow filename）がリポジトリの実際の値と一致しているか確認する。特に `workflow filename` は `release.yml`（パスではなくファイル名のみ）。
- **npm CLI のバージョンが古い**
  → trusted publishing は npm CLI `>= 11.5.1` が必要。`release.yml` は `npm install -g npm@^11.5.1` で明示的に更新しているため、通常は問題にならない。ローカルで再現する場合は `npm install -g npm@latest` を実行する。
- **プレリリースタグ**（例: `v1.15.3-beta.1` のようにタグ名に `-` が含まれる）は、ワークフロー仕様により **npm には上がりません**。安定版のみ公開されます。
- **既に同じタグをプッシュ済み**で npm だけ失敗した場合は、`package.json` と CHANGELOG を **パッチバージョン**で上げ、`release:check` 後に **新しいタグ**を押し直す（trusted publishing はローカルからの手動 publish に相当する緊急手順を持たない — ローカル publish には別途 npm ログイン＋2FA が必要で、provenance も付かないため非推奨）。

## 公開後

- README の npm バッジが解決される（パッケージ: [`@sugukuru/agriops-mcp`](https://www.npmjs.com/package/@sugukuru/agriops-mcp)）。
- `npx -y @sugukuru/agriops-mcp` や、`npm install -g @sugukuru/agriops-mcp` で試せるようになる（`bin` のエントリに従う）。

Go-to-market の他チャネル（MCP レジストリ等）は [go-to-market.md](./go-to-market.md) を参照してください。
