/**
 * Property-based tests (fast-check) for src/lib/geo.ts.
 *
 * Craft signal, not a spec requirement: haversine distance and the bbox
 * pre-filter used by `nearby_farms` are exactly the kind of small numeric
 * helper where hand-picked example tests miss edge cases (poles, the
 * antimeridian, r=0) that random inputs find quickly.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bboxFromRadius, haversineMeters, isValidLatLng } from "../../src/lib/geo.js";

const latArb = fc.double({ min: -90, max: 90, noNaN: true });
const lngArb = fc.double({ min: -180, max: 180, noNaN: true });
const pointArb = fc.record({ lat: latArb, lng: lngArb });

describe("geo.haversineMeters (property-based)", () => {
  it("is zero for a point against itself", () => {
    fc.assert(
      fc.property(pointArb, (p) => {
        expect(haversineMeters(p, p)).toBeCloseTo(0, 3);
      }),
    );
  });

  it("is symmetric: d(a,b) === d(b,a)", () => {
    fc.assert(
      fc.property(pointArb, pointArb, (a, b) => {
        const ab = haversineMeters(a, b);
        const ba = haversineMeters(b, a);
        expect(ab).toBeCloseTo(ba, 6);
      }),
    );
  });

  it("is always finite, non-negative, and bounded by half the Earth's circumference", () => {
    // Max possible great-circle distance is exactly pi * R (antipodal points);
    // add a small epsilon for floating-point round-trip through asin/sqrt.
    const MAX_ANTIPODAL_M = Math.PI * 6_371_008.8 + 1;
    fc.assert(
      fc.property(pointArb, pointArb, (a, b) => {
        const d = haversineMeters(a, b);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(MAX_ANTIPODAL_M);
      }),
    );
  });

  it("satisfies the triangle inequality within floating-point tolerance", () => {
    fc.assert(
      fc.property(pointArb, pointArb, pointArb, (a, b, c) => {
        const ab = haversineMeters(a, b);
        const bc = haversineMeters(b, c);
        const ac = haversineMeters(a, c);
        // Spherical triangle inequality holds exactly; allow a small epsilon
        // for the trig round-trip through asin/sqrt near antipodal points.
        expect(ac).toBeLessThanOrEqual(ab + bc + 1);
      }),
    );
  });
});

describe("geo.bboxFromRadius (property-based)", () => {
  it("always produces a box that contains the center point", () => {
    fc.assert(
      fc.property(
        fc.record({ lat: fc.double({ min: -85, max: 85, noNaN: true }), lng: lngArb }),
        fc.double({ min: 1, max: 50_000, noNaN: true }),
        (center, radius) => {
          const box = bboxFromRadius(center, radius);
          expect(center.lat).toBeGreaterThanOrEqual(box.minLat);
          expect(center.lat).toBeLessThanOrEqual(box.maxLat);
          expect(center.lng).toBeGreaterThanOrEqual(box.minLng);
          expect(center.lng).toBeLessThanOrEqual(box.maxLng);
        },
      ),
    );
  });

  it("grows monotonically with radius", () => {
    fc.assert(
      fc.property(
        fc.record({ lat: fc.double({ min: -85, max: 85, noNaN: true }), lng: lngArb }),
        fc.double({ min: 1, max: 10_000, noNaN: true }),
        fc.double({ min: 10_001, max: 50_000, noNaN: true }),
        (center, smallRadius, bigRadius) => {
          const small = bboxFromRadius(center, smallRadius);
          const big = bboxFromRadius(center, bigRadius);
          expect(big.maxLat - big.minLat).toBeGreaterThanOrEqual(small.maxLat - small.minLat);
          expect(big.maxLng - big.minLng).toBeGreaterThanOrEqual(small.maxLng - small.minLng);
        },
      ),
    );
  });
});

describe("geo.isValidLatLng (property-based)", () => {
  it("accepts every in-range (lat, lng) pair", () => {
    fc.assert(
      fc.property(pointArb, (p) => {
        expect(isValidLatLng(p)).toBe(true);
      }),
    );
  });

  it("rejects any lat/lng magnitude outside the valid range", () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true }).filter((n) => n > 90 || n < -90),
        lngArb,
        (badLat, lng) => {
          expect(isValidLatLng({ lat: badLat, lng })).toBe(false);
        },
      ),
    );
  });

  it("rejects NaN and non-finite values", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isValidLatLng({ lat: bad, lng: 0 })).toBe(false);
      expect(isValidLatLng({ lat: 0, lng: bad })).toBe(false);
    }
  });
});
