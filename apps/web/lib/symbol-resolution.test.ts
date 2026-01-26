import { describe, it, expect } from "vitest";
import {
  normalizeSymbolName,
  calculateMatchScore,
  parseSymbolUrl,
  extractSymbolNameFromPath,
  extractPackageFromPath,
  extractSymbolPathForMapping,
  MATCH_THRESHOLD,
} from "./symbol-resolution";
import {
  getExplicitMapping,
  getSymbolAlias,
  getEquivalentPackage,
  SYMBOL_MAPPINGS,
  SYMBOL_ALIASES,
} from "./symbol-mappings";

// =============================================================================
// normalizeSymbolName tests
// =============================================================================

describe("normalizeSymbolName", () => {
  it("camelCase to normalized form", () => {
    const result = normalizeSymbolName("embedDocuments");
    expect(result.normalized).toBe("embeddocuments");
    expect(result.searchTerms).toContain("embed");
    expect(result.searchTerms).toContain("documents");
  });

  it("snake_case to normalized form", () => {
    const result = normalizeSymbolName("embed_documents");
    expect(result.normalized).toBe("embeddocuments");
    expect(result.searchTerms).toContain("embed");
    expect(result.searchTerms).toContain("documents");
  });

  it("PascalCase class name", () => {
    const result = normalizeSymbolName("BaseMessage");
    expect(result.normalized).toBe("basemessage");
    expect(result.searchTerms).toContain("base");
    expect(result.searchTerms).toContain("message");
  });

  it("preserves original name", () => {
    const result = normalizeSymbolName("createReactAgent");
    expect(result.name).toBe("createReactAgent");
  });

  it("handles empty string", () => {
    const result = normalizeSymbolName("");
    expect(result.name).toBe("");
    expect(result.normalized).toBe("");
  });

  it("handles single character", () => {
    const result = normalizeSymbolName("x");
    expect(result.name).toBe("x");
    expect(result.normalized).toBe("x");
  });

  it("handles UPPERCASE constants", () => {
    const result = normalizeSymbolName("END");
    expect(result.normalized).toBe("end");
  });
});

// =============================================================================
// calculateMatchScore tests
// =============================================================================

