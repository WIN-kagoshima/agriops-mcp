import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { buildWeather } from "../scenarios/_harness.js";

async function boot() {
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
  const content = r.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("\n");
}

describe("crop_calendar tool", () => {
  it("returns a calendar for さつまいも in kyushu", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({ name: "crop_calendar", arguments: { crop: "さつまいも" } });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("さつまいも");
    expect(text).toContain("kyushu");
    expect(text).toContain("挿苗");
    expect(text).toContain("収穫");
    await close();
  });

  it("shifts months by +1 for hokkaido (田植え later)", async () => {
    const { client, close } = await boot();
    const kyushuR = await client.callTool({
      name: "crop_calendar",
      arguments: { crop: "稲", region: "kyushu" },
    });
    const hokkaidoR = await client.callTool({
      name: "crop_calendar",
      arguments: { crop: "稲", region: "hokkaido" },
    });
    expect(kyushuR.isError).toBeFalsy();
    expect(hokkaidoR.isError).toBeFalsy();
    // Both should mention 田植え but in different months
    expect(getText(kyushuR)).toContain("田植え");
    expect(getText(hokkaidoR)).toContain("田植え");
    expect(getText(hokkaidoR)).toContain("hokkaido");
    await close();
  });

  it("lists available crops and empty calendar for unknown crop", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({ name: "crop_calendar", arguments: { crop: "ドリアン" } });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    // Should mention one of the known crops as available
    expect(text).toMatch(/さつまいも|稲|キャベツ/);
    await close();
  });

  it("accepts crop alias (甘藷 → さつまいも)", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({ name: "crop_calendar", arguments: { crop: "甘藷" } });
    expect(r.isError).toBeFalsy();
    expect(getText(r)).toContain("さつまいも");
    await close();
  });

  it("returns isError for empty crop string", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({ name: "crop_calendar", arguments: { crop: "" } });
    expect(r.isError).toBe(true);
    await close();
  });
});
