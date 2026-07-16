<!--
Canonical source is the Japanese Zenn article at ./zenn-mcp-7-primitives.ja.md.
This is an English adaptation (not a literal translation) for dev.to. Publish
by copy-pasting the body below into a new dev.to post. Keep both in sync when
either changes; the Zenn post links back here and vice versa.

Suggested dev.to front matter (dev.to uses its own editor, this is for
reference / for the dev.to CLI):

title: Wiring Japan's public agriculture data into MCP's 7 primitives
published: false
tags: mcp, typescript, opensource, ai
canonical_url: https://zenn.dev/<handle>/articles/<slug>
-->

# Wiring Japan's public agriculture data into MCP's 7 primitives

*This is an English adaptation of a Japanese article originally published on [Zenn](https://zenn.dev). The canonical source lives alongside the code at [`docs/articles/zenn-mcp-7-primitives.ja.md`](https://github.com/WIN-kagoshima/agriops-mcp/blob/main/docs/articles/zenn-mcp-7-primitives.ja.md).*

## Scope

Most MCP (Model Context Protocol) servers I've read stop at `tools`. The spec actually defines seven primitives: `tools`, `prompts`, `resources`, `resource templates`, `completion`, `logging`, and `pagination`.

[AgriOps MCP](https://github.com/WIN-kagoshima/agriops-mcp) is a server I built to connect Japanese farmland polygon data (eMAFF Fude), 1km-mesh weather forecasts (Open-Meteo / JMA), and pesticide registration records (FAMIC) to AI agents — originally for planning where to dispatch Specified Skilled Worker (SSW) agricultural staff. This post is a record of the concrete design decisions it took to get all seven primitives genuinely active, not just declared. Everything is open source (Apache-2.0), so the links below go straight to working code.

## Why stopping at Tools isn't enough

From an LLM agent's point of view, `tools` is just a set of function calls. But a real-world MCP server keeps running into requirements that Tools alone represents awkwardly:

- **User-initiated fixed workflows** ("give me today's field briefing") → `prompts` (slash commands)
- **Cacheable, read-only reference data** (prefecture list, license terms) → `resources`
- **Look-up-by-ID reads** (this one farmland polygon) → `resource templates`
- **Input autocomplete** (start typing a prefecture name, get suggestions) → `completion`
- **Progress / rate-limit notifications** → `logging`
- **Safely returning large result sets** → `pagination`

Deferring these just pushes the burden onto the client (i.e., the model's own context), which costs both tokens and correctness. "Capability over compensation" — don't paper over a model's current limitations with a hidden hint tool; solve it with the protocol feature the spec already gives you. That principle guided every decision below.

## Tools: deliberately shrinking to ~8

The first version of AgriOps grew organically to nearly 30 model-visible tools (including 7 deprecated ones), simply by turning every feature into a tool. That directly conflicts with the [Anthropic Connectors Directory review criteria](https://claude.com/docs/connectors/building/review-criteria): a reviewer calls every tool once to confirm it succeeds, so tool count is literally review cost — and it's also selection cost for the model.

Laying out the actual user job (find farmland → check weather/risk → check pesticide rules → draft a deployment plan → open the dashboard) it turned out 8 tools covered the whole flow:

```
search_farmland / nearby_farms / area_summary
get_weather_1km / get_weather_warning
get_pesticide_rules
create_staff_deploy_plan
open_dashboard
```

The derived/composite tools (crop calendar, spray-window checks, multi-field comparison, etc.) and the legacy tools (old market-price and SSW-market endpoints) weren't deleted or renamed — they're gated behind opt-in env flags (`AGRIOPS_ENABLE_EXTENDED_TOOLS`, `AGRIOPS_ENABLE_LEGACY_TOOLS`), so existing self-hosted operators keep exactly the surface they had. Once a tool name or schema ships, we don't break it — that's a separate concern from trimming what the *default* Directory-facing surface exposes.

UI-only tools that the MCP Apps dashboard calls internally (like `fetch_topojson_resource`) get `_meta["ui/visibility"] = ["app"]`, which removes them from the model's own `tools/list` view entirely. There's no reason to make the model read a UI implementation detail.

## Prompts: the user's front door

Tools are "the model picks when needed"; Prompts are "the user invokes explicitly." AgriOps ships 15 prompts (`area_briefing`, `staff_deploy_plan`, `weather_risk_alert`, and more), but the README and the submission packet foreground only 3. Show a user 15 equally-weighted options and they'll pick none of them.

## Resources / Resource Templates: read-by-ID data

Static reference data — the prefecture list, the attribution/license terms — is exposed as `resources` at fixed URIs. But "I want exactly this one farmland polygon" has a variable ID, which is what `resource templates` are for:

```
farmland://{fude_id}
```

An unknown ID returns a structured `{ "error": "farmland_not_found" }` payload instead of a protocol-level error — a deliberate choice so an agent can handle the failure as readable text, matching the way tool results already represent errors in MCP.

## Completion: only declare what you can actually complete

Completion was the last of the seven primitives to land, for a boring reason: you only need it once a prompt or resource-template argument with something worth completing actually exists. Until then there was nothing to wire it to.

Two places activate it now:

1. The `area_briefing` prompt's `prefecture` argument is wrapped in the SDK's `completable()`, matching either a Japanese-name prefix or an ISO code prefix (`JP-46`, etc.).
2. The `farmland://{fude_id}` resource template ships a `complete` handler that proxies partial IDs to `emaff.search`, returning only real matches.

```ts
prefecture: completable(z.string(), completePrefectureName)
```

The rule I kept was: capability negotiation follows from a real completable argument existing — not the other way around. Declaring a capability you don't actually use is a small lie to any client reading the Server Card.

## Logging / Pagination: unglamorous, easy to silently break

`notifications/message` logging was already in place; what changed was locking it down with conformance tests, and de-duplicating the `cursor`/`nextCursor` pagination logic that had been copy-pasted across the eMAFF and FAMIC adapters:

```ts
// src/lib/pagination.ts
export function encodeOffsetCursor(offset: number): string { ... }
export function decodeOffsetCursor(cursor: string | undefined): number { ... }
export function clampLimit(limit: number | undefined, max: number): number { ... }
```

After extracting the shared helper, a [fast-check](https://github.com/dubzzz/fast-check) property-based test proves that *any* garbage cursor string resolves to a valid offset without throwing. Pagination is a good spot for property-based testing specifically because the `cursor` string is exactly the kind of value an LLM might hallucinate or mangle before sending it back.

## Showing quality instead of asserting it

Rather than just claiming "there are tests," it's more convincing to show what's actually verified:

- `tests/unit/geo.pbt.test.ts` — haversine distance symmetry, triangle inequality, boundary behavior
- `tests/unit/pagination.pbt.test.ts` — cursor round-trips, resilience to garbage input
- `tests/conformance/attribution.test.ts` — every licensed data source's `attribution` field is schema-enforced to be non-empty
- `scripts/bench.ts` ([tinybench](https://github.com/tinylibs/tinybench)) — p50/p95/p99 latency for `search_farmland` and `get_weather_1km`, published as a table in the README

In CI, the MCP Inspector `tools/list` smoke check went from `continue-on-error: true` to a hard gate — a broken tool surface now fails the build, which is the bar it should have always been held to.

## Takeaway

Implementing all seven primitives wasn't the goal by itself. The goal was putting each kind of interaction in its proper place: what the model picks (Tools), what the user invokes (Prompts), what's looked up by ID (Resources/Templates), what helps input (Completion), and what tells you the moment something breaks (Logging/CI gate). The result: roughly a third of the original tool count, an easier Directory review, and — genuinely — more readable code.

Code: [github.com/WIN-kagoshima/agriops-mcp](https://github.com/WIN-kagoshima/agriops-mcp) (Apache-2.0). Try it now with `npx -y @sugukuru/agriops-mcp`. Issues and PRs welcome.
