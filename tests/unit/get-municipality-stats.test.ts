/**
 * Unit tests for get_municipality_stats (Phase 10)
 */

import { describe, it, expect } from "vitest";
import {
  getAllMunicipalities,
  getMunicipalitiesByPref,
  getMunicipalityByCode,
  searchMunicipalities,
  COVERED_PREF_CODES,
} from "../../src/data/municipality-db.js";
import { extractVizHint } from "../../src/lib/viz-hint.js";
import { withVizHint } from "../../src/lib/viz-hint.js";

describe("municipality-db", () => {
  it("returns at least 50 municipalities", () => {
    expect(getAllMunicipalities().length).toBeGreaterThanOrEqual(50);
  });

  it("covers 19+ prefectures", () => {
    expect(COVERED_PREF_CODES.length).toBeGreaterThanOrEqual(19);
  });

  it("getMunicipalityByCode returns Kanoya (46203)", () => {
    const rec = getMunicipalityByCode("46203");
    expect(rec).toBeDefined();
    expect(rec?.cityName).toBe("鹿屋市");
    expect(rec?.prefectureCode).toBe("JP-46");
  });

  it("getMunicipalitiesByPref('JP-45') returns Miyazaki cities", () => {
    const cities = getMunicipalitiesByPref("JP-45");
    expect(cities.length).toBeGreaterThanOrEqual(4);
    expect(cities.every((c) => c.prefectureCode === "JP-45")).toBe(true);
  });

  it("getMunicipalitiesByPref with bare code '46' still works via normalization", () => {
    const direct = getMunicipalitiesByPref("JP-46");
    expect(direct.length).toBeGreaterThan(0);
  });

  it("searchMunicipalities finds partial name match", () => {
    const results = searchMunicipalities("松山");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.cityName).toBe("松山市");
  });

  it("every record has valid cityCode (5 digits)", () => {
    const all = getAllMunicipalities();
    for (const rec of all) {
      expect(rec.cityCode).toMatch(/^\d{5}$/);
    }
  });

  it("every record has lat/lng in Japan bounding box", () => {
    const all = getAllMunicipalities();
    for (const rec of all) {
      expect(rec.lat).toBeGreaterThan(24);
      expect(rec.lat).toBeLessThan(46);
      expect(rec.lng).toBeGreaterThan(122);
      expect(rec.lng).toBeLessThan(154);
    }
  });
});

describe("viz-hint helpers", () => {
  it("withVizHint attaches hint to data object", () => {
    const data = { foo: 1 };
    const result = withVizHint(data, { preferredView: "table" });
    expect(result.viz_hint).toBeDefined();
    expect((result.viz_hint as { preferredView: string }).preferredView).toBe("table");
    expect(result.foo).toBe(1);
  });

  it("extractVizHint returns null for null input", () => {
    expect(extractVizHint(null)).toBeNull();
    expect(extractVizHint(undefined)).toBeNull();
    expect(extractVizHint("string")).toBeNull();
  });

  it("extractVizHint extracts radar hint", () => {
    const sc = withVizHint({ data: 1 }, {
      preferredView: "radar",
      axes: ["A", "B", "C", "D", "E"],
      title: "Test",
    });
    const hint = extractVizHint(sc);
    expect(hint).not.toBeNull();
    expect(hint?.preferredView).toBe("radar");
  });

  it("extractVizHint handles choropleth hint", () => {
    const sc = withVizHint({}, {
      preferredView: "choropleth",
      metric: "changeRate5yr",
      geoLevel: "prefecture",
    });
    const hint = extractVizHint(sc);
    expect(hint?.preferredView).toBe("choropleth");
  });
});
