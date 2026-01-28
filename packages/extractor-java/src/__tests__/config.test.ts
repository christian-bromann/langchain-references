/**
 * Config tests
 */

import { describe, it, expect } from "vitest";
import {
  createConfig,
  validateConfig,
  defaultConfig,
  type JavaExtractorConfig,
} from "../config.js";

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

    expect(config.excludePrivate).toBe(true);
    expect(config.excludePackagePrivate).toBe(true);
    expect(config.includePatterns).toEqual(["**/*.java", "**/*.kt"]);
    expect(config.excludePatterns).toContain("**/test/**");
    expect(config.excludePatterns).toContain("**/*Test.java");
    expect(config.excludePatterns).toContain("**/*Test.kt");
  });

  it("should override defaults with provided values", () => {
    const config = createConfig({
      packageName: "langsmith",
      packagePath: "/path/to/src",
      repo: "langchain-ai/langsmith-java",
      sha: "abc123",
      excludePrivate: false,
      excludePackagePrivate: false,
      includePatterns: ["src/**/*.java"],
      excludePatterns: [],
    });

    expect(config.repo).toBe("langchain-ai/langsmith-java");
    expect(config.sha).toBe("abc123");
    expect(config.excludePrivate).toBe(false);
    expect(config.excludePackagePrivate).toBe(false);
    expect(config.includePatterns).toEqual(["src/**/*.java"]);
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
      excludePrivate: true,
      excludePackagePrivate: true,
      includePatterns: [],
      excludePatterns: [],
      repo: "",
      sha: "",
    } as JavaExtractorConfig;

    expect(() => validateConfig(config)).toThrow("packageName is required");
  });

  it("should throw if packagePath is missing", () => {
    const config = {
      packageName: "langsmith",
      packagePath: "",
      excludePrivate: true,
      excludePackagePrivate: true,
      includePatterns: [],
      excludePatterns: [],
      repo: "",
      sha: "",
    } as JavaExtractorConfig;

    expect(() => validateConfig(config)).toThrow("packagePath is required");
  });
});

describe("defaultConfig", () => {
  it("should have sensible defaults", () => {
    expect(defaultConfig.excludePrivate).toBe(true);
    expect(defaultConfig.excludePackagePrivate).toBe(true);
    expect(defaultConfig.includePatterns).toContain("**/*.java");
    expect(defaultConfig.includePatterns).toContain("**/*.kt");
    expect(defaultConfig.excludePatterns).toContain("**/test/**");
  });
});
