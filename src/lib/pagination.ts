/**
 * Shared offset-cursor pagination helpers for adapters (Pagination is one of
 * the 7 MCP primitives — see docs/phase-plan.md). All list-shaped adapter
 * results (`search_farmland`, `nearby_farms`, `get_pesticide_rules`) use the
 * same opaque, base64url-encoded `{ o: offset }` cursor shape, so the codec
 * is centralised here instead of duplicated per adapter.
 *
 * The cursor is intentionally opaque and unauthenticated: it encodes a
 * best-effort resume offset, not a signed or tamper-proof token. A garbled
 * or hand-edited cursor decodes to offset 0 (start over) rather than
 * throwing, so pagination degrades gracefully instead of erroring.
 */

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function decodeOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as {
      o?: number;
    };
    if (typeof decoded.o === "number" && Number.isFinite(decoded.o) && decoded.o >= 0) {
      return decoded.o;
    }
  } catch {
    // fall through — malformed cursor resumes from the start.
  }
  return 0;
}

/** Clamp a requested page size into `[1, hardLimit]`, defaulting when unset or invalid. */
export function clampLimit(n: number | undefined, defaultLimit: number, hardLimit: number): number {
  if (!n || n <= 0) return defaultLimit;
  return Math.min(hardLimit, Math.floor(n));
}
