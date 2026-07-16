# AGENTS.md

This file is the entry point for **AI coding assistants** (Cursor Composer/Agent, Claude Code, OpenAI Codex CLI, etc.) working in this repository. Read it before doing anything else.

## What this project is

`@sugukuru/agriops-mcp` is an **MCP server** (Model Context Protocol) that exposes Japanese agricultural data — farmland polygons, weather, pesticide registrations — as tools, resources, prompts, and an MCP Apps UI dashboard.

The audience is agricultural staffing companies that dispatch Specified Skilled Workers (特定技能 / SSW). The server is also a **reference implementation** of the official MCP spec, so spec compliance is a first-class goal.

## Authoritative specs (always trust these over any other source)

- MCP Spec: <https://modelcontextprotocol.io/specification/latest> (currently 2025-11-25)
- MCP Apps Extension: <https://github.com/modelcontextprotocol/ext-apps> (stable spec 2026-01-26)
- MCP TypeScript SDK v1.x: <https://modelcontextprotocol.github.io/typescript-sdk/index.html>
- 2026 roadmap: <https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/>

When the spec and a comment in this repo disagree, the spec wins. Open an issue and update the comment.

## Mandatory reading before editing code

1. `.cursor/rules/00-project-overview.mdc` — what this project does and where things live.
2. `.cursor/rules/01-design-principles.mdc` — the official 8 design principles applied to this project.
3. `.cursor/rules/03-mcp-tool-rules.mdc` — naming, schema, visibility, and error conventions for tools.
4. `.cursor/rules/06-data-license.mdc` — every data source has a license; do not break the table.
5. `docs/data-license.md` — the canonical table of redistribution / caching / attribution rules.

## What you must NOT do

- Do not change the **name** or **shape** of an already-published tool (CHANGELOG.md is the source of truth for "published"). Add a new tool instead, then deprecate.
- Do not invent a new MCP primitive or extension. Compose using `tools` / `resources` / `prompts` / `MCP Apps UI`.
- Do not paper over current model limitations with hidden "hint" tools. Capability over compensation.
- Do not mix Phase 7+ (paid data, e.g. WAGRI) code into Phase 0–5 paths. Use the adapter interface.
- Do not put secrets, OAuth tokens, or any user-identifiable data in tool output, logs, error messages, or the MCP Apps UI bundle.
- Do not return unbounded results. Default `limit` is 20, hard max 100. Use `cursor` for pagination.
- Do not break `.well-known/mcp-server.json`. It is the public contract for registries and crawlers.

## Recommended workflow

1. Read the issue and find the relevant rule files.
2. Read the relevant adapter under `src/adapters/` to understand the data shape.
3. Write tests first (`tests/unit/...` or `tests/smoke/...`) using Vitest.
4. Implement.
5. Run `npm run lint && npm run typecheck && npm test` until green.
6. Update `CHANGELOG.md` (Keep a Changelog format).
7. If a tool's contract changed, also update `.well-known/mcp-server.json`.

## Phase / version map

The current phase is encoded in `package.json` `version`:

| Version range | Phase | Capability surface |
|---|---|---|
| `0.1.x` | Phase 0–1 | stdio + Streamable HTTP, 5 tools, Server Card |
| `0.2.x` | Phase 2 | + 5 prompts |
| `0.3.x` | Phase 3 | + Elicitation Form mode |
| `0.4.x` | Phase 4 | + Elicitation URL mode + OAuth Client Credentials |
| `0.5.x` | Phase 5 | + MCP Apps UI dashboard |
| `0.6.x` | Phase 6 | + Tasks primitive |
| **`1.0.0`** | **Stable** | **Surface frozen under SemVer.** |
| `1.1.x`–`1.11.x` | Stable+ | Additive: Tasks Primitive, derived agronomy tools, market/SSW/e-Stat tools (Phase 7–11), Precision Ag/IoT layer (Phase 12), 戦略室 UI. |
| **`1.12.x`** | **Stable+ (current) — Directory-ready default surface** | Default model-visible surface slimmed to **8 core tools** (see table below) for the Anthropic Connectors Directory / reference-quality bar. No tool was renamed or removed — `AGRIOPS_ENABLE_EXTENDED_TOOLS=true` and `AGRIOPS_ENABLE_LEGACY_TOOLS=true` restore the full Phase 6–12 + deprecated surface for operators who relied on the previous default. See [`docs/anthropic-directory-submission.md`](docs/anthropic-directory-submission.md). |
| `2.0.0+` | Next major | Breaking surface changes allowed. |

From `1.0.0` the surface is **stable** under SemVer. Breaking changes require a major version bump. Add new tools/prompts/resources — do not rename or remove published ones. Since `1.12.0`, **default registration** of non-core tools also requires opt-in (see above) — this is a registration-policy change, not a schema/name break.

### Default (Directory-facing) model-visible tools

No env vars set — this is what a fresh connection, MCP Inspector, or an Anthropic Directory reviewer sees:

| Tool | Requires |
|---|---|
| `get_weather_1km` | — |
| `get_weather_warning` | JMA adapter |
| `search_farmland` | eMAFF snapshot |
| `area_summary` | eMAFF snapshot |
| `nearby_farms` | eMAFF snapshot |
| `get_pesticide_rules` | FAMIC snapshot |
| `create_staff_deploy_plan` | eMAFF snapshot |
| `open_dashboard` | — |

`AGRIOPS_ENABLE_EXTENDED_TOOLS=true` adds the Tasks Primitive, derived agronomy tools (`crop_calendar`, `spray_window`, ...), `snapshot_status`, and the Phase 12 IoT layer. `AGRIOPS_ENABLE_LEGACY_TOOLS=true` adds the seven tools already flagged `deprecated: true` in `surface-catalog.ts` (market/SSW/municipality/e-Stat). Both default to `false`. See `src/tools/_registry.ts` and `src/lib/config.ts`.

## Where things live

```
src/
  server/         # McpServer wiring, transports, well-known, connect handler
  tools/          # One file per tool. Group by phase in registry.
  prompts/        # One file per prompt (Phase 2).
  elicitation/    # form / url helpers (Phase 3+).
  adapters/       # Data source adapters with a stable interface.
  auth/           # Token store + OAuth client (Phase 4+).
  ui/             # MCP Apps React UI (Phase 5). Built to dist/ui/dashboard.html.
  lib/            # Cache, rate limit, geo math, logger, errors, config.
  types/          # Shared types.
scripts/build-snapshots/   # Reproducible eMAFF/FAMIC SQLite builds.
tests/{unit,smoke,conformance,ui}/
docs/             # data-license.md, architecture.md, phase-plan.md.
.well-known/      # Static Server Card snapshot (fallback for repo crawlers; live endpoint is authoritative).
```

The static `.well-known/mcp-server.json` is generated by `npm run snapshot:well-known` (`scripts/generate-well-known-snapshot.ts`) and reflects the default (no env flags) 8-tool surface. Regenerate it whenever the default surface, prompts, or resources change.

## Quick commands

```bash
npm install              # one-time
npm run dev              # stdio dev server
npm run dev:http         # Streamable HTTP dev server (Phase 1+)
npm test                 # vitest run (unit + smoke + conformance)
npm run test:ui          # Playwright UI smoke against dist/ui/dashboard.html
npm run inspector        # MCP Inspector against built server
npm run snapshots:build  # build local SQLite snapshots
npm run build:all        # tsc + ui bundle
```
