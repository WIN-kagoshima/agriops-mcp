# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

From `1.0.0` onward, tool names, input/output schemas, resource URIs, and prompt names are **stable** under Semantic Versioning. Breaking changes require a major version bump.

Pre-`1.0.0` releases were explicitly **experimental**.

## [1.15.1] — 2026-07-22 — CI unblock + IoT snapshot seeding race fix

### Fixed
- **CI `npm ci` ERESOLVE** (`.npmrc`): every GitHub Actions workflow (`ci.yml`, `codeql.yml`, `deploy.yml`, `production-smoke.yml`, `release.yml`) had been failing at the `npm ci` step since 2026-07-15 — the root `react@19.2.6` devDependency and the vendored `@modelcontextprotocol/inspector-client`'s radix-ui peer requirement on `react@^18.3.1` trip npm's strict peer resolver even though the lockfile already nests a private `react@18.3.1` copy that makes this work at runtime. Added `legacy-peer-deps=true` to a new `.npmrc`.
- **Corrupted `package-lock.json` entry**: `@types/qs@6.15.0` carried a bogus `os: ["linux"]` restriction, wrong `license`, and a nonexistent `engines` field (none present in the real published package — same integrity hash, so not a supply-chain substitution, just bad lockfile data) that broke `npm ci`/`npm install` on non-Linux machines. Regenerated the lockfile via `npm install`, which also refreshed a stale `@types/react-dom@18.3.7` entry to `19.2.3` to match `@types/react@^19`.
- **IoT snapshot seed race** (`src/services/iot/iot-db.ts`): `initIotDb()`'s "seed if empty" check-then-insert was not atomic across concurrent connections to the same on-disk SQLite file (parallel test workers, or multiple Cloud Run instances cold-starting against the same GCS-restored snapshot), causing an intermittent `UNIQUE constraint failed: machine_telemetry.machine_id`. The seed check and inserts now run inside a single `BEGIN IMMEDIATE` transaction (serializes concurrent seeders; the loser re-checks and finds the data already there) with a 5s `busy_timeout`, and the machine/batch inserts use `INSERT OR IGNORE` as defense-in-depth.
- 4 pre-existing Biome lint errors in `market-mcp/` (literal-key and template-literal style violations) that were hidden behind the `npm ci` failure and would have failed CI's lint step next — fixed via `biome check --write --unsafe`.

## [1.15.0] — 2026-07-22 — Directory UX & artifact portability

### Added
- **`AGRIOPS_ALLOWED_HOSTS`** (`src/lib/config.ts`, `src/server/transport-http.ts`, `.env.example`): additional trusted hostnames (comma-separated, no scheme) for the Streamable HTTP DNS-rebinding allowlist, alongside `MCP_BASE_URL`'s own host. Fixes a `421 Forbidden` on platforms (Cloud Run) that expose more than one hostname for the same service.
- **Embedded artifact resources** ("take this artifact home"): `search_farmland` and `nearby_farms` now embed a GeoJSON `FeatureCollection` content block (`application/geo+json`); `get_pesticide_rules` and `create_staff_deploy_plan` now embed a CSV content block (`text/csv`, RFC 4180). Uses the MCP Spec §6.4 `EmbeddedResourceSchema` shape — purely additive, ignored by clients that don't render it. New `src/lib/csv.ts` (shared CSV serialiser, also adopted by the existing `export_plan_csv` app tool) and `src/lib/artifacts.ts` (GeoJSON/CSV resource-block builders).
- **`outputSchema` for `create_staff_deploy_plan`**: previously the only default-tier tool without one. Covers both the successful-draft and Form-elicitation-declined response shapes.
- **Dashboard CSV export**: the AgriOps Dashboard MCP App (`ui://agriops/dashboard.html`) header gained a "CSV ダウンロード" button (`src/ui/csv-export.ts`) that serialises the currently rendered tabular data to CSV and triggers a browser download, with a copy-to-clipboard fallback panel for MCP Apps hosts that sandbox the iframe against anchor-click downloads.
- **`tests/conformance/artifacts.test.ts`**: end-to-end coverage for all 4 embedded-resource tools (shape, mimeType, row-count parity with `structuredContent`, zero-result omission) plus `create_staff_deploy_plan`'s both output shapes against its new `outputSchema`.
- **`scripts/capture-directory-screenshots.ts`** / `npm run capture:screenshots`: headless-Playwright capture of 5 dashboard screenshots (choropleth, radar, bar_compare, timeseries, CSV-export fallback) against `dist/ui/dashboard.html` with a mock `window.mcpApps` bridge, for the Anthropic Directory submission portal. Output committed at `assets/directory-screenshots/`.

### Fixed
- **`assets/logo.png`**: was a JPEG mislabeled with a `.png` extension (confirmed via `file`); re-encoded in place to a true PNG.
- **Dashboard/tool-surface consistency**: the dashboard and several prompts (`strategy_room_dashboard`, `market_trend_briefing`, ...) called 5 tools (`get_municipality_stats`, `get_labor_shortage_stats`, `get_ssw_crop_compatibility`, `get_livestock_regional_stats`, `get_market_price`) that did not exist at all on the default (`AGRIOPS_ENABLE_LEGACY_TOOLS` unset) 8-tool surface — every dashboard quick-action click would have hit "tool not found" for a Directory reviewer or first-time connection. These 5 tools now register unconditionally, with `_meta["ui/visibility"] = ["app"]` (LLM-invisible, UI-callable) when the legacy flag is off, and as before (model-visible, `deprecated: true`) when it's on. Prompts requiring extended/legacy-only tools are now gated behind those flags instead of always registering; `strategy_room_dashboard` degrades its instructions gracefully when the tools its analysis view needs aren't model-visible in the current configuration.

### Changed
- **`src/server/surface-catalog.ts` / `src/server/well-known.ts`**: `RegisteredSurface` gained `appOnlyToolNames`, so `.well-known/mcp-server.json` reports each tool's *runtime* visibility (accounting for the fix above) instead of only its static catalog entry — the Server Card no longer claims the 5 dashboard-helper tools are model-visible on the default surface.
- **`src/tools/_registry.ts`**: `registerAllTools` now returns `{ tools, appOnlyToolNames }` instead of a bare tool-name array.
- **`src/server/create-server.ts`**: server `instructions` are now built by `buildInstructions()` after tool registration, conditionally mentioning `get_estat_stats` only when it will actually be registered — previously a default (no env flags) connection could be instructed to call a tool absent from `tools/list`.
- **`docs/anthropic-directory-submission.md`**: checklist updated (icon, screenshots, portable artifacts all marked Done); new §9 documents this release's changes in detail.
- **`tests/conformance/directory-surface.test.ts`**: split the legacy-tool assertions into `LEGACY_ONLY_TOOLS` (still fully gated) and `DASHBOARD_HELPER_TOOLS` (registered unconditionally, asserted to carry the `ui/visibility: ["app"]` hint by default).

## [1.14.2] — 2026-07-16 — Narrative & community distribution

