# Agent Gateway / reverse-proxy deployment

This note describes how to put AgriOps MCP behind an enterprise gateway
(Gemini Enterprise Agent Gateway, Apigee, Google Cloud Load Balancer with
Cloud Armor, NGINX, Envoy, etc.) without weakening the server's own
defense-in-depth.

It is companion material to:

- [`docs/runbook.md`](runbook.md) — Cloud Run deploy steps.
- [`docs/cloud-next26-agent-readiness.md`](cloud-next26-agent-readiness.md) —
  what AgriOps MCP does and does not adopt from Google Cloud Next '26.
- [`SECURITY.md`](../SECURITY.md) — server-side hardening contract.

Last reviewed: 2026-05-03.

---

## When you need a gateway

A gateway is **not required** for the public `agriops-mcp` reference
deployment. The server already enforces:

- TLS expectation via `MCP_BASE_URL`.
- Host allow-list (`localhost`, `MCP_BASE_URL.host`, and an optional
  reverse-proxy hop count via `AGRIOPS_TRUST_PROXY`).
- Per-IP token-bucket rate limiting (`AGRIOPS_RATE_RPS`, `AGRIOPS_RATE_BURST`).
- 1 MiB request body cap.
- 1 MiB tool-result safety cap (`enforceSizeCap`).
- Streamable HTTP transport, stateless mode, fresh `McpServer` per request.
- Bearer-protected `/metrics`.
- Read-only `/livez`, `/readyz`, `/.well-known/mcp-server.json`, and
  `/.well-known/oauth-protected-resource`.
- Cloud Run **`--no-allow-unauthenticated`** by default, so the public
  Cloud Run URL itself is IAM-protected.

You still want a gateway when any of the following is true:

| Driver | Gateway responsibility |
| --- | --- |
| Multiple agents share one MCP fleet | Mint per-agent identities, propagate them as audit-only headers, enforce per-agent quotas. |
| You run more than one MCP server | Centralize allow-listed tools, prompts, resources, and uniform error envelopes. |
| Compliance requires Model-Armor-style content scanning | Inspect `tools/call` JSON request bodies and tool result `content[*].text` before they reach the model or the human. |
| Public browser entry point is in scope | Add Fraud Defense / reCAPTCHA Enterprise / Cloud Armor at the edge before traffic reaches `/connect/*` or `/mcp`. |
| Multi-region or multicloud failover | Steer traffic, do health-aware routing, hold session affinity if a downstream needs it (this server does not). |

If none of the drivers apply, a single Cloud Run service behind
Workload Identity Federation deploys is enough.

---

## Architecture target

```
Agent host  ─►  Agent Gateway (policy, identity, model armor)  ─►  Cloud Run AgriOps MCP  ─►  Snapshots + upstream APIs
                  │                                                 │
                  ├─ propagates X-Request-Id                        ├─ enforces tool schemas, size caps, rate limits
                  ├─ injects identity headers (agent + owner)       ├─ logs request ID and (audit-only) identity labels
                  ├─ handles auth handshake with the model host     ├─ never trusts client-side identity for authorization
                  └─ may content-scan request and response bodies   └─ never logs prompt bodies, OAuth tokens, cookies
```

The gateway is the **outer ring**. The server is the **inner ring**. Both
rings must enforce their invariants independently.

---

## Required upstream behavior

A gateway in front of AgriOps MCP MUST:

1. **Terminate TLS** and pass the original HTTP method, path, headers, and
   raw JSON body to the upstream.
2. **Forward `Host`** as the `MCP_BASE_URL.host` value used at deploy time.
   The server rejects mismatched hosts with HTTP 421 (Misdirected request)
   to defend against DNS rebinding.
3. **Set `X-Forwarded-Proto: https`** and **`X-Forwarded-For`** so the
   server's per-IP rate limiter sees the real client. AgriOps MCP trusts
   the first proxy hop by default; raise `AGRIOPS_TRUST_PROXY` to the
   number of hops if you stack multiple proxies.
4. **Preserve `X-Request-Id`** (or inject one if absent). Agent hosts
   reuse this ID across the workflow; AgriOps MCP echoes it in
   structured logs and in safe error envelopes for end-to-end tracing.
5. **Limit body size before the upstream**. The server itself caps at
   1 MiB; the gateway should drop anything obviously larger so the
   upstream is never billed for it.

A gateway in front of AgriOps MCP MUST NOT:

1. **Strip the JSON-RPC envelope** or rewrite tool names. Tool names are
   part of the public MCP surface and are conformance-tested.
2. **Inject extra fields into `tools/call` request `arguments`**. The
   server validates with strict Zod schemas; unknown keys produce a
   safe validation error, not a silent merge.
3. **Log the JSON-RPC body**, prompt text, OAuth codes, bearer tokens,
   or session cookies in plaintext.
4. **Cache `tools/call` responses across agents**. Tool annotations may
   say `readOnlyHint: true`, but the server still attaches per-request
   attribution and request-id metadata.

---

## Endpoint exposure matrix

