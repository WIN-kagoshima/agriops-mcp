# Contributing to AgriOps MCP

Thank you for your interest in contributing! This guide explains how to set up a
development environment, add tools or prompts, run the test suite, and submit a
pull request.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and install](#2-clone-and-install)
3. [Project structure](#3-project-structure)
4. [Running the server locally](#4-running-the-server-locally)
5. [Running tests](#5-running-tests)
6. [Adding a new tool](#6-adding-a-new-tool)
7. [Adding a new prompt](#7-adding-a-new-prompt)
8. [Code style](#8-code-style)
9. [Commit messages](#9-commit-messages)
10. [Pull request checklist](#10-pull-request-checklist)
11. [Security issues](#11-security-issues)

---

## 1. Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22 LTS (`node --version` → `v22.x.x`) |
| npm | bundled with Node 22 |
| Git | any recent version |

Optional (needed for snapshot-backed tools and Playwright UI tests):

- Docker / Docker Buildx — for building multi-arch images locally.
- A Google Cloud project — only if you are testing Cloud Run deployment.

---

## 2. Clone and install

```bash
git clone https://github.com/WIN-kagoshima/agriops-mcp.git
cd agriops-mcp
npm ci
```

`npm ci` performs a clean install from `package-lock.json`. Never use `npm install`
in CI or when preparing a PR — it can update the lock file unexpectedly.

---

## 3. Project structure

```
src/
  adapters/       Raw data-source adapters (Open-Meteo, JMA, eMAFF, FAMIC)
  auth/           Token store (in-memory + encrypted file backends)
  elicitation/    MCP Form elicitation store
  lib/            Shared utilities (config, logger, cache, errors, geo, …)
  prompts/        MCP Prompts (slash commands for users)
  resources/      MCP Resources (Server Card, task-status, UI bundle)
  server/         Server factory, transport (stdio + HTTP), well-known endpoint
  tasks/          Async task store (InMemoryTaskStore)
  tools/          MCP Tools (one file per tool + _registry.ts)
  types/          Shared Zod schemas (weather, farmland, pesticide)
  ui/             React + MapLibre GL MCP Apps dashboard

tests/
  conformance/    Protocol correctness, Server Card, red-team, schema tests
  scenarios/      Multi-turn eval scenarios (weather-risk, pesticide, staff-plan, adversarial)
  smoke/          HTTP / stdio integration tests
  unit/           Unit tests for adapters, tools, lib helpers

scripts/
  build-snapshots/  SQLite snapshot builders (eMAFF, FAMIC)
  snapshots-audit.ts  Freshness + integrity check
  release-check.ts    Pre-release gate

docs/             Operator and developer documentation
examples/         Ready-to-run client examples (Claude Desktop, Cursor, ADK)
```

---

## 4. Running the server locally

**stdio (MCP Inspector / Claude Desktop):**

```bash
npm run build          # compile TypeScript to dist/
node dist/server/transport-stdio.js
```

**Streamable HTTP (port 8080):**

```bash
MCP_BASE_URL=http://localhost:8080 \
  node dist/server/transport-http.js
```

Point [MCP Inspector](https://github.com/modelcontextprotocol/inspector) at
`http://localhost:8080/mcp` to browse and call tools interactively.

For Cursor or Claude Desktop config snippets, see `examples/`.

---

## 5. Running tests

```bash
npm test                   # full suite (unit + smoke + conformance + scenarios)
npm run test:scenarios     # eval scenarios only
npx vitest run tests/unit  # unit tests only
```

The suite must pass before any PR is merged. CI also runs `lint` and `typecheck`:

```bash
npm run lint       # Biome check (format + lint)
npm run typecheck  # tsc --noEmit
```

---

## 6. Adding a new tool

1. Create `src/tools/<your-tool>.ts`. Export `meta` (`ToolMeta`), `inputSchema`
   (Zod), and `register<YourTool>(server, deps)`.
2. Add it to `src/tools/_registry.ts` with a conditional guard (`if (deps.emaff)` etc.)
3. Add it to `src/server/surface-catalog.ts` under `TOOL_METADATA`.
4. Add at least one unit test in `tests/unit/<your-tool>.test.ts`.
5. Update `src/server/well-known.ts` → `eval.testFiles` and `eval.testCases`.

**Tool contract rules** (enforced by conformance tests):

- Model-visible tools (`visibility: "model"`) must have a description ≥ 60 characters.
- All tools must declare `ToolAnnotations` (use `READ_ONLY` / `DRAFT_NON_IDEMPOTENT` constants from `surface-catalog.ts`).
- Tools that return structured data should declare `outputSchema`.
- No tool may log or return raw stack traces, env var names, or bearer tokens (enforced by `red-team.test.ts`).

---

## 7. Adding a new prompt

1. Create `src/prompts/<your-prompt>.ts`. Export
   `register<YourPrompt>Prompt(server, deps)`.
2. Add it to `src/prompts/_registry.ts` (import + call + return name).
3. Add at least one smoke test scenario in `tests/smoke/prompts.test.ts` or a new
   eval scenario in `tests/scenarios/`.

---

## 8. Code style

- **Formatter**: [Biome](https://biomejs.dev/) (configured in `biome.json`). Run `npm run lint` before committing.
- **Imports**: keep at the top of the file — no inline dynamic `import()` except where explicitly justified (see `rules/no-inline-imports.mdc`).
- **TypeScript**: strict mode, no `any`. Use `unknown` and narrow with Zod or type guards.
- **Comments**: explain *why*, not *what*. Don't narrate the code.
- **Exhaustive switch**: use `satisfies` or `_exhaustive: never` for discriminated unions (see `rules/typescript-exhaustive-switch.mdc`).

---

## 9. Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]
[optional footer]
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`.

Examples:
```
feat(tools): add crop_calendar tool for seasonal planning
fix(ci): lowercase IMAGE_NAME for GHCR registry
chore(deps): upgrade @modelcontextprotocol/sdk to 1.13.0
```

---

## 10. Pull request checklist

Before opening a PR, run:

```bash
npm run lint
npm run typecheck
npm test
npm run release:check
```

All four must exit 0.

In your PR description:

- [ ] Describe what the change does and why.
- [ ] List any new environment variables or configuration keys.
- [ ] Note any breaking changes to tool names, input/output schemas, or resource URIs.
- [ ] Update `CHANGELOG.md` → `[Unreleased]` section.
- [ ] Update `src/server/well-known.ts` → `eval` counts if you added tests.

---

## 11. Security issues

**Do not open a public issue for security vulnerabilities.**

Please follow the process described in [SECURITY.md](SECURITY.md) and contact the
maintainers privately.
