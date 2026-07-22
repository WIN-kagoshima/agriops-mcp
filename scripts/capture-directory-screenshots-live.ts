#!/usr/bin/env tsx
/**
 * Captures 5 PNG screenshots of the MCP Apps dashboard for the Anthropic
 * Connectors Directory submission (§6/§8.3 of
 * docs/anthropic-directory-submission.md), sourcing BOTH the dashboard HTML
 * bundle AND the four `viz_hint`-driven tool responses from the real,
 * anonymously-reachable public Cloud Run deployment via genuine MCP
 * Streamable HTTP JSON-RPC calls (`initialize` / `resources/read` /
 * `tools/call`) — not the hand-written mock bridge in
 * `scripts/capture-directory-screenshots.ts`.
 *
 * This is the closest a non-interactive agent can get to the "final
 * live-host recapture" §6 asks for without an actual Claude Desktop / MCP
 * Inspector Apps-preview session: real server, real data, real bundle,
 * driven by a `window.mcpApps` bridge that is a thin pass-through to
 * already-fetched real `tools/call` results (so Playwright doesn't need to
 * re-implement MCP Apps' actual runtime bridge, but nothing rendered is
 * fabricated).
 *
 * Usage:
 *   npx tsx scripts/capture-directory-screenshots-live.ts [baseUrl]
 *
 * Defaults to the public anonymous Cloud Run URL documented in
 * docs/anthropic-directory-submission.md §2.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..");
const outDir = resolve(repoRoot, "assets/directory-screenshots");
const DEFAULT_BASE_URL = "https://agriops-mcp-public-731026511067.asia-northeast1.run.app";

const DASHBOARD_URI = "ui://agriops/dashboard.html";

interface RpcResponse {
  status: number;
  parsed: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resultObject(parsed: unknown): Record<string, unknown> {
  if (!isRecord(parsed)) return {};
  return isRecord(parsed.result) ? parsed.result : parsed;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean);
    if (dataLines.length > 0) return JSON.parse(dataLines.join("\n"));
  }
  return JSON.parse(trimmed);
}

async function callRpc(
  baseUrl: string,
  method: string,
  params: Record<string, unknown>,
  id: number,
): Promise<RpcResponse> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "x-request-id": `directory-screenshots-live-${method.replace("/", "-")}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  try {
    return { status: res.status, parsed: parseJson(text) };
  } catch {
    throw new Error(
      `Failed to parse response for ${method}: status=${res.status} body=${text.slice(0, 300)}`,
    );
  }
}

interface ToolCallResult {
  content: unknown;
  structuredContent: unknown;
}

async function callTool(
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
  id: number,
): Promise<ToolCallResult> {
  const res = await callRpc(baseUrl, "tools/call", { name, arguments: args }, id);
  const result = resultObject(res.parsed);
  if (res.status !== 200 || result.isError === true) {
    throw new Error(
      `tools/call ${name} failed: status=${res.status} result=${JSON.stringify(result).slice(0, 500)}`,
    );
  }
  return {
    content: result.content,
    structuredContent: result.structuredContent,
  };
}

async function main() {
  const baseUrl = (process.argv[2] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  console.log(`Fetching live dashboard + tool data from ${baseUrl} ...`);

  const initRes = await callRpc(
    baseUrl,
    "initialize",
    {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "agriops-directory-screenshots-live", version: "0.0.1" },
    },
    1,
  );
  const serverInfo = isRecord(resultObject(initRes.parsed).serverInfo)
    ? (resultObject(initRes.parsed).serverInfo as Record<string, unknown>)
    : {};
  if (initRes.status !== 200 || serverInfo.name !== "agriops-mcp") {
    throw new Error(`initialize failed against ${baseUrl}: status=${initRes.status}`);
  }
  console.log(`Connected: ${serverInfo.name}@${String(serverInfo.version)}`);

  const resourceRes = await callRpc(baseUrl, "resources/read", { uri: DASHBOARD_URI }, 2);
  const contents = resultObject(resourceRes.parsed).contents;
  const firstContent = Array.isArray(contents) && isRecord(contents[0]) ? contents[0] : undefined;
  const html = typeof firstContent?.text === "string" ? firstContent.text : undefined;
  if (resourceRes.status !== 200 || !html) {
    throw new Error(
      `resources/read ${DASHBOARD_URI} failed against ${baseUrl}: status=${resourceRes.status}`,
    );
  }
  console.log(`Fetched live dashboard bundle: ${html.length.toLocaleString()} bytes`);

  const [municipality, radar, livestock, marketPrice] = await Promise.all([
    callTool(baseUrl, "get_municipality_stats", { prefectureCode: "JP-46" }, 3),
    callTool(baseUrl, "get_ssw_crop_compatibility", { crop: "みかん" }, 4),
    callTool(baseUrl, "get_livestock_regional_stats", { prefectureCode: "JP-46" }, 5),
    callTool(baseUrl, "get_market_price", { crop: "みかん" }, 6),
  ]);
  console.log("Fetched real structuredContent for all 4 dashboard-helper tools.");

  const RESPONSES: Record<string, ToolCallResult> = {
    get_municipality_stats: municipality,
    get_ssw_crop_compatibility: radar,
    get_livestock_regional_stats: livestock,
    get_market_price: marketPrice,
  };

  mkdirSync(outDir, { recursive: true });
  const htmlPath = resolve(outDir, "_live-dashboard-snapshot.html");
  writeFileSync(htmlPath, html, "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.addInitScript(`
    (function () {
      const responses = ${JSON.stringify(RESPONSES)};
      window.mcpApps = {
        callTool: async function (name) {
          const real = responses[name];
          if (!real) return { content: [{ type: "text", text: "" }], structuredContent: null };
          return real;
        },
        setView: function () {},
        onStateChange: function () { return function () {}; },
      };
    })();
  `);

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(`file://${htmlPath}`);
  await page.waitForSelector("#root .dashboard-header", { timeout: 10_000 });

  // 1. Initial load — municipality choropleth map (real 鹿児島県 SSW data).
  await page.waitForSelector(".viz-map-panel", { timeout: 10_000 });
  await page.waitForTimeout(1500); // let maplibre finish its first paint
  await page.screenshot({ path: resolve(outDir, "1-choropleth-municipality-map.png") });

  // 2. SSW crop-compatibility radar (real みかん score).
  await page.getByRole("button", { name: "SSW適性スコア" }).click();
  await page.waitForSelector(".viz-panel svg", { timeout: 10_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, "2-radar-ssw-crop-compatibility.png") });

  // 3. Livestock regional bar comparison (real 鹿児島県 4-sector breakdown).
  await page.getByRole("button", { name: "畜産マップ" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, "3-bar-compare-livestock.png") });

  // 4. Market-price time series (real みかん monthly estimate).
  await page.getByRole("button", { name: "市場価格" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, "4-timeseries-market-price.png") });

  // 5. CSV export ("take this artifact home") fallback panel, exporting
  //    whatever real data is currently on screen (the market-price series).
  await page.getByRole("button", { name: "CSV ダウンロード" }).click();
  await page.waitForSelector(".csv-fallback-panel", { timeout: 5_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(outDir, "5-csv-export-artifact.png") });

  await browser.close();

  if (pageErrors.length > 0) {
    console.warn(`Captured with ${pageErrors.length} uncaught page error(s):`);
    for (const msg of pageErrors) console.warn(`  - ${msg}`);
  }
  console.log(`Wrote 5 screenshots (sourced from live ${baseUrl}) to ${outDir}`);
  console.log(`(kept ${htmlPath} alongside them as the exact HTML snapshot that was rendered)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
