#!/usr/bin/env node
/**
 * Reproducible snapshot builder.
 *
 * Reads raw open-data files under `snapshots/raw/` and produces SQLite
 * snapshots that the runtime adapters consume. Run with:
 *
 *     npm run snapshots:build
 *
 * Each builder is idempotent and independent: missing raw inputs cause
 * that builder to print an instructive message and skip, rather than fail
 * the whole pipeline. This lets developers run only the parts they care
 * about.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildEmaffSnapshot } from "./build-emaff.js";
import { buildFamicSnapshot } from "./build-famic.js";

interface BuilderResult {
  name: string;
  status: "ok" | "skipped" | "failed";
  message: string;
  outputPath?: string;
  rawPaths?: string[];
  rowCount?: number;
  incrementalRowsProcessed?: number;
  source?: string;
  attribution?: string;
}

/**
 * Google Cloud Smart Storage object-context metadata (Cloud Next '26).
 * Attached to snapshot manifests so Smart Storage-aware clients can apply
 * semantic filtering, topic routing, and data-lineage tracking without
 * reading the full SQLite file.
 */
interface SmartStorageContext {
  /** Schema version for Smart Storage context format. */
  objectContextVersion: "v1";
  /**
   * Approximate bounding box of the data in this snapshot as a GeoJSON
   * Polygon [minLng, minLat, maxLng, maxLat]. Derived from the raw inputs
   * or hardcoded per-builder for known datasets.
   */
  spatialExtent?: {
    type: "Polygon";
    coordinates: number[][][];
  };
  /**
   * Semantic topic tags for content-based routing in Agent Platform workflows.
   */
  topicTags: string[];
  /** Machine-readable data lineage for audit and compliance. */
  dataLineage: {
    source: string;
    license: string;
    sourceUrl?: string;
  };
}

interface SnapshotManifest {
  schemaVersion: 2;
  generatedAt: string;
  /** Set when --incremental mode was used for this build. */
  lastIncrementalAt?: string;
  /** Number of rows processed in the incremental pass. */
  incrementalRowsProcessed?: number;
  builder: string;
  outputPath: string;
  outputBytes: number;
  outputSha256: string;
  rawInputs: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
  rowCount: number;
  source: string;
  attribution: string;
  /** Smart Storage context for Google Cloud Agent Platform integration. */
  smartStorage?: SmartStorageContext;
}

async function ensureDir(path: string): Promise<void> {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true });
  }
}

function parseArgs(argv: string[]): { incremental: boolean } {
  return {
    incremental: argv.includes("--incremental"),
  };
}

async function run(): Promise<void> {
  const { incremental } = parseArgs(process.argv.slice(2));

  if (incremental) {
    console.log("Mode: incremental (existing snapshots will be updated in-place)");
  } else {
    console.log("Mode: full rebuild (existing snapshots will be recreated)");
  }

  await ensureDir("./snapshots");
  await ensureDir("./snapshots/raw");

  const results: BuilderResult[] = [];

  results.push(
    await tryRun("emaff", async () =>
      buildEmaffSnapshot({
        rawPaths: await resolveEmaffRawPaths(),
        outPath: "./snapshots/emaff-fude-kagoshima.sqlite",
        incremental,
      }),
    ),
  );
  results.push(
    await tryRun("famic", () =>
      buildFamicSnapshot({
        rawPath: "./snapshots/raw/famic-pesticide.csv",
        outPath: "./snapshots/famic-pesticide-2026.sqlite",
      }),
    ),
  );

  console.log("\n=== Snapshot build summary ===");
  for (const r of results) {
    const icon = r.status === "ok" ? "OK" : r.status === "skipped" ? "--" : "FAIL";
    console.log(`[${icon}] ${r.name}: ${r.message}`);
    if (r.status === "ok") {
      const manifestPath = await writeSnapshotManifest(r, incremental);
      console.log(`     manifest: ${manifestPath}`);
    }
  }
  if (results.some((r) => r.status === "failed")) {
    process.exitCode = 1;
  }
}

