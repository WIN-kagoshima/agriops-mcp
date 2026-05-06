# AgriOps MCP 現状説明書（専門家向け・事実ベース）

作成日: 2026-05-07  
対象リポジトリ: `WIN-kagoshima/agriops-mcp`  
npm パッケージ: `@sugukuru/agriops-mcp`

## 1. 現在の公開状態

- npm registry 上の最新バージョンは `1.10.3`。
- npm registry 上で確認できる公開済みバージョンは `1.10.2` と `1.10.3`。
- npm dist-tag `latest` は `1.10.3`。
- GitHub Release `v1.10.3` は作成済み。
- GitHub Release `v1.10.3` の作成者は `github-actions[bot]`。
- GitHub Release `v1.10.3` の作成日時は `2026-05-06T17:54:53Z`。
- GitHub Release `v1.10.3` の公開日時は `2026-05-06T17:56:06Z`。
- GitHub Release `v1.10.3` には次の assets がある。
  - `agriops-mcp-dashboard-v1.10.3.html`
  - `agriops-mcp-server-v1.10.3.tar.gz`
  - `SHA256SUMS`

## 2. リポジトリ状態

- 現在の `main` HEAD は `50e72064af30bb0644c02a925537fca176fa0041`。
- `v1.10.3` タグは `8eaf93ad7323a175acbb3ab50fd788d832320a69` を指している。
- `main` と `origin/main` は同期済み。
- 作業ツリーに未コミット差分はない。
- ローカルに存在する `v1.10.x` タグは `v1.10.0`, `v1.10.1`, `v1.10.2`, `v1.10.3`。

## 3. package metadata

- `package.json` の `name` は `@sugukuru/agriops-mcp`。
- `package.json` の `version` は `1.10.3`。
- `package.json` の `license` は `Apache-2.0`。
- `package.json` の `author` は `WIN Kagoshima`。
- `package.json` の `homepage` は `https://github.com/WIN-kagoshima/agriops-mcp`。
- `package.json` の `repository.url` は `git+https://github.com/WIN-kagoshima/agriops-mcp.git`。
- `package.json` の `engines.node` は `>=22.0.0`。
- npm bin は `agriops-mcp`。
- npm publish config は public access。

## 4. 主要 dependencies

npm registry 上の `@sugukuru/agriops-mcp@1.10.3` が持つ dependencies:

- `@modelcontextprotocol/ext-apps`: `^1.7.1`
- `@modelcontextprotocol/sdk`: `^1.29.0`
- `better-sqlite3`: `^12.9.0`
- `cookie-parser`: `^1.4.7`
- `express`: `^4.21.2`
- `zod`: `^3.25.0`

## 5. v1.10.3 の変更内容

`CHANGELOG.md` の `1.10.3` セクションに記載されている変更:

- `express-rate-limit` を更新し、`npm audit` が報告した moderate severity の `ip-address` advisory に対応。
- `better-sqlite3` を v12.9.0 に更新。
- `better-sqlite3` v12.9.0 は SQLite 3.53.0 を含む。
- TypeScript を v6.0.3 に更新。
- TypeScript 6 の CSS side-effect import に対応するため、CSS module declaration を追加。
- GitHub Actions の `actions/checkout`, `actions/setup-node`, Docker actions を Node 24 compatible versions に更新。
- `docs/npm-first-publish.md` に CI provenance publish 用の Automation token 手順を追記。

## 6. 実行済みローカル検証

ローカル検証環境:

- OS: Windows
- Node.js: `v22.22.0`
- npm: `11.8.0`

実行済みコマンドと結果:

- `npm run lint`
  - 結果: success
  - Biome 対象: 178 files
  - fixes applied: 0
- `npm run typecheck`
  - 結果: success
  - TypeScript compiler error: 0
- `npm audit`
  - 結果: success
  - vulnerabilities: 0
- `npm test`
  - 結果: success
  - Test Files: 42 passed
  - Tests: 220 passed
- `npm run test:ui`
  - 結果: success
  - Playwright: 2 passed
- `npm run build:all`
  - 結果: success
  - UI bundle: `dist/ui/index.html` 959.10 kB
  - gzip size: 266.45 kB
- `npm run release:check -- --tag v1.10.3`
  - 結果: success
  - package name: PASS
  - package version: PASS
  - release tag matches package version: PASS
  - CHANGELOG release notes: PASS
  - npm package required files: PASS
  - npm package forbidden files: PASS
  - dry-run pack files: 231

## 7. GitHub Actions 状態

Release workflow:

- Run: `release: v1.10.3 #18`
- Commit: `8eaf93ad7323a175acbb3ab50fd788d832320a69`
- Status: Success
- Duration: 2m 29s
- Job: `Build, test, and release v1.10.3`
- Job duration: 2m 24s
- Annotation: Node.js 20 deprecation warning for `softprops/action-gh-release@v2`

Post-release CI workflow:

- Run: `ci: bump softprops/action-gh-release to v3 #99`
- Commit: `50e72064af30bb0644c02a925537fca176fa0041`
- Status: Success
- Duration: 1m 39s
- Job: `Lint, typecheck, test`
- Job duration: 44s
- Job: `UI (Playwright) Phase 5+`
- Job duration: 42s
- Playwright summary: 2 passed

## 8. Release workflow の残存警告への対応状態

- `v1.10.3` Release workflow は `softprops/action-gh-release@v2` で実行されたため、Node.js 20 deprecation warning が 1 件記録されている。
- `v1.10.3` 公開後、`main` で `softprops/action-gh-release` を `v3` に更新済み。
- `softprops/action-gh-release@v3` への更新 commit は `50e72064af30bb0644c02a925537fca176fa0041`。
- その更新 commit の CI は Success。

## 9. npm publish の状態

- `@sugukuru/agriops-mcp@1.10.3` は npm registry に公開済み。
- npm registry 上の `latest` は `1.10.3`。
- npm registry 上の tarball URL は `https://registry.npmjs.org/@sugukuru/agriops-mcp/-/agriops-mcp-1.10.3.tgz`。
- npm registry 上の unpacked size は 1.9 MB。
- npm registry 上の maintainer は `sugukuru <a_kabe@sugu-kuru.co.jp>`。

## 10. MCP surface と機能概要

`README.md`, `package.json`, `CHANGELOG.md` に基づく事実:

- Node.js 22+ を対象 runtime としている。
- TypeScript ESM package である。
- stdio transport と Streamable HTTP を提供する。
- MCP Spec `2025-11-25` と MCP Apps Extension `2026-01-26` を参照している。
- MCP Apps UI dashboard を含む。
- UI dashboard は `dist/ui/dashboard.html` として npm package に含まれる。
- npm package には `assets/topojson/**/*.json` が含まれる。
- `v1.10.0` で `viz_hint` protocol、TopoJSON MCP resources、municipality drill-down dashboard、8 種の UI view components が追加された。
- `v1.10.0` 以降の package line で `get_municipality_stats` tool が含まれる。
- `CHANGELOG.md` は `1.0.0` 以降、tool names, input/output schemas, resource URIs, prompt names を SemVer 下で stable と記載している。

## 11. 既知の未完了事項

- GitHub repository の About metadata（description, website, topics）は、未ログイン状態では自動更新できなかった。
- GitHub repository page の fetched view では description が `MCP for Agri` と表示されていた。
- `v1.10.3` Release workflow の annotation には `softprops/action-gh-release@v2` の Node.js 20 deprecation warning が残っている。
- ただし `main` では `softprops/action-gh-release@v3` に更新済み。

