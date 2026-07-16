# Phase plan

Canonical phase → version → capability map for AgriOps MCP. `AGENTS.md`'s "Phase / version map" and `README.md`'s phase table are summaries of this document; if they disagree, this file wins and the others should be corrected.

| Phase | Version | Capability added | Status |
|---|---|---|---|
| 0 | `0.1.0` | stdio transport, `get_weather_1km` | Shipped |
| 1 | `0.1.x` | + Streamable HTTP, Server Card, `search_farmland`/`area_summary`/`nearby_farms`/`get_pesticide_rules`, `get_weather_warning` (JMA) | Shipped |
| 2 | `0.2.x` | + 5 user-controlled prompts (slash commands) | Shipped |
| 3 | `0.3.x` | + Elicitation Form mode (`create_staff_deploy_plan`) | Shipped |
| 4 | `0.4.x`–`1.1.x` | + Elicitation URL mode, OAuth Client Credentials demo, Tasks Primitive (`create_task`/`get_task_status`, `tasks://{id}`) | Shipped |
| 5 | `0.5.x`–`1.10.x` | + MCP Apps UI dashboard (React + MapLibre GL), 戦略室 UI 2.0 (municipality drill-down, adaptive visualizations) | Shipped |
| **Stable** | **`1.0.0`** | **Tool names, schemas, resource URIs, and prompt names frozen under SemVer** | Shipped |
| 6 | `1.4.x`–`1.5.x` | + derived agronomy tools: `crop_calendar`, `field_weather_report`, `spray_window`, `multi_field_compare`, `seasonal_risk_forecast` | Shipped (now extended-tier, see Phase 12.1) |
| 7 | `1.6.x`–`1.7.x` | + Sugu-kuru regional expansion: `get_market_price`, `get_prefecture_crop_profile` (deprecated), `optimize_harvest_timing` | Shipped (market/SSW price tools now legacy-tier) |
| 8–9 | `1.8.x`–`1.9.x` | + SSW strategic intelligence: `get_ssw_crop_compatibility`, `get_labor_shortage_stats`, `get_livestock_regional_stats` (all deprecated) | Shipped (legacy-tier) |
| 10 | `1.10.0` | + municipality drill-down (`get_municipality_stats`, deprecated), TopoJSON resource templates | Shipped (legacy-tier) |
| 11 | `1.11.0` | + `get_estat_stats` (e-Stat live government statistics, deprecated) | Shipped (legacy-tier) |
| 12 | `1.12.0`-pre | + Precision Agriculture & IoT Unified Layer (`get_realtime_sensor_data`, `get_machine_iot_status`, `predict_labor_demand`, `plan_irrigation`, `generate_subsidy_application`, `get_traceability_report`) | Shipped (now extended-tier, see Phase 12.1) |
| 12.1 | `1.12.0` | Directory & reference-quality surface: default model-visible tools slimmed to the 8-tool core; `AGRIOPS_ENABLE_EXTENDED_TOOLS`/`AGRIOPS_ENABLE_LEGACY_TOOLS` restore the rest; Privacy Policy; Anthropic Connectors Directory submission packet | Shipped |
| 13 | `1.13.0` | `completions` capability: `farmland://{fude_id}` Resource Template with a live `complete` handler, `area_briefing`'s `prefecture` prompt argument wrapped in `completable()` — closes the 7th and final MCP primitive gap (Tools, Prompts, Resources, Resource Templates, Completion, Logging, Pagination all genuinely active) | Shipped |
| 14 | `1.14.0` | Craft signals: fast-check property-based tests for geo/pagination, a shared non-empty-`attribution` Zod schema across all licensed-source output types, a tinybench p50/p95/p99 latency table for the core tools in README, and a hard-gated Inspector `tools/list` smoke check in CI | Shipped |
| 15 | `1.14.1` | Anthropic submission packet verification: description audit against Directory rejection patterns, local Inspector `tools/list`/`tools/call` pass confirming the 8-tool default surface end-to-end, MCP Apps screenshot recipe validated. Remaining items (org Directory-management access, anonymous Cloud Run endpoint) are manual/ops, tracked in `docs/anthropic-directory-submission.md` | Shipped |
| **16** | **`1.14.2`** | **Narrative & community distribution: Zenn (canonical)/dev.to/note/Show HN drafts under `docs/articles/`, README Demo + Roadmap sections, PRs opened against `awesome-mcp-servers` and `awesome-agriculture`. Remaining items (actually posting to Zenn/dev.to/HN/note, recording the demo GIF, npm re-publish) are manual/content-ops, tracked in `docs/go-to-market.md`** | **Current** |
| Future | `1.x.x` | Additive only: new tools/prompts/resources, no renames or removals | Ongoing |
| Next major | `2.0.0+` | Breaking surface changes allowed (e.g. WAGRI/Phase 7+ paid-data adapter with real user-consent OAuth) | Not started |

