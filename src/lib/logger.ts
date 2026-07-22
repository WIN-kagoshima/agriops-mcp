/**
 * Tiny structured logger that writes JSON Lines to stderr.
 *
 * Why stderr: stdio transport uses stdout for JSON-RPC. Logging to stdout
 * would break the protocol. Streamable HTTP can use stdout too, but stderr
 * stays compatible with both.
 *
 * Never logs secrets or full request bodies.
 */

export type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

/** Forwarding hook used by `withMcpSink` — receives every log call in addition to the stderr write. */
export type LogSink = (level: Level, msg: string, fields?: Record<string, unknown>) => void;

/**
 * Wrap a `Logger` so every call also invokes `sink`, in addition to writing
 * to stderr as usual. Used by `createServer` to forward log lines to the MCP
 * `notifications/message` logging capability (Spec 2025-11-25 §6.9) when a
 * client session is connected, so the declared `logging: {}` server
 * capability is backed by a real implementation instead of an unused stub.
 * `sink` must never throw — callers are expected to swallow their own
 * delivery errors (e.g. "not connected yet").
 */
export function withMcpSink(
  logger: Logger,
  sink: LogSink,
  base: Record<string, unknown> = {},
): Logger {
  return {
    debug: (msg, f) => {
      logger.debug(msg, f);
      sink("debug", msg, { ...base, ...f });
    },
    info: (msg, f) => {
      logger.info(msg, f);
      sink("info", msg, { ...base, ...f });
    },
    warn: (msg, f) => {
      logger.warn(msg, f);
      sink("warn", msg, { ...base, ...f });
    },
    error: (msg, f) => {
      logger.error(msg, f);
      sink("error", msg, { ...base, ...f });
    },
    // Track accumulated `.child()` fields ourselves (mirroring what
    // `createLogger`'s internal `base` does for the stderr line) so a
    // notification sent from a deeply-nested child logger (the shape every
    // adapter/tool actually holds as `deps.logger`) still carries the same
    // fields the stderr JSON line has.
    child: (f) => withMcpSink(logger.child(f), sink, { ...base, ...f }),
  };
}

export function createLogger(opts: { level?: Level; base?: Record<string, unknown> } = {}): Logger {
  const minLevel = LEVELS[opts.level ?? "info"];
  const base = opts.base ?? {};

  function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
    if (LEVELS[level] < minLevel) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...fields,
    });
    process.stderr.write(`${line}\n`);
  }

  return {
    debug: (msg, f) => emit("debug", msg, f),
    info: (msg, f) => emit("info", msg, f),
    warn: (msg, f) => emit("warn", msg, f),
    error: (msg, f) => emit("error", msg, f),
    child: (f) => createLogger({ level: opts.level, base: { ...base, ...f } }),
  };
}
