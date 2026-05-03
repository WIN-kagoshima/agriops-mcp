import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { OpenMeteoWeatherAdapter } from "../../src/adapters/weather/open-meteo.js";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";

describe("Prompts", () => {
  it("exposes all 12 prompts", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const list = await client.listPrompts();
    const names = list.prompts.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "field_summary",
        "pesticide_advice",
        "staff_deploy_plan",
        "area_briefing",
        "weather_risk_alert",
        "irrigation_schedule",
        "data_freshness_check",
        "harvest_readiness",
        "daily_briefing",
        "field_visit_checklist",
        "market_trend_briefing",
        "region_dispatch_demand",
      ]),
    );
    expect(names).toHaveLength(12);

    await client.close();
    await server.close();
  });

  it("field_summary returns a prompt message for a given field_id", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "field_summary",
      arguments: { field_id: "fude-eval-0001" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");
    const content = r.messages[0]?.content as { text?: string };
    expect(typeof content.text).toBe("string");
    expect((content.text ?? "").length).toBeGreaterThan(10);

    await client.close();
    await server.close();
  });

  it("pesticide_advice returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "pesticide_advice",
      arguments: { crop: "稲", pest_or_disease: "いもち病" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");
    const content = r.messages[0]?.content as { text?: string };
    expect(content.text).toMatch(/稲|いもち/);

    await client.close();
    await server.close();
  });

  it("area_briefing returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "area_briefing",
      arguments: { prefecture: "鹿児島県" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");

    await client.close();
    await server.close();
  });

  it("weather_risk_alert returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "weather_risk_alert",
      arguments: { farm_ids: "fude-eval-0001,fude-eval-0002" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");

    await client.close();
    await server.close();
  });

  it("irrigation_schedule returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "irrigation_schedule",
      arguments: { lat: "31.59", lng: "130.55" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");
    const content = r.messages[0]?.content as { text?: string };
    expect(content.text).toMatch(/灌水|irrigation|ET₀/i);

    await client.close();
    await server.close();
  });

  it("data_freshness_check returns a prompt message without required args", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({ name: "data_freshness_check", arguments: {} });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");

    await client.close();
    await server.close();
  });

  it("harvest_readiness returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "harvest_readiness",
      arguments: { crop: "稲", lat: "31.59", lng: "130.55", last_spray_date: "2026-04-20" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");
    const content = r.messages[0]?.content as { text?: string };
    expect(content.text).toMatch(/収穫|harvest/i);

    await client.close();
    await server.close();
  });

  it("daily_briefing returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "daily_briefing",
      arguments: { lat: "31.59", lng: "130.55" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");

    await client.close();
    await server.close();
  });

  it("field_visit_checklist returns a prompt message", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "1.5.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "field_visit_checklist",
      arguments: { field_id: "fude-eval-0001" },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");

    await client.close();
    await server.close();
  });

  it("staff_deploy_plan returns a prompt message even when eMAFF is not configured", async () => {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server } = createServer({
      config,
      logger,
      version: "0.2.0-test",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const r = await client.getPrompt({
      name: "staff_deploy_plan",
      arguments: {
        farm_ids: "K46-0001-0001,K46-0002-0001",
        period: "2026-06-01 to 2026-06-30",
      },
    });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]?.role).toBe("user");
    const content = r.messages[0]?.content as { text?: string };
    expect(content.text).toMatch(/派遣計画/);

    await client.close();
    await server.close();
  });
});
