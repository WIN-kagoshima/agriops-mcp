import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { WeatherAdapter } from "../../src/adapters/_interface.js";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import type { WeatherForecast } from "../../src/types/weather.js";

function buildMultiDayWeather(
  overrides?: Partial<{ tempMax: number; precip: number; wind: number }>,
): WeatherAdapter {
  const tempMax = overrides?.tempMax ?? 22;
  const precip = overrides?.precip ?? 0;
  const wind = overrides?.wind ?? 2.5;
  // 168 hourly entries spanning 7 days
  const hourly = Array.from({ length: 168 }, (_, i) => {
    const dayMs = Math.floor(i / 24);
    const hour = i % 24;
    const d = new Date(Date.UTC(2026, 4, 1 + dayMs, hour));
    return {
      time: d.toISOString(),
      temperatureC: hour >= 12 && hour <= 15 ? tempMax : tempMax - 6,
      precipitationMm: precip,
      windSpeedMs: wind,
      relativeHumidity: 60,
      et0EvapotranspirationMm: 0.3,
      soilMoisture: 0.25,
    };
  });
  const forecast: WeatherForecast = {
    source: "test",
    attribution: "test weather",
    location: { lat: 31.6, lng: 130.5, timezone: "Asia/Tokyo" },
    generatedAt: "2026-05-01T00:00:00Z",
    hourly,
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

describe("seasonal_risk_forecast tool", () => {
  it("returns 7-day forecast with weekly summary header", async () => {
    const { client, close } = await boot(buildMultiDayWeather());
    const r = await client.callTool({
      name: "seasonal_risk_forecast",
      arguments: { lat: 31.6, lng: 130.5 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("週間リスク予報");
    expect(text).toContain("週間サマリ");
    // 7 date rows (2026-05-01 through 2026-05-07)
    expect(text).toContain("2026-05-01");
    await close();
  });

  it("detects heavy rain risk when precip is high", async () => {
    const { client, close } = await boot(buildMultiDayWeather({ precip: 3 })); // 72mm/day
    const r = await client.callTool({
      name: "seasonal_risk_forecast",
      arguments: { lat: 31.6, lng: 130.5 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    // Should flag rain-related risk
    expect(text).toMatch(/大雨|まとまった雨/);
    await close();
  });

  it("detects heat stress when tempMax exceeds 35°C", async () => {
    const { client, close } = await boot(buildMultiDayWeather({ tempMax: 37 }));
    const r = await client.callTool({
      name: "seasonal_risk_forecast",
      arguments: { lat: 31.6, lng: 130.5 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("猛暑");
    await close();
  });

  it("includes crop name in header when crop is provided", async () => {
    const { client, close } = await boot(buildMultiDayWeather());
    const r = await client.callTool({
      name: "seasonal_risk_forecast",
      arguments: { lat: 31.6, lng: 130.5, crop: "さつまいも" },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("さつまいも");
    await close();
  });

  it("returns isError for invalid coordinates", async () => {
    const { client, close } = await boot(buildMultiDayWeather());
    const r = await client.callTool({
      name: "seasonal_risk_forecast",
      arguments: { lat: 200, lng: 130.5 },
    });
    expect(r.isError).toBe(true);
    await close();
  });
});