### Added
- **`docs/articles/`**: canonical content for developer-trust distribution — [`zenn-mcp-7-primitives.ja.md`](docs/articles/zenn-mcp-7-primitives.ja.md) (Japanese, deep technical dive into implementing all 7 MCP primitives, canonical source), [`devto-mcp-7-primitives.en.md`](docs/articles/devto-mcp-7-primitives.en.md) (English adaptation), [`show-hn-draft.md`](docs/articles/show-hn-draft.md) (title + post text + anticipated Q&A prep), and [`note-ssw-placement.ja.md`](docs/articles/note-ssw-placement.ja.md) (non-technical, SSW-placement-industry angle for note.com).
- **README.md / README.ja.md**: added a "Demo" / "デモ" section (placeholder pending a real screen-recorded GIF, tracked as a TODO) and a "Roadmap" / "ロードマップ" section noting the planned `aios`/SuguVisa integration, per the go-to-market plan's developer-trust-first distribution strategy.
- Submitted PRs adding AgriOps MCP to two community-curated lists: [punkpeye/awesome-mcp-servers#10187](https://github.com/punkpeye/awesome-mcp-servers/pull/10187) (Data Platforms) and [brycejohnston/awesome-agriculture#42](https://github.com/brycejohnston/awesome-agriculture/pull/42) (Data Standardization, Interoperability and APIs).

### Changed
- `docs/go-to-market.md`: checked off the completed items in the "即時アクションリスト" (awesome-list PRs, Zenn/dev.to/note/Show HN drafts) and flagged the remaining npm-publish-lag and demo-GIF gaps explicitly.
- `README.ja.md`: corrected the stale test-coverage figures (41 files / 208 cases → 48 files / 263 cases).

## [1.14.1] — 2026-07-16 — Anthropic submission packet verification

### Added
- **`docs/anthropic-directory-submission.md` §8**: local verification log for the Phase 4 pre-submission checklist — confirmed via `@modelcontextprotocol/inspector` `--cli` that the default (no feature flags) surface exposes exactly the 8 model-visible tools plus 10 `ui/visibility: ["app"]` helper tools, and that `tools/call` succeeds (`isError: false`) for all 8 default tools end-to-end against fixture SQLite snapshots.
- Description audit (§5) completed: all 8 default tool descriptions re-read against the Directory's prompt-injection rejection patterns — all are factual "what it does" statements, no imperative "always call this tool" phrasing.
- MCP Apps screenshot recipe (§8.3) validated: a mock `window.mcpApps` bridge injected into the built `dist/ui/dashboard.html` standalone confirms `bar_compare`, `radar`, and `choropleth` views all render correctly post the React 19 pinning fix.

### Changed
- `docs/anthropic-directory-submission.md`: checklist statuses updated; documented two local-environment gotchas (relative `EMAFF_SNAPSHOT_PATH`/`FAMIC_SNAPSHOT_PATH` resolution, and an upstream `@modelcontextprotocol/inspector@0.22.0` CWD-resolution bug in `--cli` mode) so future verification passes don't re-debug them. Confirmed the production Cloud Run endpoint still returns `403 Forbidden` to anonymous clients — tracked as the remaining ops action item before portal submission.

## [1.14.0] — 2026-07-16 — Craft signals

### Added
- **fast-check property-based tests**: `tests/unit/geo.pbt.test.ts` (haversine symmetry/zero/triangle-inequality/bounds, `bboxFromRadius` containment and monotonicity, `isValidLatLng` boundary behavior) and `tests/unit/pagination.pbt.test.ts` (cursor round-trip for any non-negative safe integer, garbage input never throws and always resumes at a valid offset, `clampLimit` bounds).
- **`src/lib/pagination.ts`**: extracted `encodeOffsetCursor` / `decodeOffsetCursor` / `clampLimit`, previously duplicated verbatim in `src/adapters/emaff-fude.ts` and `src/adapters/famic-pesticide.ts`. Same behavior, single source of truth, now directly unit-testable.
- **`src/lib/attribution.ts`**: shared `AttributionSchema` (`z.string().min(1)`) used by every output schema backed by a licensed source (Open-Meteo, eMAFF, FAMIC, JMA). Previously `attribution: z.string()` accepted an empty string despite `docs/data-license.md` mandating every adapter populate it — this closes that gap at the schema level instead of relying on adapter discipline.
- **`tests/conformance/attribution.test.ts`**: fast-check property proving `AttributionSchema` rejects `""` and accepts any non-empty string, a table test confirming the 4 core output schemas (`WeatherForecastSchema`, `FarmlandSearchResultSchema`, `AreaSummarySchema`, `PesticideQueryResultSchema`) reject an empty `attribution`, and an end-to-end pass calling all 5 attribution-bearing core tools against the live server.
- **`scripts/bench.ts` / `npm run bench`**: [tinybench](https://github.com/tinylibs/tinybench)-based p50/p95/p99 latency benchmark for `search_farmland` and `get_weather_1km`, measuring the full `tools/call` round trip over an in-memory transport with deterministic mock adapters (isolates MCP + Zod overhead from upstream API latency). Results published in README.md / README.ja.md "Performance" sections.
- CI: the MCP Inspector `tools/list` smoke step is now a hard gate (`continue-on-error: true` removed) — a broken tool surface now fails CI instead of silently passing.

### Changed
- `src/types/farmland.ts`, `src/types/pesticide.ts`, `src/types/weather.ts`, `src/tools/get-weather-warning.ts`: `attribution` fields now use the shared `AttributionSchema` instead of a bare `z.string()`.
- `src/adapters/emaff-fude.ts`, `src/adapters/famic-pesticide.ts`: use the shared pagination helpers; local duplicate `clampLimit`/`encodeCursor`/`decodeCursor` removed.

## [1.13.0] — 2026-07-16 — Completion primitive

### Added
- **`completions` capability** (Phase 13, closes the 7th and final MCP primitive gap: Tools, Prompts, Resources, Resource Templates, Completion, Logging, Pagination are now all genuinely active — not just declared). The server negotiates `completions: {}` because the `area_briefing` prompt registers a completable argument; this was previously a truthfulness gap (`docs/phase-plan.md` Phase 13 tracked it as missing).
- **`farmland://{fude_id}` Resource Template** (`src/resources/farmland-template.ts`): read-only lookup of a single eMAFF Fude polygon by `fieldId`, same JSON shape as one entry of `search_farmland`'s `structuredContent.fields`. Registers only when the `emaff` adapter is configured. Ships a `complete` handler for `fude_id` that proxies to `emaff.search`, so clients get live autocompletion instead of guessing IDs. Reading an unknown ID returns a structured `{ error: "farmland_not_found" }` payload rather than a protocol-level error.
- **`src/lib/prefectures.ts`**: extracted the shared 47-prefecture name/ISO-code table and `normalisePrefectureCode` / `completePrefectureName` helpers (previously duplicated inline in `area-briefing.ts`). `completePrefectureName` matches on Japanese-name prefix or `JP-nn` code prefix.
- `area_briefing` prompt's `prefecture` argument is now wrapped in the SDK's `completable()`, wired to `completePrefectureName`, giving Directory reviewers and IDE clients live prefecture autocompletion instead of a bare string field.
- **`tests/conformance/completion.test.ts`**: end-to-end `completion/complete` conformance — capability negotiation, prompt-argument completion (`ref/prompt`) by name and by ISO code, resource-template completion (`ref/resource`) by partial `fieldId`, and both the found/not-found `farmland://` read paths.

### Changed
- `src/server/surface-catalog.ts`: added `RESOURCE_METADATA` entry for `farmland://{fude_id}`.
- `src/server/well-known.ts`: Server Card now lists a `resources` array (previously only `apps`/UI resources were surfaced) so `farmland://{fude_id}` and other non-UI resources are discoverable by crawlers; `capabilities.completions` explicitly declared.
- `src/resources/_registry.ts`: registers the new farmland template when `deps.emaff` is present; also gated `tasks://{task_id}` behind `config.enableExtendedTools` for consistency with its sibling tools (was previously always registered regardless of the flag — a latent tier-leak fixed as part of this pass).
- `docs/phase-plan.md` Phase 13 status: Planned → Shipped/Current.

## [1.12.0] — 2026-07-16 — Directory & reference-quality surface

### Added
- **Tool surface tiering**: two opt-in feature flags gate the default model-visible surface — `AGRIOPS_ENABLE_EXTENDED_TOOLS` (Tasks Primitive, derived agronomy tools, `snapshot_status`, Phase 12 IoT layer) and `AGRIOPS_ENABLE_LEGACY_TOOLS` (the seven tools already flagged `deprecated: true`). Both default to `false`. With no env vars set, exactly 8 model-visible tools register: `get_weather_1km`, `get_weather_warning`, `search_farmland`, `area_summary`, `nearby_farms`, `get_pesticide_rules`, `create_staff_deploy_plan`, `open_dashboard`. This is the surface an Anthropic Connectors Directory reviewer, the MCP Inspector, or a first-time agent sees. No tool was renamed, removed, or had its schema changed — this is a registration-policy change only.
- **`config.enableExtendedTools` / `config.enableLegacyTools`** (`src/lib/config.ts`), consumed by `src/tools/_registry.ts`.
- **`docs/anthropic-directory-submission.md`**: submission-shape decision (anonymous Streamable HTTP remote MCP, no OAuth for the public-data default surface) and pre-submission checklist mapped to Anthropic's official criteria.
- **`docs/privacy-policy.md`**: public privacy policy describing what data the server processes, caches, and retains.
- **`docs/phase-plan.md`**: canonical phase → version → capability map (previously referenced by `AGENTS.md` but missing from the repo).
- **`tests/conformance/directory-surface.test.ts`**: pins the default 8-tool surface and asserts no extended/legacy tool registers without its flag.

### Changed
- `vitest.config.ts`: sets `AGRIOPS_ENABLE_EXTENDED_TOOLS=true` and `AGRIOPS_ENABLE_LEGACY_TOOLS=true` for the test run by default, so existing tests keep exercising the full tool surface; `directory-surface.test.ts` explicitly unsets both to assert the opposite default.
- `src/server/well-known.ts`: refreshed the stale `eval` block (test counts, `lastRun`) and added a `toolSurfacePolicy` field documenting the two env vars.
- `AGENTS.md`, `SECURITY.md`, `docs/architecture.md`, `docs/api-reference.md`, `docs/go-to-market.md`, `README.md`, `README.ja.md`, `examples/README.md`, `.env.example`: synced tool-count claims and phase/version tables with the actual registered surface (previously drifted — `AGENTS.md` said "17 tools" at `1.0.0`, `SECURITY.md` said current stable was `1.5.0`, `docs/architecture.md`'s diagram said "17 tools total").

## [1.11.0] — 2026-05-12

### Added
- **`get_estat_stats` tool** (Phase 11): Live query interface to the e-Stat (政府統計の総合窓口) API v3.0. Provides access to 農林水産省 statistical data — 農林業センサス (census_workers), 作物統計 (crop_output), 畜産統計 (livestock). Two-step workflow: `mode='search'` to discover statistics tables → `mode='data'` to fetch values. Supports prefecture-level area filtering via ISO 3166-2:JP codes, category/time filters, and preset shortcuts. 24-hour response cache. Requires free `ESTAT_APP_ID` registration.
- **`EstatApiAdapter`** (`src/adapters/estat.ts`): e-Stat API v3.0 adapter wrapping `getStatsList` and `getStatsData` endpoints. JSON format, `TtlCache` for 24h caching, `UpstreamError` for API failures, attribution in every result per 利用規約.
- **`EstatAdapter` interface** added to `src/adapters/_interface.ts`.
- **`src/types/estat.ts`**: Type definitions for e-Stat API response shapes.

### Changed
- `config.ts`: Added optional `estatAppId` (from `ESTAT_APP_ID` env var).
- `deps.ts`: Added `estat: EstatAdapter | null` to `Deps`.
- `create-server.ts`: Wires `EstatApiAdapter` when `ESTAT_APP_ID` is set; updated `instructions` to document e-Stat cross-tool pattern.
- `surface-catalog.ts`: Phase 11 entry for `get_estat_stats` (read-only, model-visible, `READ_ONLY_REMOTE`).
- `well-known.ts`: Added e-Stat to `data_sources` array and updated server description.
- `_registry.ts`: Conditional registration gated on `deps.estat`.
- `docs/data-license.md`: Added e-Stat API entry with 政府統計API利用規約 terms.
- `.env.example`: Added `ESTAT_APP_ID` documentation.
- `tool-annotations.test.ts`: Added `get_estat_stats` to `expectedRemote` set (openWorldHint conformance).
- Security: appId is now masked (replaced with `***`) in all error messages, debug logs, and upstream error propagation.

## [1.10.3] — 2026-05-07

### Changed

- Security: upgraded `express-rate-limit` to resolve the moderate `ip-address` advisory reported by `npm audit`.
- Dependencies: upgraded `better-sqlite3` to v12.9.0 (SQLite 3.53.0) and TypeScript to v6.0.3; added a CSS module declaration for TS6 side-effect CSS imports.
- CI: upgraded GitHub Actions runtime dependencies (`actions/checkout`, `actions/setup-node`, Docker actions) to Node 24-compatible versions and removed deprecation warning noise.
- Docs: expanded `docs/npm-first-publish.md` with explicit Automation token steps for CI provenance publishing.

## [1.10.2] — 2026-05-07

### Changed

- `.nvmrc` updated from `20` to `22` (align with `package.json engines >=22` and CI).
- `README.md`, `README.ja.md`, `CONTRIBUTING.md`: added Windows/OneDrive setup notes for `better-sqlite3` prebuilds (Node 22 LTS; pause OneDrive sync before `npm ci`).
- Docs version references updated to v1.10.2 in `go-to-market.md` and `expert-review/` materials.
- Removed accidental empty root files (`npm`, `tsc`, `tsx`, `vite`, `v1.10.1`).

## [1.10.1] — 2026-05-04

### Changed

- **npm package name** from `@win-kagoshima/agriops-mcp` to `@sugukuru/agriops-mcp` (publisher: [sugukuru](https://www.npmjs.com/~sugukuru)). GitHub repo URL and Docker image references (`ghcr.io/...`) are unchanged.
- **`.nvmrc`** updated from `20` to `22` to align with `package.json engines` (`>=22.0.0`) and CI (`node-version: 22`).
- Maintainer docs (`docs/npm-first-publish.md`), expert-review materials, `release:check` TopoJSON pack assertion, and CI/npm release alignment.
- `README.md` / `README.ja.md` / `CONTRIBUTING.md`: added Windows/OneDrive setup notes for `better-sqlite3` prebuilds (Node 22 LTS required; pause OneDrive sync before `npm ci`).

## [1.10.0] — 2026-05-04 — 戦略室 UI 2.0: 市町村ドリルダウン + 8種アダプティブビジュアライゼーション

### Added
- **`viz_hint` protocol** (`src/lib/viz-hint.ts`): New `VizHint` discriminated union type + `withVizHint()` / `extractVizHint()` / `resolvePath()` helpers. Tools embed viz hints in `structuredContent`, and the dashboard auto-selects the best visualization. 8 view types supported: `choropleth`, `map_zoom`, `radar`, `timeseries`, `bar_compare`, `sankey`, `calendar_heatmap`, `table`.
- **viz_hint added to 6 existing tools**:
  - `get_ssw_crop_compatibility`: `radar` (single crop) or `bar_compare` (all crops)
  - `get_labor_shortage_stats`: `choropleth` (JP-00 national) or `bar_compare` (single prefecture)
  - `get_livestock_regional_stats`: `bar_compare` by sector
  - `get_market_price`: `timeseries` (12-month price curve)
  - `get_prefecture_crop_profile`: `calendar_heatmap` (12-month crop labor calendar)
- **`get_municipality_stats` tool** (Phase 10): City-level agricultural statistics for ~150 municipalities in 19 prefectures (Kyushu/Shikoku/Tokai/Kinki/Chugoku). Input: `cityCode`, `prefectureCode`, or `cityName`. Returns: population, farm bodies, top SSW crop + score.
- **`src/data/municipality-db.ts`**: Internal DB of ~65+ cities with agricultural workers (2020/2015), farm bodies, main crops, top SSW crop, lat/lng. Prefectures: JP-40〜47, JP-36〜39, JP-21/23/24, JP-29/30, JP-33〜35.
- **TopoJSON MCP Resources** (`src/resources/topojson-resources.ts`): 4 TopoJSON boundary resources served as `resource://agriops/topojson/*`. Prefectures + 3 regional municipality files for Kyushu, Shikoku, Tokai/Kinki/Chugoku.
- **`scripts/build-topojson.mjs`**: Build script for generating production-quality TopoJSON from 国土数値情報 N03 via `mapshaper`.
- **Dashboard UI 2.0** (`src/ui/Dashboard.tsx`): Complete rewrite as a strategic command room shell with:
  - **Breadcrumb navigation**: 国 → 都道府県 → 市町村 → 圃場 (clickable, ESC-aware)
  - **Quick action buttons**: one-click access to national choropleth, SSW radar, livestock map, market prices
  - **Prefecture selector**: 19 Sugu-kuru zone prefectures
  - **ViewDispatcher**: auto-selects visualization from viz_hint
- **8 new UI view components** (pure SVG, no external chart libraries):
  - `Radar.tsx`: 5-axis pentagon radar chart for SSW compatibility
  - `BarCompare.tsx`: horizontal bar comparison with threshold line
  - `TimeSeries.tsx`: multi-series line/area chart
  - `Sankey.tsx`: flow diagram for SSW rotation planning
  - `CalendarHeatmap.tsx`: 12-month × crop labor intensity grid
  - `DataTable.tsx`: sortable fallback table
  - `MapChoropleth.tsx`: maplibre-gl choropleth with metric color scale
  - `MapZoomDrill.tsx`: interactive drill-down map with municipality markers
- **`_dispatch.tsx`**: ViewDispatcher component with exhaustive switch over all 8 view types
- **`Breadcrumb.tsx`**: hierarchy navigation component
- **`topojson-loader.ts`**: async TopoJSON loader with in-memory cache
- **`fetch_topojson_resource` tool** (app-only): Serves TopoJSON asset files to the dashboard via `bridge.callTool`
- **`useAppBridge.fetchResource()`**: New method to fetch MCP resources through the bridge
- **`open_dashboard` upgraded**: Added `viewSpec` parameter for pre-selecting a visualization view
- **`strategy_room_dashboard` prompt**: Receives an `analysis_goal` description and generates the optimal tool call + `open_dashboard` invocation sequence

### Changed
- Dashboard dark theme redesigned: Tailwind-inspired dark palette (`--bg: #0d1117`, `--accent: #34d399`)
- `list_municipalities` upgraded from stub to real implementation using `municipality-db.ts`

### Tests
- New unit test suite: `tests/unit/get-municipality-stats.test.ts` (9 tests)
- Smoke tests: prompts count updated 14→15 (`strategy_room_dashboard` added)
- Conformance: JSONRPC resource URI regex updated to allow `resource://` scheme

## [1.9.0] — 2026-05-04 — 畜産×SSW戦略インテリジェンス (捕鳥・養豚・酪農・肉用牛)

### Added
- **`get_livestock_regional_stats` tool**: Prefecture-level livestock statistics based on 農林水産省 畜産統計調査 2023. Covers 4 sectors: broiler (ブロイラー/捕鳥), pig (養豚), beef cattle (肉用牛), dairy (酪農). For each sector: national rank, headcount, farm count, SSW compatibility score (0-100), key operations, and SSW dispatch notes. Key data: 鹿児島 #1 in broiler (1.5 billion birds/yr) + pig + beef cattle simultaneously — Sugu-kuru's home base is the most concentrated livestock region in Japan. Supports 17 prefectures including JP-00 national total.
- **`get_ssw_crop_compatibility` expanded to livestock**: Added 4 畜産農業 entries:
  - `ブロイラー（捕鳥）`: Score 78 — labor shortage score **20/20** (highest in all agriculture). Night-time bird catching (23:00–06:00) is the most automation-resistant, human-avoidance-prone operation in Japanese agriculture. Kagoshima/Miyazaki are #1/#2 nationally.
  - `養豚（分娩補助）`: Score 64 — year-round employment possible. Kagoshima/Miyazaki #1/#2.
  - `酪農（搾乳）`: Score 60 — ideal for SSW residency model (fixed daily schedule). Hokkaido 64% national share.
  - `肉用牛（和牛飼養管理）`: Score 63 — branded wagyu (鹿児島黒牛・宮崎牛) farms have high payment capacity.

### Changed
- `surface-catalog.ts`: Phase 9 entry for `get_livestock_regional_stats`.
- `package.json`: version bumped to `1.9.0`.

## [1.8.0] — 2026-05-04 — SSW Strategic Intelligence Layer (スグクル戦略室)

### Added
- **`get_ssw_crop_compatibility` tool**: Returns an SSW (特定技能外国人 agricultural category) compatibility score for 15 crops on 5 axes (automation resistance, value density, seasonal concentration, skill acquisition speed, labor shortage level — each 0-20 pts, total 100). Rankings: いちご/みかん=85, すだち=88 (S-rank); 花き/お茶/さつまいも/ぶどう/びわ/レモン in A-range. Omit the `crop` arg to get the full ranked table. Methodology based on 農水省特定技能ガイドライン + ALIC market data + 農林業センサス 2020.
- **`get_labor_shortage_stats` tool**: Prefecture-level agricultural labor force statistics based on 農林業センサス 2020 (農林水産省). Covers 20 entries (JP-00 national + 19 prefectures: Kyushu 8, Shikoku 4, Tokai 3, Kinki 2, Chugoku 2). Returns workforce size (2020/2015), 5-year change rate, average age, over-65%, farm management body count, shortage severity rating (深刻/高い/中程度/低い) with qualitative notes. Key finding: national agricultural workforce down 22% in 5 years, average age 67.8, 70% over 65.
- **`ssw_strategy_briefing` prompt**: The "Sugu-kuru 戦略室" master prompt. Accepts `focus_region`, `analysis_month`, `priority` (urgent_shortage/high_value/year_round/quick_onboarding), `available_workers`, and `horizon` (this_season/next_6months/annual/3year). Orchestrates 5 tools in sequence (crop compatibility → labor stats → prefecture profiles → market prices → crop calendar) and instructs the model to produce a structured strategy report with: 1-page strategy summary, prefecture scorecard, crop-SSW matching analysis, 12-month demand calendar, Sugu-kuru competitive advantage, and risk register.

### Changed
- `tests/smoke/prompts.test.ts`: updated expected count from 13 to 14, added `ssw_strategy_briefing`.
- `surface-catalog.ts`: Phase 8 entries for `get_ssw_crop_compatibility`, `get_labor_shortage_stats`, `ssw_strategy_briefing`.
- `package.json`: version bumped to `1.8.0`.

## [1.7.0] — 2026-05-04 — Harvest optimizer, expanded market DB, Kinki/Chugoku prefectures

### Added
- **`optimize_harvest_timing` tool**: Synthesizes weather forecast (Open-Meteo), crop calendar, and market price seasonality into a scored recommendation for the optimal harvest month. Returns per-month scores across weather risk / market trend / labor demand axes with SSW dispatch note. Supports 8 crops (さつまいも, みかん, キャベツ, トマト, 稲, いちご, 花き, すだち).
- **`get_prefecture_crop_profile` expanded to 19 prefectures**: Added Kinki 2-pref (JP-30 Wakayama 有田みかん・南高梅, JP-29 Nara 富有柿・古都華いちご) and Chugoku 2-pref (JP-34 Hiroshima 瀬戸田レモン, JP-33 Okayama マスカット・白桃). Each with harvest months, labor intensity, and `ssw_dispatch_note`.
- **`get_market_price` expanded to 19 products**: Added すいか (熊本産春すいか), メロン (熊本産アンデスメロン), ぶどう (岡山マスカット/ピオーネ), なし (鳥取二十世紀梨), りんご (青森ふじ), 梅 (和歌山南高梅). Full seasonal factors and regional origin notes.
- **`annual_dispatch_plan` prompt**: 12-month SSW deployment plan generator. Calls `get_prefecture_crop_profile` + `get_market_price` + `crop_calendar` across all specified prefectures and produces a month-by-month schedule table, Q1–Q4 strategy, agricultural off-season utilization plan, and weather risk calendar.

### Changed
- `get_prefecture_crop_profile` input enum and `PrefectureProfile` type now include `"kinki"` and `"chugoku"` regions.
- Conformance test `tool-annotations.test.ts`: added `optimize_harvest_timing` to `expectedRemote` set (uses weather API → `openWorldHint: true`).
- `tests/smoke/prompts.test.ts`: updated to expect 13 prompts.
- `surface-catalog.ts`: Phase 7 entry for `optimize_harvest_timing` and `annual_dispatch_plan` prompt.

## [1.6.0] — 2026-05-04 — Sugu-kuru regional expansion: Kyushu / Shikoku / Tokai + market data

### Added
- **`get_market_price` tool**: Reference wholesale price data for 13 agricultural products and timber (野菜・果物・米・茶・花き・スギ丸太・ヒノキ丸太). Built-in seasonal price factors, regional origin notes, and ALIC / 林野庁 attribution. Supports Kyushu (JP-40…JP-47), Shikoku (JP-36…JP-39), and Tokai 3-pref (JP-21, JP-23, JP-24) origin filtering.
- **`get_prefecture_crop_profile` tool**: Per-prefecture crop profile covering all 15 target prefectures. Each entry contains main crops ranked by output, harvest months, peak SSW labor months, labor intensity (low/medium/high/very_high), market notes, and a `ssw_dispatch_note` written specifically for Sugu-kuru dispatch decision-making.
- **`crop_calendar` — 4 new crops**: すだち (with Shikoku-native windows including 徳島 harvest schedule), びわ (Shikoku window), 花き (with Tokai-native window for 愛知 year-round greenhouse operations). Total: **17 crops**.
- **`crop_calendar` — `shikoku` and `tokai` regions**: Added native regional windows for `かんきつ` (Ehime 段々畑 specifics), `すだち` (Tokushima), `花き` (Aichi/Tokai year-round flower greenhouse). Other crops fall back to Kyushu base with ±shift.
- **`market_trend_briefing` prompt**: Agent-driven market briefing that calls `get_market_price` + `crop_calendar` + `get_weather_1km` and produces a structured analysis: price trend summary table, harvest calendar for the month, SSW dispatch demand evaluation, and notable topics. Designed for Sugu-kuru weekly decision meetings.
- **`region_dispatch_demand` prompt**: Multi-region SSW dispatch demand forecast. Calls `get_prefecture_crop_profile`, `get_market_price`, and `crop_calendar` across all specified prefectures and synthesizes a demand matrix, recommended deployment allocation, risks, and weekly action items. Direct support for Sugu-kuru's 九州全域 + 四国 + 東海3県 strategy.
- **`well-known.ts`**: Added ALIC and 林野庁 to `data_sources` list.
- **`surface-catalog.ts`**: Added Phase 7 entries for both new tools and both new prompts.

### Changed
- **`crop_calendar` region enum**: Added `"tokai"` as a named region alongside `"shikoku"`. Both now use native windows when available, falling back to Kyushu base with zero shift otherwise.
- **`prompts.test.ts`**: Updated to expect 12 prompts (was 10) with new names included in `arrayContaining`.

## [1.5.1] — 2026-05-04 — crop_calendar expansion, README.ja.md refresh, data-freshness workflow

### Added
- **`crop_calendar` expanded to 13 crops**: Added ナス, きゅうり, たまねぎ, 大豆, じゃがいも, さとうきび, かんきつ, とうもろこし with authentic Kyushu cultivation windows including spring/autumn double-cropping entries.
- **`.github/workflows/data-freshness.yml`**: Weekly scheduled workflow (Mondays 02:00 JST) that audits eMAFF and FAMIC snapshot manifests. Opens a GitHub issue when snapshots exceed 30 days; auto-closes the issue when freshness is restored.
- **Tests (A, B, C phases)**: 5 Phase 6 unit test files, getPrompt coverage for all 10 prompts, `outputSchema` on `create_task` / `get_task_status` / `open_dashboard`, `structuredContent` returns on all Phase 6 tools (fixes SDK -32602 validation). 41 files / 208 cases.

### Changed
- **`docs/api-reference.md`**: Full rewrite covering all 16 model-visible tools and 10 prompts with `Since` column and per-tool `structuredContent` shapes.
- **`README.ja.md`**: Updated to Node.js 22+, v1.5.1, 16 tools / 10 prompts, test coverage badge.
- **`src/server/well-known.ts`**: Bump eval counts to `testFiles: 41`, `testCases: 208`.
- **`crop_calendar` tool description**: Updated to reflect 13 crops.

## [1.5.0] — 2026-05-04 — Persona-driven features: daily briefing, field visits, multi-field compare

### Added
- **`docs/personas.md`**: Four detailed user personas (dispatch manager, JA extension officer, mid-scale farmer, AgriTech CTO) with pain points, current tool landscape, and feature mapping matrix.
- **`daily_briefing` prompt**: Morning briefing for farmers and dispatch managers. Fetches 48-hour weather, JMA warnings, and generates prioritized daily work plan with Go/NoGo judgement. Designed to be read on a smartphone in under 30 seconds.
- **`field_visit_checklist` prompt**: Pre-visit preparation sheet for JA extension officers. Given a field ID, assembles farmland info, 72-hour weather, pesticide candidates, and nearby fields into a printable A4 checklist with observation points and farmer advice draft.
- **`multi_field_compare` tool**: Takes up to 10 field IDs and returns a side-by-side comparison table with risk levels (safe/caution/danger), recommending the best field for work today. Designed for dispatch managers deciding field priorities.
- **`seasonal_risk_forecast` tool**: 7-day agricultural risk forecast with day-by-day breakdown. Evaluates heat stress, frost, heavy rain, drought, strong wind, and crop-specific disease risk (high-temp + humidity). Returns overall risk level (low/moderate/high).

### Changed
- **`surface-catalog.ts`**: Added tool metadata for `multi_field_compare`, `seasonal_risk_forecast` and prompt metadata for `daily_briefing`, `field_visit_checklist`.
- **`_registry.ts` (tools)**: `seasonal_risk_forecast` is unconditional; `multi_field_compare` requires `deps.emaff`.
- **`_registry.ts` (prompts)**: Now 10 prompts total.

## [1.4.0] — 2026-05-04 — User-facing agricultural decision tools

### Added
- **`crop_calendar` tool**: Returns a month-by-month farming calendar for a given crop and climate region. Built-in database covers 5 major crops (稲, さつまいも, キャベツ, トマト, 茶) with regional time-shift for all 9 climate zones. Includes sowing, transplanting, pest control windows, and harvest timing.
- **`field_weather_report` tool**: Given a single eMAFF field ID, fetches the field's location, runs a multi-day weather forecast, checks for active JMA warnings, and returns a unified risk-flagged report. Combines get_weather_1km + get_weather_warning into one agent-friendly call. Risk flags: heavy_rain, strong_wind, high_evapotranspiration, drought_stress, heat_stress, frost_risk, jma_warning_active.
- **`spray_window` tool**: Analyzes hourly weather to find safe time windows for pesticide spraying. Evaluates wind speed (configurable threshold, default 3 m/s), precipitation (must be 0), and humidity (40–90% optimal). Returns ranked contiguous slots with washoff risk assessment.
- **`harvest_readiness` prompt**: Cross-references the 7-day weather outlook with FAMIC pesticide pre-harvest interval rules to advise whether a field is safe to harvest. Accepts crop, coordinates, last spray date, and pesticide name. Returns a 3-level judgement (収穫可/要待機/要確認) with recommended harvest day and safety notes.

### Changed
- **`surface-catalog.ts`**: Added `TOOL_METADATA` entries for `crop_calendar`, `field_weather_report`, `spray_window` (Phase 6, read-only, model visibility) and `PROMPT_METADATA` for `harvest_readiness` (introduced 1.4.0).
- **`_registry.ts` (tools)**: Phase 6 registration block. `crop_calendar` and `spray_window` are unconditional; `field_weather_report` requires `deps.emaff`.
- **`_registry.ts` (prompts)**: Added `harvest_readiness` to prompt list (now 8 prompts total).

## [1.3.0] — 2026-05-03 — Prompt improvements, CONTRIBUTING guide, prefecture map fix

### Added
- **`irrigation_schedule` prompt**: Uses the 7-day ET₀ evapotranspiration and volumetric soil-moisture forecast from `get_weather_1km` to recommend a daily irrigation schedule. Accepts `lat`, `lng`, optional `crop` name, and `field_area_ha` for water-volume estimates. Generates a table with recommended irrigation volume and flags high-stress days (ET₀ > 5 mm, soil moisture < 0.15 m³/m³).
- **`data_freshness_check` prompt**: Operator slash command that instructs the agent to call `snapshot_status` and format the result as a plain-language data-quality bulletin. Accepts optional `stale_after_days` (default: 90).
- **`CONTRIBUTING.md`**: Full contribution guide covering prerequisites, project structure, local server setup, testing, tool/prompt authoring contract, code style, commit message convention, PR checklist, and security reporting.

### Changed
- **`weather_risk_alert` prompt enhanced**: Now aggregates ET₀ and minimum soil moisture per field alongside rain/wind. Cross-references active JMA warnings for the fields' prefectures when `deps.jma` is available. Evaluation criteria updated to flag ET₀ > 40 mm, soil moisture < 0.15 m³/m³, and active JMA advisories.
- **`area_briefing` prompt**: `normalisePrefectureCode` helper expanded from 3 hard-coded entries to all 47 Japanese prefectures (both `県名` and short names accepted).
- **`surface-catalog.ts`**: Added `PROMPT_METADATA` entries for `irrigation_schedule` and `data_freshness_check` (`introduced: "1.3.0"`). Server Card conformance restored to green.

## [1.2.0] — 2026-05-03 — snapshot_status tool, outputSchema on 6 tools, JMA fix, typed task args

### Added
- **`snapshot_status` tool** (phase 5, model-visible, read-only): reports freshness, row counts, and attribution for eMAFF/FAMIC SQLite snapshots by reading their companion manifest JSON files. Returns `ageHours`, `stale` flag, `lastIncrementalAt`, and attribution for each snapshot. Accepts a configurable `staleAfterHours` threshold (default: 2160 h / 90 days). Enables agents to verify data currency before making time-sensitive agricultural decisions. Tests: `+5` in `snapshot-status.test.ts`.
- **`outputSchema` on 6 tools**: `get_weather_1km`, `search_farmland`, `area_summary`, `get_weather_warning`, `nearby_farms`, and `get_pesticide_rules` now declare `outputSchema` in their `registerTool` config. Hosts that support the MCP 2025-03-26 spec can validate/parse structured tool output without relying on free-text content.
- **`create_task` args schema tightened**: `args` field changed from `Record<string, unknown>` to a typed Zod object with `prefecture_code` (ISO 3166-2:JP regex), `city_code` (5-digit regex), and `delay_ms` (0–5000) properties. Removes implicit `as unknown` casts and improves LLM hint quality.
- **JMA user-agent version is now dynamic**: `JmaWarningAdapter` accepts an optional `version` parameter and uses it in the `User-Agent` header instead of the previously hardcoded `0.5.1`. Version is injected via `create-server.ts` from `deps.version`.

### Changed
- `surface-catalog.ts`: added `snapshot_status` tool metadata entry (`introduced: "1.2.0"`, `read-only`, `model` visibility).
- `docker-multiarch.yml`: fixed `IMAGE_NAME` case (`WIN-kagoshima` → lowercase via `tr`) to satisfy OCI registry requirements; removed deprecated `buildx install: true` flag.

## [1.1.0] — 2026-05-03 — Agri metrics, Tasks Primitive, eMAFF incremental, ADK example

### Added
- **ET₀ evapotranspiration and soil indicators** (`HourlyWeatherSchema` extension): `get_weather_1km` now returns `et0EvapotranspirationMm` (FAO-56 Penman-Monteith, mm — key for irrigation scheduling), `soilTemperatureC` (0 cm depth, °C — germination/root decisions), and `soilMoisture` (0–1 cm volumetric water content, m³/m³ — field operation timing). Open-Meteo adapter requests the corresponding `et0_fao_evapotranspiration`, `soil_temperature_0cm`, `soil_moisture_0_to_1cm` variables. Tests: `+3` in `open-meteo.test.ts`.
- **Tasks Primitive** (`src/tasks/`): `create_task` (kinds: `echo`, `area_summary_async`) and `get_task_status` model-visible tools + `tasks://{task_id}` dynamic `ResourceTemplate`. Allows clients to kick off long-running work and poll status without blocking a single tool call. `InMemoryTaskStore` is the default; swap for Cloud Firestore / Cloud Tasks in multi-replica deployments. Tests: `+8` in `tasks.test.ts`.
- **eMAFF incremental snapshot builds** (`scripts/build-snapshots --incremental`): `buildEmaffSnapshot` now accepts `incremental?: boolean`. When set on an existing database, rows are applied with `INSERT ... ON CONFLICT DO UPDATE` rather than dropping and recreating the table. R*Tree index is updated via `INSERT OR REPLACE`. An `updated_at` column is added (auto-migrated on first incremental run). `SnapshotManifest` bumped to `schemaVersion: 2` with `lastIncrementalAt` and `incrementalRowsProcessed`. Added `npm run snapshots:build:incremental` shorthand.
- **Google Cloud Smart Storage context** in snapshot manifests: each `*.sqlite.manifest.json` now includes a `smartStorage` block with `objectContextVersion`, `spatialExtent` (GeoJSON Polygon bounding box), `topicTags`, and `dataLineage`. Enables Google Cloud Agent Platform / Smart Storage-aware clients to route and filter snapshots without reading the SQLite files.
- **`examples/google-adk/`**: ADK `agent.py` with `MCPToolset` + Streamable HTTP + Workload Identity Federation token flow, `adk_agent_config.json`, and a comprehensive README covering prerequisites, `gcloud print-identity-token` dev flow, Gemini Enterprise Agent Gateway production notes, and quick-test prompts for all new features (ET₀, tasks, incremental snapshot).
- **`snapshots-audit.ts` v2**: `isManifest()` now accepts `schemaVersion 1 | 2`; audit summary line shows `last-incremental` date when `ManifestV2.lastIncrementalAt` is present.

## [1.0.1] — 2026-04-28 — Observability hardening + agri metrics

### Added
- **Tool metrics auto-instrumentation**: `tool_calls_total{tool,outcome}` and `tool_duration_ms{tool}` are now automatically incremented / observed for every registered MCP tool without per-tool code changes. The `_registry.ts` patches `server.registerTool` at registration time, wraps each handler, then restores the original. `deps.metrics` (optional `Metrics`) flows from `transport-http.ts` → `create-server.ts` → `deps`. The `/metrics` Prometheus endpoint now emits per-tool call counts and durations.
- Added `tests/unit/tool-metrics.test.ts` (4 scenarios) verifying end-to-end auto-instrumentation via `InMemoryTransport`.
- Added `CODEOWNERS` — all files owned by `@WIN-kagoshima/agriops-maintainers` (improves OSSF Scorecard Branch-Protection check).
- Added `.github/workflows/docker-multiarch.yml` — builds and pushes `linux/amd64 + linux/arm64` images to `ghcr.io/win-kagoshima/agriops-mcp` on SemVer tags (Docker layer cache via registry manifest; SBOM + provenance attestation via `docker/build-push-action`).
- Added `docs/architecture.md` — system diagram, request lifecycle, directory structure, adapter pattern, tool registration lifecycle, `search_farmland` data-flow trace, phase model, DI/testability pattern, security boundaries, and checklists for adding new tools and data sources.
- Added `examples/claude-desktop/` — `claude_desktop_config.json` snippets for stdio and Streamable HTTP modes, Cursor `.cursor/mcp.json` config, troubleshooting guide, and quick-test prompts.
- Expanded Server Card (`/.well-known/mcp-server.json`) with `clients` (known-tested MCP clients), `observability` (metrics/health/readiness URLs), `eval` (test-suite summary), and `container` (image reference, platforms, Node/distroless versions) sections.
- Added `tests/scenarios/` eval suite (4 files, 23 scenarios): `weather-risk`, `pesticide`, `staff-plan`, and `adversarial` multi-turn tests that exercise the complete Phase 0–5 tool surface with deterministic Kagoshima fixtures. Scenarios cover the canonical `search_farmland → get_weather_1km → get_pesticide_rules → open_dashboard` agent workflow and a 7-step adversarial escalation. Run with `npm run test:scenarios`.
- Added `scripts/snapshots-audit.ts` and `npm run snapshots:audit` — freshness and integrity gate for SQLite snapshot files. Checks manifest `generatedAt` age (default 90 days, configurable via `--max-age-days`), re-computes SHA-256, and verifies file-size consistency. Exits 1 on any failure so CI can gate on stale or corrupted snapshots.
- Added `docs/observability.md` covering `/livez`, `/readyz`, `/metrics` (Prometheus text format), log NDJSON fields, Cloud Logging / Google Managed Prometheus / Cloud Trace integration, rate-limiting parameters, snapshot freshness monitoring, and alerting recommendations.

### Changed
- `SECURITY.md`: updated supported-versions table to reflect `1.0.x` as current stable; `0.5.x` moved to security-patches-only; `0.4.x` marked end-of-life.
- Upgraded runtime from **Node.js 20 LTS** to **Node.js 22 LTS** across Dockerfile (all stages), CI workflows, and `package.json` `engines`. Distroless final image is now `gcr.io/distroless/nodejs22-debian12:nonroot`.
- Added `npm run test:scenarios` as an explicit script target (CI now runs it as a separate step after the main test run).
- CI runs `npm run test:scenarios` as a dedicated step so eval scenario regressions are clearly surfaced in the workflow summary.
- `deploy.yml` now runs `npm run snapshots:audit` before Cloud Build starts, surfacing stale snapshot manifests early (step is `continue-on-error` for first-time deploys that pre-date the manifest format).

## [1.0.0] — 2026-04-28 — Stable — public surface frozen

This release marks the first stable API surface. Tool names, prompt names, resource URIs, and input/output schemas are now frozen under SemVer. Breaking changes will require a `2.0.0`. The `0.x` series was explicitly experimental.

### Added
- Added `docs/cloud-next26-agent-readiness.md`, mapping Google Cloud Next '26 Agent Platform, Smart Storage, Fraud Defense, and multi-AI security announcements to AgriOps MCP adoption decisions.
- Snapshot builds now emit `*.sqlite.manifest.json` provenance files with source attribution, row counts, raw input hashes, and output hashes for GCS snapshot audit and future Smart Storage object-context workflows.
- Added optional `AGRIOPS_AGENT_ID_HEADER` / `AGRIOPS_AGENT_OWNER_HEADER` audit labels for trusted Agent Gateway or reverse-proxy deployments.
- GitHub Actions workflows now opt JavaScript actions into Node.js 24 with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` ahead of the GitHub-hosted runner Node 20 deprecation.
- The OSSF Scorecard workflow now supports `workflow_dispatch`, so operators can manually re-trigger Scorecard analysis after transient flakes.
- Added `tests/conformance/red-team.test.ts` (11 scenarios) that exercises prompt-injection / unbounded-`limit` / fractional-`limit` / path-traversal / oversized-input / secret-shaped-argument / size-cap / console-leak probes against the live MCP surface.
- Added `docs/agent-gateway-deployment.md` with concrete reverse-proxy / Agent Gateway placement guidance (NGINX, Envoy, Cloud Armor, Gemini Enterprise Agent Gateway), an endpoint exposure matrix, identity-header propagation notes, and a verification checklist.
- Added `examples/agent-workflow/` — a deterministic, key-free reference plan for `search_farmland → get_weather_1km → get_pesticide_rules → open_dashboard` with wiring guidance for Anthropic Claude / Google Gemini / OpenAI / ADK tool-use loops.

### Changed
- The OSSF Scorecard workflow's `Run analysis` step is now `continue-on-error`. SARIF is still uploaded to GitHub Code Scanning whenever the binary produced it, with a `::warning::` annotation on non-zero exit.
- `examples/stdio-typescript/run.mjs` now resolves the bundled server entry point via `fileURLToPath`, fixing a Windows-only "Connection closed" failure.

### Fixed
- `deploy:smoke` now supports `--expected-version`, and the Cloud Run deploy workflow uses it to fail fast if post-deploy smoke is still hitting an older revision.
- Bumped `ossf/scorecard-action` from `v2.4.0` to `v2.4.3` (Scorecard `v5.0.0` → `v5.3.0`).
- `surface-catalog.ts` now records `introduced: "0.5.1"` for `get_weather_warning`, matching when the JMA tool actually shipped.

## [0.5.2] — Patch — production deploy hardening

### Added — snapshot-backed production deploys
- Added `npm run release:check`, a release-readiness gate that validates package/tag/changelog consistency and `npm pack --dry-run` contents before publishing a GitHub Release.
- Added `.github/workflows/production-smoke.yml`, an hourly/manual production smoke workflow that mints a Cloud Run ID token through Workload Identity Federation and runs `deploy:smoke` against the IAM-protected service.
- Cloud Build can now restore baked SQLite snapshots from a GCS bucket before building the Cloud Run image, so GitHub Actions deploys stay `/readyz`-clean without committing generated database files.
- GitHub Actions deploys require `SNAPSHOT_BUCKET`, run `npm run deploy:preflight` before Cloud Build, and no longer pass `--allow-not-ready` to the deployment smoke test.
- `npm run deploy:preflight` now supports `--snapshot-bucket` and verifies the required `emaff-fude-kagoshima.sqlite` and `famic-pesticide-2026.sqlite` objects before deployment.
- The eMAFF snapshot builder accepts multiple raw GeoJSON/JSON files, including municipality JSON files extracted from the official Kagoshima ZIP.
- The npm package now includes `docs/**/*.md` and `examples/**/*`, so README links remain useful from the published tarball.

### Changed
- Cloud Run deployments are private by default; `cloudbuild.yaml` no longer requests `--allow-unauthenticated`.
- Security reporting contact is now `info@win-g-c.com` in both `SECURITY.md` and the Server Card.
- The JMA User-Agent now matches the package version.

### Fixed — Cloud Build / Cloud Run deploy path
- The release workflow now fails fast when a tag has no matching `CHANGELOG.md` section, preventing empty GitHub Release notes.
- `deploy:smoke` now validates live MCP `tools/list`, `prompts/list`, and `resources/list` in addition to `/livez`, `/readyz`, the Server Card, and `initialize`.
- `deploy:preflight` now checks deployer IAM for runtime `actAs`, Cloud Build worker `actAs`, self Token Creator for Cloud Run ID-token minting, and private Cloud Run `roles/run.invoker`.
- The runbook now records the first verified production baseline (Cloud Run URL, revision, image tag/digest, and smoke status), rollback inspection commands, scheduled smoke monitoring, and legacy `sugu-agri-*` cleanup candidates.
- HTTP curl examples now support `AGRIOPS_AUTH_BEARER`, so they can target the IAM-protected Cloud Run reference deployment.
- GitHub Actions smoke tests now mint a Cloud Run audience-bound ID token through `google-github-actions/auth@v2` instead of calling `gcloud auth print-identity-token`, which is unsupported for the generated WIF credential file. The runbook now documents the deployer's self `roles/iam.serviceAccountTokenCreator` binding used for this token minting.
- The runbook now documents the required `roles/iam.serviceAccountUser` bindings for the GitHub deployer service account on both the Cloud Run runtime service account and the Cloud Build worker service account. Without the latter, `gcloud builds submit` fails with `caller does not have permission to act as service account ...`.
- GitHub Actions deploys now use `cloudbuild.remote.yaml` with `gcloud builds submit --no-source`. The build clones the repository inside Cloud Build, restores snapshots from GCS, and then builds/deploys, fully bypassing managed `*_cloudbuild` source-staging bucket uploads that can be blocked by organization policy.
- `.dockerignore` now explicitly re-includes `snapshots/*.sqlite`, ensuring SQLite snapshots restored during Cloud Build are available to the Docker build context while raw snapshot archives remain excluded.
- `deploy:preflight` now downgrades the GCS bucket existence check to a `[WARN]` (instead of `[FAIL]`) when the deployer service account can read every required snapshot object but lacks `storage.buckets.get` on the bucket itself. Cloud Build's `restore-snapshots` step only needs object reads, so this avoids spurious deployment-blocking failures on least-privilege deployers.
- `deploy:preflight` and `deploy:smoke` now trim whitespace and CR/LF from CLI argument values, and the deploy workflow strips trailing newlines from secrets before invoking `gcloud`/preflight, preventing failures when GitHub Secrets are pasted with stray newlines.
- Documented the authenticated Cloud Scheduler `/livez` synthetic monitor used while organization policy blocks public Cloud Run invocation.
- GitHub Actions deploys now install smoke-test dependencies and verify the IAM-protected Cloud Run service after each deployment.
- Cloud Build deploys now include locally built `snapshots/*.sqlite` files while still excluding raw source archives, allowing operators to bake first-party snapshots into Cloud Run images.
- Snapshot builders now accept official eMAFF OD property names and official FAMIC Japanese CSV exports, including Shift_JIS-encoded files extracted from FAMIC ZIP downloads.
- Added `npm run deploy:preflight`, a GCP preflight checker for billing, required APIs, Artifact Registry, runtime service account, Secret Manager entries, and existing Cloud Run service URL. The runbook now starts with this diagnostic so operators get concrete fix commands before deployment.
- Added `npm run deploy:smoke`, a deployed-service smoke tester for `/healthz`, `/readyz`, Server Card, `/mcp` initialize, and optional `/metrics` bearer auth checks.
- Added `/livez` as a liveness alias for Cloud Run environments where organization or edge infrastructure intercepts `/healthz`; `deploy:smoke` now supports `--auth-bearer` and `--health-path`.
- `cloudbuild.yaml` now matches the runbook's `agriops-runtime` service-account name and `agriops-mcp` Artifact Registry repository.
- Cloud Build deploys now pass production HTTP env vars (`AGRIOPS_TRUST_PROXY`, rate-limit settings) and Secret Manager mappings (`AGRIOPS_TOKEN_ENC_KEY`, `SESSION_COOKIE_SECRET`) instead of silently falling back to dev defaults.
- `deploy.yml` now passes `--project=$PROJECT_ID` explicitly to `gcloud builds submit` and forwards the required Secret Manager substitution names.
- `npm run deploy` now refuses unsafe one-command source deploys and directs operators to the runbook, avoiding accidental Cloud Run deployments without secrets or the hardened image path.
- `docs/runbook.md` now includes exact `agriops-session-cookie-secret` creation commands and uses the same `agriops-mcp` Artifact Registry repository as `cloudbuild.yaml`.

## [0.5.1] — Patch — release hardening + Cloud Run image fix

### Security
- Refreshed vulnerable development dependencies (`@modelcontextprotocol/inspector`, Vite, Vitest, `@vitejs/plugin-react`) so `npm audit --audit-level=high` reports `found 0 vulnerabilities`.

### Fixed
- Docker image now runs `npm run build:all` during the build stage, so Cloud Run images include `dist/ui/dashboard.html` instead of falling back to the MCP Apps UI placeholder.
- Docker runtime stage now copies `node_modules` from a production-only dependency stage (`npm ci --omit=dev`) instead of shipping dev/test tooling in the distroless runtime image.
- Replaced stale `pnpm build:ui` references in the dashboard UI placeholder and comments with `npm run build:ui`.

### Added — MCP Spec 2025-11-25 §6.10 ToolAnnotations
- Every registered tool now exposes the official `ToolAnnotations` block (`readOnlyHint`, `idempotentHint`, `openWorldHint`, `destructiveHint`) on `tools/list`, so MCP hosts can correctly decide whether to require user confirmation before invocation.
- `src/server/surface-catalog.ts` is the single source of truth: each tool entry carries an `annotations` field plus three reusable presets (`READ_ONLY`, `READ_ONLY_REMOTE`, `DRAFT_NON_IDEMPOTENT`).
- `getToolAnnotations(name)` helper throws if the catalog and registration drift apart.
- `tests/conformance/tool-annotations.test.ts` (3 new tests) verifies that (a) every live tool advertises a complete annotations object, (b) hints agree with the internal `sideEffect` classification, and (c) `openWorldHint=true` exactly for tools that touch the network (Open-Meteo, JMA).
- The Server Card (`/.well-known/mcp-server.json`) now embeds annotations alongside `sideEffect`, so registries see the same hints clients see.
- `.github/CODEOWNERS` for spec-touching code, security paths, data-licence files, and infra.
- `.github/FUNDING.yml` placeholder.

### Added — production sidecars
- **Graceful shutdown** (`src/server/lifecycle.ts`): SIGTERM triggers a 8 s drain window. `/healthz` flips to 503 once draining. Inflight requests get to finish before the listening socket closes, matching Cloud Run's 10 s grace period.
- **Per-IP token-bucket rate limiter** (`src/server/rate-limit.ts`): `/mcp` is bounded by `AGRIOPS_RATE_RPS` / `AGRIOPS_RATE_BURST`. Rejected requests return JSON-RPC error `-32429`, `Retry-After`, and `X-RateLimit-Limit` / `X-RateLimit-Remaining`.
- **Adapter-aware `/readyz` probe**: enumerates each registered adapter (weather / JMA / eMAFF / FAMIC) and returns 503 with per-adapter reason strings when any is missing. Distinct from `/healthz` (liveness) per CNCF readiness conventions.
- **Prometheus `/metrics` endpoint** (`src/server/metrics.ts`): zero-dependency exposition with counters (`mcp_requests_total`, `rate_limited_total`, `tool_calls_total`) and histograms (`tool_duration_ms`, `http_request_duration_ms`). Bearer-token gated when `AGRIOPS_METRICS_BEARER` is set.
- **Tool result size cap** (`src/lib/tool-size.ts`): unbounded read tools (`search_farmland`, `area_summary`, `nearby_farms`, `get_pesticide_rules`) now fail closed with a structured `isError` if their JSON-serialised result exceeds 1 MiB, advising the model to lower `limit` or use `cursor` pagination.
- **`docs/runbook.md`**: end-to-end Cloud Run deploy procedure, env-var reference, SLO targets, incident triage flowchart, key rotation, snapshot rebuild, and disaster recovery RTO/RPO matrix.

### Added — earlier in this Unreleased window
- **`get_weather_warning` tool + `JmaWarningAdapter`**: surfaces active 警報・注意報 from the official JMA Disaster XML feed. Compliant with the Japan Meteorological Business Act: ≤10 minute cache, attribution baked into every response, no modification.
- **`FileTokenStore`**: AES-256-GCM encrypted file backend for `TokenStore`, with deterministic per-key filenames, atomic writes, scrypt-derived keys from `AGRIOPS_TOKEN_ENC_PASSPHRASE`, or a raw 32-byte base64 key from `AGRIOPS_TOKEN_ENC_KEY`. Refuses to start unless one is set.
- **X-Request-Id middleware**: Streamable HTTP now honours/echoes a stable per-request ID, plumbs it into `logger.child({ requestId })`, and surfaces it in error JSON-RPC `data.requestId`. Fulfils the contract that `safeErrorMessage` advertises ("report the request ID").
- `examples/` folder with three runnable clients: `stdio-typescript/` (`@modelcontextprotocol/sdk`), `stdio-python/` (`mcp[cli]`), and `http-curl/` (Bash + PowerShell scripts hitting `/mcp`).
- README badges: CI, CodeQL, OpenSSF Scorecard, npm version, Apache-2.0, Node ≥22, MCP Spec 2025-11-25, MCP Apps 2026-01-26.
- `.github/workflows/codeql.yml` (weekly + on PR) and `.github/workflows/scorecard.yml`.
- `npm audit signatures` step in CI (continues on error so missing provenance doesn't block PRs).
- `NOTICE` file documenting third-party data attribution (Open-Meteo, JMA, eMAFF, FAMIC).
- `.editorconfig` mirroring Biome formatter settings for non-Biome editors.
- `.npmignore` belt-and-suspenders to prevent dev artifacts leaking into npm tarballs.
- `docs/api-reference.md`: canonical reference for every model-visible / app-only tool, prompt, resource, error code, and `_meta` extension.
- `src/server/surface-catalog.ts`: single source of truth for tool / prompt / resource metadata (introduced version, side effect, visibility). The Server Card and conformance tests both read from this catalog.
- `tests/conformance/server-card.test.ts`: enforces that `.well-known/mcp-server.json` exactly matches the live `tools/list`, `prompts/list`, and `resources/list`. Phase 0 deployments without snapshots no longer falsely advertise farmland tools.
- `tests/smoke/http-security.test.ts`: spawns the real built server and confirms the Host header allowlist returns `421` for spoofed Host headers (DNS rebinding defense), and that legitimate `X-Request-Id` is reflected back.
- `tests/smoke/oauth-url-flow.test.ts`: full end-to-end `/connect` → mock authorize → `/callback` → token-store flow including session-cookie anti-phishing check.
- `tests/unit/{file-token-store,jma-warning,request-id}.test.ts`: 23 new unit tests covering encryption / tamper resistance, JMA feed parsing, and request-id middleware semantics.
- `tests/smoke/jma-tool.test.ts`: end-to-end MCP smoke for `get_weather_warning` including the disabled-adapter case.
- OSS scaffolding: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.{yml,yaml}`, `CODE_OF_CONDUCT.md`, `.github/dependabot.yml`.
- `.github/workflows/release.yml`: tag-driven release with version-vs-tag check, full test suite, and GitHub Release publication. npm publish gated on a repo variable so it stays opt-in.

### Changed
- `startHttp()` now returns an `HttpServerHandle` (`stop()` / `isStopped()` / `port`) so the entry point can drive cooperative shutdown. `server.ts` calls `stopHttp()` before `server.close()` on SIGINT/SIGTERM.
- `createServer()` now returns `{ server, deps, surface }` so callers can build a Server Card that reflects the actually-registered surface, and instantiates a `JmaWarningAdapter` by default.
- `mountConnectHandler` requires `elicitationStore` and `tokenStore` arguments; `transport-http.ts` constructs process-singleton stores so URL elicitation flows complete across the per-request McpServer instances used by the stateless transport. Token store backend is auto-selected: `FileTokenStore` when an encryption key is configured, `InMemoryTokenStore` otherwise (with a warning).
- `package.json` `files`/`prepack`/`prepublishOnly`: only ship compiled `dist/`, the inlined `dashboard.html`, license metadata, and snapshot README. `prepack` builds both server + UI; `prepublishOnly` runs lint + typecheck + tests.
- `useAppBridge.hasHost` exposed; the dashboard renders an explicit standalone-preview banner when no MCP Apps bridge is detected.
- Server Card data sources now include the JMA Disaster XML feed entry.

### Fixed
- Anti-phishing check in `/connect/{provider}`: stores were never actually wired through, so the same-user verification was effectively a no-op. Now enforced + covered by integration test.


## [0.5.0] — Phase 5 — MCP Apps UI dashboard + comprehensive test suite

### Added
- `ui://agriops/dashboard.html` resource: single-file React + MapLibre GL dashboard built with Vite + `vite-plugin-singlefile`.
- `open_dashboard` tool that returns `_meta.openWidget` for MCP Apps hosts and a structured-text fallback for others.
- App-only helper tools used by the UI (`fetch_field_geojson`, `fetch_weather_layer`, `select_field`, `list_prefectures`, `list_municipalities`, `search_operators`, `export_plan_csv`, `summarize_farmland`, `compute_ndvi_stub`).
- Standalone preview banner in the dashboard when no MCP Apps host bridge is detected (`useAppBridge.hasHost`).
- Conformance test suite (`tests/conformance/`):
  - `jsonrpc.test.ts` — serverInfo, capabilities, snake_case identifiers, JSON-Schema shape on every tool, safe error path on unknown tools.
  - `schemas.test.ts` — every tool's `inputSchema` is well-formed (`type:object` + properties + required[] consistency).
  - `secret-leakage.test.ts` — config secrets never leak through any catalog or tool result.
- Playwright UI smoke tests under `tests/ui/` exercising `dist/ui/dashboard.html` from `file://`.
- CI runs lint + typecheck + unit + smoke + conformance + secret-leakage grep + Inspector CLI smoke + Playwright UI as required jobs.

### Changed
- `useAppBridge` exposes `hasHost: boolean` so UI can render an explicit fallback banner.
- CI switched from pnpm to npm to match the actual lockfile in the repo.

## [0.4.0] — Phase 4 — Elicitation URL mode + OAuth

### Added
- `URLElicitationRequiredError` (`-32042`) for tools that require an external auth.
- `/connect/{provider}` HTTP handler with cookie-based same-user check before redirecting to OAuth.
- `notifications/elicitation/complete` notification on successful auth.
- Mock OAuth provider for local dev (`/__mock-oauth/*`).
- File-based encrypted token store under `.tokens/`.

## [0.3.0] — Phase 3 — Elicitation Form mode

### Added
- `create_staff_deploy_plan` (draft) tool that asks for `farm_selection` / `period_days` / `include_weekend` via Form elicitation when arguments are missing.
- `accept` / `decline` / `cancel` action handling and a fallback path for clients that do not support elicitation.

## [0.2.0] — Phase 2 — Prompts

### Added
- 5 user-controlled prompts: `field_summary`, `pesticide_advice`, `staff_deploy_plan`, `area_briefing`, `weather_risk_alert`.

## [0.1.0] — Phase 0 + Phase 1 — Core MCP server

### Added
- Initial release with stdio + Streamable HTTP transports.
- Tools: `get_weather_1km`, `search_farmland`, `area_summary`, `nearby_farms`, `get_pesticide_rules`.
- `.well-known/mcp-server.json` Server Card.
- eMAFF and FAMIC SQLite snapshot build pipeline under `scripts/build-snapshots/`.
- Cloud Run-ready Dockerfile and GitHub Actions deploy workflow.

[Unreleased]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.10.3...HEAD
[1.10.3]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.10.2...v1.10.3
[1.10.2]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.10.1...v1.10.2
[1.10.1]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v0.5.2...v1.0.0
[0.5.2]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.5.0
[0.4.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.4.0
[0.3.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.3.0
[0.2.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.1.0
