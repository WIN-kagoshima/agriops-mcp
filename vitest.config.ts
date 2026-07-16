import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests/ui/**"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Most existing tests exercise the full tool surface directly (extended
    // agronomy/IoT tools, Tasks Primitive, deprecated Phase 7-11 tools).
    // Default these on for the test run; the *production default* (what an
    // Anthropic Directory reviewer or first connection sees) is `false` for
    // both — see tests/conformance/directory-surface.test.ts, which
    // explicitly unsets these to assert the slim 8-tool default.
    env: {
      AGRIOPS_ENABLE_EXTENDED_TOOLS: "true",
      AGRIOPS_ENABLE_LEGACY_TOOLS: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types/**", "src/ui/**"],
    },
  },
});
