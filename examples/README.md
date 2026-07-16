# AgriOps MCP — Client examples

Minimal clients and configuration snippets that connect to the AgriOps MCP server.

| Folder | Transport | What it shows |
| --- | --- | --- |
| [`stdio-typescript/`](stdio-typescript) | stdio | Official `@modelcontextprotocol/sdk` client driving the server as a child process. |
| [`stdio-python/`](stdio-python) | stdio | Official `mcp[cli]` Python client (`mcp.client.stdio`). |
| [`http-curl/`](http-curl) | Streamable HTTP | Plain `curl` calls against the `/mcp` endpoint. Useful when integrating from any language. |
| [`agent-workflow/`](agent-workflow) | stdio | Multi-tool workflow (`search_farmland → get_weather_1km → get_pesticide_rules → open_dashboard`) — canonical reference plan for an LLM tool-use loop (Claude / Gemini / OpenAI / ADK). |
| [`claude-desktop/`](claude-desktop) | stdio / HTTP | `claude_desktop_config.json` snippets for Claude Desktop and Cursor, plus a troubleshooting guide. |
| [`google-adk/`](google-adk) | Streamable HTTP | Google ADK `agent.py` + WIF auth guide. Exercises the default 8-tool core plus ET₀ agri metrics; set `AGRIOPS_ENABLE_EXTENDED_TOOLS=true` on the server to also exercise the Tasks Primitive. |

The SDK examples target the same surface so you can compare them side by side.
None of them require any keys, snapshots, or external accounts: they
exercise Phase 0 (`get_weather_1km`, Open-Meteo) only.

The HTTP example can also target the IAM-protected Cloud Run reference
deployment if you provide an identity token:

```bash
export AGRIOPS_BASE_URL=https://agriops-mcp-n5vdix22hq-an.a.run.app
export AGRIOPS_AUTH_BEARER="$(gcloud auth print-identity-token)"
cd examples/http-curl
./run.sh
```

## Prerequisites

```bash
git clone https://github.com/WIN-kagoshima/agriops-mcp
cd agriops-mcp
npm install
npm run build
```

Then `cd examples/<folder>` and follow that folder's README.
