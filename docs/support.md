# Support — AgriOps MCP

_Last updated: 2026-07-22 (v1.15.3)_

> **Public HTTPS copy**: this same content is published in 日本語 → English → Bahasa Indonesia at
> <https://win-kagoshima.github.io/agriops-mcp/support/> (GitHub Pages, see
> [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)). That page is the canonical URL to
> hand to a registry or reviewer; this file is the source-controlled English original it's generated from.

## When you need support

- Usage / tool-behaviour questions → open a [GitHub Issue](https://github.com/WIN-kagoshima/agriops-mcp/issues) with the "question" label.
- Bug reports → open a [GitHub Issue](https://github.com/WIN-kagoshima/agriops-mcp/issues) including reproduction steps, the tool name and input you used, and the expected vs. actual result.
- Documentation → see the [README](../README.md), the [docs/](.) folder, and the [API reference](api-reference.md).

## Reporting a vulnerability (security)

**Please do not open a public GitHub issue.**

Email `info@win-g-c.com` with:

- A description of the issue.
- Steps to reproduce, ideally with a minimal MCP client transcript.
- The version (`package.json` `version`) and transport (`stdio` or `streamable-http`) where you observed it.
- Any suggested mitigation.

We will acknowledge within 3 business days and aim to ship a fix or a documented mitigation within 30 days. Full hardening notes are in [SECURITY.md](../SECURITY.md).

## Supported versions

| Version | Status |
|---|---|
| `1.x` | Supported (see `package.json` for current stable) |
| `0.5.x` | Security patches only |
| `0.4.x` and earlier | End of life |
