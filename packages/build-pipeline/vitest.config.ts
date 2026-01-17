import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Snapshot settings
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },
  },
});
