/**
 * Eval scenario: Staff planning workflow.
 *
 * Simulates an agricultural cooperative agent that needs to plan daily field
 * work assignments. The canonical tool chain is:
 *   1. area_summary     — understand the prefecture-level crop composition
 *   2. nearby_farms     — find fields within a radius of the cooperative office
 *   3. get_weather_1km  — check today's forecast at the search centroid
 *   4. prompt: plan_farming_tasks — (optional) elicit a structured work plan
 *
 * Assertions verify:
 * - area_summary exposes total fields, total area, and top-crops list
 * - nearby_farms results carry centroid coordinates usable for weather calls
 * - The weather call at the searched centroid returns a structured forecast
 * - Tool chain completes even when nearby_farms returns fewer fields than limit
 * - Server surfaces the plan_farming_tasks prompt without error
 */

import { describe, expect, it } from "vitest";
import { FIELD_RICE, FIELD_SWEETPOTATO, allText, bootClient, isErrorResult } from "./_harness.js";

describe("Eval: staff planning workflow", () => {
  it("area_summary provides crop composition for JP-46", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "area_summary",
        arguments: { prefectureCode: "JP-46" },
      });
      expect(isErrorResult(result)).toBe(false);
      const sc = (result as { structuredContent?: unknown }).structuredContent as {
        totalFields?: number;
        totalAreaHa?: number;
        topCrops?: Array<{ crop: string; count: number }>;
        attribution?: string;
      };
      // Our fixture seeds: 142,800 fields, 47,200 ha
      if (sc) {
        expect(sc.totalFields ?? 0).toBeGreaterThan(0);
        expect(sc.totalAreaHa ?? 0).toBeGreaterThan(0);
        expect(Array.isArray(sc.topCrops)).toBe(true);
        expect((sc.topCrops ?? []).length).toBeGreaterThanOrEqual(1);
        expect(sc.attribution).toBeTruthy();
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("nearby_farms at cooperative office coordinates returns fields with centroids", async () => {
    const { client, close } = await bootClient();
    try {
      // Satsumasendai cooperative office (fictional point)
      const result = await client.callTool({
        name: "nearby_farms",
        arguments: {
          lat: 31.84,
          lng: 130.31,
          radiusMeters: 5000,
          limit: 5,
        },
      });
      expect(isErrorResult(result)).toBe(false);
      const sc = (result as { structuredContent?: unknown }).structuredContent as {
        fields?: Array<{ centroid?: { lat: number; lng: number }; fieldId?: string }>;
      };
      if (sc?.fields) {
        expect(sc.fields.length).toBeGreaterThanOrEqual(1);
        for (const field of sc.fields) {
          expect(field.centroid).toBeDefined();
          expect(typeof field.centroid?.lat).toBe("number");
          expect(typeof field.centroid?.lng).toBe("number");
        }
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("chained: nearby_farms → weather at first field's centroid", async () => {
    const { client, close } = await bootClient();
    try {
      // Step 1: Find nearby fields
      const nearbyResult = await client.callTool({
        name: "nearby_farms",
        arguments: {
          lat: FIELD_RICE.centroid.lat,
          lng: FIELD_RICE.centroid.lng,
          radiusMeters: 3000,
          limit: 2,
        },
      });
      expect(isErrorResult(nearbyResult)).toBe(false);
      const sc = (nearbyResult as { structuredContent?: unknown }).structuredContent as {
        fields?: Array<{ centroid: { lat: number; lng: number } }>;
      };
      const fields = sc?.fields ?? [];
      expect(fields.length).toBeGreaterThanOrEqual(1);

      // Step 2: Fetch weather at the first field's centroid
      const firstField = fields[0];
      if (!firstField) throw new Error("No fields returned");
      const { lat, lng } = firstField.centroid;
      const weatherResult = await client.callTool({
        name: "get_weather_1km",
        arguments: { lat, lng, hours: 8 },
      });
      expect(isErrorResult(weatherResult)).toBe(false);
      const weatherSc = (weatherResult as { structuredContent?: unknown }).structuredContent as {
        hourly?: unknown[];
        location?: { lat: number; lng: number };
      };
      if (weatherSc) {
        expect(Array.isArray(weatherSc.hourly)).toBe(true);
        expect((weatherSc.hourly ?? []).length).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("staff_deploy_plan prompt is available in prompts/list", async () => {
    const { client, close } = await bootClient();
    try {
      const { prompts } = await client.listPrompts();
      const names = prompts.map((p) => p.name);
      expect(names).toContain("staff_deploy_plan");
    } finally {
      await close();
    }
  }, 30_000);

  it("staff_deploy_plan prompt can be retrieved with farm_ids and period arguments", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.getPrompt({
        name: "staff_deploy_plan",
        arguments: {
          farm_ids: "fude-eval-0001,fude-eval-0002",
          period: "2026-05-01 to 2026-05-31",
        },
      });
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      const firstMsg = result.messages[0];
      expect(firstMsg).toBeDefined();
      if (firstMsg) {
        expect(firstMsg.content.type).toBe("text");
        if (firstMsg.content.type === "text") {
          expect(firstMsg.content.text).toBeTruthy();
        }
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("both fixture fields are returned by nearby_farms with limit >= 2", async () => {
    const { client, close } = await bootClient({
      emaffFields: [FIELD_RICE, FIELD_SWEETPOTATO],
    });
    try {
      const result = await client.callTool({
        name: "nearby_farms",
        // max allowed radius is 20,000 m; both fixture fields are well within
        arguments: { lat: 31.6, lng: 130.4, radiusMeters: 20_000, limit: 5 },
      });
      expect(isErrorResult(result)).toBe(false);
      const sc = (result as { structuredContent?: unknown }).structuredContent as {
        fields?: Array<{ fieldId: string }>;
      };
      const ids = (sc?.fields ?? []).map((f) => f.fieldId);
      expect(ids).toContain(FIELD_RICE.fieldId);
      expect(ids).toContain(FIELD_SWEETPOTATO.fieldId);
    } finally {
      await close();
    }
  }, 30_000);

  it("area_summary text output contains attribution", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "area_summary",
        arguments: { prefectureCode: "JP-46" },
      });
      const text = allText(result);
      expect(text).toContain("農林水産省");
    } finally {
      await close();
    }
  }, 30_000);
});
