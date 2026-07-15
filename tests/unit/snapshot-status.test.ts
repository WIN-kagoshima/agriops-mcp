/**
 * Tests for the snapshot_status tool.
 *
 * We use a temporary directory with synthetic manifest JSON files to avoid
 * coupling the test to the real snapshots/ folder, which may not exist in CI.
 * The tool reads from process.cwd()/snapshots by default, so we temporarily
 * change the working directory.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { buildWeather } from "../scenarios/_harness.js";

// Use the OS temp dir (outside OneDrive) to avoid EBUSY / sync-lock issues on Windows.
const TMP_DIR = join(tmpdir(), `agriops-snapshot-test-${process.pid}`);
const SNAPSHOT_DIR = join(TMP_DIR, "snapshots");

function writeManifest(
  name: string,
  overrides: Partial<{
    schemaVersion: 1 | 2;
    generatedAt: string;
    rowCount: number;
    outputBytes: number;
    lastIncrementalAt: string;
  }> = {},
) {
  writeFileSync(
    join(SNAPSHOT_DIR, `${name}.manifest.json`),
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: overrides.generatedAt ?? new Date().toISOString(),
      builder: "test",
      outputPath: `snapshots/${name}`,
      outputBytes: overrides.outputBytes ?? 1024,
      outputSha256: "abc123",
      rowCount: overrides.rowCount ?? 100,
      source: "https://example.com",
      attribution: "Test attribution",
      ...overrides,
    }),
  );
}

async function bootClient() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({
    config,
    logger,
    version: "test",
    // Explicitly disable DB adapters so better-sqlite3 never opens the
    // empty placeholder .sqlite files we create in the temp directory.
    overrides: { weather: buildWeather(), emaff: null, famic: null, jma: null, iotDb: null },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "snapshot-test", version: "0.0.1" }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("snapshot_status tool", () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    // Create placeholder .sqlite files so `existsSync` returns true.
    for (const name of ["emaff-fude-kagoshima.sqlite", "famic-pesticide-2026.sqlite"]) {
      writeFileSync(join(SNAPSHOT_DIR, name), "");
    }
    // Change cwd so resolve("snapshots") points to our temp dir.
    process.chdir(TMP_DIR);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  it("reports all snapshots fresh when manifests are current", async () => {
    writeManifest("emaff-fude-kagoshima.sqlite", { rowCount: 42_000 });
    writeManifest("famic-pesticide-2026.sqlite", { rowCount: 3_500 });

    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "snapshot_status",
        arguments: { staleAfterHours: 2160 },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toMatch(/fresh/);
      expect(result.isError).toBeFalsy();

      const structured = result.structuredContent as {
        allPresent: boolean;
        allFresh: boolean;
        snapshots: Array<{ name: string; stale: boolean; rowCount: number }>;
      };
      expect(structured.allPresent).toBe(true);
      expect(structured.allFresh).toBe(true);
      expect(structured.snapshots).toHaveLength(2);
      expect(structured.snapshots[0]?.rowCount).toBe(42_000);
    } finally {
      await close();
    }
  });

  it("flags stale when generatedAt is too old", async () => {
    const old = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString(); // 200 days ago
    writeManifest("emaff-fude-kagoshima.sqlite", { generatedAt: old });
    writeManifest("famic-pesticide-2026.sqlite");

    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({
        name: "snapshot_status",
        arguments: { staleAfterHours: 2160 }, // 90 days threshold
      });
      const structured = result.structuredContent as {
        allFresh: boolean;
        snapshots: Array<{ name: string; stale?: boolean }>;
      };
      expect(structured.allFresh).toBe(false);
      const emaff = structured.snapshots.find((s) => s.name === "emaff-fude-kagoshima.sqlite");
      expect(emaff?.stale).toBe(true);
    } finally {
      await close();
    }
  });

  it("reports missing when .sqlite file does not exist", async () => {
    // No .sqlite files created — only manifests.
    await rm(join(SNAPSHOT_DIR, "emaff-fude-kagoshima.sqlite"));
    writeManifest("emaff-fude-kagoshima.sqlite");
    writeManifest("famic-pesticide-2026.sqlite");

    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({ name: "snapshot_status", arguments: {} });
      const structured = result.structuredContent as {
        allPresent: boolean;
        snapshots: Array<{ name: string; present: boolean }>;
      };
      expect(structured.allPresent).toBe(false);
      const emaff = structured.snapshots.find((s) => s.name === "emaff-fude-kagoshima.sqlite");
      expect(emaff?.present).toBe(false);
    } finally {
      await close();
    }
  });

  it("handles missing manifest gracefully (present = true, manifestPresent = false)", async () => {
    // .sqlite exists but no manifest.
    const { client, close } = await bootClient();
    try {
      const result = await client.callTool({ name: "snapshot_status", arguments: {} });
      const structured = result.structuredContent as {
        snapshots: Array<{ name: string; present: boolean; manifestPresent: boolean }>;
      };
      for (const snap of structured.snapshots) {
        expect(snap.present).toBe(true);
        expect(snap.manifestPresent).toBe(false);
        expect((snap as Record<string, unknown>).generatedAt).toBeUndefined();
      }
    } finally {
      await close();
    }
  });

  it("respects custom staleAfterHours threshold", async () => {
    const recent = new Date(Date.now() - 5 * 3600 * 1000).toISOString(); // 5 hours ago
    writeManifest("emaff-fude-kagoshima.sqlite", { generatedAt: recent });
    writeManifest("famic-pesticide-2026.sqlite", { generatedAt: recent });

    const { client, close } = await bootClient();
    try {
      // 3-hour threshold → should be stale
      const staleResult = await client.callTool({
        name: "snapshot_status",
        arguments: { staleAfterHours: 3 },
      });
      expect((staleResult.structuredContent as { allFresh: boolean }).allFresh).toBe(false);

      // 10-hour threshold → should be fresh
      const freshResult = await client.callTool({
        name: "snapshot_status",
        arguments: { staleAfterHours: 10 },
      });
      expect((freshResult.structuredContent as { allFresh: boolean }).allFresh).toBe(true);
    } finally {
      await close();
    }
  });
});
