/**
 * Property-based tests (fast-check) for src/lib/pagination.ts — the offset
 * cursor codec shared by `search_farmland`, `nearby_farms`, and
 * `get_pesticide_rules`. Pagination is one of the 7 MCP primitives (see
 * docs/phase-plan.md); this file pins the two invariants a `cursor` must
 * satisfy to be a well-behaved opaque token: it round-trips, and it never
 * throws on garbage input.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clampLimit, decodeOffsetCursor, encodeOffsetCursor } from "../../src/lib/pagination.js";

describe("pagination cursor codec (property-based)", () => {
  it("round-trips any non-negative safe integer offset", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (offset) => {
        const cursor = encodeOffsetCursor(offset);
        expect(decodeOffsetCursor(cursor)).toBe(offset);
      }),
    );
  });

  it("produces a URL-safe token (no characters requiring percent-encoding)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (offset) => {
        const cursor = encodeOffsetCursor(offset);
        expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      }),
    );
  });

  it("never throws and always resumes from a valid (>= 0) offset for arbitrary garbage input", () => {
    fc.assert(
      fc.property(fc.string(), (garbage) => {
        expect(() => decodeOffsetCursor(garbage)).not.toThrow();
        expect(decodeOffsetCursor(garbage)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("treats undefined as the start-of-results offset 0", () => {
    expect(decodeOffsetCursor(undefined)).toBe(0);
  });

  it("decoding a cursor built from a negative or non-numeric `o` field falls back to 0", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ max: -1 }), fc.string(), fc.boolean()), (badO) => {
        const cursor = Buffer.from(JSON.stringify({ o: badO })).toString("base64url");
        expect(decodeOffsetCursor(cursor)).toBe(0);
      }),
    );
  });
});

describe("pagination.clampLimit (property-based)", () => {
  it("always returns a value within [1, hardLimit]", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: -1000, max: 100_000 }), { nil: undefined }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 51, max: 500 }),
        (requested, defaultLimit, hardLimit) => {
          const result = clampLimit(requested, defaultLimit, hardLimit);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(hardLimit);
        },
      ),
    );
  });

  it("falls back to defaultLimit for undefined, zero, or negative requests", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 0 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 51, max: 500 }),
        (nonPositive, defaultLimit, hardLimit) => {
          expect(clampLimit(nonPositive, defaultLimit, hardLimit)).toBe(defaultLimit);
        },
      ),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 51, max: 500 }),
        (defaultLimit, hardLimit) => {
          expect(clampLimit(undefined, defaultLimit, hardLimit)).toBe(defaultLimit);
        },
      ),
    );
  });

  it("caps any request above hardLimit down to hardLimit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 51, max: 500 }),
        fc.integer({ min: 501, max: 100_000 }),
        (defaultLimit, hardLimit, tooMany) => {
          expect(clampLimit(tooMany, defaultLimit, hardLimit)).toBe(hardLimit);
        },
      ),
    );
  });
});
