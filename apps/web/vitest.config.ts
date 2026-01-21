import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest configuration for @langchain/reference-web
 *
 * Supports two modes:
 * - Default: Run regular unit tests
 * - Performance: Run performance benchmarks with `vitest --mode perf`
 *
 * Usage:
 *   pnpm test           # Run regular tests
 *   pnpm test:perf      # Run performance tests (vitest run --mode perf)
 */
export default defineConfig(({ mode }) => {
  const isPerf = mode === "perf";

  return {
    test: {
      globals: true,
      environment: "node",
      include: isPerf
        ? ["lib/__tests__/performance/**/*.perf.test.ts"]
        : ["lib/**/*.test.ts"],
      testTimeout: isPerf ? 30000 : 10000,
      // Performance tests use forks for isolated timing
      pool: isPerf ? "forks" : "threads",
      reporters: isPerf ? ["verbose"] : ["default"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname),
      },
    },
  };
});
