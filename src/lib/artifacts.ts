/**
 * "Take this artifact home" helpers — embedded-resource content blocks
 * (MCP Spec 2025-11-25 §6.4, `EmbeddedResourceSchema`) that let a tool
 * result carry a self-contained GeoJSON or CSV document alongside its
 * usual text summary and `structuredContent`.
 *
 * Unlike `resource_link` (a pointer the client must separately fetch via
 * `resources/read`), an embedded resource inlines the bytes directly in the
 * `tools/call` response — the right shape for data generated per-call
 * (a search result, a draft plan) that has no stable URI a client could
 * read back later. Clients that render these (Claude Desktop, Claude.ai)
 * offer the user a save/copy affordance for free; clients that don't just
 * ignore the extra content block, so this is purely additive and safe for
 * every existing tool schema. See docs/anthropic-directory-submission.md.
 */

import type { Farmland } from "../types/farmland.js";
import type { PesticideRule } from "../types/pesticide.js";
import { toCsv } from "./csv.js";

export interface EmbeddedTextResourceBlock {
  type: "resource";
  resource: {
    uri: string;
    mimeType: string;
    text: string;
  };
}

export function embeddedTextResource(opts: {
  uri: string;
  mimeType: string;
  text: string;
}): EmbeddedTextResourceBlock {
  return {
    type: "resource",
    resource: { uri: opts.uri, mimeType: opts.mimeType, text: opts.text },
  };
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
}

/** Farmland centroids as a standard GeoJSON FeatureCollection (RFC 9946). */
export function farmlandToGeoJson(fields: Farmland[]): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: fields.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.centroid.lng, f.centroid.lat] },
      properties: {
        fieldId: f.fieldId,
        prefectureCode: f.prefectureCode,
        cityCode: f.cityCode,
        address: f.address,
        areaHa: Math.round((f.areaM2 / 10_000) * 100) / 100,
        registeredCrop: f.registeredCrop,
      },
    })),
  };
}

/** Embedded-resource block wrapping `farmlandToGeoJson`, ready to append to `content`. */
export function farmlandGeoJsonResource(
  toolName: string,
  fields: Farmland[],
): EmbeddedTextResourceBlock {
  return embeddedTextResource({
    uri: `generated://agriops/${toolName}/${Date.now()}.geojson`,
    mimeType: "application/geo+json",
    text: JSON.stringify(farmlandToGeoJson(fields), null, 2),
  });
}

/** Embedded-resource block wrapping a farmland CSV export, ready to append to `content`. */
export function farmlandCsvResource(
  toolName: string,
  fields: Farmland[],
): EmbeddedTextResourceBlock {
  const csvText = toCsv(
    ["fieldId", "prefectureCode", "cityCode", "address", "lat", "lng", "areaHa", "registeredCrop"],
    fields.map((f) => [
      f.fieldId,
      f.prefectureCode,
      f.cityCode,
      f.address,
      f.centroid.lat,
      f.centroid.lng,
      Math.round((f.areaM2 / 10_000) * 100) / 100,
      f.registeredCrop,
    ]),
  );
  return embeddedTextResource({
    uri: `generated://agriops/${toolName}/${Date.now()}.csv`,
    mimeType: "text/csv",
    text: csvText,
  });
}

/** Embedded-resource block wrapping a FAMIC pesticide-registration search result as CSV. */
export function pesticideRulesCsvResource(
  toolName: string,
  rules: PesticideRule[],
): EmbeddedTextResourceBlock {
  const csvText = toCsv(
    [
      "registrationId",
      "productName",
      "activeIngredients",
      "targetCrops",
      "targetPestsOrDiseases",
      "applicationMethod",
      "preHarvestIntervalDays",
      "maxApplicationsPerSeason",
      "registrationDate",
      "expiresAt",
    ],
    rules.map((r) => [
      r.registrationId,
      r.productName,
      r.activeIngredients.join("; "),
      r.targetCrops.join("; "),
      r.targetPestsOrDiseases.join("; "),
      r.applicationMethod,
      r.preHarvestIntervalDays,
      r.maxApplicationsPerSeason,
      r.registrationDate,
      r.expiresAt,
    ]),
  );
  return embeddedTextResource({
    uri: `generated://agriops/${toolName}/${Date.now()}.csv`,
    mimeType: "text/csv",
    text: csvText,
  });
}

/**
 * Single-row CSV summary for tools whose output is one aggregate record
 * (e.g. a draft deployment plan) rather than a list — a CSV with exactly
 * the fields already in `structuredContent`, so the user has something to
 * drop into a spreadsheet without the tool fabricating per-field/per-day
 * detail it never actually computed.
 */
export function summaryRowCsvResource(
  toolName: string,
  row: Record<string, string | number | boolean | null>,
): EmbeddedTextResourceBlock {
  const header = Object.keys(row);
  const csvText = toCsv(header, [
    header.map((k) =>
      typeof row[k] === "boolean" ? String(row[k]) : (row[k] as string | number | null),
    ),
  ]);
  return embeddedTextResource({
    uri: `generated://agriops/${toolName}/${Date.now()}.csv`,
    mimeType: "text/csv",
    text: csvText,
  });
}
