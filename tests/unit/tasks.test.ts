/**
 * Tests for the Tasks Primitive: InMemoryTaskStore, create_task tool lifecycle,
 * get_task_status tool, and the tasks://{id} resource.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { InMemoryTaskStore } from "../../src/tasks/index.js";
import { loadConfig } from "../../src/lib/config.js";
import { createLogger } from "../../src/lib/logger.js";
import { createServer } from "../../src/server/create-server.js";
import { buildEmaff, buildJma, buildWeather } from "../scenarios/_harness.js";

async function bootTaskClient() {
  const config = loadConfig();
  const logger = createLogger({ level: "error" });
  const taskStore = new InMemoryTaskStore();

  const { server } = createServer({
    config,
    logger,
    version: "test",
    overrides: {
      weather: buildWeather(),
      jma: buildJma(),
      emaff: buildEmaff(),
      taskStore,
    },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "task-test-runner", version: "0.0.1" }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    taskStore,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("InMemoryTaskStore", () => {
  it("creates, reads, and updates tasks", () => {
    const store = new InMemoryTaskStore();
    const task = store.create("echo");

    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(task.status).toBe("pending");
    expect(task.kind).toBe("echo");

    const updated = store.update(task.id, { status: "running" });
    expect(updated?.status).toBe("running");

    const done = store.update(task.id, { status: "done", result: { answer: 42 } });
    expect(done?.status).toBe("done");
    expect((done?.result as { answer: number })?.answer).toBe(42);
  });

  it("returns undefined for unknown task id", () => {
    const store = new InMemoryTaskStore();
    expect(store.get("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    expect(store.update("00000000-0000-0000-0000-000000000000", { status: "done" })).toBeUndefined();
  });

  it("list() returns all created tasks", () => {
    const store = new InMemoryTaskStore();
    store.create("echo");
    store.create("area_summary_async");
    expect(store.list()).toHaveLength(2);
  });
});

describe("create_task tool", () => {
  it("returns task_id and pending status immediately for echo kind", async () => {
    const { client, close } = await bootTaskClient();
    try {
      const result = await client.callTool({
        name: "create_task",
        arguments: { kind: "echo", args: { message: "hello" } },
      });

      const sc = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
      expect(sc?.status).toBe("pending");
      expect(typeof sc?.task_id).toBe("string");
      expect(sc?.poll_resource).toMatch(/^tasks:\/\//);
    } finally {
      await close();
    }
  });

  it("rejects invalid kind with isError:true", async () => {
    const { client, close } = await bootTaskClient();
    try {
      const result = await client.callTool({
        name: "create_task",
        arguments: { kind: "invalid_kind_xyz" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
    } finally {
      await close();
    }
  });
});

describe("get_task_status tool", () => {
  it("returns task state after creation", async () => {
    const { client, taskStore, close } = await bootTaskClient();
    try {
      const task = taskStore.create("echo");

      const result = await client.callTool({
        name: "get_task_status",
        arguments: { task_id: task.id },
      });

      const sc = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
      expect(sc?.id).toBe(task.id);
      expect(sc?.kind).toBe("echo");
    } finally {
      await close();
    }
  });

  it("returns isError:true for unknown task_id", async () => {
    const { client, close } = await bootTaskClient();
    try {
      const result = await client.callTool({
        name: "get_task_status",
        arguments: { task_id: "00000000-0000-0000-0000-000000000000" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
    } finally {
      await close();
    }
  });
});

describe("echo task end-to-end", () => {
  it("transitions pending -> running -> done within delay", async () => {
    const { client, taskStore, close } = await bootTaskClient();
    try {
      const createResult = await client.callTool({
        name: "create_task",
        arguments: { kind: "echo", args: { delay_ms: 50 } },
      });

      const sc = (createResult as { structuredContent?: Record<string, unknown> }).structuredContent;
      const taskId = sc?.task_id as string;
      expect(taskId).toBeTruthy();

      // Wait for the background echo to complete.
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const task = taskStore.get(taskId);
      expect(task?.status).toBe("done");
      expect((task?.result as { delay_ms?: number })?.delay_ms).toBe(50);
    } finally {
      await close();
    }
  });
});