| Path | Public via gateway? | Notes |
| --- | --- | --- |
| `POST /mcp` | YES (gated) | Streamable HTTP transport. Agents reach this. Apply auth, rate, content scanning here. |
| `GET /mcp` | YES (gated) | SSE response side of Streamable HTTP. Same protections as `POST /mcp`. |
| `GET /livez` | OPTIONAL | Liveness ping. Cheap. Safe to expose for synthetic monitors. |
| `GET /healthz` | OPTIONAL | Same payload as `/livez`. |
| `GET /readyz` | OPTIONAL | Adapter readiness. Returns 503 during shutdown. Safe to expose. |
| `GET /metrics` | NEVER | Bearer-token Prometheus metrics; bypass the gateway and reach the metrics scraper directly. |
| `GET /.well-known/mcp-server.json` | YES | Public Server Card; required for registries. |
| `GET /.well-known/oauth-protected-resource` | YES | Public OAuth discovery doc; required for clients. |
| `* /connect/*` | LIMITED | OAuth bridge for elicitation URL flow. Apply edge anti-bot (Fraud Defense / reCAPTCHA) when exposing this to browser clients. |
| `* /__mock-oauth/*` | NEVER | Local development mock; the production server never registers it. |

---

## Identity propagation

AgriOps MCP does not authenticate agents on the MCP path; that is the
gateway's job. To make agent activity auditable without coupling the
server to a specific gateway, the server can **copy** trusted identity
headers into structured logs as opaque labels.

Set, on the upstream Cloud Run service:

```bash
gcloud run services update agriops-mcp \
  --region=asia-northeast1 \
  --update-env-vars=AGRIOPS_AGENT_ID_HEADER=X-Agent-Id,AGRIOPS_AGENT_OWNER_HEADER=X-Agent-Owner
```

Then have the gateway inject the matching headers, e.g. for Gemini
Enterprise Agent Gateway:

```http
X-Agent-Id: agt_01HW8...
X-Agent-Owner: owner@example.com
X-Request-Id: 7b3a7e94-...
```

`getTrustedAgentIdentity` (in `src/server/request-id.ts`) validates the
header values against a conservative regex (printable ASCII, length
bounded), and only labels the request log line if the validation passes.
The server **never** uses these values for authorization, never echoes
them in tool output, and never returns them to the client.

If the gateway does not inject identity headers, leave the env vars
unset and the log line stays anonymous (only `requestId` is emitted).

---

## Suggested gateway policies

### Authentication

- Issue per-agent client credentials on the gateway side.
- For human end-users behind Gemini Enterprise, propagate the gateway's
  short-lived OIDC token to a backend; do not pass that token to the MCP
  upstream.
- Mint a Cloud Run audience-bound ID token at the gateway when calling
  the IAM-protected upstream (the runbook documents
  `google-github-actions/auth@v2 token_format: id_token`).

### Rate limiting

- Apply per-agent quotas at the gateway. The server's per-IP limiter is
  a backstop, not the primary enforcement.
- Recommended starting limit for production: 60 requests / minute / agent
  with a 30-request burst, matching the server defaults of
  `AGRIOPS_RATE_RPS=10` and `AGRIOPS_RATE_BURST=30`.

### Content scanning

- Run prompt-injection / data-exfiltration scanning (Model Armor or
  equivalent) on the **request body** before it reaches `/mcp`. Reject
  any request that contains a known credential pattern or that asks
  the server to "ignore previous instructions" within a tool argument.
- Run a similar scan on the **response body**, especially on
  `tools/call` content to keep tool output free of accidental
  data exfiltration paths.

### Logging and audit

- Log gateway-side: agent ID, owner, route (`POST /mcp`), JSON-RPC
  method (`tools/call`), tool name, response status, latency, request
  size, response size.
- Do **not** log JSON-RPC `arguments`, prompt text, or tool result
  `content[*].text` in plaintext.
- Forward gateway logs to the same sink the server uses; correlate by
  `X-Request-Id`.

### Egress

- Gateways often need to reach upstreams (e.g. for content scanning).
  Place them in the same VPC connector as the Cloud Run service so the
  IAM-protected upstream URL is never reachable from the public internet.

---

## Reference snippets

