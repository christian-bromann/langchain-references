/**
 * Config tests
 */

import { describe, it, expect } from "vitest";
import { createConfig, validateConfig, defaultConfig, type GoExtractorConfig } from "../config.js";

describe("createConfig", () => {
  it("should create a config with required fields", () => {
    const config = createConfig({
      packageName: "langsmith",
      packagePath: "/path/to/src",
    });

    expect(config.packageName).toBe("langsmith");
    expect(config.packagePath).toBe("/path/to/src");
    expect(config.repo).toBe("");
    expect(config.sha).toBe("");
  });

  it("should apply default values", () => {
    const config = createConfig({
      packageName: "langsmith",
      packagePath: "/path/to/src",
    });

    expect(config.exportedOnly).toBe(true);
    expect(config.includePatterns).toEqual(["**/*.go"]);
    expect(config.excludePatterns).toContain("**/*_test.go");
    expect(config.excludePatterns).toContain("**/vendor/**");
  });

  it("should override defaults with provided values", () => {
    const config = createConfig({
      packageName: "langsmith",
      packagePath: "/path/to/src",
      repo: "langchain-ai/langsmith-go",
      sha: "abc123",
      exportedOnly: false,
      includePatterns: ["pkg/**/*.go"],
      excludePatterns: [],
    });

    expect(config.repo).toBe("langchain-ai/langsmith-go");
    expect(config.sha).toBe("abc123");
    expect(config.exportedOnly).toBe(false);
    expect(config.includePatterns).toEqual(["pkg/**/*.go"]);
    expect(config.excludePatterns).toEqual([]);
  });

  it("should include outputPath when provided", () => {
    const config = createConfig({
      packageName: "langsmith",
      packagePath: "/path/to/src",
      outputPath: "/output/symbols.json",
    });

    expect(config.outputPath).toBe("/output/symbols.json");
  });
});

describe("validateConfig", () => {
  it("should not throw for valid config", () => {
    const config = createConfig({
      packageName: "langsmith",
      packagePath: "/path/to/src",
    });

    expect(() => validateConfig(config)).not.toThrow();
  });

  it("should throw if packageName is missing", () => {
    const config = {
      packageName: "",
      packagePath: "/path/to/src",
      exportedOnly: true,
      includePatterns: [],
      excludePatterns: [],
      repo: "",
      sha: "",
    } as GoExtractorConfig;

    expect(() => validateConfig(config)).toThrow("packageName is required");
  });

  it("should throw if packagePath is missing", () => {
    const config = {
      packageName: "langsmith",
      packagePath: "",
      exportedOnly: true,
      includePatterns: [],
      excludePatterns: [],
      repo: "",
      sha: "",
    } as GoExtractorConfig;

    expect(() => validateConfig(config)).toThrow("packagePath is required");
  });
});

describe("defaultConfig", () => {
  it("should have sensible defaults", () => {
    expect(defaultConfig.exportedOnly).toBe(true);
    expect(defaultConfig.includePatterns).toContain("**/*.go");
    expect(defaultConfig.excludePatterns).toContain("**/*_test.go");
    expect(defaultConfig.excludePatterns).toContain("**/vendor/**");
  });
});
