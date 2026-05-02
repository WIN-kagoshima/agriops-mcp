import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Express middleware that ensures every request has a stable
 * `X-Request-Id`:
 *
 *   - Reuses a caller-supplied `X-Request-Id` if present and well-formed
 *     (8–128 chars, ASCII printable).
 *   - Otherwise generates a UUID v4.
 *   - Echoes it back as `X-Request-Id` so clients can correlate logs
 *     across upstream proxies.
 *   - Stores it on `res.locals.requestId` for downstream handlers and
 *     error responses.
 *
 * Why this matters for MCP: the SDK's `safeErrorMessage` tells clients
 * to "report the request ID if it persists". That sentence is hollow if
 * we don't actually surface a request ID. Now we do.
 */

const REQUEST_ID_RE = /^[\x21-\x7e]{8,128}$/;
const TRUSTED_HEADER_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const TRUSTED_AGENT_VALUE_RE = /^[\x21-\x7e]{1,256}$/;

export interface TrustedAgentIdentityOptions {
  agentIdHeader?: string;
  agentOwnerHeader?: string;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const reused = typeof incoming === "string" && REQUEST_ID_RE.test(incoming) ? incoming : null;
  const id = reused ?? randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function getRequestId(res: Response): string {
  const id = res.locals.requestId;
  if (typeof id === "string" && id.length > 0) return id;
  // Defensive fallback: never let a missing middleware crash a handler.
  const fresh = randomUUID();
  res.locals.requestId = fresh;
  res.setHeader("X-Request-Id", fresh);
  return fresh;
}

export function getTrustedAgentIdentity(
  req: Request,
  options: TrustedAgentIdentityOptions,
): Record<string, string> {
  const out: Record<string, string> = {};
  const agentId = trustedHeaderValue(req, options.agentIdHeader);
  const agentOwner = trustedHeaderValue(req, options.agentOwnerHeader);
  if (agentId) out.agentId = agentId;
  if (agentOwner) out.agentOwner = agentOwner;
  return out;
}

function trustedHeaderValue(req: Request, configuredName: string | undefined): string | undefined {
  const name = configuredName?.trim();
  if (!name || !TRUSTED_HEADER_NAME_RE.test(name)) return undefined;
  const value = req.headers[name.toLowerCase()];
  if (typeof value !== "string" || !TRUSTED_AGENT_VALUE_RE.test(value)) return undefined;
  return value;
}
