"""
Minimal Google ADK agent that connects to AgriOps MCP over Streamable HTTP.

Prerequisites:
    pip install google-adk google-auth requests

Environment variables:
    AGRIOPS_MCP_URL      Full URL of the /mcp endpoint, e.g.
                         https://agriops-mcp-<hash>-an.a.run.app/mcp
    AGRIOPS_ID_TOKEN     Bearer token for Cloud Run IAM (see below).
    GOOGLE_CLOUD_PROJECT GCP project ID used by ADK for logging.

Getting an ID token for Cloud Run (Workload Identity Federation):
    gcloud auth print-identity-token --audiences=$AGRIOPS_MCP_URL

For production, use Workload Identity Federation so no long-lived keys
are ever stored — see docs/agent-gateway-deployment.md for the full setup.
"""

import os
import google.auth
import google.auth.transport.requests
from google.oauth2 import id_token as google_id_token

# ── Google ADK imports ────────────────────────────────────────────────────────
from google.adk.agents import Agent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StreamableHTTPConnectionParams

# ── ID token helper ───────────────────────────────────────────────────────────

def get_cloud_run_id_token(audience: str) -> str:
    """Fetch a short-lived Cloud Run ID token via Application Default Credentials."""
    auth_req = google.auth.transport.requests.Request()
    token = google_id_token.fetch_id_token(auth_req, audience)
    return token


# ── MCP toolset wired to AgriOps ─────────────────────────────────────────────

MCP_URL = os.environ["AGRIOPS_MCP_URL"]

agriops_toolset = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=MCP_URL,
        headers={
            # Obtain a fresh ID token for each session; in production, cache with a
            # short TTL (< 55 min) to avoid expiry mid-session.
            "Authorization": f"Bearer {get_cloud_run_id_token(MCP_URL)}",
            "X-Agent-ID": os.getenv("ADK_AGENT_ID", "agriops-adk-demo"),
            "X-Agent-Owner": os.getenv("ADK_AGENT_OWNER", "win-kagoshima"),
        },
    ),
    # Restrict to the model-visible tools only (excludes app-only Phase 5 helpers).
    # Remove filter to expose all 19 tools.
    tool_filter=[
        "get_weather_1km",
        "get_weather_warning",
        "search_farmland",
        "area_summary",
        "nearby_farms",
        "get_pesticide_rules",
        "create_staff_deploy_plan",
        "open_dashboard",
        "create_task",
        "get_task_status",
    ],
)

# ── Agent definition ──────────────────────────────────────────────────────────

root_agent = Agent(
    name="agriops_assistant",
    model="gemini-2.0-flash",
    description=(
        "Agricultural operations assistant for Japanese farms managed by WIN Kagoshima. "
        "Uses AgriOps MCP to look up farmland polygons, 1 km mesh weather forecasts "
        "(including ET₀ evapotranspiration and soil moisture), and FAMIC pesticide data."
    ),
    instruction=(
        "Answer questions about farms, weather, and crop management using the agriops-mcp tools. "
        "Always quote the `attribution` field when presenting data. "
        "Canonical workflow: search_farmland → get_weather_1km → get_pesticide_rules → open_dashboard. "
        "For long-running work use create_task and poll with get_task_status."
    ),
    tools=[agriops_toolset],
)
