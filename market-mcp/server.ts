#!/usr/bin/env node
/**
 * AgriOps Market & Stats MCP Server entry point.
 *
 *   node dist/server.js --stdio   # stdio transport (default; for Claude Desktop, Cursor, VS Code)
 *   node dist/server.js --http    # Streamable HTTP transport on $PORT (default 3001)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { EstatApiAdapter } from "./src/adapters/estat.js";
import { createLogger } from "./src/lib/logger.js";
import { registerGetEstatStats } from "./src/tools/get-estat-stats.js";
import { registerGetLaborShortageStats } from "./src/tools/get-labor-shortage-stats.js";
import { registerGetLivestockRegionalStats } from "./src/tools/get-livestock-regional-stats.js";
import { registerGetMarketPrice } from "./src/tools/get-market-price.js";
import { registerGetMunicipalityStats } from "./src/tools/get-municipality-stats.js";
import { registerGetPrefectureCropProfile } from "./src/tools/get-prefecture-crop-profile.js";
import { registerGetSswCropCompatibility } from "./src/tools/get-ssw-crop-compatibility.js";
import { registerSelectDispatchSalesTargets } from "./src/tools/select-dispatch-sales-targets.js";

type Level = "debug" | "info" | "warn" | "error";
const logLevel = (process.env["LOG_LEVEL"] ?? "info") as Level;
const logger = createLogger({ level: logLevel, base: { service: "agriops-market-mcp" } });

function parseTransport(argv: string[]): "stdio" | "http" {
  if (argv.includes("--http")) return "http";
  if (argv.includes("--stdio")) return "stdio";
  return "stdio";
}

function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: "AgriOps Market & Stats MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Initialize e-Stat adapter if API key is provided
  const estatAppId = process.env["ESTAT_APP_ID"];
  let estatAdapter = null;
  if (estatAppId) {
    logger.info("Initializing e-Stat API Adapter");
    estatAdapter = new EstatApiAdapter({ appId: estatAppId });
  } else {
    logger.warn("ESTAT_APP_ID env var not found. e-Stat statistics tool will be skipped.");
  }

  const deps = {
    estat: estatAdapter,
  };

  // Register market & stats tools
  registerGetMarketPrice(server, deps);
  registerGetPrefectureCropProfile(server, deps);
  registerGetMunicipalityStats(server, deps);
  registerGetLaborShortageStats(server, deps);
  registerGetLivestockRegionalStats(server, deps);
  registerGetSswCropCompatibility(server, deps);
  registerSelectDispatchSalesTargets(server, deps);

  if (deps.estat) {
    registerGetEstatStats(server, deps);
  }

  return server;
}

async function startStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("AgriOps Market & Stats MCP Server connected via stdio");
}

async function startHttp(server: McpServer): Promise<{ stop: () => Promise<void> }> {
  const port = Number(process.env["PORT"]) || 3001;
  const app = express();

  // Parse JSON request bodies (required for MCP POST /mcp)
  app.use(express.json());

  // CORS for cross-origin MCP clients & browser access
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Root endpoint — setup guide HTML (for browser access)
  app.get("/", (_req, res) => {
    // Lazy-import to avoid top-level await
    import("./src/ui/setup-guide-html.js")
      .then(({ SETUP_GUIDE_HTML }) => {
        res.type("html").send(SETUP_GUIDE_HTML);
      })
      .catch(() => {
        res.status(500).send("Failed to load setup guide");
      });
  });

  // JSON API endpoint — server info
  app.get("/api/info", (_req, res) => {
    res.json({
      name: "AgriOps Market & Stats MCP Server",
      version: "1.0.0",
      status: "running",
      transport: "Streamable HTTP",
      mcpEndpoint: "/mcp",
      tools: [
        "get_market_price",
        "get_prefecture_crop_profile",
        "get_municipality_stats",
        "get_estat_stats",
        "get_labor_shortage_stats",
        "get_livestock_regional_stats",
        "get_ssw_crop_compatibility",
        "select_dispatch_sales_targets",
      ],
      description:
        "農産物市場価格・地域作物プロフィール・市町村統計・労働力データを提供し、" +
        "派遣営業先の最優先ターゲットを AI で自動選抜する MCP サーバーです。",
      healthCheck: { livez: "/livez", readyz: "/readyz" },
    });
  });

  // Health check endpoints for Cloud Run
  app.get("/livez", (_req, res) => res.status(200).send("ok"));
  app.get("/readyz", (_req, res) => res.status(200).send("ok"));

  // MCP Streamable HTTP endpoint
  app.post("/mcp", async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined as unknown as () => string,
      });
      res.on("close", () => {
        void transport.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body as Record<string, unknown>);
    } catch (err) {
      logger.error("MCP request error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(port, () => {
      logger.info(`AgriOps Market & Stats MCP Server listening on port ${port}`);
      resolve({
        stop: () => new Promise<void>((r) => httpServer.close(() => r())),
      });
    });
  });
}

async function main(): Promise<void> {
  const transportKind = parseTransport(process.argv.slice(2));
  logger.info("starting", { transport: transportKind });

  const server = buildServer();

  let stopHttp: (() => Promise<void>) | undefined;

  switch (transportKind) {
    case "stdio":
      await startStdio(server);
      break;
    case "http": {
      const handle = await startHttp(server);
      stopHttp = handle.stop;
      break;
    }
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      logger.warn("second shutdown signal; forcing exit", { signal });
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutdown", { signal });
    try {
      if (stopHttp) await stopHttp();
      await server.close();
    } catch (err) {
      logger.warn("shutdown error", { error: (err as Error).message });
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  const e = err as Error;
  process.stderr.write(`fatal: ${e.message}\n`);
  if (e.stack) process.stderr.write(`${e.stack}\n`);
  process.exit(1);
});
