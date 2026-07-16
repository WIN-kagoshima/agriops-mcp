/**
 * Attribution conformance (docs/data-license.md §"Operational requirements").
 *
 * Every tool result backed by a licensed source (Open-Meteo, eMAFF, FAMIC,
 * JMA) must carry a non-empty `structuredContent.attribution`. This used to
 * be an unenforced convention (`attribution: z.string()` also accepts `""`);
 * `src/lib/attribution.ts`'s `AttributionSchema` now makes it a schema-level
 * invariant via `.min(1)`. This suite has two layers:
 *
 * 1. A fast-check property proving every core output schema rejects an
 *    empty attribution string and accepts any non-empty one.
 * 2. An end-to-end pass over the 4 core tools that call a licensed adapter,
 *    asserting the live server actually returns a non-empty attribution.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AttributionSchema } from "../../src/lib/attribution.js";
import { AreaSummarySchema, FarmlandSearchResultSchema } from "../../src/types/farmland.js";
import { PesticideQueryResultSchema } from "../../src/types/pesticide.js";
import { WeatherForecastSchema } from "../../src/types/weather.js";
import { bootClient } from "../scenarios/_harness.js";

describe("AttributionSchema (property-based)", () => {
  it("rejects the empty string", () => {
    expect(AttributionSchema.safeParse("").success).toBe(false);
  });

  it("accepts any non-empty string", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (s) => {
        expect(AttributionSchema.safeParse(s).success).toBe(true);
      }),
    );
  });
});

describe("Core output schemas reject an empty attribution", () => {
  const validForecast = {
    source: "test",
    attribution: "x",
    location: { lat: 0, lng: 0, timezone: "Asia/Tokyo" },
    generatedAt: "2026-01-01T00:00:00Z",
    hourly: [],
    alerts: [],
  };
  const validFarmlandSearch = { fields: [], nextCursor: null, attribution: "x" };
  const validAreaSummary = {
    prefectureCode: null,
    cityCode: null,
    totalFields: 0,
    totalAreaHa: 0,
    topCrops: [],
    attribution: "x",
  };
  const validPesticideQuery = { rules: [], nextCursor: null, attribution: "x" };

  it.each([
    ["WeatherForecastSchema", WeatherForecastSchema, validForecast],
    ["FarmlandSearchResultSchema", FarmlandSearchResultSchema, validFarmlandSearch],
    ["AreaSummarySchema", AreaSummarySchema, validAreaSummary],
    ["PesticideQueryResultSchema", PesticideQueryResultSchema, validPesticideQuery],
  ])(
    "%s: valid with non-empty attribution, invalid with empty attribution",
    (_name, schema, valid) => {
      expect(schema.safeParse(valid).success).toBe(true);
      expect(schema.safeParse({ ...valid, attribution: "" }).success).toBe(false);
    },
  );
});

describe("Live tool results carry non-empty attribution (end-to-end)", () => {
  it("get_weather_1km", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "get_weather_1km",
        arguments: { lat: 31.8352, lng: 130.3107 },
      });
      const sc = result.structuredContent as { attribution?: string };
      expect(sc.attribution).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("search_farmland", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "search_farmland",
        arguments: { prefectureCode: "JP-46", limit: 5 },
      });
      const sc = result.structuredContent as { attribution?: string };
      expect(sc.attribution).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("area_summary", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "area_summary",
        arguments: { prefectureCode: "JP-46" },
      });
      const sc = result.structuredContent as { attribution?: string };
      expect(sc.attribution).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("nearby_farms", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "nearby_farms",
        arguments: { lat: 31.8352, lng: 130.3107, radiusMeters: 5000 },
      });
      const sc = result.structuredContent as { attribution?: string };
      expect(sc.attribution).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("get_pesticide_rules", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "get_pesticide_rules",
        arguments: { crop: "稲" },
      });
      const sc = result.structuredContent as { attribution?: string };
      expect(sc.attribution).toBeTruthy();
    } finally {
      await close();
    }
  });
});
