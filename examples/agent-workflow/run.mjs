// @ts-check
/**
 * AgriOps MCP — minimal multi-tool agent example.
 *
 * Demonstrates the canonical AgriOps workflow that an LLM-powered agent
 * is expected to run end-to-end:
 *
 *   1. `search_farmland`       — pick a candidate field by prefecture/crop.
 *   2. `get_weather_1km`       — fetch site-specific hourly weather.
 *   3. `get_pesticide_rules`   — look up pesticide registrations for that crop.
 *
 * The script is deliberately deterministic and key-free: it runs the
 * official MCP SDK over stdio, drives the public AgriOps MCP server,
 * and lets you confirm the surface, attribution strings, and pagination
 * behavior end-to-end without depending on any LLM provider.
 *
 * Treat the body of this file as a reference plan that any of the
 * LLM tool-use loops in `README.md` can follow:
 *
 *   - Anthropic Claude (Messages API + tool_use)
 *   - Google Gemini API (function calling)
 *   - OpenAI Responses API (tools)
 *   - Google Cloud ADK / Gemini Enterprise Agent Platform
 *
 * Usage:
 *   node ./run.mjs                              # uses ../../dist/server.js
 *   node ./run.mjs path/to/built/server.js      # custom server entrypoint
 *
 * Set AGRIOPS_PREFECTURE_CODE / AGRIOPS_CROP to override the demo target.
 * If the local server has no eMAFF/FAMIC snapshots, the script gracefully
 * skips the snapshot-dependent steps and still exercises Phase 0 weather.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PREFECTURE_CODE = process.env.AGRIOPS_PREFECTURE_CODE ?? "JP-46";
const CROP = process.env.AGRIOPS_CROP ?? "さつまいも";

function pickFirstTextContent(result) {
  if (!result || !Array.isArray(result.content)) return undefined;
  for (const c of result.content) {
    if (c && typeof c === "object" && "text" in c && typeof c.text === "string") {
      return c.text;
    }
  }
  return undefined;
}

function printStep(label, payload) {
  console.log(`\n▶ ${label}`);
  if (payload === undefined) {
    console.log("  (no payload)");
    return;
  }
  for (const line of String(payload).split(/\r?\n/)) {
    console.log(`  ${line}`);
  }
}

function summariseTools(tools) {
  return tools
    .map((t) => t.name)
    .sort()
    .join(", ");
}

function pickFirstField(structured) {
  if (!structured || typeof structured !== "object") return undefined;
  const fields = /** @type {unknown} */ (structured).fields;
  if (!Array.isArray(fields) || fields.length === 0) return undefined;
  return fields[0];
}

async function safeCall(client, name, args) {
  try {
    return await client.callTool({ name, arguments: args });
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
    };
  }
}

const serverEntry = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../../dist/server.js", import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry, "--stdio"],
});

const client = new Client(
  { name: "agriops-mcp-agent-workflow", version: "0.0.1" },
  { capabilities: {} },
);

console.log("AgriOps MCP agent workflow demo");
console.log(`server entry: ${serverEntry}`);
console.log(`prefecture:   ${PREFECTURE_CODE}`);
console.log(`crop:         ${CROP}`);

await client.connect(transport);
try {
  // 1. Discover the surface, exactly like an LLM agent does on first turn.
  const info = client.getServerVersion();
  printStep("MCP server identification", `${info?.name ?? "(unknown)"} v${info?.version ?? "?"}`);

  const toolList = await client.listTools();
  const toolNames = new Set(toolList.tools.map((t) => t.name));
  printStep("Tools advertised", summariseTools(toolList.tools));

  const promptList = await client.listPrompts();
  printStep(
    "Prompts advertised",
    promptList.prompts.map((p) => `/${p.name}`).join(", ") || "(none)",
  );

  const resourceList = await client.listResources();
  printStep(
    "Resources advertised",
    resourceList.resources.map((r) => r.uri).join(", ") || "(none)",
  );

  // 2. Search for a farmland polygon if eMAFF is available.
  let centroid = { lat: 31.55, lng: 130.55 };
  let fieldDescription = `default ${PREFECTURE_CODE} centroid (no eMAFF snapshot detected)`;

  if (toolNames.has("search_farmland")) {
    const search = await safeCall(client, "search_farmland", {
      prefectureCode: PREFECTURE_CODE,
      crop: CROP,
      limit: 5,
    });

    if (search.isError) {
      printStep("search_farmland", `error: ${pickFirstTextContent(search) ?? "(no detail)"}`);
    } else {
      const summary = pickFirstTextContent(search) ?? "(no summary)";
      printStep("search_farmland", summary);
      const first = pickFirstField(search.structuredContent);
      if (first && typeof first === "object" && "centroid" in first) {
        centroid = /** @type {{ lat: number; lng: number }} */ (first.centroid);
        fieldDescription = `field ${first.fieldId ?? "?"} (${first.address ?? "no address"})`;
      } else {
        fieldDescription = `no fields matched; falling back to ${PREFECTURE_CODE} centroid`;
      }
    }
  } else {
    printStep("search_farmland", "skipped — eMAFF snapshot is not loaded on this server");
  }

  // 3. Fetch site-specific hourly weather.
  const weather = await safeCall(client, "get_weather_1km", {
    lat: centroid.lat,
    lng: centroid.lng,
    hours: 24,
    timezone: "Asia/Tokyo",
  });
  if (weather.isError) {
    printStep("get_weather_1km", `error: ${pickFirstTextContent(weather) ?? "(no detail)"}`);
  } else {
    const summary = pickFirstTextContent(weather) ?? "(no summary)";
    const sc = /** @type {{ hourly?: unknown[] }} */ (weather.structuredContent);
    printStep(
      "get_weather_1km",
      `${summary}\nhours returned: ${Array.isArray(sc?.hourly) ? sc.hourly.length : 0}\ntargeting: ${fieldDescription}`,
    );
  }

  // 4. Look up pesticide registrations for the candidate crop.
  if (toolNames.has("get_pesticide_rules")) {
    const pesticide = await safeCall(client, "get_pesticide_rules", {
      crop: CROP,
      limit: 3,
    });
    if (pesticide.isError) {
      printStep(
        "get_pesticide_rules",
        `error: ${pickFirstTextContent(pesticide) ?? "(no detail)"}`,
      );
    } else {
      printStep("get_pesticide_rules", pickFirstTextContent(pesticide) ?? "(no summary)");
    }
  } else {
    printStep("get_pesticide_rules", "skipped — FAMIC snapshot is not loaded on this server");
  }

  // 5. Surface the dashboard hint for hosts that support MCP Apps UI.
  if (toolNames.has("open_dashboard")) {
    const dashboard = await safeCall(client, "open_dashboard", {
      focus: { lat: centroid.lat, lng: centroid.lng, zoom: 12 },
    });
    if (dashboard.isError) {
      printStep("open_dashboard", `error: ${pickFirstTextContent(dashboard) ?? "(no detail)"}`);
    } else {
      printStep("open_dashboard", pickFirstTextContent(dashboard) ?? "(dashboard hint emitted)");
    }
  }

  console.log("\n✓ Workflow finished. See README.md for LLM tool-use loop wiring.");
} finally {
  await client.close();
}
