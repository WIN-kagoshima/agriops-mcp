# Cloud Next '26 Agent Readiness

This note maps relevant Google Cloud Next '26 announcements to concrete
AgriOps MCP follow-ups. It is intentionally an operator and maintainer guide,
not a promise that every preview product is already integrated.

Last reviewed: 2026-05-03

## What Changed

The most relevant announcements for this project are:

- Gemini Enterprise Agent Platform is the forward path for enterprise agent
  build, runtime, governance, identity, gateway, registry, simulation,
  evaluation, and observability.
- Agent Gallery and partner-built agents make "Google Cloud Ready - Gemini
  Enterprise" style governance important for third-party and internal agents.
- Cloud Storage Smart Storage adds object context, automated annotations, and a
  Cloud Storage MCP server for agent-ready enterprise data.
- Cloud Storage Rapid Bucket and Rapid Cache improve AI data access, but they
  are not required for this small Cloud Run reference deployment.
- Google Cloud Fraud Defense expands reCAPTCHA toward agentic traffic
  measurement, policy, and human-presence challenges.
- Google Cloud's security direction emphasizes multicloud, multi-AI, Agent
  Gateway, Agent Identity, Model Armor, and prompt/data exfiltration controls.

## Current Fit

AgriOps MCP is already aligned with the safer parts of this direction:

- It exposes agricultural data through MCP tools, prompts, resources, and an MCP
  Apps UI instead of custom chatbot-only APIs.
- It runs on private Cloud Run with Workload Identity Federation based deploys,
  Secret Manager injection, liveness/readiness checks, and release smoke tests.
- It has a Server Card and conformance tests so agent registries can discover
  the public surface.
- Tool annotations mark read-only, draft, idempotent, destructive, and
  open-world behavior for MCP hosts.
- Tool outputs include attribution and are bounded by size and pagination.

## Adoption Plan

### Phase A - Registry and gateway readiness

Goal: make the server easier to place behind Gemini Enterprise Agent Gateway or
an equivalent enterprise gateway.

Actions:

- Keep `/.well-known/mcp-server.json` accurate and release-gated.
- Keep tool names stable, snake_case, and action-oriented.
- Preserve `ToolAnnotations` for every tool.
- Add gateway-facing docs before adding new auth behavior.
- Treat Agent Gateway, Model Armor, or third-party gateway policies as an outer
  enforcement layer, not a replacement for server-side validation.

Do not:

- Add broad admin tools just because a gateway can protect them.
- Depend on gateway-specific headers for the core open-source MCP path.
- Return raw upstream payloads or stack traces to help agent debugging.

### Phase B - Agent identity and audit

Goal: make agent and human activity auditable without leaking sensitive data.

Actions:

- Continue propagating `X-Request-Id` and surfacing request IDs in safe errors.
- When an Agent Identity or gateway identity header is introduced, normalize it
  into structured logs as an opaque principal ID.
- Do not log bearer tokens, OAuth codes, session cookies, prompt bodies, or
  field-level personal data.
- Extend metrics by tool name and status, not by user-provided free text.

Future candidate:

- Use optional `AGRIOPS_AGENT_ID_HEADER` and `AGRIOPS_AGENT_OWNER_HEADER`
  settings to copy gateway-provided identities into logs after allowlisting the
  header names. These fields are audit-only and must not authorize tools.

### Phase C - Smart Storage snapshots

Goal: make eMAFF/FAMIC snapshot operations more agent-ready while keeping this
repo license-safe.

Today, Cloud Build restores SQLite snapshots from a private GCS bucket. The npm
package does not redistribute generated SQLite files or raw government archives.

Future options:

- Store snapshot manifests beside each SQLite object, including source URL,
  source date, build command, SHA256, row count, and attribution string.
- Use Cloud Storage object context or custom metadata for snapshot provenance
  once it is enabled on the production bucket.
- Keep the Cloud Storage MCP server as an operator tool for snapshot inspection,
  not as a direct dependency of the public AgriOps MCP server.
- Consider Smart Storage annotations for future unstructured inputs such as
  manuals, PDF notices, and compliance documents.

Do not:

- Move raw eMAFF or FAMIC archives into the npm package.
- Let agents write or overwrite production snapshots without a human-reviewed
  build and promote step.
- Require Cloud Storage Rapid features for the reference deployment; this
  workload is latency-sensitive but not AI-training-throughput-sensitive.

### Phase D - Fraud Defense and agentic traffic

Goal: support trusted agent traffic without weakening normal API security.

Actions:

- Keep Cloud Run private by default.
- Keep OAuth and connect flows TLS-only.
- For any future public browser entry point, evaluate Fraud Defense or
  reCAPTCHA-style controls at the edge.
- If agentic traffic is allowed from web clients, document how trusted agents
  are identified and which tools they may call.

Do not:

- Put challenges inside MCP JSON-RPC responses.
- Treat a challenge pass as authorization to call mutating tools.
- Expose `/connect/{provider}` publicly without an edge policy and rate limits.

### Phase E - Evaluation and observability

Goal: make production behavior measurable before adding more autonomy.

Actions:

- Keep scheduled production smoke tests.
- Add scenario-based evals before any Phase 6+ autonomous workflow.
- Record expected tool lists, prompt lists, resource URIs, and deployment
  version in smoke checks.
- Use Agent Simulation or equivalent tools for multi-turn workflows before
  allowing an agent to draft operational plans from live data.

Useful eval scenarios:

- Weather-risk triage for a Kagoshima field.
- Pesticide advice with missing pest/disease details.
- Staff deployment plan that requires elicitation.
- Malicious prompt that asks for secrets, raw SQL, or unbounded data.
- Stale snapshot or readiness failure.

## Product Decisions

| Area | Decision |
| --- | --- |
| Agent Platform | Integration target, not a hard runtime dependency. |
| ADK | Out of scope for the server; useful for example agents that call this MCP. |
| Agent Gateway | Preferred enterprise front door when available. |
| Agent Identity | Adopt via optional trusted headers once a gateway is in place. |
| Model Armor | Recommended at the gateway/host layer, not inside tool handlers. |
| Cloud Storage MCP server | Operator-side companion for snapshot buckets. |
| Smart Storage | Future snapshot provenance and unstructured document context. |
| Cloud Storage Rapid | Defer; not needed for current Cloud Run workload size. |
| Fraud Defense | Future edge control for public browser surfaces. |
| Partner Agent Marketplace | Future distribution path if packaging criteria become available. |

## Next Implementation Candidates

1. Add snapshot manifest generation for `snapshots/*.sqlite`.
2. Add optional trusted agent identity log fields.
3. Add a red-team conformance test for prompt-injection style requests.
4. Add a small example ADK/Gemini Enterprise agent that calls AgriOps MCP.
5. Add a gateway deployment note for Agent Gateway or equivalent reverse proxy
   policies once public docs stabilize.

