# AgriOps MCP

<p align="center">
  <img src="./assets/logo.png" alt="AgriOps MCP" width="220" />
</p>

[![CI](https://github.com/WIN-kagoshima/agriops-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/WIN-kagoshima/agriops-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/WIN-kagoshima/agriops-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/WIN-kagoshima/agriops-mcp/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/WIN-kagoshima/agriops-mcp/badge)](https://securityscorecards.dev/viewer/?uri=github.com/WIN-kagoshima/agriops-mcp)
[![npm](https://img.shields.io/npm/v/@win-kagoshima/agriops-mcp.svg)](https://www.npmjs.com/package/@win-kagoshima/agriops-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP Spec](https://img.shields.io/badge/MCP-2025--11--25-7c3aed)](https://modelcontextprotocol.io/specification/2025-11-25/)
[![MCP Apps](https://img.shields.io/badge/MCP%20Apps-2026--01--26-7c3aed)](https://github.com/modelcontextprotocol/ext-apps)

> **Reference implementation** of an MCP server using MCP Spec 2025-11-25, MCP Apps Extension 2026-01-26, and the official MCP TypeScript SDK v1.x.
> Apache-2.0 · TypeScript ESM · Node.js 22+ · stdio + Streamable HTTP.
>
> 日本語: [README.ja.md](./README.ja.md)

AgriOps MCP exposes Japanese agricultural data — farmland polygons (eMAFF), 1 km mesh weather (Open-Meteo, JMA), and pesticide registrations (FAMIC) — to AI agents through MCP. The audience is staffing companies that dispatch Specified Skilled Workers (特定技能 / SSW) to farms.

## Status

**Stable since `1.0.0`**. Tool names, prompt names, resource URIs, and input/output schemas are frozen under SemVer. Breaking changes require a `2.0.0`. See [CHANGELOG.md](./CHANGELOG.md).

| Phase | Version | Capabilities |
|---|---|---|
| 0 | `0.1.0` | stdio transport · `get_weather_1km` |
| 1 | `0.1.x` | + Streamable HTTP · Server Card · `search_farmland`, `area_summary`, `nearby_farms`, `get_pesticide_rules` |
| 2 | `0.2.x` | + 5 user-controlled prompts (slash commands) |
| 3 | `0.3.x` | + Elicitation Form mode |
| 4 | `0.4.x` | + Elicitation URL mode + OAuth Client Credentials |
| 5 | `0.5.x` | + MCP Apps UI dashboard (map + weather overlay) |
| 6–9 | `1.x` | + crop calendar · market price · SSW compatibility · labor shortage stats · livestock stats |
| 10 | `1.10.0` | + 戦略室 UI 2.0: municipality drill-down · 8 adaptive viz · viz_hint protocol · TopoJSON resources |

## Capabilities at a glance

```mermaid
flowchart LR
  host["AI host (Claude · Cursor · ChatGPT)"]
  host -->|MCP| server["agriops-mcp"]
  server --> tools["Tools"]
  server --> prompts["Prompts (Phase 2+)"]
  server --> ui["ui://agriops/dashboard.html (Phase 5)"]
  tools --> openMeteo[(Open-Meteo)]
  tools --> emaff[("eMAFF SQLite snapshot")]
  tools --> famic[("FAMIC SQLite snapshot")]
```

## Quickstart (stdio)

Requires Node.js 22+ and npm (pnpm/yarn also work).

```bash
git clone https://github.com/WIN-kagoshima/agriops-mcp.git
cd agriops-mcp
npm install
npm run build
npm run dev   # starts stdio transport
```

### Claude Desktop / Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/agriops-mcp/dist/server.js", "--stdio"]
    }
  }
}
```

### Cursor

Settings → MCP → Add MCP server:

```json
{
  "name": "agriops-mcp",
  "command": "node",
  "args": ["/absolute/path/to/agriops-mcp/dist/server.js", "--stdio"]
}
```

### MCP Inspector

```bash
npm run inspector
```

## Quickstart (Streamable HTTP, Phase 1+)

```bash
npm run build
npm run start:http      # listens on $PORT (default 3001)
```

The server exposes:

- `POST /mcp` — JSON-RPC over Streamable HTTP (per MCP Spec 2025-11-25).
- `GET /mcp` — server-initiated SSE notifications.
- `DELETE /mcp` — explicit session termination.
- `GET /.well-known/mcp-server.json` — Server Card for registries.
- `GET /healthz` — liveness probe (503 while draining).
- `GET /readyz` — readiness probe with per-adapter status.
- `GET /metrics` — Prometheus exposition (bearer-token gated when `AGRIOPS_METRICS_BEARER` is set).

Production deployment, key rotation, incident response, and SLO targets are documented in [`docs/runbook.md`](docs/runbook.md). Metrics, log format, rate limiting, and alerting recommendations are in [`docs/observability.md`](docs/observability.md). For system design and the adapter/tool/phase model, see [`docs/architecture.md`](docs/architecture.md).

### Deployed reference endpoint

The first production Cloud Run deployment is live at:

```text
https://agriops-mcp-n5vdix22hq-an.a.run.app
```

It is IAM-protected by default. Operators can verify it with:

```bash
TOKEN="$(gcloud auth print-identity-token)"
npm run deploy:smoke -- \
  --base-url=https://agriops-mcp-n5vdix22hq-an.a.run.app \
  --health-path=/livez \
  --expected-version="$(node -p "require('./package.json').version")" \
  --auth-bearer="$TOKEN"
```

The smoke test checks `/livez`, `/readyz`, the Server Card, MCP `initialize`,
`tools/list`, `prompts/list`, and `resources/list`.

## Tools

| Name | Phase | Side effect | Summary |
|---|---|---|---|
| `get_weather_1km` | 0 | read-only | Hourly forecast at the given lat/lng (up to 7 days). Open-Meteo with ET₀, soil moisture, soil temperature. |
| `get_weather_warning` | 1 | read-only | JMA active 警報・注意報 by prefecture. Cached ≤ 10 min. |
| `search_farmland` | 1 | read-only | Search eMAFF Fude polygons by address, prefecture, or crop. |
| `area_summary` | 1 | read-only | Aggregate farmland statistics over a polygon or admin code. |
| `nearby_farms` | 1 | read-only | Farmland within a radius of a centroid. |
| `get_pesticide_rules` | 1 | read-only | FAMIC pesticide registrations applicable to a crop / pest. |
| `create_staff_deploy_plan` | 3 | draft | Generates a non-binding staff deployment plan. Uses Form elicitation when input is missing. |
| `create_task` | 4 | mutating | Create a background async task (returns task_id for polling). |
| `get_task_status` | 4 | read-only | Poll a background task by task_id. |
| `snapshot_status` | 5 | read-only | Reports freshness and provenance of eMAFF/FAMIC SQLite snapshots. |
| `open_dashboard` | 5 | read-only (UI) | Opens the MCP Apps UI dashboard. Falls back to a structured summary on hosts without MCP Apps. |
| `crop_calendar` | 6 | read-only | Month-by-month farming calendar for a crop × climate region (5 crops, 9 regions). |
| `field_weather_report` | 6 | read-only | Integrated weather + JMA + risk report for a single eMAFF field ID. |
| `spray_window` | 6 | read-only | Finds safe time windows for pesticide spraying (wind/rain/humidity analysis). |
| `multi_field_compare` | 6 | read-only | Side-by-side comparison of up to 10 fields with risk levels. |
| `seasonal_risk_forecast` | 6 | read-only | 7-day agricultural risk forecast with daily breakdown and overall risk level. |

App-only (UI-driven) tools and low-level helpers are documented in [docs/api-reference.md](docs/api-reference.md).

### Client examples

Three runnable clients in [`examples/`](examples) — TypeScript stdio, Python (`mcp[cli]`) stdio, and `curl` over Streamable HTTP — that all call `get_weather_1km` against this server.

## Prompts (Phase 2+)

User-controlled slash commands. The MCP host decides when to surface them; the LLM does not auto-fire them.

| Slash command | Required args | Since |
|---|---|---|
| `/field_summary` | `field_id` | 1.0.0 |
| `/pesticide_advice` | `crop`, `pest_or_disease` | 1.0.0 |
| `/staff_deploy_plan` | `farm_ids[]`, `period` | 1.0.0 |
| `/area_briefing` | `prefecture` | 1.1.0 |
| `/weather_risk_alert` | `farm_ids[]` | 1.1.0 |
| `/irrigation_schedule` | `lat`, `lng` | 1.3.0 |
| `/data_freshness_check` | *(none)* | 1.3.0 |
| `/harvest_readiness` | `crop`, `lat`, `lng`, `last_spray_date` | 1.4.0 |
| `/daily_briefing` | `lat`, `lng` | 1.5.0 |
| `/field_visit_checklist` | `field_id` | 1.5.0 |

## Data sources & licensing

This server only ships data sources that are open or whose licenses permit redistribution under documented constraints. See [docs/data-license.md](docs/data-license.md) for the full table.

| Source | License | Notes |
|---|---|---|
| eMAFF Fude Polygon | Public open data | SQLite snapshot built locally; not redistributed in npm package. |
| Open-Meteo | CC-BY 4.0 | Live API. Attribution included in tool output. |
| FAMIC pesticide | Public open data | SQLite snapshot built locally. |
| JMA disaster XML | Japan Meteorological Business Act | Phase 1+, short cache only. |
| WAGRI | Member agreement | **Out of scope for this OSS release** (Phase 7+, separate package). |

Cloud Next '26 agent-readiness notes for Agent Platform, Smart Storage,
Fraud Defense, and multi-AI security are tracked in
[`docs/cloud-next26-agent-readiness.md`](docs/cloud-next26-agent-readiness.md).
Reverse-proxy / Agent Gateway deployment guidance lives in
[`docs/agent-gateway-deployment.md`](docs/agent-gateway-deployment.md).

## Security

- No secrets in tool output, logs, errors, or UI bundles.
- DNS rebinding protection enabled on Streamable HTTP transport.
- Origin / Host allowlist on HTTP transport.
- See [SECURITY.md](./SECURITY.md) for vulnerability reporting.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All contributions must be Apache-2.0 compatible.

## License

Apache-2.0. © 2026 WIN Kagoshima
