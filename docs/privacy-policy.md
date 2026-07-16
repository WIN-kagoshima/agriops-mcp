# Privacy Policy — AgriOps MCP

_Last updated: 2026-07-16 (v1.14.2)_

This policy covers the `@sugukuru/agriops-mcp` server (the "Server"), operated by WIN Kagoshima ("we", "us"), including the reference Cloud Run deployment referenced in [README.md](../README.md) and any self-hosted deployment running unmodified server code.

## 1. What the Server does

The Server exposes Japanese public agricultural data — farmland polygons (eMAFF), 1 km mesh weather (Open-Meteo), JMA disaster warnings, and pesticide registrations (FAMIC) — to AI agents (Claude, Cursor, ChatGPT connectors, Google ADK, etc.) over the Model Context Protocol. Optional extended/legacy tools (`AGRIOPS_ENABLE_EXTENDED_TOOLS`, `AGRIOPS_ENABLE_LEGACY_TOOLS`) add derived agronomy calculations, IoT sensor demos, and government statistics lookups. See [docs/api-reference.md](api-reference.md) for the full tool catalog.

## 2. What data we process

| Category | Examples | Persisted? |
|---|---|---|
| Tool call arguments | Coordinates, prefecture/crop names, field IDs you supply | No — used only to serve the request, not written to disk or a database. |
| Public agricultural data | eMAFF/FAMIC snapshot rows, Open-Meteo/JMA API responses | Cached in-memory only (TTL ≤ 24h depending on source; see [docs/data-license.md](data-license.md)). Not personal data. |
| `create_staff_deploy_plan` draft input | Farm IDs, dispatch period, free-text notes you provide | Held in-memory for the duration of the elicitation flow only (`InMemoryElicitationStore`), evicted on expiry (default short TTL) or process restart. Never written to disk. |
| OAuth tokens (URL-mode elicitation, Phase 4) | Access/refresh tokens for a connected provider | Stored only if `AGRIOPS_TOKEN_ENC_KEY` or `AGRIOPS_TOKEN_ENC_PASSPHRASE` is configured, in an AES-256-GCM encrypted file store (`FileTokenStore`) under operator control. Without either, tokens live in-memory only and are lost on restart. We never log token values. |
| Operational logs | Request method/path, tool name, outcome, latency, trace ID | Structured JSON logs (`src/lib/logger.ts`). Logs never include tool arguments, secrets, or full request bodies (enforced by `tests/conformance/secret-leakage.test.ts`). |
| Audit-only headers | `AGRIOPS_AGENT_ID_HEADER` / `AGRIOPS_AGENT_OWNER_HEADER`, if an operator enables them behind a trusted gateway | Logged for audit only; never used for authorization decisions. |

We do **not** collect: passport/residence-card images, other identity documents, chat history, conversation summaries, or any data beyond what a single tool call needs to answer it. See [SECURITY.md](../SECURITY.md) for the full hardening notes.

## 3. Third-party data sources

Tool results include data from Open-Meteo (CC-BY 4.0), 農林水産省 eMAFF, FAMIC, 気象庁 (JMA), and optionally e-Stat. Each source's license and attribution requirement is documented in [docs/data-license.md](data-license.md); every applicable tool result carries `structuredContent.attribution` naming the source. We do not sell, share, or otherwise transfer this data beyond returning it in the tool response.

## 4. Data retention

- Tool call arguments and responses: not retained beyond the request lifecycle.
- In-memory caches (weather, elicitation sessions): bounded TTL, evicted automatically, and cleared on process restart. Cloud Run's stateless-per-request model (see [docs/architecture.md](architecture.md)) means no cross-request session state survives a cold start.
- Operational logs: retained per the operator's log-sink policy (e.g. Cloud Logging default retention); no tool arguments are logged.
- Encrypted OAuth tokens (if configured): retained until the operator rotates or deletes the token store directory.

## 5. Your controls

- Self-hosted operators control all retention, logging destinations, and encryption keys via environment variables documented in [.env.example](../.env.example).
- No account or sign-up is required to use the default (anonymous) tool surface — there is no user profile to delete.
- For the OAuth URL-mode elicitation flow, disconnecting the provider from your MCP client revokes the connection; deleting the token store directory removes the encrypted token.

## 6. Contact

Security or privacy questions: `info@win-g-c.com` (see [SECURITY.md](../SECURITY.md) for the vulnerability-reporting process). This policy is versioned in this repository; changes are visible in `git log docs/privacy-policy.md`.
