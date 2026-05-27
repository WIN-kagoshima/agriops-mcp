# syntax=docker/dockerfile:1.7
#
# Multi-stage build for Cloud Run — AgriOps Market & Stats MCP Server
#
# Final image:
#   - gcr.io/distroless/nodejs22-debian12:nonroot   (Node.js 22 LTS)
#   - runs as non-root user (uid 65532)
#   - read-only filesystem friendly
#
# Runtime ENV:
#   PORT (Cloud Run sets this)
#   LOG_LEVEL (info|warn|error|debug)
#   ESTAT_APP_ID (optional — e-Stat API key)
#
# Build:
#   docker build -t agriops-market-mcp:local .
#   docker run --rm -p 8080:8080 -e PORT=8080 agriops-market-mcp:local

############################
# 1. deps stage — full devDependencies for build
############################
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

############################
# 2. production dependencies — runtime-only node_modules
############################
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

############################
# 3. build stage — TypeScript compilation
############################
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY server.ts ./
COPY src ./src

RUN npx tsc

############################
# 4. final stage — distroless
############################
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    LOG_LEVEL=info

COPY --from=build  --chown=nonroot:nonroot /app/dist          ./dist
COPY --from=prod-deps  --chown=nonroot:nonroot /app/node_modules  ./node_modules
COPY --from=build  --chown=nonroot:nonroot /app/package.json  ./package.json

USER nonroot
EXPOSE 8080

# Cloud Run sets $PORT (default 8080); the entry point reads it.
ENTRYPOINT ["/nodejs/bin/node", "/app/dist/server.js", "--http"]
