/**
 * Config tests for TypeScript extractor
 */

import { describe, it, expect } from "vitest";
import { createConfig, validateConfig, defaultConfig, type ExtractionConfig } from "../config.js";

describe("createConfig", () => {
  it("should create a config with required fields", () => {
    const config = createConfig({
      packageName: "@langchain/core",
      packagePath: "/path/to/package",
    });

    expect(config.packageName).toBe("@langchain/core");
    expect(config.packagePath).toBe("/path/to/package");
    expect(config.repo).toBe("");
    expect(config.sha).toBe("");
  });

  it("should apply default values", () => {
    const config = createConfig({
      packageName: "@langchain/core",
      packagePath: "/path/to/package",
    });

    expect(config.excludePrivate).toBe(true);
    expect(config.excludeInternal).toBe(true);
    expect(config.excludeExternals).toBe(false);
    expect(config.entryPoints).toEqual(["src/index.ts"]);
  });

  it("should override defaults with provided values", () => {
    const config = createConfig({
      packageName: "@langchain/openai",
      packagePath: "/path/to/openai",
      repo: "langchain-ai/langchainjs",
      sha: "abc123",
      excludePrivate: false,
      excludeInternal: false,
      excludeExternals: true,
      entryPoints: ["src/main.ts", "src/types.ts"],
    });

    expect(config.repo).toBe("langchain-ai/langchainjs");
    expect(config.sha).toBe("abc123");
    expect(config.excludePrivate).toBe(false);
    expect(config.excludeInternal).toBe(false);
    expect(config.excludeExternals).toBe(true);
    expect(config.entryPoints).toEqual(["src/main.ts", "src/types.ts"]);
  });

  it("should include custom tsconfig when provided", () => {
    const config = createConfig({
      packageName: "@langchain/core",
      packagePath: "/path/to/package",
      tsconfig: "tsconfig.build.json",
    });

    expect(config.tsconfig).toBe("tsconfig.build.json");
  });
});

describe("validateConfig", () => {
  it("should not throw for valid config", () => {
    const config = createConfig({
      packageName: "@langchain/core",
      packagePath: "/path/to/package",
    });

    expect(() => validateConfig(config)).not.toThrow();
  });

  it("should throw if packageName is missing", () => {
    const config = {
      packageName: "",
      packagePath: "/path/to/package",
      excludePrivate: true,
      excludeInternal: true,
      excludeExternals: false,
      entryPoints: ["src/index.ts"],
      repo: "",
      sha: "",
    } as ExtractionConfig;

    expect(() => validateConfig(config)).toThrow("packageName is required");
  });

  it("should throw if packagePath is missing", () => {
    const config = {
      packageName: "@langchain/core",
      packagePath: "",
      excludePrivate: true,
      excludeInternal: true,
      excludeExternals: false,
      entryPoints: ["src/index.ts"],
      repo: "",
      sha: "",
    } as ExtractionConfig;

    expect(() => validateConfig(config)).toThrow("packagePath is required");
  });

  it("should throw if entryPoints is empty", () => {
    const config = {
      packageName: "@langchain/core",
      packagePath: "/path/to/package",
      excludePrivate: true,
      excludeInternal: true,
      excludeExternals: false,
      entryPoints: [],
      repo: "",
      sha: "",
    } as ExtractionConfig;

    expect(() => validateConfig(config)).toThrow("At least one entry point is required");
  });
});

describe("defaultConfig", () => {
  it("should have sensible defaults", () => {
    expect(defaultConfig.excludePrivate).toBe(true);
    expect(defaultConfig.excludeInternal).toBe(true);
    expect(defaultConfig.excludeExternals).toBe(false);
    expect(defaultConfig.entryPoints).toEqual(["src/index.ts"]);
  });
});
