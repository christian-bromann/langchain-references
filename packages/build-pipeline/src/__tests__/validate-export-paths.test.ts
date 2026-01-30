import { describe, it, expect } from "vitest";
import { validateExportPaths } from "../commands/build-ir.js";

describe("validateExportPaths", () => {
  it("returns empty array when no export paths provided", () => {
    const routingMap = {
      slugs: {
        SomeClass: { kind: "class" },
      },
    };

    const result = validateExportPaths([], routingMap);
    expect(result).toEqual([]);
  });

  it("returns empty array when routing map has no slugs", () => {
    const exportPaths = [{ slug: "jest/reporter", title: "Reporter" }];
    const routingMap = { slugs: {} };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([]);
  });

  it("keeps export path when exact slug match exists", () => {
    const exportPaths = [{ slug: "client", title: "Client" }];
    const routingMap = {
      slugs: {
        client: { kind: "module" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([{ slug: "client", title: "Client" }]);
  });

  it("keeps export path when dot-separated variation matches", () => {
    const exportPaths = [{ slug: "jest/reporter", title: "Reporter" }];
    const routingMap = {
      slugs: {
        "jest.reporter": { kind: "module" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([{ slug: "jest/reporter", title: "Reporter" }]);
  });

  it("keeps export path when last segment matches", () => {
    const exportPaths = [{ slug: "wrappers/anthropic", title: "Anthropic" }];
    const routingMap = {
      slugs: {
        anthropic: { kind: "function" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([{ slug: "wrappers/anthropic", title: "Anthropic" }]);
  });

  it("filters out export paths with no matching symbols", () => {
    const exportPaths = [
      { slug: "valid/path", title: "Valid" },
      { slug: "invalid/path", title: "Invalid" },
    ];
    const routingMap = {
      slugs: {
        "valid.path": { kind: "module" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([{ slug: "valid/path", title: "Valid" }]);
  });

  it("matches any symbol kind, not just modules", () => {
    const exportPaths = [
      { slug: "client", title: "Client" },
      { slug: "utils/helper", title: "Helper" },
      { slug: "types/config", title: "Config" },
    ];
    const routingMap = {
      slugs: {
        client: { kind: "class" },
        helper: { kind: "function" },
        "types.config": { kind: "interface" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toHaveLength(3);
  });

  it("handles deeply nested paths", () => {
    const exportPaths = [{ slug: "experimental/otel/setup", title: "Setup" }];
    const routingMap = {
      slugs: {
        setup: { kind: "function" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([{ slug: "experimental/otel/setup", title: "Setup" }]);
  });

  it("does not try last segment for single-segment paths", () => {
    const exportPaths = [{ slug: "client", title: "Client" }];
    const routingMap = {
      slugs: {
        "something-else": { kind: "class" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([]);
  });

  it("handles real-world LangSmith scenario", () => {
    // These are the broken links from the original issue
    const exportPaths = [
      { slug: "jest/reporter", title: "Reporter" },
      { slug: "vitest/reporter", title: "Reporter" },
      { slug: "wrappers/anthropic", title: "Anthropic" },
      { slug: "wrappers/openai", title: "OpenAI" },
      { slug: "wrappers/gemini", title: "Gemini" },
      { slug: "singletons/traceable", title: "Traceable" },
      { slug: "experimental/otel/setup", title: "Setup" },
      { slug: "experimental/otel/exporter", title: "Exporter" },
      { slug: "experimental/otel/processor", title: "Processor" },
      { slug: "client", title: "Client" }, // This one should be valid
    ];

    // Simulate a routing map that only has certain symbols
    const routingMap = {
      slugs: {
        Client: { kind: "class" },
        client: { kind: "module" },
        RunTree: { kind: "class" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);

    // Only "client" should match
    expect(result).toEqual([{ slug: "client", title: "Client" }]);
  });

  it("preserves order of valid export paths", () => {
    const exportPaths = [
      { slug: "z-module", title: "Z Module" },
      { slug: "a-module", title: "A Module" },
      { slug: "m-module", title: "M Module" },
    ];
    const routingMap = {
      slugs: {
        "z-module": { kind: "module" },
        "a-module": { kind: "module" },
        "m-module": { kind: "module" },
      },
    };

    const result = validateExportPaths(exportPaths, routingMap);
    expect(result).toEqual([
      { slug: "z-module", title: "Z Module" },
      { slug: "a-module", title: "A Module" },
      { slug: "m-module", title: "M Module" },
    ]);
  });
});
