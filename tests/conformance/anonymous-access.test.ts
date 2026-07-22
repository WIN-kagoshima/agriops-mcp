import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { startHttp } from "../../src/server/transport-http.js";
import { buildWeather } from "../scenarios/_harness.js";

/**
 * Anonymous-transport conformance.
 *
 * The public Cloud Run deployment (`agriops-mcp-public`, see
 * docs/anthropic-directory-submission.md §2) is deliberately
 * `--allow-unauthenticated` — Anthropic Connectors Directory reviewers, MCP
 * registry crawlers, and first-time agents must be able to call every
 * default-tier tool with **zero** credentials. This file asserts that
 * contract at the HTTP transport level: no `Authorization` header, no
 * cookie, no OAuth dance, on every request.
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
    const { server } = createServer({
      config,
      logger,
      version: "anonymous-access-test",
      overrides: { weather: buildWeather() },
    });
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

  it("serves /livez and /readyz with no Authorization header", async () => {
    const live = await fetch(`${config.baseUrl}/livez`);
    expect(live.status).toBe(200);
    const ready = await fetch(`${config.baseUrl}/readyz`);
    expect(ready.status).toBe(200);
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

  it("lists tools with no Authorization header", async () => {
    const { status, result, error } = await rpc("tools/list", {}, 2);
    expect(error).toBeUndefined();
    expect(status).toBe(200);
    const tools = (result?.tools as Array<{ name: string }> | undefined) ?? [];
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_weather_1km");
    expect(names).toContain("search_farmland");
  });

  it("calls a default-tier tool end-to-end with no Authorization header", async () => {
    const { status, result, error } = await rpc(
      "tools/call",
      { name: "get_weather_1km", arguments: { lat: 31.5966, lng: 130.5571 } },
      3,
    );
    expect(error).toBeUndefined();
    expect(status).toBe(200);
    expect(result?.isError).not.toBe(true);
  });
});
