#!/usr/bin/env node
/**
 * snapshots:audit — Snapshot freshness and integrity gate.
 *
 * For each expected SQLite snapshot this script:
 *
 *   1. Verifies the `.sqlite` file exists.
 *   2. Reads the companion `.sqlite.manifest.json` file.
 *   3. Validates the manifest schema (schemaVersion, generatedAt, outputSha256).
 *   4. Checks that `generatedAt` is within the allowed age limit
 *      (default: 90 days; override with `--max-age-days=N`).
 *   5. Re-computes the SHA-256 of the SQLite file and compares it to the
 *      manifest's `outputSha256` to detect silent corruption or tampering.
 *
 * Exit codes:
 *   0 — all snapshots present, fresh, and hash-verified
 *   1 — one or more failures (missing file, stale manifest, hash mismatch)
 *
 * Usage:
 *   npm run snapshots:audit
 *   npm run snapshots:audit -- --max-age-days=30
 *   npm run snapshots:audit -- --snapshot-dir=./snapshots --max-age-days=60
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EXPECTED_SNAPSHOTS = ["emaff-fude-kagoshima.sqlite", "famic-pesticide-2026.sqlite"] as const;

interface ManifestV1 {
  schemaVersion: 1;
  generatedAt: string;
  builder: string;
  outputPath: string;
  outputBytes: number;
  outputSha256: string;
  rowCount: number;
  source: string;
  attribution: string;
}

interface ManifestV2 extends Omit<ManifestV1, "schemaVersion"> {
  schemaVersion: 2;
  /** Set when the last build used --incremental mode. */
  lastIncrementalAt?: string;
  incrementalRowsProcessed?: number;
}

type Manifest = ManifestV1 | ManifestV2;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { maxAgeDays: number; snapshotDir: string } {
  let maxAgeDays = 90;
  let snapshotDir = "./snapshots";
  for (const arg of argv.slice(2)) {
    const maxAge = arg.match(/^--max-age-days=(\d+)$/);
    if (maxAge?.[1]) {
      maxAgeDays = Number.parseInt(maxAge[1], 10);
      continue;
    }
    const dir = arg.match(/^--snapshot-dir=(.+)$/);
    if (dir?.[1]) {
      snapshotDir = dir[1];
    }
  }
  return { maxAgeDays, snapshotDir };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function isManifest(obj: unknown): obj is Manifest {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    (m.schemaVersion === 1 || m.schemaVersion === 2) &&
    typeof m.generatedAt === "string" &&
    typeof m.outputSha256 === "string" &&
    typeof m.rowCount === "number" &&
    typeof m.attribution === "string"
  );
}

// ---------------------------------------------------------------------------
// Audit runner
// ---------------------------------------------------------------------------

interface AuditResult {
  name: string;
  status: "pass" | "fail";
  message: string;
}

async function auditSnapshot(
  snapshotDir: string,
  filename: string,
  maxAgeDays: number,
): Promise<AuditResult> {
  const sqlitePath = resolve(snapshotDir, filename);
  const manifestPath = `${sqlitePath}.manifest.json`;
  const label = filename;

  // 1. SQLite file exists
  if (!existsSync(sqlitePath)) {
    return {
      name: label,
      status: "fail",
      message: `SQLite file not found: ${sqlitePath}. Run \`npm run snapshots:build\` to generate it.`,
    };
  }

  // 2. Manifest exists
  if (!existsSync(manifestPath)) {
    return {
      name: label,
      status: "fail",
      message: `Manifest not found: ${manifestPath}. Run \`npm run snapshots:build\` to regenerate.`,
    };
  }

  // 3. Parse and validate manifest (v1 and v2 supported)
  let manifest: Manifest;
  try {
    const raw = await readFile(manifestPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isManifest(parsed)) {
      return {
        name: label,
        status: "fail",
        message:
          "Manifest schema invalid: expected schemaVersion=1|2, generatedAt, outputSha256, rowCount, attribution.",
      };
    }
    manifest = parsed;
  } catch (err) {
    return {
      name: label,
      status: "fail",
      message: `Failed to read manifest: ${(err as Error).message}`,
    };
  }

  // 4. Freshness check
  const generatedAt = new Date(manifest.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return {
      name: label,
      status: "fail",
      message: `manifest.generatedAt is not a valid ISO timestamp: "${manifest.generatedAt}"`,
    };
  }
  const ageMs = Date.now() - generatedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > maxAgeDays) {
    const ageDaysStr = ageDays.toFixed(1);
    return {
      name: label,
      status: "fail",
      message: `Snapshot is ${ageDaysStr} days old (limit: ${maxAgeDays} days). Last built: ${manifest.generatedAt}. Run \`npm run snapshots:build\` to refresh.`,
    };
  }

  // 5. Hash integrity check
  let actualHash: string;
  try {
    actualHash = await sha256File(sqlitePath);
  } catch (err) {
    return {
      name: label,
      status: "fail",
      message: `Could not hash file: ${(err as Error).message}`,
    };
  }
  if (actualHash !== manifest.outputSha256) {
    return {
      name: label,
      status: "fail",
      message: `SHA-256 mismatch — file may be corrupted or tampered.\n  manifest : ${manifest.outputSha256}\n  actual   : ${actualHash}`,
    };
  }

  // Bonus: size sanity check
  const fileStat = await stat(sqlitePath);
  if (fileStat.size !== manifest.outputBytes) {
    return {
      name: label,
      status: "fail",
      message: `File size mismatch — file may be corrupted.\n  manifest : ${manifest.outputBytes} bytes\n  actual   : ${fileStat.size} bytes`,
    };
  }

  const ageDaysStr = ageDays.toFixed(1);
  const incrementalNote =
    manifest.schemaVersion === 2 && manifest.lastIncrementalAt
      ? ` · last-incremental: ${manifest.lastIncrementalAt.slice(0, 10)}`
      : "";

  return {
    name: label,
    status: "pass",
    message:
      `${manifest.rowCount.toLocaleString()} rows · ${ageDaysStr}d old · ` +
      `sha256 ok · ${(fileStat.size / 1024 / 1024).toFixed(1)} MiB${incrementalNote}`,
  };
}

async function run(): Promise<void> {
  const { maxAgeDays, snapshotDir } = parseArgs(process.argv);
  const absDir = resolve(snapshotDir);
  console.log(`AgriOps MCP snapshot audit (max age: ${maxAgeDays} days, dir: ${absDir})\n`);

  const results: AuditResult[] = await Promise.all(
    EXPECTED_SNAPSHOTS.map((name) => auditSnapshot(snapshotDir, name, maxAgeDays)),
  );

  let failures = 0;
  for (const r of results) {
    const icon = r.status === "pass" ? "[PASS]" : "[FAIL]";
    console.log(`${icon} ${r.name}`);
    if (r.status === "fail") {
      failures++;
      for (const line of r.message.split("\n")) {
        console.log(`       ${line}`);
      }
    } else {
      console.log(`       ${r.message}`);
    }
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} snapshot(s) failed the freshness/integrity audit.`);
    process.exit(1);
  } else {
    console.log(`All ${results.length} snapshot(s) passed.`);
  }
}

run().catch((err: unknown) => {
  console.error(`fatal: ${(err as Error).message}`);
  process.exit(1);
});
