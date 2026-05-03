/**
 * In-process task store for long-running MCP tool operations.
 *
 * Tasks are ephemeral: they live only as long as the server process. On Cloud
 * Run, a scale-to-zero event will discard in-flight tasks. For persistent
 * tasks in production, replace this with a Cloud Firestore / Cloud Tasks
 * backed store behind the same `TaskStore` interface.
 */

import { randomUUID } from "node:crypto";

export type TaskStatus = "pending" | "running" | "done" | "error";

export interface Task {
  id: string;
  kind: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
}

export interface TaskStore {
  create(kind: string): Task;
  get(id: string): Task | undefined;
  update(id: string, patch: Partial<Pick<Task, "status" | "result" | "error">>): Task | undefined;
  list(): Task[];
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();

  create(kind: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      kind,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return { ...task };
  }

  get(id: string): Task | undefined {
    const t = this.tasks.get(id);
    return t ? { ...t } : undefined;
  }

  update(
    id: string,
    patch: Partial<Pick<Task, "status" | "result" | "error">>,
  ): Task | undefined {
    const t = this.tasks.get(id);
    if (!t) return undefined;
    const updated: Task = { ...t, ...patch, updatedAt: new Date().toISOString() };
    this.tasks.set(id, updated);
    return { ...updated };
  }

  list(): Task[] {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }));
  }
}
