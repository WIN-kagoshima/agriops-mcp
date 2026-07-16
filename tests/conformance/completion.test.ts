/**
 * Completion primitive conformance (MCP Spec 2025-11-25 §6.11, `completions`
 * capability, `completion/complete` request).
 *
 * The 7 MCP primitives are Tools, Prompts, Resources, Resource Templates,
 * Completion, Logging, Pagination — see docs/phase-plan.md Phase 13. This
 * suite asserts the two completers this server registers actually work end
 * to end, and that the capability is truthfully negotiated (not just
 * declared).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { buildEmaff, buildJma, buildWeather } from "../scenarios/_harness.js";

async function bootClient() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const { server } = createServer({
    config,
    logger,
    version: "test-completion",
    overrides: {
      weather: buildWeather(),
      jma: buildJma(),
      emaff: buildEmaff(),
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "completion-test", version: "0.0.1" }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("Completion primitive", () => {
  it("negotiates the completions capability", async () => {
    const { client, close } = await bootClient();
    try {
      const caps = client.getServerCapabilities();
      expect(caps?.completions, "server did not negotiate completions capability").toBeDefined();
    } finally {
      await close();
    }
  });

  it("completes the area_briefing prompt's `prefecture` argument by Japanese-name prefix", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.complete({
        ref: { type: "ref/prompt", name: "area_briefing" },
        argument: { name: "prefecture", value: "鹿児島" },
      });
      expect(result.completion.values).toContain("鹿児島県");
    } finally {
      await close();
    }
  });

  it("completes the area_briefing prompt's `prefecture` argument by JP-nn code prefix", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.complete({
        ref: { type: "ref/prompt", name: "area_briefing" },
        argument: { name: "prefecture", value: "jp-46" },
      });
      expect(result.completion.values).toContain("鹿児島県");
    } finally {
      await close();
    }
  });

  it("completes the farmland://{fude_id} resource template from a search-matching query", async () => {
    const { client, close } = await bootClient();
    try {
      const result = await client.complete({
        ref: { type: "ref/resource", uri: "farmland://{fude_id}" },
        argument: { name: "fude_id", value: "fude-eval" },
      });
      expect(result.completion.values.length).toBeGreaterThan(0);
      expect(result.completion.values).toContain("fude-eval-0001");
    } finally {
      await close();
    }
  });

  it("reading a resolved farmland:// URI returns the matching field", async () => {
    const { client, close } = await bootClient();
    try {
      const read = await client.readResource({ uri: "farmland://fude-eval-0001" });
      const content = read.contents[0];
      expect(content && "text" in content ? content.text : undefined).toBeDefined();
      const text = content && "text" in content ? content.text : "{}";
      const parsed = JSON.parse(text);
      expect(parsed.fieldId).toBe("fude-eval-0001");
    } finally {
      await close();
    }
  });

  it("reading an unknown farmland:// URI returns a structured not-found payload, not a protocol error", async () => {
    const { client, close } = await bootClient();
    try {
      const read = await client.readResource({ uri: "farmland://does-not-exist" });
      const content = read.contents[0];
      const text = content && "text" in content ? content.text : "{}";
      const parsed = JSON.parse(text);
      expect(parsed.error).toBe("farmland_not_found");
    } finally {
      await close();
    }
  });
});
