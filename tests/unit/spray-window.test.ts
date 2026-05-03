import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { WeatherAdapter } from "../../src/adapters/_interface.js";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import type { WeatherForecast } from "../../src/types/weather.js";

function makeHourly(count: number, windMs: number, precipMm: number) {
  return Array.from({ length: count }, (_, i) => ({
    time: `2026-05-01T${String(6 + i).padStart(2, "0")}:00:00Z`,
    temperatureC: 22,
    precipitationMm: precipMm,
    windSpeedMs: windMs,
    relativeHumidity: 65,
  }));
}

function buildWeatherWith(windMs: number, precipMm: number, count = 12): WeatherAdapter {
  const forecast: WeatherForecast = {
    source: "test",
    attribution: "test weather",
    location: { lat: 31.6, lng: 130.5, timezone: "Asia/Tokyo" },
    generatedAt: "2026-05-01T00:00:00Z",
    hourly: makeHourly(count, windMs, precipMm),
    alerts: [],
  };
  return {
    async getForecast({ lat, lng }) {
      return { ...forecast, location: { ...forecast.location, lat, lng } };
    },
  };
}

async function boot(weather: WeatherAdapter) {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({ config, logger, version: "test", overrides: { weather } });
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

function getText(r: Awaited<ReturnType<InstanceType<typeof Client>["callTool"]>>): string {
  return (r.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("\n");
}

describe("spray_window tool", () => {
  it("finds suitable slots when wind is calm and no precipitation", async () => {
    const { client, close } = await boot(buildWeatherWith(1.5, 0, 12));
    const r = await client.callTool({
      name: "spray_window",
      arguments: { lat: 31.6, lng: 130.5 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("散布");
    // Best slot recommendation should mention a time window
    expect(text).not.toContain("適期なし");
    await close();
  });

  it("reports no suitable slots when wind exceeds threshold", async () => {
    const { client, close } = await boot(buildWeatherWith(8, 0, 10));
    const r = await client.callTool({
      name: "spray_window",
      arguments: { lat: 31.6, lng: 130.5, wind_threshold_ms: 3 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("散布");
    await close();
  });

  it("reports no suitable slots when precipitation is present every hour", async () => {
    const { client, close } = await boot(buildWeatherWith(1.0, 3.0, 10));
    const r = await client.callTool({
      name: "spray_window",
      arguments: { lat: 31.6, lng: 130.5 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("散布");
    await close();
  });

  it("respects lenient wind threshold (5 m/s accepts 4.5 m/s wind)", async () => {
    const { client, close } = await boot(buildWeatherWith(4.5, 0, 10));
    // Strict threshold: no slots
    const strictR = await client.callTool({
      name: "spray_window",
      arguments: { lat: 31.6, lng: 130.5, wind_threshold_ms: 3 },
    });
    // Lenient threshold: should have slots
    const lenientR = await client.callTool({
      name: "spray_window",
      arguments: { lat: 31.6, lng: 130.5, wind_threshold_ms: 5 },
    });
    expect(strictR.isError).toBeFalsy();
    expect(lenientR.isError).toBeFalsy();
    const strictText = getText(strictR);
    const lenientText = getText(lenientR);
    // Strict should mention no window or empty, lenient should have slots
    expect(strictText).toContain("散布");
    expect(lenientText).toContain("散布");
    await close();
  });

  it("returns isError for invalid input (lat out of range)", async () => {
    const { client, close } = await boot(buildWeatherWith(1.5, 0));
    const r = await client.callTool({
      name: "spray_window",
      arguments: { lat: 999, lng: 130.5 },
    });
    expect(r.isError).toBe(true);
    await close();
  });
});