### NGINX (single-tenant, internal gateway)

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.agriops.example.com;

    # Body cap matches AgriOps MCP's own 1 MiB express.json limit.
    client_max_body_size 1m;

    proxy_set_header Host                 $host;
    proxy_set_header X-Real-IP            $remote_addr;
    proxy_set_header X-Forwarded-For      $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto    $scheme;
    proxy_set_header X-Request-Id         $request_id;

    # Identity headers - only forward what the upstream is configured to trust.
    proxy_set_header X-Agent-Id           $http_x_agent_id;
    proxy_set_header X-Agent-Owner        $http_x_agent_owner;

    # Hide the metrics endpoint from the public surface.
    location = /metrics { return 404; }

    location / {
        proxy_pass https://agriops-mcp-XXXX-an.a.run.app;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Pair NGINX with `auth_request` against an OAuth introspection backend if
you need per-agent authentication.

### Envoy (Agent Gateway-style, multi-tenant)

```yaml
http_filters:
  - name: envoy.filters.http.lua
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua
      inline_code: |
        function envoy_on_request(req)
          local id = req:headers():get("x-request-id")
          if id == nil or id == "" then
            req:headers():add("x-request-id", "agw-" .. tostring(os.time()) .. "-" .. tostring(math.random(1e9)))
          end
        end
  - name: envoy.filters.http.local_ratelimit
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
      stat_prefix: agriops_mcp
      token_bucket:
        max_tokens: 600
        tokens_per_fill: 10
        fill_interval: 1s
  - name: envoy.filters.http.router
```

### Google Cloud Load Balancer + Cloud Armor

- Use a serverless network endpoint group pointing at the Cloud Run
  service.
- Attach a Cloud Armor security policy that:
  - Blocks unauthenticated traffic on `/connect/*` for browser clients.
  - Throttles `POST /mcp` to a per-agent quota using
    `enforceOnKeyConfigs`.
  - Allows `GET /.well-known/*` and `GET /livez|readyz` without a token.

A complete Cloud Armor rule set is out of scope for this doc; see the
security team's gateway runbook for the production policy.

### Gemini Enterprise Agent Gateway

When Agent Gateway routing is generally available, register AgriOps MCP
as an upstream and:

- Bind the gateway's per-agent identity to `X-Agent-Id`.
- Bind the gateway's per-tenant owner identifier to `X-Agent-Owner`.
- Allow-list the public tool surface declared in
  `.well-known/mcp-server.json`.
- Forbid agents from calling `*_app_only*` tools (visibility="ui" in the
  Server Card) — those are intended for the MCP Apps UI bundle, not for
  generic tool routing.
- Configure Model Armor to scan `tools/call.params.arguments` and
  response `content[].text`.

---

## Google Agent Development Kit (ADK) integration

ADK agents connect to AgriOps MCP over Streamable HTTP using `MCPToolset`.
The handshake flow is identical to any other HTTP client, but two ADK-specific
details are worth noting.

### Authentication — Cloud Run ID token

Cloud Run IAM requires a valid Google Cloud **ID token** (not an access token)
in the `Authorization: Bearer` header. The expected audience is the full Cloud
Run service URL (e.g. `https://agriops-mcp-<hash>-an.a.run.app`).

**Development:**
```bash
export AGRIOPS_ID_TOKEN=$(gcloud auth print-identity-token \
  --audiences="$AGRIOPS_MCP_URL")
```

**Production (Workload Identity Federation, no key files):**

1. Grant the ADK runner's service account `roles/run.invoker` on the AgriOps
   MCP Cloud Run service.
2. In `agent.py` call `google.oauth2.id_token.fetch_id_token(auth_req, audience)`.
   Application Default Credentials pick up the WIF token automatically.
3. Refresh the token before its 1-hour expiry; cache with TTL < 55 minutes.

Full working example: [`examples/google-adk/agent.py`](../examples/google-adk/agent.py).

### Audit headers

ADK passes optional agent-identity metadata through HTTP headers. AgriOps MCP
forwards these to the structured log when the corresponding env vars are set:

```bash
# On the Cloud Run service (set at deploy time):
AGRIOPS_AGENT_ID_HEADER=X-Agent-ID
AGRIOPS_AGENT_OWNER_HEADER=X-Agent-Owner

# In agent.py MCPToolset headers:
"X-Agent-ID": "agriops-adk-prod",
"X-Agent-Owner": "win-kagoshima"
```

These values are **audit-only** — they are never used as authorization
decisions inside the server.

### Gemini Enterprise Agent Gateway

When the Gemini Enterprise Agent Gateway sits in front of AgriOps MCP:

1. Configure the gateway route to target `$AGRIOPS_MCP_URL/mcp`.
2. The gateway injects its own identity headers; set
   `AGRIOPS_AGENT_ID_HEADER` / `AGRIOPS_AGENT_OWNER_HEADER` on the Cloud Run
   service to match the header names the gateway uses.
3. Strip any client-supplied `X-Agent-*` headers at the gateway layer so
   callers cannot spoof the audit identity.
4. Point the ADK agent at the gateway URL, not the Cloud Run URL directly, so
   Model Armor and rate limiting apply at the edge.

---

## Verification checklist

After putting a gateway in front of AgriOps MCP, run the existing smoke
suite against the gateway URL to make sure the public contract still
holds:

```bash
EXPECTED_VERSION=$(node -p "require('./package.json').version")
GATEWAY_URL=https://mcp.agriops.example.com

npm run deploy:smoke -- \
  --base-url="${GATEWAY_URL}" \
  --health-path=/livez \
  --expected-version="${EXPECTED_VERSION}" \
  --auth-bearer="${AGENT_TOKEN_FOR_GATEWAY}"
```

The smoke suite verifies `/livez`, `/readyz`, the Server Card,
`initialize`, `tools/list`, `prompts/list`, `resources/list`, and the
deployed package version. If any of those fail through the gateway, the
gateway is rewriting more than it should.

Add the gateway URL to the production smoke workflow once it is
verified, alongside the existing direct-Cloud-Run probe. Two probes
catch gateway-only regressions that would otherwise be invisible.
