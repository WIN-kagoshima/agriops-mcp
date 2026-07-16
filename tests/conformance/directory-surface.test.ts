/**
 * Directory-surface conformance.
 *
 * Verifies the *default* model-visible tool surface (no env overrides) is
 * the slim 8-tool core described in docs/anthropic-directory-submission.md.
 * This is the surface an Anthropic Connectors Directory reviewer, the MCP
 * Inspector, or a first-time agent sees. `vitest.config.ts` sets
 * `AGRIOPS_ENABLE_EXTENDED_TOOLS` / `AGRIOPS_ENABLE_LEGACY_TOOLS` to `true`
 * for the rest of the suite so those tools stay covered elsewhere; this
 * file explicitly unsets both to assert the opposite default.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { TOOL_METADATA } from "../../src/server/surface-catalog.js";
import { buildWeather } from "../scenarios/_harness.js";

const CORE_TOOLS = [
  "get_weather_1km",
  "get_weather_warning",
  "search_farmland",
  "area_summary",
  "nearby_farms",
  "get_pesticide_rules",
  "create_staff_deploy_plan",
  "open_dashboard",
];

const EXTENDED_ONLY_TOOLS = [
  "create_task",
  "get_task_status",
  "snapshot_status",
  "crop_calendar",
  "spray_window",
  "seasonal_risk_forecast",
  "field_weather_report",
  "multi_field_compare",
  "optimize_harvest_timing",
  "get_realtime_sensor_data",
  "get_machine_iot_status",
  "predict_labor_demand",
  "plan_irrigation",
  "generate_subsidy_application",
  "get_traceability_report",
];

const LEGACY_ONLY_TOOLS = [
  "get_market_price",
  "get_prefecture_crop_profile",
  "get_ssw_crop_compatibility",
  "get_labor_shortage_stats",
  "get_livestock_regional_stats",
  "get_municipality_stats",
  "get_estat_stats",
];

describe("Directory surface (default, no feature flags)", () => {
  const originalExtended = process.env.AGRIOPS_ENABLE_EXTENDED_TOOLS;
  const originalLegacy = process.env.AGRIOPS_ENABLE_LEGACY_TOOLS;

  afterEach(() => {
    process.env.AGRIOPS_ENABLE_EXTENDED_TOOLS = originalExtended;
    process.env.AGRIOPS_ENABLE_LEGACY_TOOLS = originalLegacy;
  });

  async function bootDefaultClient() {
    process.env.AGRIOPS_ENABLE_EXTENDED_TOOLS = undefined;
    process.env.AGRIOPS_ENABLE_LEGACY_TOOLS = undefined;
    const config = loadConfig();
    expect(config.enableExtendedTools).toBe(false);
    expect(config.enableLegacyTools).toBe(false);

    const logger = createLogger({ level: "error" });
    const { server } = createServer({
      config,
      logger,
      version: "test-directory-surface",
      overrides: {
        weather: buildWeather(),
        jma: {
          async getActiveWarnings() {
            return { warnings: [], fetchedAt: new Date().toISOString(), attribution: "test" };
          },
        },
        emaff: {
          async search() {
            return { fields: [], nextCursor: null, total: 0, attribution: "test" };
          },
          async get() {
            return null;
          },
          async nearby() {
            return { fields: [], nextCursor: null, total: 0, attribution: "test" };
          },
          async areaSummary() {
            return {
              prefectureCode: "JP-46",
              cityCode: null,
              totalFields: 0,
              totalAreaHa: 0,
              topCrops: [],
              attribution: "test",
            };
          },
        },
        famic: {
          async search() {
            return { rules: [], nextCursor: null, attribution: "test" };
          },
          async get() {
            return null;
          },
        },
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "directory-surface", version: "0.0.1" },
      { capabilities: {} },
    );
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it("advertises exactly the 8 core model-visible tools with all adapters present", async () => {
    const { client, close } = await bootDefaultClient();
    try {
      const live = await client.listTools();
      // `tools/list` also includes app-only helpers (fetch_field_geojson, etc.)
      // for hosts that don't honor the `ui/visibility` hint; filter to the
      // tools TOOL_METADATA classifies as "model" to assert the LLM-facing
      // surface specifically.
      const modelVisible = live.tools
        .filter((t) => TOOL_METADATA[t.name]?.visibility === "model")
        .map((t) => t.name)
        .sort();
      expect(modelVisible).toEqual([...CORE_TOOLS].sort());
    } finally {
      await close();
    }
  });

  it("does not register any extended-tier tool by default", async () => {
    const { client, close } = await bootDefaultClient();
    try {
      const live = await client.listTools();
      const names = new Set(live.tools.map((t) => t.name));
      for (const name of EXTENDED_ONLY_TOOLS) {
        expect(names.has(name), `${name} should not be registered by default`).toBe(false);
      }
    } finally {
      await close();
    }
  });

  it("does not register any deprecated/legacy tool by default", async () => {
    const { client, close } = await bootDefaultClient();
    try {
      const live = await client.listTools();
      const names = new Set(live.tools.map((t) => t.name));
      for (const name of LEGACY_ONLY_TOOLS) {
        expect(names.has(name), `${name} should not be registered by default`).toBe(false);
      }
    } finally {
      await close();
    }
  });
});
