/**
 * Unit tests for get_market_price (Phase 7, app-visible on the default surface).
 *
 * Regression coverage for the `monthlySeries` fix: prior to this, the tool's
 * `viz_hint` declared `preferredView: "timeseries"` but `structuredContent`
 * only ever carried a single month, so the dashboard's TimeSeries view
 * always rendered "データがありません" against real (non-mocked) data. See
 * docs/anthropic-directory-submission.md §9 and CHANGELOG.md.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { extractVizHint } from "../../src/lib/viz-hint.js";
import { createServer } from "../../src/server/create-server.js";

async function boot() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({ config, logger, version: "test" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
  await Promise.all([client.connect(ct), server.connect(st)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("get_market_price tool", () => {
  it("returns a full 12-month monthlySeries alongside the current-month fields", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({ name: "get_market_price", arguments: { crop: "みかん" } });
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as Record<string, unknown>;
    expect(sc.crop).toBe("みかん");
    expect(Array.isArray(sc.monthlySeries)).toBe(true);
    const series = sc.monthlySeries as Array<Record<string, unknown>>;
    expect(series).toHaveLength(12);
    expect(series.map((row) => row.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const row of series) {
      expect(typeof row.estimatedPriceYen).toBe("number");
      expect(typeof row.seasonalFactor).toBe("number");
    }
    await close();
  });

  it("viz_hint.dataPath points at the monthlySeries array, matching the declared timeseries view", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({ name: "get_market_price", arguments: { crop: "みかん" } });
    const hint = extractVizHint(r.structuredContent);
    expect(hint?.preferredView).toBe("timeseries");
    if (hint?.preferredView === "timeseries") {
      expect(hint.dataPath).toBe("monthlySeries");
      const sc = r.structuredContent as Record<string, unknown>;
      const resolved = (sc as { monthlySeries?: unknown }).monthlySeries;
      expect(Array.isArray(resolved)).toBe(true);
    }
    await close();
  });

  it("a specific month request still returns the matching top-level snapshot", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "get_market_price",
      arguments: { crop: "さつまいも", month: 11 },
    });
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as Record<string, unknown>;
    expect(sc.month).toBe(11);
    const series = sc.monthlySeries as Array<Record<string, unknown>>;
    const novRow = series.find((row) => row.month === 11);
    expect(novRow?.estimatedPriceYen).toBe(sc.estimatedPriceYen);
    await close();
  });

  it("returns an empty monthlySeries (not an error) for an unregistered crop", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "get_market_price",
      arguments: { crop: "存在しない架空作物XYZ" },
    });
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as Record<string, unknown>;
    expect(sc.monthlySeries).toEqual([]);
    expect(Array.isArray(sc.availableProducts)).toBe(true);
    await close();
  });

  it("rejects an out-of-range month with a validation error", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "get_market_price",
      arguments: { crop: "みかん", month: 13 },
    });
    expect(r.isError).toBe(true);
    await close();
  });
});
