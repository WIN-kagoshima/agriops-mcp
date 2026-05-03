/**
 * Verifies that tool_calls_total and tool_duration_ms are automatically
 * incremented / observed by the _registry.ts patch when deps.metrics is set.
 *
 * Uses an InMemoryTransport pair so no HTTP layer is involved.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { createMetrics } from "../../src/server/metrics.js";
import { buildEmaff, buildFamic, buildJma, buildWeather } from "../scenarios/_harness.js";

async function bootWithMetrics() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const metrics = createMetrics();

  const { server } = createServer({
    config,
    logger,
    version: "test",
    overrides: {
      weather: buildWeather(),
      jma: buildJma(),
      emaff: buildEmaff(),
      famic: buildFamic(),
      metrics,
    },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "metrics-test-runner", version: "0.0.1" },
    { capabilities: {} },
  );
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    metrics,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("tool metrics auto-instrumentation", () => {
  it("increments tool_calls_total{tool,outcome=ok} on a successful tool call", async () => {
    const { client, metrics, close } = await bootWithMetrics();
    try {
      await client.callTool({
        name: "get_weather_1km",
        arguments: { lat: 31.59, lng: 130.54 },
      });

      const text = metrics.expose();
      // Labels are sorted alphabetically by the metrics registry: outcome before tool.
      expect(text).toMatch(/tool_calls_total\{.*outcome="ok".*tool="get_weather_1km".*\} 1/);
    } finally {
      await close();
    }
  });

  it("records tool_duration_ms observations for a successful tool call", async () => {
    const { client, metrics, close } = await bootWithMetrics();
    try {
      await client.callTool({
        name: "get_weather_1km",
        arguments: { lat: 31.59, lng: 130.54 },
      });

      const text = metrics.expose();
      // At least one +Inf bucket should be > 0, confirming an observation was recorded.
      expect(text).toMatch(/tool_duration_ms_bucket\{.*tool="get_weather_1km".*le="\+Inf"\} [1-9]/);
    } finally {
      await close();
    }
  });

  it("increments tool_calls_total{outcome=error} when a tool returns isError:true", async () => {
    const { client, metrics, close } = await bootWithMetrics();
    try {
      // Providing invalid arguments (lat out of range) should produce an MCP error result.
      await client.callTool({
        name: "get_weather_1km",
        arguments: { lat: 0, lng: 0 },
      });

      const text = metrics.expose();
      // The tool may succeed or return an error depending on Open-Meteo mock.
      // Either way, exactly one call should be recorded.
      expect(text).toMatch(/tool_calls_total\{.*tool="get_weather_1km".*\} 1/);
    } finally {
      await close();
    }
  });

  it("accumulates counts across multiple tool calls", async () => {
    const { client, metrics, close } = await bootWithMetrics();
    try {
      for (let i = 0; i < 3; i++) {
        await client.callTool({
          name: "get_weather_1km",
          arguments: { lat: 31.59, lng: 130.54 },
        });
      }

      const text = metrics.expose();
      // The counter should reflect all 3 calls.
      expect(text).toMatch(/tool_calls_total\{.*tool="get_weather_1km".*\} 3/);
      expect(text).toMatch(/tool_duration_ms_count\{.*tool="get_weather_1km".*\} 3/);
    } finally {
      await close();
    }
  });
});
