# npm 初回公開（メンテナ向け）

パッケージ名は **`@sugukuru/agriops-mcp`**（npm アカウント: [sugukuru](https://www.npmjs.com/~sugukuru)）。registry に載せるための手順です。

## 0. 前提

- npm の **2FA** を有効にしていると、トークン種別によっては追加制約があります（npm の案内に従ってください）。
- **スコープ `@sugukuru`** は [sugukuru](https://www.npmjs.com/~sugukuru) ユーザに紐づく公開スコープです。`npm login` したアカウントがこのユーザであること、およびトークンが **そのアカウント向け**に発行されていることを確認してください。

## A. GitHub Actions で自動公開（推奨・provenance 付き）

リポジトリの [`.github/workflows/release.yml`](../.github/workflows/release.yml) が、**リリースタグのプッシュ**で `npm publish --access public --provenance` を実行します（オプトイン）。

1. **[npmjs.com](https://www.npmjs.com/)** に **sugukuru** でログインし、**Granular Access Token** で **`NPM_TOKEN`** を発行する。
   - **Packages and scopes**: `@sugukuru/agriops-mcp` に **Read and write**（または該当スコープ全体）。
   - **2FA をオンにしている場合は必須:** トークン種別で **Automation** を選ぶ（CI から `npm publish` するときに OTP を求められない）。**Publish** だけのトークンだと Actions 上で **`npm error code EOTP`** になり失敗します。
2. GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions**
   - **Repository secrets**: 名前 `NPM_TOKEN`、値にトークンを保存。
3. 同じ画面の **Variables** タブ
   - 名前 `PUBLISH_TO_NPM`、値 **`true`**（文字列）。
4. `main`（またはデフォルトブランチ）に、次が揃っていることを確認する。
   - `package.json` の `version`
   - 同じバージョンの `CHANGELOG.md` 見出し `## [x.y.z]`
   - CI が緑
5. タグを `package.json` のバージョンに合わせて作成し、リモートへプッシュする。

   ```bash
   npm run build:all
   npm run release:check -- --tag v1.10.0   # 例: version が 1.10.0 のとき
   git tag v1.10.0
   git push origin v1.10.0
   ```

6. GitHub の **Actions** → **Release** ワークフローで、**Publish to npm** ステップが成功したことを確認する。
7. 確認コマンド:

   ```bash
   npm view @sugukuru/agriops-mcp version
   ```

### よくあるハマり

- **`npm error code EOTP` / `This operation requires a one-time password`**（GitHub Actions の Publish ステップ）  
  → アカウントが **2FA（認証＋書き込み）**のとき、**Automation** 以外の細粒度トークンだと CI から OTP を要求されます。  
  **対処:** npm で **Granular Access Token（type: Automation）** を再発行し、GitHub の **`NPM_TOKEN` を差し替え**たうえで、失敗した **Release ワークフローを再実行**するか、`1.10.2` などパッチを上げて **新しいタグ**を押してください。
- **プレリリースタグ**（例: `v1.10.0-beta.1` のようにタグ名に `-` が含まれる）は、ワークフロー仕様により **npm には上がりません**。安定版のみ公開されます。
- **既に同じタグをプッシュ済み**で npm だけ失敗した場合は、`package.json` と CHANGELOG を **パッチバージョン**で上げ、`release:check` 後に **新しいタグ**を押し直すか、メンテナ判断でローカルから一度だけ `npm publish` します（下記 B）。

## B. ローカルから手動公開（初回のみ・緊急用）

```bash
npm run build:all
npm run release:check -- --tag v$(node -p "require('./package.json').version")
npm login
npm publish --access public
```

GitHub Actions 経由と違い、**provenance は付かない**ことがあります。通常は A を推奨します。

## 公開後

- README の npm バッジが解決される（パッケージ: [`@sugukuru/agriops-mcp`](https://www.npmjs.com/package/@sugukuru/agriops-mcp)）。
- `npx -y @sugukuru/agriops-mcp` や、`npm install -g @sugukuru/agriops-mcp` で試せるようになる（`bin` のエントリに従う）。

Go-to-market の他チャネル（MCP レジストリ等）は [go-to-market.md](./go-to-market.md) を参照してください。
