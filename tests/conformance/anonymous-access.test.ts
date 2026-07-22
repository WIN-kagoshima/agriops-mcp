import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { startHttp } from "../../src/server/transport-http.js";

/**
 * Anonymous-transport conformance.
 *
 * The public Cloud Run deployment (`agriops-mcp-public`, see
 * docs/anthropic-directory-submission.md §2) is deliberately
 * `--allow-unauthenticated` — Anthropic Connectors Directory reviewers, MCP
 * registry crawlers, and first-time agents must be able to reach every
 * endpoint with **zero** credentials. This file asserts that contract at
 * the real HTTP transport level (`startHttp`, the same code path Cloud Run
 * runs): no `Authorization` header, no cookie, no OAuth dance, on every
 * request.
 *
 * `startHttp`'s per-request `/mcp` handler always constructs a fresh,
 * config-driven `McpServer` (stateless-transport pattern) rather than
 * reusing whatever `createServer()` instance the caller passes in, so — like
 * `tests/smoke/http-client.test.ts` — this only asserts against
 * `get_weather_1km` (never snapshot-backed, so it registers and responds
 * the same with or without real eMAFF/FAMIC `.sqlite` files on disk) rather
 * than a snapshot-dependent tool. Real eMAFF/FAMIC-backed anonymous access
 * is covered against the live deployment by
 * `.github/workflows/production-smoke-public.yml`.
 *
 * `/metrics` is intentionally excluded — that sidecar is meant to stay
 * bearer-gated even on the public deployment (see `AGRIOPS_METRICS_BEARER`
 * in `tests/smoke/http-ops.test.ts`); it is operator telemetry, not part of
 * the MCP surface a client needs.
 */
describe("Anonymous transport access (no credentials required)", () => {
  const config = { ...loadConfig(), port: 39301, baseUrl: "http://127.0.0.1:39301" };
  const logger = createLogger({ level: "warn" });
  let handle: Awaited<ReturnType<typeof startHttp>>;

  beforeAll(async () => {
    const { server } = createServer({ config, logger, version: "anonymous-access-test" });
    handle = await startHttp(server, { config, logger, version: "anonymous-access-test" });
  });

  afterAll(async () => {
    await handle.stop();
  });

  async function rpc(method: string, params: Record<string, unknown> = {}, id = 1) {
    const res = await fetch(`${config.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const text = await res.text();
    const dataLine = text
      .split(/\r?\n/)
      .find((line) => line.startsWith("data:"))
      ?.slice("data:".length)
      .trim();
    const parsed = JSON.parse(dataLine ?? text) as {
      result?: Record<string, unknown>;
      error?: unknown;
    };
    return { status: res.status, ...parsed };
  }

  it("serves /livez with no Authorization header", async () => {
    const res = await fetch(`${config.baseUrl}/livez`);
    expect(res.status).toBe(200);
  });

  it("serves /readyz with no Authorization header (never a credential rejection)", async () => {
    // Whether the body says "ready" or "not_ready" depends on real eMAFF/
    // FAMIC snapshots being present on disk (see the module doc above) —
    // that's an orthogonal, already-covered concern (tests/smoke/http-ops
    // .test.ts, deploy:preflight). What this asserts is narrower: an
    // anonymous caller is never turned away with 401/403 just for lacking
    // credentials.
    const res = await fetch(`${config.baseUrl}/readyz`);
    expect([200, 503]).toContain(res.status);
  });

  it("serves .well-known/mcp-server.json with no Authorization header", async () => {
    const res = await fetch(`${config.baseUrl}/.well-known/mcp-server.json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("AgriOps MCP");
  });

  it("completes MCP initialize with no Authorization header", async () => {
    const { status, result, error } = await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "anonymous-access-test", version: "0.0.1" },
    });
    expect(error).toBeUndefined();
    expect(status).toBe(200);
    const serverInfo = result?.serverInfo as { name?: string } | undefined;
    expect(serverInfo?.name).toBe("agriops-mcp");
  });

  it("lists the default weather tool with no Authorization header", async () => {
    const { status, result, error } = await rpc("tools/list", {}, 2);
    expect(error).toBeUndefined();
    expect(status).toBe(200);
    const tools = (result?.tools as Array<{ name: string }> | undefined) ?? [];
    expect(tools.map((t) => t.name)).toContain("get_weather_1km");
  });
});
