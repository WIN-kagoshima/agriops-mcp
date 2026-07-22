import { z } from "zod";

/**
 * Shared `attribution` field schema, used by every output schema whose data
 * comes from a licensed source (Open-Meteo, eMAFF, FAMIC, JMA — see
 * docs/data-license.md). Required and non-empty: `docs/data-license.md`
 * §"Operational requirements" states every adapter result carries a
 * populated `attribution` string, so the schema enforces that instead of
 * relying on adapters to remember. `tests/conformance/attribution.test.ts`
 * asserts this invariant holds for the default (core) tool surface.
 */
export const AttributionSchema = z
  .string()
  .min(1, "attribution must be a non-empty string — see docs/data-license.md")
  .describe(
    "License attribution string identifying the data source, e.g. for display to end users.",
  );
