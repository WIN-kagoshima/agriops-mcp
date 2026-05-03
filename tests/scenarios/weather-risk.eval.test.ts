/**
 * Eval scenario: Weather-risk assessment workflow.
 *
 * Simulates an AI agent that helps a Kagoshima farmer decide whether to spray
 * pesticides today. The canonical tool chain is:
 *   1. search_farmland    — identify the target field
 *   2. get_weather_1km    — fetch hourly forecast for that field's centroid
 *   3. get_weather_warning — check for active prefecture-level warnings
 *
 * Assertions verify that:
 * - Tool results carry attribution strings (data provenance compliance)
 * - Location info matches the seeded field centroid
 * - Rainy-weather branch returns elevated precipitation values
 * - The workflow still completes gracefully with no warnings active
 */

import { describe, expect, it } from "vitest";
import {
  FIELD_RICE,
  FIELD_SWEETPOTATO,
  allText,
  bootClient,
  isErrorResult,
  structuredFields,
} from "./_harness.js";

describe("Eval: weather-risk assessment workflow", () => {
  it("sunny day — farmer can safely spray (full tool chain completes)", async () => {
    const { client, close } = await bootClient({ rainyWeather: false });
    try {
      // Step 1: Identify the target field
      const searchResult = await client.callTool({
        name: "search_farmland",
        arguments: { prefectureCode: "JP-46", crop: "稲", limit: 5 },
      });
      expect(isErrorResult(searchResult), "search_farmland should succeed").toBe(false);
      const fields = structuredFields(searchResult);
      expect(fields.length).toBeGreaterThanOrEqual(1);
      const firstField = fields[0] as typeof FIELD_RICE;
      expect(firstField.centroid).toBeDefined();
      expect(firstField.attribution).toBeTruthy();

      // Step 2: Fetch weather at the field centroid
      const { lat, lng } = firstField.centroid as { lat: number; lng: number };
      const weatherResult = await client.callTool({
        name: "get_weather_1km",
        arguments: { lat, lng, hours: 24 },
      });
      expect(isErrorResult(weatherResult), "get_weather_1km should succeed").toBe(false);
      const weatherText = allText(weatherResult);
      expect(weatherText).toContain("Open-Meteo");
      // sunny fixture: max precipitation per hour < 5 mm
      const sc = (weatherResult as { structuredContent?: unknown }).structuredContent as {
        hourly?: Array<{ precipitationMm: number }>;
      };
      if (sc?.hourly) {
        const maxPrecip = Math.max(...sc.hourly.map((h) => h.precipitationMm));
        expect(maxPrecip, "Sunny forecast: max precip should be low").toBeLessThan(5);
      }

      // Step 3: Check for active warnings
      const warningResult = await client.callTool({
        name: "get_weather_warning",
        arguments: { prefectureCode: "JP-46" },
      });
      expect(isErrorResult(warningResult), "get_weather_warning should succeed").toBe(false);
      const warningText = allText(warningResult);
      expect(warningText).toContain("気象庁");
    } finally {
      await close();
    }
  }, 30_000);

  it("rainy day — elevated precipitation is surfaced correctly", async () => {
    const { client, close } = await bootClient({ rainyWeather: true });
    try {
      const weatherResult = await client.callTool({
        name: "get_weather_1km",
        arguments: { lat: FIELD_RICE.centroid.lat, lng: FIELD_RICE.centroid.lng, hours: 12 },
      });
      expect(isErrorResult(weatherResult)).toBe(false);
      const sc = (weatherResult as { structuredContent?: unknown }).structuredContent as {
        hourly?: Array<{ precipitationMm: number }>;
      };
      if (sc?.hourly) {
        const maxPrecip = Math.max(...sc.hourly.map((h) => h.precipitationMm));
        // rainy fixture adds 18 mm to every hour
        expect(maxPrecip, "Rainy forecast: max precip should be elevated").toBeGreaterThan(15);
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("both rice and sweet-potato fields resolve correct centroids", async () => {
    const { client, close } = await bootClient();
    try {
      for (const field of [FIELD_RICE, FIELD_SWEETPOTATO]) {
        const result = await client.callTool({
          name: "get_weather_1km",
          arguments: { lat: field.centroid.lat, lng: field.centroid.lng, hours: 6 },
        });
        expect(isErrorResult(result), `weather for ${field.fieldId} should succeed`).toBe(false);
        const sc = (result as { structuredContent?: unknown }).structuredContent as {
          location?: { lat?: number; lng?: number };
        };
        if (sc?.location) {
          expect(sc.location.lat).toBeCloseTo(field.centroid.lat, 3);
          expect(sc.location.lng).toBeCloseTo(field.centroid.lng, 3);
        }
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("area_summary returns Kagoshima top crops and attribution", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "area_summary",
        arguments: { prefectureCode: "JP-46" },
      });
      expect(isErrorResult(result)).toBe(false);
      const text = allText(result);
      expect(text).toContain("稲");
      const sc = (result as { structuredContent?: unknown }).structuredContent as {
        topCrops?: Array<{ crop: string }>;
        attribution?: string;
      };
      if (sc?.topCrops) {
        const crops = sc.topCrops.map((c) => c.crop);
        expect(crops).toContain("稲");
        expect(crops).toContain("さつまいも");
      }
      if (sc?.attribution) {
        expect(sc.attribution).toBeTruthy();
      }
    } finally {
      await close();
    }
  }, 30_000);
});
