<!--
Draft for a Show HN submission. Post from an account with some prior HN
history (not brand-new) for best odds of surviving the new-submissions queue.
Best posting window per docs/go-to-market.md: Tue-Wed, 22:00-24:00 JST
(≈ 09:00-11:00 EST / Tue-Wed morning US time), which lines up with HN's own
9am-noon ET peak-traffic guidance.

Do not post this until:
  - npm package version matches the repo (currently repo is ahead: 1.14.2
    vs. npm's 1.11.0; confirm `npm view @sugukuru/agriops-mcp version`
    matches before posting so first-run copy/paste works).
  - The live Cloud Run endpoint issue in docs/anthropic-directory-submission.md
    §4 (anonymous access currently 403s) is resolved, OR this post only
    promotes the self-hosted / npx path, not the hosted URL.
-->

## Title

```
Show HN: AgriOps MCP – an MCP server for Japanese farmland, weather, and pesticide data
```

Alternative (if the above feels too dry / gets flagged as low-effort):

```
Show HN: I built an MCP server that lets AI agents query Japan's farmland registry
```

## Post text (first comment, as the OP)

```
Hi HN,

I built AgriOps MCP: an open-source Model Context Protocol server that exposes
Japanese agricultural public data — farmland polygons (eMAFF Fude), 1km-mesh
weather forecasts (Open-Meteo / JMA), and pesticide registration records
(FAMIC) — as tools an AI agent (Claude, Cursor, etc.) can call directly.

Backstory: my company dispatches Specified Skilled Worker (SSW) staff to
farms across Japan, and we kept re-writing the same "which field, what's the
weather, what pesticide rules apply" lookups by hand for every placement
decision. This is the tool version of that.

A few things I tried to get right, since I mostly build MCP servers for a
living now and wanted this one to hold up as a reference:

- All 7 MCP primitives are genuinely active, not just declared: Tools,
  Prompts (15 slash-command-style workflows), Resources, a Resource Template
  (farmland://{fude_id} with live completion), Completion (prefecture
  autocomplete too), Logging, and cursor-based Pagination.
- The model-visible tool surface is deliberately ~8 tools by default (not the
  ~30 the codebase actually has) — extended/legacy tools are opt-in via env
  flags, so a reviewer or a first-time agent isn't asked to reason about 30
  overlapping tools. Nothing is renamed or removed, just gated.
- Property-based tests (fast-check) for the geo math and the pagination
  cursor codec, a tinybench p50/p95/p99 latency table in the README, and a
  hard-gated MCP Inspector smoke check in CI.
- There's also an MCP Apps dashboard (choropleth map, radar chart, etc.) for
  hosts that support inline UI, with a text fallback for hosts that don't.

Stack: TypeScript, Zod, better-sqlite3 for the offline snapshot builds,
Streamable HTTP + stdio transports, Apache-2.0.

    npx -y @sugukuru/agriops-mcp --stdio

Repo: https://github.com/WIN-kagoshima/agriops-mcp

Happy to answer questions about the MCP spec side (primitives, Directory
submission requirements) or the Japan-specific data side (eMAFF, FAMIC, JMA
licensing).
```

## Anticipated questions (prep, not for posting)

- **"Why not just scrape gov data with a script — why does this need to be an MCP server?"**
  Because the target user is an AI agent making placement decisions in a chat session, not a batch job. The value is the *tool contract* (typed inputs/outputs, pagination, attribution enforcement), not the underlying scrape.
- **"Is the data actually free to redistribute?"**
  Yes for the sources used by default — see `docs/data-license.md` in the repo; every adapter carries a mandatory, non-empty `attribution` string enforced at the schema level.
- **"Isn't 8 tools too few / why hide the rest behind flags instead of just... having 8 tools?"**
  The other ~20 are real, tested, already-published features other self-hosted users depend on (derived agronomy calculations, IoT sensor tools). Deleting them would be a breaking change; gating them behind an opt-in flag keeps the default *review* surface small without breaking anyone.
- **"Does this work with ChatGPT / other MCP hosts?"**
  Streamable HTTP is host-agnostic. It's currently verified against Claude Desktop and MCP Inspector; ChatGPT Connectors support is unverified/planned (see `.well-known/mcp-server.json`'s `testedWith` list).
