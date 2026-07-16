# Security Policy

## Supported versions

| Version | Status |
|---|---|
| `1.x` | **Supported** (current stable: 1.14.2) |
| `0.5.x` | Security patches only |
| `0.4.x` and earlier | End of life |

## Reporting a vulnerability

**Please do not open a public GitHub issue.**

Email `info@win-g-c.com` with:

- A description of the issue.
- Steps to reproduce, ideally with a minimal MCP client transcript.
- The version (`package.json` `version`) and transport (`stdio` or `streamable-http`) where you observed it.
- Any suggested mitigation.

We will acknowledge within 3 business days and aim to ship a fix or a documented mitigation within 30 days.

## Hardening notes for operators

- Run the server under a least-privilege OS user. The server only needs read access to the `snapshots/` SQLite files.
- For Streamable HTTP, restrict the public origin via `MCP_BASE_URL` and the built-in DNS rebinding protection.
- Never expose the `/connect/{provider}` endpoint to the public internet without TLS.
- Token store: when running with the URL-mode elicitation flow enabled, set `AGRIOPS_TOKEN_ENC_KEY` (32-byte base64) or `AGRIOPS_TOKEN_ENC_PASSPHRASE` to use the AES-256-GCM `FileTokenStore`. Without either the server falls back to the in-memory store and logs a warning at startup. For Cloud Run, inject the key from Secret Manager via the runtime service account; never put it in plain Cloud Run env vars in production.
- Open-Meteo and FAMIC do not require keys; if a future paid tier is enabled, keep keys in environment variables only and never log or echo them in tool output.
- For enterprise agent deployments, place Model Armor, Agent Gateway, Fraud Defense, or equivalent edge controls outside this server. These controls are defense-in-depth; MCP handlers must still validate inputs, bound outputs, and avoid secret leakage.
- `AGRIOPS_AGENT_ID_HEADER` and `AGRIOPS_AGENT_OWNER_HEADER` are audit-only. Enable them only behind a trusted gateway that strips spoofed client headers; never use these values as authorization decisions inside the server.
- `AGRIOPS_ENABLE_EXTENDED_TOOLS` and `AGRIOPS_ENABLE_LEGACY_TOOLS` are a **tool-count/context-budget** control, not a security boundary. Every tool they gate has the same input validation, rate limiting, and attribution requirements as the default 8-tool surface whether or not the flag is set.
- Snapshot manifests (`snapshots/*.sqlite.manifest.json`) should be retained with GCS snapshot objects so operators can audit source provenance, row counts, and raw-input/output hashes without granting direct database access.
