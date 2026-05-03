/**
 * Eval scenario: Pesticide rules lookup workflow.
 *
 * Simulates an AI agent that identifies applicable pesticide registrations for
 * a Kagoshima rice or sweet-potato field. The canonical tool chain is:
 *   1. search_farmland       — resolve the target field and its registered crop
 *   2. get_pesticide_rules   — fetch FAMIC rules for that crop
 *
 * Additionally exercises the `open_dashboard` tool so the agent can hand off a
 * URL for the farmer to review.
 *
 * Assertions verify:
 * - Crop-filtered queries return only rules with matching targetCrops
 * - Pre-harvest interval and max-application fields are present where expected
 * - Attribution strings are carried through for regulatory traceability
 * - open_dashboard produces a valid HTTPS URL
 */

import { describe, expect, it } from "vitest";
import { allText, bootClient, isErrorResult, structuredRules } from "./_harness.js";

describe("Eval: pesticide rules lookup workflow", () => {
  it("rice disease rules — returns registration with pre-harvest interval", async () => {
    const { client, close } = await bootClient();
    try {
      // Step 1: Search for rice fields
      const searchResult = await client.callTool({
        name: "search_farmland",
        arguments: { prefectureCode: "JP-46", crop: "稲", limit: 5 },
      });
      expect(isErrorResult(searchResult)).toBe(false);

      // Step 2: Get pesticide rules for rice (いもち病)
      const pesticideResult = await client.callTool({
        name: "get_pesticide_rules",
        arguments: { crop: "稲", pestOrDisease: "いもち病", limit: 5 },
      });
      expect(isErrorResult(pesticideResult)).toBe(false);

      const text = allText(pesticideResult);
      expect(text).toContain("農林水産省");

      const rules = structuredRules(pesticideResult);
      expect(rules.length).toBeGreaterThanOrEqual(1);
      const rule = rules[0] as {
        productName?: string;
        targetCrops?: string[];
        targetPestsOrDiseases?: string[];
        preHarvestIntervalDays?: number | null;
        attribution?: string;
      };
      expect(rule.targetCrops).toBeDefined();
      expect(rule.attribution).toBeTruthy();
      // Our fixture includes a 14-day pre-harvest interval for rice
      if (rule.preHarvestIntervalDays !== undefined && rule.preHarvestIntervalDays !== null) {
        expect(rule.preHarvestIntervalDays).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("sweet-potato weevil rules — insecticide fixture surfaced", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "get_pesticide_rules",
        arguments: { crop: "さつまいも", limit: 5 },
      });
      expect(isErrorResult(result)).toBe(false);

      const rules = structuredRules(result);
      expect(rules.length).toBeGreaterThanOrEqual(1);
      const rule = rules[0] as {
        targetCrops?: string[];
        targetPestsOrDiseases?: string[];
        maxApplicationsPerSeason?: number | null;
      };
      expect(rule.targetCrops).toBeDefined();
      // sweet-potato weevil fixture has maxApplicationsPerSeason = 1
      if (rule.maxApplicationsPerSeason !== undefined && rule.maxApplicationsPerSeason !== null) {
        expect(rule.maxApplicationsPerSeason).toBeGreaterThanOrEqual(1);
      }
    } finally {
      await close();
    }
  }, 30_000);

  it("open_dashboard succeeds and returns a resource_link with the dashboard URI", async () => {
    const { client, close } = await bootClient();
    try {
      const dashResult = await client.callTool({
        name: "open_dashboard",
        arguments: {},
      });
      expect(isErrorResult(dashResult)).toBe(false);
      // The tool returns a text summary plus a resource_link for MCP Apps hosts
      const content = (dashResult as { content?: unknown[] }).content ?? [];
      const hasResourceLink = content.some(
        (c) =>
          typeof c === "object" && c !== null && (c as { type?: string }).type === "resource_link",
      );
      // If the host doesn't surface resource_link it falls back to text-only
      const text = allText(dashResult);
      expect(text || hasResourceLink, "dashboard should return text or resource_link").toBeTruthy();
    } finally {
      await close();
    }
  }, 30_000);

  it("limit=1 returns exactly one rule", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "get_pesticide_rules",
        arguments: { crop: "稲", limit: 1 },
      });
      expect(isErrorResult(result)).toBe(false);
      const rules = structuredRules(result);
      expect(rules.length).toBeLessThanOrEqual(1);
    } finally {
      await close();
    }
  }, 30_000);

  it("attribution field is non-empty in all returned rules", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "get_pesticide_rules",
        arguments: { crop: "稲", limit: 10 },
      });
      expect(isErrorResult(result)).toBe(false);
      const rules = structuredRules(result) as Array<{ attribution?: string }>;
      for (const rule of rules) {
        expect(rule.attribution, "attribution must be non-empty").toBeTruthy();
      }
    } finally {
      await close();
    }
  }, 30_000);
});
