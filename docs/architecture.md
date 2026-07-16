# Architecture

AgriOps MCP is a Node.js server that implements the [Model Context Protocol spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) and the [MCP Apps Extension 2026-01-26](https://modelcontextprotocol.io/specification/apps/2026-01-26). It exposes agricultural data from Japanese public open-data sources to AI agents via a well-defined tool, prompt, and resource surface.

## System diagram

```
                  ┌──────────────────────────────────────────────┐
  AI Agent        │              AgriOps MCP server               │
  (Claude /  ────▶│  MCP endpoint  ┌──────────────────────────┐  │
   Gemini /       │  /mcp          │  Tool dispatch            │  │
   OpenAI /       │                │  search_farmland          │──│──▶ eMAFF SQLite
   ADK)           │  ─────────────▶│  nearby_farms             │  │    snapshot
                  │                │  area_summary             │  │
                  │                │  get_weather_1km          │──│──▶ Open-Meteo API
                  │                │  get_weather_warning      │──│──▶ JMA XML feed
                  │                │  get_pesticide_rules      │──│──▶ FAMIC SQLite
                  │                │  create_staff_deploy_plan │  │    snapshot
                  │                │  open_dashboard           │  │
                  │                │  …(8 core tools; extended/│  │
                  │                │   legacy tiers opt-in)…   │  │
                  │                └──────────────────────────┘  │
                  │                                              │
                  │  /.well-known/mcp-server.json  (Server Card) │
                  │  /livez  /readyz  /metrics  (ops endpoints)  │
                  └──────────────────────────────────────────────┘
                           │                 ▲
               (optional)  ▼                 │
                  ┌──────────────────┐  ┌───────────────────────┐
                  │  Agent Gateway   │  │  Prometheus / Cloud   │
                  │  (NGINX / Envoy /│  │  Monitoring scrape    │
                  │   Cloud Armor /  │  │  /metrics every 60s   │
                  │   Gemini Gateway)│  └───────────────────────┘
                  └──────────────────┘
```

## Request lifecycle (Streamable HTTP)

```
Client ──POST /mcp──▶ Lifecycle.middleware (503 if draining)
                    ──▶ RateLimiter.middleware (429 if over limit)
                    ──▶ Host allowlist check (421 if misdirected)
                    ──▶ createServer() — fresh McpServer per request
                    ──▶ StreamableHTTPServerTransport.handleRequest()
                    ──▶ Tool / Prompt / Resource handler
                    ──▶ Adapter (Weather / JMA / eMAFF / FAMIC)
                    ──▶ StreamableHTTP response (SSE or JSON)
```

Each HTTP request gets its own `McpServer` instance. This **stateless per-request model** is intentional:

- Cloud Run scale-to-zero means there is no reliable process-level session state.
- The pattern follows the official MCP `simpleStatelessStreamableHttp.ts` example.
- The process-singleton stores (`ElicitationStore`, `TokenStore`) are shared across instances on the same process, not across processes.

## Directory structure

```
src/
├── adapters/
│   ├── _interface.ts       ← Adapter interfaces (no concrete classes)
│   ├── open-meteo.ts       ← Weather: Open-Meteo REST API
│   ├── jma.ts              ← JMA XML weather warnings
│   ├── emaff-sqlite.ts     ← eMAFF farmland: better-sqlite3 snapshot
│   └── famic-sqlite.ts     ← FAMIC pesticide: better-sqlite3 snapshot
├── auth/
│   ├── file-token-store.ts ← Encrypted file-backed OAuth token store
│   └── token-store.ts      ← In-memory token store (dev/test)
├── elicitation/
│   └── store.ts            ← In-memory elicitation session store
├── lib/
│   ├── cache.ts            ← TTL cache used by weather adapters
│   ├── config.ts           ← env-var config with sensible defaults
│   ├── errors.ts           ← safeErrorMessage: redact stack/secrets
│   ├── geo.ts              ← LatLng, haversine distance
│   ├── logger.ts           ← Pino-compatible NDJSON logger
│   ├── metrics.ts          ← (not used; see src/server/metrics.ts)
│   ├── rate-limit.ts       ← (not used; see src/server/rate-limit.ts)
│   └── tool-size.ts        ← enforceSizeCap: 1 MiB output guard
├── prompts/
│   ├── _registry.ts        ← Registers all 5 Phase 2 prompts
│   ├── field-summary.ts
│   ├── pesticide-advice.ts
│   ├── staff-deploy-plan.ts
│   ├── area-briefing.ts
│   └── weather-risk-alert.ts
├── resources/
│   └── dashboard-ui.ts     ← Phase 5 MCP resource (HTML blob)
├── server/
│   ├── connect-handler.ts  ← /connect route (Elicitation URL mode)
│   ├── create-server.ts    ← Factory: returns McpServer + Deps
│   ├── deps.ts             ← Deps interface (DI container)
│   ├── lifecycle.ts        ← Graceful shutdown + drain
│   ├── metrics.ts          ← Zero-dep Prometheus exporter
│   ├── mock-oauth.ts       ← Dev-only OAuth stub
│   ├── rate-limit.ts       ← Token-bucket per-IP rate limiter
│   ├── request-id.ts       ← X-Request-ID middleware
│   ├── surface-catalog.ts  ← Tool metadata registry (annotations etc.)
│   ├── transport-http.ts   ← Express app + Streamable HTTP
│   ├── transport-stdio.ts  ← stdio transport for Claude Desktop etc.
│   └── well-known.ts       ← Server Card generation
├── tools/
│   ├── _registry.ts        ← Registers all tools conditionally
│   ├── area-summary.ts
│   ├── get-pesticide-rules.ts
│   ├── get-weather-1km.ts
│   ├── get-weather-warning.ts
│   ├── nearby-farms.ts
│   ├── open-dashboard.ts   ← Phase 5 MCP Apps tool
│   ├── search-farmland.ts
│   └── …
├── types/
│   ├── common.ts
│   ├── farmland.ts         ← Zod schema + TypeScript types
│   ├── pesticide.ts
│   └── weather.ts
└── ui/
    ├── Dashboard.tsx       ← Phase 5 React + MapLibre GL UI
    └── …
```

## Adapter pattern

Tools depend on adapter **interfaces** (`src/adapters/_interface.ts`), never on concrete implementations:

```typescript
// Tool only knows the interface
export interface EmaffAdapter {
  search(input: { query?: string; prefectureCode?: string; limit: number; … }): Promise<FarmlandSearchResult>;
  get(fieldId: string): Promise<Farmland | null>;
  nearby(center: LatLng, radiusMeters: number, limit: number): Promise<FarmlandSearchResult>;
  areaSummary(input: { prefectureCode?: string; cityCode?: string }): Promise<AreaSummary>;
}
```

The concrete adapters (`emaff-sqlite.ts`, `open-meteo.ts`, etc.) implement these interfaces. `createServer()` wires the adapters to the tools via the `Deps` container.

This means:
- Tests inject mock adapters via `overrides` in `createServer()`.
- A cloud database or REST-API adapter can replace the SQLite adapter without changing any tool code.
- Tools are unavailable (`registerTool` is skipped) when their required adapter is `null`.

## Tool registration lifecycle

```
createServer(config, logger, version, overrides?)
  → buildDeps()              — instantiate or reuse adapters
  → new McpServer(serverInfo, capabilities)
  → registerAllTools(server, deps)
      for each tool:
        if deps.emaff == null → skip  (e.g. search_farmland)
        else server.registerTool(name, schema, handler)
  → registerAllPrompts(server, deps)
  → registerAllResources(server, deps)
  → return { server, deps, surface }
```

`surface` is a string array of registered tool/prompt/resource names used by the Server Card (`/.well-known/mcp-server.json`) to report the live capability set.

### Tool surface tiers (since 1.12.0)

Registration is gated on three independent axes, checked in `src/tools/_registry.ts`:

1. **Adapter presence** (`deps.emaff`, `deps.famic`, `deps.jma`, `deps.estat`) — unchanged since Phase 0/1.
2. **`config.enableExtendedTools`** (env `AGRIOPS_ENABLE_EXTENDED_TOOLS`, default `false`) — the Tasks Primitive, derived agronomy tools, `snapshot_status`, and the Phase 12 IoT layer.
3. **`config.enableLegacyTools`** (env `AGRIOPS_ENABLE_LEGACY_TOOLS`, default `false`) — the seven tools already flagged `deprecated: true` in `surface-catalog.ts`.

With both flags `false` (the default), exactly 8 model-visible tools register when all adapters are present. This is the surface an Anthropic Connectors Directory reviewer or a first-time agent sees; rationale in [`docs/anthropic-directory-submission.md`](anthropic-directory-submission.md). No tool was renamed, and no schema changed — `TOOL_METADATA` in `surface-catalog.ts` is untouched. `tests/conformance/directory-surface.test.ts` pins the default 8-tool set; `vitest.config.ts` sets both flags to `true` for the rest of the suite so the extended/legacy tools stay covered by their existing tests.

## Data flow: `search_farmland`

```
Agent calls tools/call { name: "search_farmland", arguments: { prefectureCode: "JP-46", limit: 5 } }
  → Zod inputSchema.safeParse(raw)              — validates + coerces
  → enforceSizeCap(result, MAX_BYTES)            — 1 MiB output guard
  → deps.emaff.search({ prefectureCode, limit })
      → better-sqlite3: SELECT … FROM fude …
         WHERE prefecture_code = 'JP-46' LIMIT 5
  → FarmlandSearchResultSchema.parse(rows)       — validates adapter output
  → { content: [{ type: "text", text: … }], structuredContent: … }
```

The two-layer validation (input Zod at boundary + output Zod at adapter) prevents type smuggling even if an adapter returns malformed data.

## Phase model

| Phase | Version | Capability added |
|---|---|---|
| 0 | `0.1.x` | stdio + Streamable HTTP, Server Card, 5 core tools |
| 1 | `0.1.x` | eMAFF / FAMIC SQLite adapters, geospatial search |
| 2 | `0.2.x` | 5 user-controlled prompts |
| 3 | `0.3.x` | Elicitation Form mode |
| 4 | `0.4.x` | Elicitation URL mode, OAuth Client Credentials |
| 5 | `0.5.x` | MCP Apps UI dashboard (React + MapLibre GL) |
| **Stable** | **`1.0.x`** | **All surfaces frozen under SemVer** |
| Future | `1.x.x` | Additive only: new tools/prompts/resources |

## Dependency injection and testability

`createServer()` accepts an `overrides` object:

```typescript
const { server } = createServer({
  config,
  logger,
  version: "1.0.0-test",
  overrides: {
    weather: mockWeatherAdapter,   // inject a mock
    emaff:   mockEmaffAdapter,
    famic:   mockFamicAdapter,
    jma:     mockJmaAdapter,
  },
});
```

All tests (`tests/unit/`, `tests/smoke/`, `tests/conformance/`, `tests/scenarios/`) use this pattern with `InMemoryTransport` from the MCP SDK. No network calls, no SQLite files, no running server required.

## Security boundaries

| Boundary | Mechanism |
|---|---|
| Input size | Zod `.max()` on all string fields; 1 MiB output cap via `enforceSizeCap` |
| Path traversal / injection | Regex-validated fields (e.g. `^JP-\d{2}$`); parameterised SQL |
| Secret leakage | `safeErrorMessage()` strips stack traces; `secret-leakage.test.ts` asserts no env var patterns escape |
| Rate limiting | Per-IP token bucket (default 10 req/s, burst 30) |
| Host rebinding | `StreamableHTTPServerTransport` `allowedHosts` + Express host check |
| Supply chain | OSSF Scorecard CI job; `npm audit signatures` on every CI run |

For Agent Gateway placement and policy enforcement, see [`docs/agent-gateway-deployment.md`](./agent-gateway-deployment.md).

## Adding a new tool (checklist)

1. Create `src/tools/my-new-tool.ts` following the existing pattern:
   - Export `meta` (ToolMeta), `inputSchema` (Zod), `registerMyNewTool` function.
   - Gate registration on `deps.myAdapter !== null`.
2. Add an entry to `src/server/surface-catalog.ts` (`TOOL_METADATA`).
3. Register in `src/tools/_registry.ts`.
4. Add adapter interface method to `src/adapters/_interface.ts` if needed.
5. Write unit tests in `tests/unit/my-new-tool.test.ts` using mock adapters.
6. Add a scenario in `tests/scenarios/` if the tool participates in a multi-tool workflow.
7. Update `CHANGELOG.md` and `src/server/well-known.ts` `tools` list.

## Adding a new data source (checklist)

1. Add an entry to `docs/data-license.md` (redistribution rights, caching policy, attribution).
2. Implement the adapter interface in `src/adapters/my-source.ts`.
3. Add the `MyAdapter` interface to `src/adapters/_interface.ts`.
4. Add `myAdapter: MyAdapter | null` to `Deps` in `src/server/deps.ts`.
5. Wire it in `src/server/create-server.ts`.
6. Update `.well-known/mcp-server.json` `data_sources` and the Server Card generator.

PRs that add data sources without `docs/data-license.md` entries are closed per [`CONTRIBUTING.md`](../CONTRIBUTING.md).
