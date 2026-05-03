# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

From `1.0.0` onward, tool names, input/output schemas, resource URIs, and prompt names are **stable** under Semantic Versioning. Breaking changes require a major version bump.

Pre-`1.0.0` releases were explicitly **experimental**.

## [Unreleased]

### Added
- **`snapshot_status` tool** (phase 5, model-visible, read-only): reports freshness, row counts, and attribution for eMAFF/FAMIC SQLite snapshots by reading their companion manifest JSON files. Returns `ageHours`, `stale` flag, `lastIncrementalAt`, and attribution for each snapshot. Accepts a configurable `staleAfterHours` threshold (default: 2160 h / 90 days). Enables agents to verify data currency before making time-sensitive agricultural decisions.
- **`outputSchema` on four core tools**: `get_weather_1km`, `search_farmland`, `area_summary`, and `get_weather_warning` now declare `outputSchema` in their `registerTool` config. Hosts that support the MCP 2025-03-26 spec can validate/parse structured tool output without relying on free-text content.
- **`create_task` args schema tightened**: `args` field changed from `Record<string, unknown>` to a typed Zod object with `prefecture_code`, `city_code`, and `delay_ms` properties, each with regex/range validation. Removes implicit `as unknown` casts and improves LLM hint quality.
- **JMA user-agent version is now dynamic**: `JmaWarningAdapter` accepts an optional `version` parameter (passed from `create-server.ts` via `deps.version`) and uses it in the `User-Agent` header instead of the previously hardcoded `0.5.1`.

### Changed
- `surface-catalog.ts`: added `snapshot_status` tool metadata entry (`introduced: "1.2.0"`, `read-only`, `model` visibility).

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

## [1.0.0] — Stable — public surface frozen

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
- README badges: CI, CodeQL, OpenSSF Scorecard, npm version, Apache-2.0, Node ≥20, MCP Spec 2025-11-25, MCP Apps 2026-01-26.
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

[Unreleased]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v0.5.2...v1.0.0
[0.5.2]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/WIN-kagoshima/agriops-mcp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.5.0
[0.4.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.4.0
[0.3.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.3.0
[0.2.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/WIN-kagoshima/agriops-mcp/releases/tag/v0.1.0
