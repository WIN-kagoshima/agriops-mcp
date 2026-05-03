# AgriOps MCP × Google Agent Development Kit (ADK)

This example shows how to wire AgriOps MCP into a **Google ADK** agent using the
Streamable HTTP transport and **Workload Identity Federation** for keyless
authentication to Cloud Run.

## Prerequisites

| Requirement | Version |
|---|---|
| Python | ≥ 3.11 |
| `google-adk` | ≥ 1.0.0 |
| `google-auth` | ≥ 2.30 |
| AgriOps MCP running | ≥ 1.0.1 |
| gcloud CLI | ≥ 480 |

```bash
pip install google-adk google-auth requests
```

## 1. Deploy AgriOps MCP to Cloud Run

Follow `docs/runbook.md §2.3`. Your endpoint will look like:

```
https://agriops-mcp-<hash>-an.a.run.app
```

The `/mcp` path is the Streamable HTTP endpoint.

## 2. Set environment variables

```bash
# Required
export AGRIOPS_MCP_URL="https://agriops-mcp-<hash>-an.a.run.app/mcp"
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"

# Optional audit headers (forwarded to AgriOps as X-Agent-ID / X-Agent-Owner)
export ADK_AGENT_ID="agriops-adk-prod"
export ADK_AGENT_OWNER="win-kagoshima"
```

## 3. Get an ID token

AgriOps MCP on Cloud Run is protected by IAM. The ADK agent needs a Cloud Run
ID token in the `Authorization: Bearer` header.

**Development (gcloud CLI):**
```bash
export AGRIOPS_ID_TOKEN=$(gcloud auth print-identity-token \
  --audiences="$AGRIOPS_MCP_URL")
```

**Production (Workload Identity Federation):**

Configure the ADK runner's service account with `roles/run.invoker` on the
AgriOps MCP Cloud Run service. The `agent.py` helper calls
`google.oauth2.id_token.fetch_id_token()` which picks up Application Default
Credentials automatically — no key files needed.

See `docs/agent-gateway-deployment.md` for the full WIF setup with GitHub
Actions and Cloud Run.

## 4. Run the agent

```bash
# Interactive REPL
adk run examples/google-adk/agent.py

# Or via the ADK Web UI (opens browser)
adk web examples/google-adk/agent.py
```

## 5. Quick test prompts

Once the agent is running, try these prompts to exercise the full tool surface:

```
鹿児島県の田んぼを検索して、天気予報と農薬規則を教えて
→ exercises: search_farmland → get_weather_1km → get_pesticide_rules

薩摩川内市の農地面積サマリーを出して
→ exercises: area_summary

明日の天気警報を確認して
→ exercises: get_weather_warning

ET₀蒸発散量が高い日に灌漑すべきか判断して
→ exercises: get_weather_1km (new et0EvapotranspirationMm field)

バックグラウンドでエリアサマリーを非同期実行して
→ exercises: create_task (kind=area_summary_async) + get_task_status
```

## Architecture

```
ADK Runner (Python)
    │
    │  Streamable HTTP  (POST /mcp, Bearer token)
    ▼
AgriOps MCP  (Cloud Run, IAM-protected)
    ├── get_weather_1km      (Open-Meteo, Phase 0)
    ├── search_farmland      (eMAFF SQLite, Phase 1)
    ├── get_pesticide_rules  (FAMIC SQLite, Phase 1)
    ├── create_task          (async, Phase 4)
    └── open_dashboard       (MCP Apps UI, Phase 5)
```

## Gemini Enterprise Agent Gateway

For production deployments behind the Gemini Enterprise Agent Gateway
(Cloud Next '26), set `AGRIOPS_AGENT_ID_HEADER` and
`AGRIOPS_AGENT_OWNER_HEADER` on the AgriOps MCP Cloud Run service so that
gateway-injected identity headers are forwarded to the audit log.

See `docs/agent-gateway-deployment.md §4` for the full configuration.
