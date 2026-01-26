import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest configuration for @langchain/reference-web
 *
 * Supports three modes:
 * - Default: Run regular unit tests
 * - Performance: Run performance benchmarks with `vitest --mode perf`
 * - E2E: Run end-to-end tests with `vitest --mode e2e`
 *
 * Usage:
 *   pnpm test           # Run regular tests
 *   pnpm test:perf      # Run performance tests (vitest run --mode perf)
 *   pnpm test:e2e       # Run e2e tests (vitest run --mode e2e)
 */
export default defineConfig(({ mode }) => {
  const isPerf = mode === "perf";
  const isE2E = mode === "e2e";

  const getInclude = () => {
    if (isPerf) return ["lib/__tests__/performance/**/*.perf.test.ts"];
    if (isE2E) return ["lib/__tests__/e2e/**/*.e2e.test.ts"];
    return ["lib/**/*.test.ts"];
  };

  const getTimeout = () => {
    if (isPerf) return 30000;
    if (isE2E) return 120000; // 2 minute timeout for LLM-based tests
    return 10000;
  };

  return {
    test: {
      globals: true,
      environment: "node",
      include: getInclude(),
      testTimeout: getTimeout(),
      pool: isPerf ? "forks" : "threads",
      reporters: isPerf || isE2E ? ["verbose"] : ["default"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname),
      },
    },
  };
});
