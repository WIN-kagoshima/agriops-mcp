/**
 * "Take this artifact home" conformance.
 *
 * Verifies the embedded `resource` content blocks added to `search_farmland`,
 * `nearby_farms`, `get_pesticide_rules`, and `create_staff_deploy_plan`
 * (see src/lib/artifacts.ts, docs/anthropic-directory-submission.md) are
 * present, well-formed, and round-trip through `structuredContent` correctly
 * per the MCP Spec 2025-11-25 §6.4 `EmbeddedResourceSchema` shape.
 */

import { describe, expect, it } from "vitest";
import { bootClient } from "../scenarios/_harness.js";

interface EmbeddedResourceBlock {
  type: "resource";
  resource: { uri: string; mimeType: string; text: string };
}

function resourceBlocks(result: unknown): EmbeddedResourceBlock[] {
  if (typeof result !== "object" || result === null) return [];
  const content = (result as { content?: unknown }).content;
  const list = (Array.isArray(content) ? content : []) as unknown[];
  return list.filter(
    (c): c is EmbeddedResourceBlock =>
      typeof c === "object" &&
      c !== null &&
      (c as { type?: unknown }).type === "resource" &&
      typeof (c as { resource?: unknown }).resource === "object",
  );
}

describe("Embedded artifact resources", () => {
  it("search_farmland embeds a GeoJSON FeatureCollection matching structuredContent.fields", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "search_farmland",
        arguments: { prefectureCode: "JP-46", limit: 20 },
      });
      const blocks = resourceBlocks(result);
      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      if (!block) throw new Error("unreachable: length asserted above");
      expect(block.resource.mimeType).toBe("application/geo+json");
      expect(block.resource.uri).toMatch(/^generated:\/\/agriops\/search_farmland\/\d+\.geojson$/);

      const geojson = JSON.parse(block.resource.text) as {
        type: string;
        features: Array<{ type: string; geometry: { type: string; coordinates: number[] } }>;
      };
      expect(geojson.type).toBe("FeatureCollection");

      const sc = result.structuredContent as { fields?: unknown[] };
      expect(Array.isArray(sc.fields)).toBe(true);
      expect(geojson.features).toHaveLength((sc.fields as unknown[]).length);
      for (const feature of geojson.features) {
        expect(feature.type).toBe("Feature");
        expect(feature.geometry.type).toBe("Point");
        expect(feature.geometry.coordinates).toHaveLength(2);
      }
    } finally {
      await close();
    }
  });

  it("nearby_farms embeds a GeoJSON FeatureCollection", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "nearby_farms",
        arguments: { lat: 31.8352, lng: 130.3107, radiusMeters: 10_000, limit: 20 },
      });
      const blocks = resourceBlocks(result);
      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      if (!block) throw new Error("unreachable: length asserted above");
      expect(block.resource.mimeType).toBe("application/geo+json");
      const geojson = JSON.parse(block.resource.text) as { type: string };
      expect(geojson.type).toBe("FeatureCollection");
    } finally {
      await close();
    }
  });

  it("get_pesticide_rules embeds an RFC 4180 CSV with a header row plus one row per rule", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "get_pesticide_rules",
        arguments: { crop: "稲", limit: 20 },
      });
      const blocks = resourceBlocks(result);
      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      if (!block) throw new Error("unreachable: length asserted above");
      expect(block.resource.mimeType).toBe("text/csv");

      const lines = block.resource.text.trim().split("\n");
      const sc = result.structuredContent as { rules?: unknown[] };
      expect(Array.isArray(sc.rules)).toBe(true);
      // header + one line per rule
      expect(lines).toHaveLength((sc.rules as unknown[]).length + 1);
      expect(lines[0]).toBe(
        "registrationId,productName,activeIngredients,targetCrops,targetPestsOrDiseases,applicationMethod,preHarvestIntervalDays,maxApplicationsPerSeason,registrationDate,expiresAt",
      );
    } finally {
      await close();
    }
  });

  it("omits the embedded resource block entirely when there are zero results", async () => {
    const { client, close } = await bootClient({ emaffFields: [] });
    try {
      const result = await client.callTool({
        name: "search_farmland",
        arguments: { prefectureCode: "JP-46", limit: 20 },
      });
      expect(resourceBlocks(result)).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("create_staff_deploy_plan returns outputSchema-conformant structuredContent plus a single-row CSV artifact", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "create_staff_deploy_plan",
        arguments: { farmRegion: "kirishima_kokubu", periodDays: 30, includeWeekend: false },
      });
      expect(result.isError).not.toBe(true);

      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.status).toBe("draft");
      expect(typeof sc.fieldCount).toBe("number");
      expect(typeof sc.estimatedStaffDays).toBe("number");

      const blocks = resourceBlocks(result);
      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      if (!block) throw new Error("unreachable: length asserted above");
      expect(block.resource.mimeType).toBe("text/csv");
      const lines = block.resource.text.trim().split("\n");
      // Single-row summary: header + exactly one data row.
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("status");
      expect(lines[0]).toContain("fieldCount");
    } finally {
      await close();
    }
  });

  it("create_staff_deploy_plan's declined shape (missing args, no elicitation support) still validates against outputSchema and carries no artifact", async () => {
    const { client, close } = await bootClient();
    try {
      // The eval-runner client declares no elicitation capability, so the
      // server's elicitForm() call resolves to a decline/unsupported path.
      const result = await client.callTool({
        name: "create_staff_deploy_plan",
        arguments: {},
      });
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.status).toBe("declined");
      expect(typeof sc.reason).toBe("string");
      expect(resourceBlocks(result)).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