async function resolveEmaffRawPaths(): Promise<string[]> {
  const singleFile = "./snapshots/raw/emaff-fude-kagoshima.geojson";
  if (existsSync(singleFile)) return [singleFile];

  const extractedDir = "./snapshots/raw/emaff-fude-kagoshima";
  if (!existsSync(extractedDir)) return [singleFile];

  const entries = await readdir(extractedDir);
  const files = entries
    .filter((entry) => entry.endsWith(".geojson") || entry.endsWith(".json"))
    .sort()
    .map((entry) => join(extractedDir, entry));
  return files.length > 0 ? files : [singleFile];
}

async function tryRun(name: string, fn: () => Promise<BuilderResult>): Promise<BuilderResult> {
  try {
    const out = await fn();
    return out;
  } catch (err) {
    return {
      name,
      status: "failed",
      message: (err as Error).message,
    };
  }
}

async function writeSnapshotManifest(result: BuilderResult, incremental = false): Promise<string> {
  if (
    !result.outputPath ||
    result.rowCount === undefined ||
    !result.source ||
    !result.attribution
  ) {
    throw new Error(`builder ${result.name} returned incomplete manifest metadata`);
  }
  const now = new Date().toISOString();
  const manifest: SnapshotManifest = {
    schemaVersion: 2,
    generatedAt: now,
    ...(incremental
      ? {
          lastIncrementalAt: now,
          incrementalRowsProcessed: result.incrementalRowsProcessed,
        }
      : {}),
    builder: result.name,
    outputPath: result.outputPath,
    outputBytes: (await stat(result.outputPath)).size,
    outputSha256: await sha256File(result.outputPath),
    rawInputs: await Promise.all(
      (result.rawPaths ?? []).map(async (path) => ({
        path,
        bytes: (await stat(path)).size,
        sha256: await sha256File(path),
      })),
    ),
    rowCount: result.rowCount,
    source: result.source,
    attribution: result.attribution,
    smartStorage: buildSmartStorageContext(result.name),
  };
  const manifestPath = `${result.outputPath}.manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

run().catch((err: unknown) => {
  const e = err as Error;
  console.error(`fatal: ${e.message}`);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

/**
 * Returns a Smart Storage object-context block for the given builder.
 * Values are intentionally conservative approximations — the exact spatial
 * extent is computed from the raw inputs at full-build time; for now we use
 * known-good bounding boxes for our Kagoshima-prefect datasets.
 */
function buildSmartStorageContext(builderName: string): SmartStorageContext {
  if (builderName === "emaff") {
    return {
      objectContextVersion: "v1",
      // Kagoshima prefecture approximate bounding box.
      spatialExtent: {
        type: "Polygon",
        coordinates: [
          [
            [129.2, 30.9],
            [131.1, 30.9],
            [131.1, 32.2],
            [129.2, 32.2],
            [129.2, 30.9],
          ],
        ],
      },
      topicTags: ["farmland", "japan", "kagoshima", "emaff", "fude-polygon", "agriculture"],
      dataLineage: {
        source: "eMAFF",
        license: "CC-BY 4.0",
        sourceUrl: "https://open.fude.maff.go.jp/",
      },
    };
  }
  if (builderName === "famic") {
    return {
      objectContextVersion: "v1",
      topicTags: ["pesticide", "japan", "famic", "crop-protection", "agriculture"],
      dataLineage: {
        source: "FAMIC",
        license: "Government of Japan Open Data",
        sourceUrl: "https://www.acis.famic.go.jp/",
      },
    };
  }
  return {
    objectContextVersion: "v1",
    topicTags: ["agriculture", "japan"],
    dataLineage: { source: builderName, license: "unknown" },
  };
}

// Re-export for tests.
export { dirname };