## Why 12.1 exists as its own phase

Phases 6–12 shipped real product features additively, which is correct per SemVer — but it also grew the *default* model-visible surface to ~30 tools, well past this repo's own "~7 model-visible tools" guideline in [`.cursor/rules/03-mcp-tool-rules.mdc`](../.cursor/rules/03-mcp-tool-rules.mdc) and past what an Anthropic Connectors Directory reviewer or a first-time agent should have to reason over. Phase 12.1 does not remove or rename anything (Stability principle); it changes the *default registration policy* via two opt-in env flags. See [`docs/anthropic-directory-submission.md`](anthropic-directory-submission.md) and [`docs/architecture.md`](architecture.md#tool-surface-tiers-since-1120) for the mechanism, and [AGENTS.md](../AGENTS.md) for the operator-facing summary.

## Phase 13 (Completion primitive)

MCP defines 7 primitives (Tools, Prompts, Resources, Resource Templates, Completion, Logging, Pagination). Phase 13 activated the last of these:

- `completions` capability is negotiated by the SDK automatically because at least one completable prompt argument or resource-template variable is registered — no manual capability flag to keep in sync.
- `farmland://{fude_id}` read-only Resource Template (`src/resources/farmland-template.ts`), with a `complete` handler for `fude_id` that proxies to the `emaff` adapter's search.
- `area_briefing`'s `prefecture` prompt argument is wrapped in the SDK's `completable()` (`src/prompts/area-briefing.ts`), backed by the shared table in `src/lib/prefectures.ts`.
- Conformance: `tests/conformance/completion.test.ts` exercises `completion/complete` for both `ref/prompt` and `ref/resource`, plus the found/not-found `farmland://` read paths.

This was scoped as its own phase (not folded into 12.1) because it is a genuine new capability addition, not a registration-policy change.

## Phase 14 (Craft signals)

Time-boxed to the highest-leverage senior-developer trust signals, per the plan's "Tier-S 最短" guidance (mutation testing / full SLSA L3 are explicitly deferred, not blockers):

- **fast-check property-based tests** (`tests/unit/geo.pbt.test.ts`, `tests/unit/pagination.pbt.test.ts`) on the two smallest, highest-fan-in pure-function modules — geo math (`src/lib/geo.ts`) and the offset-cursor codec (`src/lib/pagination.ts`, newly extracted from two duplicated adapter-local copies).
- **Attribution required at the schema level**: `src/lib/attribution.ts`'s `AttributionSchema` (`.min(1)`) replaces bare `z.string()` on every output type from a licensed source, closing the gap between `docs/data-license.md`'s stated requirement and what Zod actually enforced. `tests/conformance/attribution.test.ts` covers both the schema invariant and the live end-to-end tool path.
- **tinybench benchmark** (`scripts/bench.ts`, `npm run bench`): p50/p95/p99 for `search_farmland` and `get_weather_1km`, published in README.md / README.ja.md.
- **Inspector hard gate**: `.github/workflows/ci.yml`'s `tools/list` smoke step no longer has `continue-on-error: true` — a broken tool surface fails CI.
