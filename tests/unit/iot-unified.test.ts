import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { buildWeather } from "../scenarios/_harness.js";

async function boot() {
  const config = loadConfig();
  // Override iotSnapshotPath to a memory database or local test db to avoid interfering with production snapshots
  config.iotSnapshotPath = "./snapshots/iot-unified-test.sqlite";

  const logger = createLogger({ level: "error" });
  const { server, deps } = createServer({
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
    deps,
    close: async () => {
      await client.close();
      await server.close();
      // Safely close sqlite connection if open
      if (deps.iotDb) {
        deps.iotDb.close();
      }
    },
  };
}

function getText(r: Awaited<ReturnType<InstanceType<typeof Client>["callTool"]>>): string {
  const content = r.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("\n");
}

describe("Agri-IoT Unified Data MCP Tools", () => {
  it("get_realtime_sensor_data returns soil moisture and evaluate safely", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "get_realtime_sensor_data",
      arguments: { farmId: "farm_kagoshima_01", sensorType: "soil_moisture" },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("Sensor [soil_moisture] at farm [farm_kagoshima_01]");
    expect(r.structuredContent).toBeDefined();
    expect((r.structuredContent as any).value).toBeGreaterThanOrEqual(0.1);
    await close();
  });

  it("get_machine_iot_status returns equipment activity and diagnostics", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "get_machine_iot_status",
      arguments: { machineId: "mach_tractor_001" },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("Kubota M7-172");
    expect(text).toContain("mach_tractor_001");
    expect(r.structuredContent).toBeDefined();
    expect((r.structuredContent as any).battery).toBe(98);
    await close();
  });

  it("predict_labor_demand runs workforce crew calculation factoring weather rules", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "predict_labor_demand",
      arguments: { farmId: "farm_kagoshima_02", cropType: "Sweet Potato", daysAhead: 7 },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("Labor demand for Sweet Potato");
    expect(text).toContain("SuguVisa Dispatch");
    expect(r.structuredContent).toBeDefined();
    expect((r.structuredContent as any).farmAreaHa).toBeGreaterThan(0);
    await close();
  });

  it("plan_irrigation outputs FAO-56 Penman-Monteith balanced advice", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "plan_irrigation",
      arguments: { farmId: "farm_kagoshima_01" },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("Irrigation advice for farm");
    expect(r.structuredContent).toBeDefined();
    expect((r.structuredContent as any).currentSoilMoisture).toBeDefined();
    await close();
  });

  it("generate_subsidy_application drafts official MAFF granting document", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "generate_subsidy_application",
      arguments: { farmId: "farm_kagoshima_01", subsidyType: "smart_farming_support" },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("スマート農業導入支援・サービス化推進事業計画書");
    expect(text).toContain("国庫補助要請額");
    expect(r.structuredContent).toBeDefined();
    expect((r.structuredContent as any).rawMarkdown).toBeDefined();
    await close();
  });

  it("get_traceability_report validates sprays against FAMIC regulatory rules", async () => {
    const { client, close } = await boot();
    const r = await client.callTool({
      name: "get_traceability_report",
      arguments: { batchId: "batch_tea_2026_01" },
    });
    expect(r.isError).toBeFalsy();
    const text = getText(r);
    expect(text).toContain("Traceability report for crop batch");
    expect(text).toContain("Pesticide spray records");
    expect(r.structuredContent).toBeDefined();
    expect((r.structuredContent as any).safetyStatus).toBeDefined();
    await close();
  });
});
