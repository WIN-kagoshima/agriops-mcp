import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Deps } from "../server/deps.js";
import { getToolAnnotations } from "../server/surface-catalog.js";
import type { ToolMeta } from "../types/common.js";

export const meta: ToolMeta = {
  name: "snapshot_status",
  sideEffect: "read-only",
  visibility: "model",
  introducedInPhase: 5,
};

/** Manifest shapes accepted by this tool. */
interface ManifestBase {
  schemaVersion: 1 | 2;
  generatedAt: string;
  builder: string;
  outputBytes: number;
  outputSha256: string;
  rowCount: number;
  source: string;
  attribution: string;
  lastIncrementalAt?: string;
  incrementalRowsProcessed?: number;
}

const KNOWN_SNAPSHOTS = ["emaff-fude-kagoshima.sqlite", "famic-pesticide-2026.sqlite"] as const;

const outputSchema = z.object({
  snapshots: z.array(
    z.object({
      name: z.string().describe("SQLite snapshot filename."),
      present: z.boolean().describe("Whether the .sqlite file exists on disk."),
      manifestPresent: z.boolean().describe("Whether a companion manifest JSON exists."),
      generatedAt: z.string().optional().describe("ISO timestamp when the snapshot was built."),
      ageHours: z.number().optional().describe("Age of the snapshot in hours."),
      stale: z
        .boolean()
        .optional()
        .describe("True when ageHours exceeds the staleAfterHours threshold."),
      rowCount: z.number().int().optional().describe("Row count recorded in the manifest."),
      outputBytes: z
        .number()
        .int()
        .optional()
        .describe("File size in bytes recorded in the manifest."),
      lastIncrementalAt: z
        .string()
        .optional()
        .describe("ISO timestamp of last incremental update, if any."),
      attribution: z.string().optional().describe("Attribution string from the manifest."),
      error: z.string().optional().describe("Error message if the manifest could not be read."),
    }),
  ),
  checkedAt: z.string().describe("ISO timestamp when this check was performed."),
  allPresent: z.boolean().describe("True when every known snapshot file exists on disk."),
  allFresh: z
    .boolean()
    .describe("True when every present snapshot is within the staleAfterHours threshold."),
});

export function registerSnapshotStatus(server: McpServer, _deps: Deps): void {
  const snapshotDir = resolve("snapshots");

  server.registerTool(
    meta.name,
    {
      title: "Snapshot freshness status",
      description:
        "Reports the freshness and provenance of the eMAFF/FAMIC SQLite snapshots that back the " +
        "search_farmland, area_summary, and get_pesticide_rules tools. Returns age, row counts, " +
        "and attribution for each snapshot. Useful before relying on farmland or pesticide data " +
        "in a time-sensitive context (e.g. planting season decisions). Read-only.",
      inputSchema: {
        staleAfterHours: z
          .number()
          .int()
          .min(1)
          .max(8760)
          .default(2160)
          .describe(
            "Hours after which a snapshot is considered stale. Default is 2160 h (90 days). " +
              "Set lower (e.g. 168 for 7 days) for time-critical checks.",
          ),
      },
      outputSchema: outputSchema.shape,
      annotations: getToolAnnotations(meta.name),
    },
    async (raw: unknown) => {
      const parsed = z
        .object({ staleAfterHours: z.number().int().min(1).max(8760).default(2160) })
        .safeParse(raw);
      const staleAfterHours = parsed.success ? parsed.data.staleAfterHours : 2160;
      const checkedAt = new Date().toISOString();

      const results = await Promise.all(
        KNOWN_SNAPSHOTS.map(async (name) => {
          const sqlitePath = resolve(snapshotDir, name);
          const manifestPath = `${sqlitePath}.manifest.json`;
          const present = existsSync(sqlitePath);
          const manifestPresent = existsSync(manifestPath);

          if (!present) {
            return { name, present, manifestPresent };
          }
          if (!manifestPresent) {
            return { name, present, manifestPresent };
          }

          try {
            const raw = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestBase;
            const generatedAt = raw.generatedAt;
            const ageHours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
            return {
              name,
              present,
              manifestPresent,
              generatedAt,
              ageHours: Math.round(ageHours * 10) / 10,
              stale: ageHours > staleAfterHours,
              rowCount: raw.rowCount,
              outputBytes: raw.outputBytes,
              lastIncrementalAt: raw.lastIncrementalAt,
              attribution: raw.attribution,
            };
          } catch (err) {
            return {
              name,
              present,
              manifestPresent,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );

      const allPresent = results.every((r) => r.present);
      const allFresh = results.every((r) => !r.stale);

      const lines = results.map((r) => {
        if (!r.present) return `  ${r.name}: MISSING`;
        if (!r.manifestPresent) return `  ${r.name}: present, no manifest`;
        if (r.error) return `  ${r.name}: manifest error — ${r.error}`;
        const freshness = r.stale ? `STALE (${r.ageHours}h)` : `fresh (${r.ageHours}h)`;
        return `  ${r.name}: ${freshness}, ${r.rowCount?.toLocaleString() ?? "?"} rows`;
      });

      const summary = [
        `Snapshot status at ${checkedAt} (stale threshold: ${staleAfterHours}h):`,
        ...lines,
        allPresent && allFresh
          ? "All snapshots present and fresh."
          : "⚠ One or more snapshots missing or stale.",
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: {
          snapshots: results,
          checkedAt,
          allPresent,
          allFresh,
        } as unknown as Record<string, unknown>,
      };
    },
  );
}
