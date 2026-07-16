/**
 * Benchmark: end-to-end MCP tool-call latency for the two most
 * request-heavy core tools, `search_farmland` and `get_weather_1km`.
 *
 * Measures the full `tools/call` round trip over an in-memory MCP
 * transport (client -> server -> mock adapter -> Zod validation ->
 * response), the same path a real client exercises minus network I/O.
 * Mock adapters are deterministic and CPU-only (no filesystem, no
 * network), so this isolates MCP/Zod/serialization overhead rather than
 * upstream API latency — the number a Directory reviewer or an
 * integrating developer actually cares about ("how much overhead does
 * this MCP server add").
 *
 * Usage: `npm run bench` (prints a Markdown table to stdout; also used to
 * refresh the numbers published in README.md's "Performance" section).
 */

import { Bench } from "tinybench";
import { bootClient } from "../tests/scenarios/_harness.js";

interface BenchRow {
  name: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
  samples: number;
}

function percentile(sortedSamples: readonly number[], p: number): number {
  if (sortedSamples.length === 0) return Number.NaN;
  const idx = Math.min(sortedSamples.length - 1, Math.ceil((p / 100) * sortedSamples.length) - 1);
  return sortedSamples[Math.max(0, idx)] ?? Number.NaN;
}

async function main(): Promise<void> {
  const { client, close } = await bootClient();

  const bench = new Bench({
    time: 1000,
    iterations: 200,
    warmupTime: 200,
    warmupIterations: 20,
    retainSamples: true,
  });

  bench
    .add("search_farmland", async () => {
      await client.callTool({
        name: "search_farmland",
        arguments: { prefectureCode: "JP-46", limit: 20 },
      });
    })
    .add("get_weather_1km", async () => {
      await client.callTool({
        name: "get_weather_1km",
        arguments: { lat: 31.8352, lng: 130.3107, hours: 24 },
      });
    });

  await bench.run();

  const rows: BenchRow[] = bench.tasks.map((task) => {
    const result = task.result;
    if (!result || (result.state !== "completed" && result.state !== "aborted-with-statistics")) {
      return {
        name: task.name,
        p50Ms: Number.NaN,
        p95Ms: Number.NaN,
        p99Ms: Number.NaN,
        opsPerSec: 0,
        samples: 0,
      };
    }
    const samples = result.latency.samples ?? [1];
    return {
      name: task.name,
      p50Ms: result.latency.p50,
      p95Ms: percentile(samples, 95),
      p99Ms: result.latency.p99,
      opsPerSec: result.throughput.mean,
      samples: samples.length,
    };
  });

  await close();

  console.log("\n| Tool | p50 (ms) | p95 (ms) | p99 (ms) | ops/sec | samples |");
  console.log("|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| \`${r.name}\` | ${r.p50Ms.toFixed(3)} | ${r.p95Ms.toFixed(3)} | ${r.p99Ms.toFixed(3)} | ${r.opsPerSec.toFixed(0)} | ${r.samples} |`,
    );
  }
  console.log(
    `\nMeasured: full \`tools/call\` round trip over an in-memory transport with deterministic mock adapters (no network/filesystem I/O) — isolates MCP + Zod validation overhead. Node ${process.version} on ${process.platform}/${process.arch}. Regenerate with \`npm run bench\`.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