describe("calculateMatchScore", () => {
  it("exact match returns 1.0", () => {
    const source = normalizeSymbolName("BaseMessage");
    const target = { title: "BaseMessage" };
    expect(calculateMatchScore(source, target)).toBe(1.0);
  });

  it("normalized match (camelCase ↔ snake_case) returns 0.95", () => {
    const source = normalizeSymbolName("embedDocuments");
    const target = { title: "embed_documents" };
    expect(calculateMatchScore(source, target)).toBe(0.95);
  });

  it("snake_case to camelCase returns 0.95", () => {
    const source = normalizeSymbolName("create_agent");
    const target = { title: "createAgent" };
    expect(calculateMatchScore(source, target)).toBe(0.95);
  });

  it("no match returns low score", () => {
    const source = normalizeSymbolName("BaseMessage");
    const target = { title: "VectorStore" };
    const score = calculateMatchScore(source, target);
    expect(score).toBeLessThan(MATCH_THRESHOLD);
  });

  it("partial match returns intermediate score", () => {
    const source = normalizeSymbolName("Message");
    const target = { title: "BaseMessage" };
    const score = calculateMatchScore(source, target);
    // "message" is contained in "basemessage"
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it("handles empty symbol names gracefully", () => {
    const source = normalizeSymbolName("");
    const target = { title: "" };
    const score = calculateMatchScore(source, target);
    // Both empty should match exactly
    expect(score).toBe(1.0);
  });
});

// =============================================================================
// parseSymbolUrl tests
// =============================================================================

describe("parseSymbolUrl", () => {
  it("JavaScript symbol URL", () => {
    const result = parseSymbolUrl("/javascript/langchain-core/messages/BaseMessage");
    expect(result.language).toBe("javascript");
    expect(result.packageSlug).toBe("langchain-core");
    expect(result.symbolPath).toBe("messages/BaseMessage");
    expect(result.symbolName).toBe("BaseMessage");
    expect(result.parentPath).toBe("messages");
  });

  it("Python symbol URL with nested path", () => {
    const result = parseSymbolUrl("/python/langchain-core/messages/base/BaseMessage");
    expect(result.language).toBe("python");
    expect(result.packageSlug).toBe("langchain-core");
    expect(result.symbolPath).toBe("messages/base/BaseMessage");
    expect(result.symbolName).toBe("BaseMessage");
    expect(result.parentPath).toBe("messages/base");
  });

  it("member symbol URL", () => {
    const result = parseSymbolUrl("/python/langchain-core/embeddings/Embeddings/embed_documents");
    expect(result.symbolName).toBe("embed_documents");
    expect(result.symbolPath).toBe("embeddings/Embeddings/embed_documents");
  });

  it("package landing page", () => {
    const result = parseSymbolUrl("/javascript/langchain");
    expect(result.language).toBe("javascript");
    expect(result.packageSlug).toBe("langchain");
    expect(result.symbolPath).toBe("");
    expect(result.symbolName).toBe("");
  });

  it("handles language-only path", () => {
    const result = parseSymbolUrl("/python");
    expect(result.language).toBe("python");
    expect(result.packageSlug).toBe("");
    expect(result.symbolPath).toBe("");
  });
});

// =============================================================================
// Extract utilities tests
// =============================================================================

describe("extract utilities", () => {
  it("extractSymbolNameFromPath: returns symbol name", () => {
    const result = extractSymbolNameFromPath("/javascript/langchain-core/messages/BaseMessage");
    expect(result).toBe("BaseMessage");
  });

  it("extractSymbolNameFromPath: returns null for package page", () => {
    const result = extractSymbolNameFromPath("/javascript/langchain");
    expect(result).toBeNull();
  });

  it("extractPackageFromPath: returns package slug", () => {
    const result = extractPackageFromPath("/python/langchain-core/messages/BaseMessage");
    expect(result).toBe("langchain-core");
  });

  it("extractSymbolPathForMapping: returns full symbol path", () => {
    const result = extractSymbolPathForMapping("/javascript/langchain/index/createAgent");
    expect(result).toBe("langchain/index/createAgent");
  });
});

// =============================================================================
// Explicit mapping tests
// =============================================================================

describe("getExplicitMapping", () => {
  it("JS to Python message mapping", () => {
    const result = getExplicitMapping("langchain/index/BaseMessage", "javascript", "python");
    expect(result).toBe("langchain-core/messages/base/BaseMessage");
  });

  it("Python to JS message mapping", () => {
    const result = getExplicitMapping(
      "langchain-core/messages/base/BaseMessage",
      "python",
      "javascript",
    );
    expect(result).toBe("langchain-core/messages/BaseMessage");
  });

  it("returns null for non-mapped symbol", () => {
    const result = getExplicitMapping("some-package/UnknownSymbol", "javascript", "python");
    expect(result).toBeNull();
  });

  it("same language returns null", () => {
    const result = getExplicitMapping("langchain/index/BaseMessage", "javascript", "javascript");
    expect(result).toBeNull();
  });
});

// =============================================================================
// Symbol alias tests
// =============================================================================

describe("getSymbolAlias", () => {
  it("JS camelCase to Python snake_case", () => {
    const result = getSymbolAlias("embedDocuments", "javascript", "python");
    expect(result).toBe("embed_documents");
  });

  it("Python snake_case to JS camelCase", () => {
    const result = getSymbolAlias("embed_documents", "python", "javascript");
    expect(result).toBe("embedDocuments");
  });

  it("returns null for non-aliased symbol", () => {
    const result = getSymbolAlias("BaseMessage", "javascript", "python");
    expect(result).toBeNull();
  });
});

// =============================================================================
// Package equivalence tests
// =============================================================================

describe("getEquivalentPackage", () => {
  it("JS to Python package", () => {
    const result = getEquivalentPackage("langchain-core", "javascript", "python");
    expect(result).toBe("langchain-core");
  });

  it("text splitters package mapping", () => {
    const jsToPy = getEquivalentPackage("langchain-textsplitters", "javascript", "python");
    expect(jsToPy).toBe("langchain-text-splitters");

    const pyToJs = getEquivalentPackage("langchain-text-splitters", "python", "javascript");
    expect(pyToJs).toBe("langchain-textsplitters");
  });

  it("returns null for unknown package", () => {
    const result = getEquivalentPackage("unknown-package", "javascript", "python");
    expect(result).toBeNull();
  });
});

// =============================================================================
// Bidirectional mapping consistency tests
// =============================================================================

describe("bidirectional mapping consistency", () => {
  it("SYMBOL_MAPPINGS: all jsToPython have pythonToJs inverse", () => {
    const jsToPython = SYMBOL_MAPPINGS.jsToPython;
    const pythonToJs = SYMBOL_MAPPINGS.pythonToJs;

    for (const [jsPath, pyPath] of Object.entries(jsToPython)) {
      // Check that the Python path maps back to SOME JavaScript path
      // (not necessarily the same one, as there may be multiple JS paths mapping to one Python)
      const inverse = pythonToJs[pyPath];
      expect(inverse).toBeDefined();
    }
  });

  it("SYMBOL_ALIASES: all jsToPython have pythonToJs inverse", () => {
    const jsToPython = SYMBOL_ALIASES.jsToPython;
    const pythonToJs = SYMBOL_ALIASES.pythonToJs;

    for (const [jsName, pyName] of Object.entries(jsToPython)) {
      // Skip self-references (like JsonOutputParser -> JsonOutputParser)
      if (jsName === pyName) continue;

      const inverse = pythonToJs[pyName];
      expect(inverse).toBeDefined();
    }
  });
});
