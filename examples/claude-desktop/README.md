# AgriOps MCP — Claude Desktop setup

Two ways to wire AgriOps MCP into Claude Desktop:

## Option A — stdio (recommended for local development)

Runs the server as a child process of Claude Desktop.

### Prerequisites

```bash
# 1. Install globally (or clone and build locally)
npm install -g @win-kagoshima/agriops-mcp   # when published to npm
# or
git clone https://github.com/WIN-kagoshima/agriops-mcp.git
cd agriops-mcp
npm install && npm run build

# 2. (Optional) Build the SQLite snapshots
#    See docs/runbook.md §1 for how to obtain the raw data files.
npm run snapshots:build
```

### Config file location

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### claude_desktop_config.json

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/agriops-mcp/dist/server.js",
        "--stdio"
      ],
      "env": {
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

Replace `/absolute/path/to/agriops-mcp` with the actual path to your clone.

**Windows path example:**

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "command": "node",
      "args": [
        "C:\\Users\\yourname\\agriops-mcp\\dist\\server.js",
        "--stdio"
      ]
    }
  }
}
```

### Quick test

After saving the config file, restart Claude Desktop. Open a new conversation and try:

> 鹿児島県の農地を検索して

Claude should call `search_farmland` and return farmland data (or a message about missing snapshot data if you skipped step 2).

---

## Option B — Streamable HTTP (for shared or remote deployments)

Start the server first:

```bash
npm run start:http
# Server listens on http://localhost:8080
```

Then add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "type": "http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

This mode is also suitable when the server runs in Docker:

```bash
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e MCP_BASE_URL=http://localhost:8080 \
  ghcr.io/win-kagoshima/agriops-mcp:latest
```

---

## Available tools (Phase 0–5)

Once connected, Claude Desktop has access to:

| Tool | Description |
|---|---|
| `search_farmland` | Search eMAFF farmland polygons by prefecture, city, or keyword |
| `nearby_farms` | Find farms within a radius of a coordinate |
| `area_summary` | Prefecture/city-level farmland statistics |
| `get_weather_1km` | 1 km mesh hourly weather forecast (Open-Meteo) |
| `get_weather_warning` | Active JMA weather warnings by prefecture |
| `get_pesticide_rules` | FAMIC pesticide registration rules by crop/pest |
| `open_dashboard` | Open the interactive map dashboard (MCP Apps hosts) |
| *(+ 10 more)* | See [`docs/architecture.md`](../../docs/architecture.md) |

And 5 slash-command prompts:

| Prompt | Usage |
|---|---|
| `field_summary` | `/field_summary fieldId=fude-…` |
| `weather_risk_alert` | `/weather_risk_alert prefectureCode=JP-46` |
| `pesticide_advice` | `/pesticide_advice crop=稲 pest=いもち病` |
| `area_briefing` | `/area_briefing prefectureCode=JP-46` |
| `staff_deploy_plan` | `/staff_deploy_plan farm_ids=… period=…` |

---

## Cursor setup (Streamable HTTP)

Add to `.cursor/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "type": "http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

Or to the global Cursor MCP config (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "agriops-mcp": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/server.js", "--stdio"]
    }
  }
}
```

---

## Troubleshooting

**"Connection closed" on Windows (stdio mode)**

Make sure you are using an **absolute path** in `args[0]`, not a relative path. On Windows, Node.js resolves paths relative to the Claude Desktop working directory, which is typically `C:\Program Files\Claude`.

**"snapshot missing (Phase 0 mode)" in /readyz**

The server runs in Phase 0 (weather + JMA only) when SQLite snapshots are absent. Run `npm run snapshots:build` after placing the raw data files in `snapshots/raw/`. See [`docs/runbook.md`](../../docs/runbook.md) §1 for the data download steps.

**Logging**

Set `LOG_LEVEL` to `debug` in the config `env` block to see verbose output in the Claude Desktop developer console.
