# Multi-tool agent workflow example

`run.mjs` drives the AgriOps MCP server through the canonical agent
workflow described in the server's `instructions` block:

```
search_farmland  →  get_weather_1km  →  get_pesticide_rules  →  open_dashboard
```

The script is **deterministic and key-free**: it does not call any LLM
provider. Treat it as a reference plan that you can drop into your
preferred tool-use loop (Anthropic Claude, Google Gemini, OpenAI,
Google Cloud ADK / Gemini Enterprise Agent Platform, etc.).

## Run it

```bash
git clone https://github.com/WIN-kagoshima/agriops-mcp
cd agriops-mcp
npm install
npm run build
node examples/agent-workflow/run.mjs
```

Optional environment knobs:

| Variable | Default | Effect |
| --- | --- | --- |
| `AGRIOPS_PREFECTURE_CODE` | `JP-46` (Kagoshima) | Prefecture used for `search_farmland`. |
| `AGRIOPS_CROP` | `さつまいも` | Crop used for `search_farmland` + `get_pesticide_rules`. |

Without local snapshots, the script gracefully skips
`search_farmland` / `get_pesticide_rules` and still exercises the
Phase 0 weather path, so it is safe to run on a fresh checkout.

## What the script does

1. `initialize` → reads `serverInfo` and capabilities.
2. `tools/list`, `prompts/list`, `resources/list` → discovers the public
   surface (the same surface advertised in
   `.well-known/mcp-server.json`).
3. `search_farmland` → narrows by prefecture + crop, picks the first
   field, and remembers its centroid. Falls back to a Kagoshima centroid
   when the snapshot is not loaded.
4. `get_weather_1km` → 24-hour forecast at that centroid, with
   attribution.
5. `get_pesticide_rules` → top 3 registered products for the crop.
6. `open_dashboard` → emits the MCP Apps UI dashboard hint that a host
   can render (no-op for stdio-only hosts).

Every call is wrapped in `safeCall` so a failed adapter still lets the
script print a clear, attribution-bearing summary instead of crashing
out half-way.

## Wiring this into a real LLM agent

The workflow above is the **plan** that an LLM tool-use loop should
arrive at on its own. Below is the minimal scaffolding needed to wire
the same MCP server into a few common providers.

### Anthropic Claude — Messages API tool-use

1. Boot AgriOps MCP locally (or against the IAM-protected Cloud Run
   reference deployment).
2. Build the Claude `tools` array from the MCP `tools/list` response.
   Each MCP tool's `name`, `description`, and `inputSchema` map directly
   onto Claude's `name`, `description`, `input_schema`.
3. On every turn, if Claude returns a `tool_use` content block, forward
   `{ name, input }` to MCP `tools/call`, then feed the resulting text
   content (and optional `structuredContent`) back as a `tool_result`
   block.
4. Stop when Claude emits an assistant message with no `tool_use`
   blocks.

### Google Gemini API — function calling

1. Translate the MCP `tools/list` response into Gemini's
   `functionDeclarations`.
2. Use `generateContent` with `tools=[{ functionDeclarations }]`.
3. When the response contains a `functionCall`, call MCP `tools/call`
   and reply with a `functionResponse` part containing the result.
4. The `attribution` line in `result.content[*].text` should be quoted
   when summarising the data to the user — Gemini's safety settings do
   not enforce this, so do it client-side.

### OpenAI — Responses API tools

1. Map MCP tools to the Responses API `tools` array of type
   `"function"`. Use `name`, `description`, and `parameters` (which is
   the same JSON Schema as MCP `inputSchema`).
2. On a `tool_call` event, dispatch to MCP `tools/call`, then submit a
   `tool_call_outputs` continuation.

### Google Cloud ADK / Gemini Enterprise Agent Platform

1. Register AgriOps MCP as a tool source on the agent's runtime.
2. Place the agent runtime behind Agent Gateway (see
   [`docs/agent-gateway-deployment.md`](../../docs/agent-gateway-deployment.md)).
3. Forward the gateway's identity headers (`X-Agent-Id`,
   `X-Agent-Owner`) to the upstream Cloud Run service so that AgriOps
   MCP can record audit-only labels via
   `AGRIOPS_AGENT_ID_HEADER` / `AGRIOPS_AGENT_OWNER_HEADER`.
4. Use Agent Simulation / Eval to replay the workflow above with
   adversarial inputs (`tests/conformance/red-team.test.ts` mirrors the
   minimum scenarios) before granting the agent autonomous authority
   over staff deployment plans.

### Generic JSON-RPC client (any language)

If your runtime does not have an MCP SDK yet, the
[`examples/http-curl/`](../http-curl) folder shows the bare minimum: a
single `tools/call` invocation over Streamable HTTP. The same body
format applies, so any language with `fetch` support can drive AgriOps
MCP through Claude / Gemini / OpenAI tool-use without depending on a
TypeScript runtime.

## What this example deliberately does **not** do

- It does not include API keys for any LLM provider; bring your own.
- It does not call `create_staff_deploy_plan`. That tool drafts an
  operational plan (Phase 3 elicitation) and is best exercised inside a
  real LLM loop where the form-mode questions can be answered by a
  human or by Agent Gateway-mediated identity, not by a deterministic
  script.
- It does not depend on the elicitation URL flow (`/connect/{provider}`
  + Phase 4 OAuth). That path is verified by the smoke tests in
  `tests/smoke/oauth-url-flow.test.ts` and the runbook.
