import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { OpenMeteoWeatherAdapter } from "../../src/adapters/weather/open-meteo.js";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";

/**
 * The Server Card and `initialize` response both declare a `logging: {}`
 * capability (MCP Spec 2025-11-25 §6.9). This test proves that declaration
 * is backed by a real implementation — `deps.logger` (and every `.child()`
 * derived from it, which is what adapters/tools actually hold) forwards
 * `warn`/`error` calls to `notifications/message` once a client is
 * connected — rather than being an unused stub. See `withMcpSink` in
 * src/lib/logger.ts and its wiring in src/server/create-server.ts.
 */
describe("MCP logging capability (notifications/message)", () => {
  async function boot() {
    const config = loadConfig();
    const logger = createLogger({ level: "warn" });
    const { server, deps } = createServer({
      config,
      logger,
      version: "test-mcp-logging",
      overrides: {
        weather: new OpenMeteoWeatherAdapter({ fetchImpl: async () => new Response("{}") }),
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "mcp-logging", version: "0.0.1" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return {
      client,
      deps,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it("forwards deps.logger.warn() as a notifications/message with level=warning", async () => {
    const { client, deps, close } = await boot();
    try {
      const received = new Promise<{ level: string; data: unknown }>((resolveNotif) => {
        client.setNotificationHandler(LoggingMessageNotificationSchema, (notif) => {
          resolveNotif(notif.params as { level: string; data: unknown });
        });
      });

      deps.logger.warn("test warning from mcp-logging conformance test", { foo: "bar" });

      const notif = await received;
      expect(notif.level).toBe("warning");
      expect(notif.data).toMatchObject({
        message: "test warning from mcp-logging conformance test",
        foo: "bar",
      });
    } finally {
      await close();
    }
  });

  it("forwards logger.child() derived loggers too (the shape every adapter actually uses)", async () => {
    const { client, deps, close } = await boot();
    try {
      const received = new Promise<{ level: string; data: unknown }>((resolveNotif) => {
        client.setNotificationHandler(LoggingMessageNotificationSchema, (notif) => {
          resolveNotif(notif.params as { level: string; data: unknown });
        });
      });

      const child = deps.logger.child({ component: "test-adapter" });
      child.error("test error from a child logger", { code: "E_TEST" });

      const notif = await received;
      expect(notif.level).toBe("error");
      expect(notif.data).toMatchObject({
        message: "test error from a child logger",
        component: "test-adapter",
        code: "E_TEST",
      });
    } finally {
      await close();
    }
  });
});
