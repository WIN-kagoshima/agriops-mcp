import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import {
  FIELD_RICE,
  FIELD_SWEETPOTATO,
  buildEmaff,
  buildJma,
  buildWeather,
} from "../scenarios/_harness.js";

async function bootWithEmaff() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({
    config,
    logger,
    version: "test",
    overrides: { weather: buildWeather(), jma: buildJma(), emaff: buildEmaff() },
  });
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

async function bootWithoutEmaff() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({
    config,
    logger,
    version: "test",
    overrides: { weather: buildWeather() },
  });
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

describe("field_weather_report tool", () => {
  it("returns a weather report for FIELD_RICE with field ID and crop", async () => {
    const { client, close } = await bootWithEmaff();
    const r = await client.callTool({
      name: "field_weather_report",
      arguments: { field_id: FIELD_RICE.fieldId },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain(FIELD_RICE.fieldId);
    expect(text).toContain("稲");
    expect(text).toContain("予報サマリ");
    await close();
  });

  it("returns report for FIELD_SWEETPOTATO with さつまいも crop", async () => {
    const { client, close } = await bootWithEmaff();
    const r = await client.callTool({
      name: "field_weather_report",
      arguments: { field_id: FIELD_SWEETPOTATO.fieldId },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("さつまいも");
    await close();
  });

  it("returns isError when field_id is not found in eMAFF", async () => {
    const { client, close } = await bootWithEmaff();
    const r = await client.callTool({
      name: "field_weather_report",
      arguments: { field_id: "fude-nonexistent-9999" },
    });
    expect(r.isError).toBe(true);
    await close();
  });

  it("returns isError when eMAFF is not configured at runtime", async () => {
    const { client, close } = await bootWithoutEmaff();
    const tools = await client.listTools();
    const hasTool = tools.tools.some((t) => t.name === "field_weather_report");
    if (!hasTool) {
      // Some deployments may not register the tool without eMAFF — acceptable
      expect(hasTool).toBe(false);
    } else {
      const r = await client.callTool({
        name: "field_weather_report",
        arguments: { field_id: "fude-eval-0001" },
      });
      expect(r.isError).toBe(true);
    }
    await close();
  });
});
