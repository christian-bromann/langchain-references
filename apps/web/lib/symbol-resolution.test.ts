import test from "node:test";
import assert from "node:assert/strict";
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

test("normalizeSymbolName: camelCase to normalized form", () => {
  const result = normalizeSymbolName("embedDocuments");
  assert.equal(result.normalized, "embeddocuments");
  assert.ok(result.searchTerms.includes("embed"));
  assert.ok(result.searchTerms.includes("documents"));
});

test("normalizeSymbolName: snake_case to normalized form", () => {
  const result = normalizeSymbolName("embed_documents");
  assert.equal(result.normalized, "embeddocuments");
  assert.ok(result.searchTerms.includes("embed"));
  assert.ok(result.searchTerms.includes("documents"));
});

test("normalizeSymbolName: PascalCase class name", () => {
  const result = normalizeSymbolName("BaseMessage");
  assert.equal(result.normalized, "basemessage");
  assert.ok(result.searchTerms.includes("base"));
  assert.ok(result.searchTerms.includes("message"));
});

test("normalizeSymbolName: preserves original name", () => {
  const result = normalizeSymbolName("createReactAgent");
  assert.equal(result.name, "createReactAgent");
});

// =============================================================================
// calculateMatchScore tests
// =============================================================================

test("calculateMatchScore: exact match returns 1.0", () => {
  const source = normalizeSymbolName("BaseMessage");
  const target = { title: "BaseMessage" };
  assert.equal(calculateMatchScore(source, target), 1.0);
});

test("calculateMatchScore: normalized match (camelCase ↔ snake_case) returns 0.95", () => {
  const source = normalizeSymbolName("embedDocuments");
  const target = { title: "embed_documents" };
  assert.equal(calculateMatchScore(source, target), 0.95);
});

test("calculateMatchScore: snake_case to camelCase returns 0.95", () => {
  const source = normalizeSymbolName("create_agent");
  const target = { title: "createAgent" };
  assert.equal(calculateMatchScore(source, target), 0.95);
});

test("calculateMatchScore: no match returns low score", () => {
  const source = normalizeSymbolName("BaseMessage");
  const target = { title: "VectorStore" };
  const score = calculateMatchScore(source, target);
  assert.ok(score < MATCH_THRESHOLD, `Expected score < ${MATCH_THRESHOLD}, got ${score}`);
});

test("calculateMatchScore: partial match returns intermediate score", () => {
  const source = normalizeSymbolName("Message");
  const target = { title: "BaseMessage" };
  const score = calculateMatchScore(source, target);
  // "message" is contained in "basemessage"
  assert.ok(score >= 0.5 && score < 1.0, `Expected 0.5-1.0, got ${score}`);
});

// =============================================================================
// parseSymbolUrl tests
// =============================================================================

test("parseSymbolUrl: JavaScript symbol URL", () => {
  const result = parseSymbolUrl("/javascript/langchain-core/messages/BaseMessage");
  assert.equal(result.language, "javascript");
  assert.equal(result.packageSlug, "langchain-core");
  assert.equal(result.symbolPath, "messages/BaseMessage");
  assert.equal(result.symbolName, "BaseMessage");
  assert.equal(result.parentPath, "messages");
});

test("parseSymbolUrl: Python symbol URL with nested path", () => {
  const result = parseSymbolUrl("/python/langchain-core/messages/base/BaseMessage");
  assert.equal(result.language, "python");
  assert.equal(result.packageSlug, "langchain-core");
  assert.equal(result.symbolPath, "messages/base/BaseMessage");
  assert.equal(result.symbolName, "BaseMessage");
  assert.equal(result.parentPath, "messages/base");
});

test("parseSymbolUrl: member symbol URL", () => {
  const result = parseSymbolUrl("/python/langchain-core/embeddings/Embeddings/embed_documents");
  assert.equal(result.symbolName, "embed_documents");
  assert.equal(result.symbolPath, "embeddings/Embeddings/embed_documents");
});

test("parseSymbolUrl: package landing page", () => {
  const result = parseSymbolUrl("/javascript/langchain");
  assert.equal(result.language, "javascript");
  assert.equal(result.packageSlug, "langchain");
  assert.equal(result.symbolPath, "");
  assert.equal(result.symbolName, "");
});

// =============================================================================
// Extract utilities tests
// =============================================================================

test("extractSymbolNameFromPath: returns symbol name", () => {
  const result = extractSymbolNameFromPath("/javascript/langchain-core/messages/BaseMessage");
  assert.equal(result, "BaseMessage");
});

test("extractSymbolNameFromPath: returns null for package page", () => {
  const result = extractSymbolNameFromPath("/javascript/langchain");
  assert.equal(result, null);
});

test("extractPackageFromPath: returns package slug", () => {
  const result = extractPackageFromPath("/python/langchain-core/messages/BaseMessage");
  assert.equal(result, "langchain-core");
});

test("extractSymbolPathForMapping: returns full symbol path", () => {
  const result = extractSymbolPathForMapping("/javascript/langchain/index/createAgent");
  assert.equal(result, "langchain/index/createAgent");
});

// =============================================================================
// Explicit mapping tests
// =============================================================================

test("getExplicitMapping: JS to Python message mapping", () => {
  const result = getExplicitMapping("langchain/index/BaseMessage", "javascript", "python");
  assert.equal(result, "langchain-core/messages/base/BaseMessage");
});

test("getExplicitMapping: Python to JS message mapping", () => {
  const result = getExplicitMapping(
    "langchain-core/messages/base/BaseMessage",
    "python",
    "javascript",
  );
  assert.equal(result, "langchain-core/messages/BaseMessage");
});

test("getExplicitMapping: returns null for non-mapped symbol", () => {
  const result = getExplicitMapping("some-package/UnknownSymbol", "javascript", "python");
  assert.equal(result, null);
});

test("getExplicitMapping: same language returns null", () => {
  const result = getExplicitMapping("langchain/index/BaseMessage", "javascript", "javascript");
  assert.equal(result, null);
});

// =============================================================================
// Symbol alias tests
// =============================================================================

test("getSymbolAlias: JS camelCase to Python snake_case", () => {
  const result = getSymbolAlias("embedDocuments", "javascript", "python");
  assert.equal(result, "embed_documents");
});

test("getSymbolAlias: Python snake_case to JS camelCase", () => {
  const result = getSymbolAlias("embed_documents", "python", "javascript");
  assert.equal(result, "embedDocuments");
});

test("getSymbolAlias: returns null for non-aliased symbol", () => {
  const result = getSymbolAlias("BaseMessage", "javascript", "python");
  assert.equal(result, null);
});

// =============================================================================
// Package equivalence tests
// =============================================================================

test("getEquivalentPackage: JS to Python package", () => {
  const result = getEquivalentPackage("langchain-core", "javascript", "python");
  assert.equal(result, "langchain-core");
});

test("getEquivalentPackage: text splitters package mapping", () => {
  const jsToPy = getEquivalentPackage("langchain-textsplitters", "javascript", "python");
  assert.equal(jsToPy, "langchain-text-splitters");

  const pyToJs = getEquivalentPackage("langchain-text-splitters", "python", "javascript");
  assert.equal(pyToJs, "langchain-textsplitters");
});

test("getEquivalentPackage: returns null for unknown package", () => {
  const result = getEquivalentPackage("unknown-package", "javascript", "python");
  assert.equal(result, null);
});

// =============================================================================
// Bidirectional mapping consistency tests
// =============================================================================

test("SYMBOL_MAPPINGS: all jsToPython have pythonToJs inverse", () => {
  const jsToPython = SYMBOL_MAPPINGS.jsToPython;
  const pythonToJs = SYMBOL_MAPPINGS.pythonToJs;

  for (const [jsPath, pyPath] of Object.entries(jsToPython)) {
    // Check that the Python path maps back to SOME JavaScript path
    // (not necessarily the same one, as there may be multiple JS paths mapping to one Python)
    const inverse = pythonToJs[pyPath];
    assert.ok(
      inverse !== undefined,
      `Missing pythonToJs mapping for: ${pyPath} (from JS: ${jsPath})`,
    );
  }
});

test("SYMBOL_ALIASES: all jsToPython have pythonToJs inverse", () => {
  const jsToPython = SYMBOL_ALIASES.jsToPython;
  const pythonToJs = SYMBOL_ALIASES.pythonToJs;

  for (const [jsName, pyName] of Object.entries(jsToPython)) {
    // Skip self-references (like JsonOutputParser -> JsonOutputParser)
    if (jsName === pyName) continue;

    const inverse = pythonToJs[pyName];
    assert.ok(
      inverse !== undefined,
      `Missing pythonToJs alias for: ${pyName} (from JS: ${jsName})`,
    );
  }
});

// =============================================================================
// Edge case tests
// =============================================================================

test("normalizeSymbolName: handles empty string", () => {
  const result = normalizeSymbolName("");
  assert.equal(result.name, "");
  assert.equal(result.normalized, "");
});

test("normalizeSymbolName: handles single character", () => {
  const result = normalizeSymbolName("x");
  assert.equal(result.name, "x");
  assert.equal(result.normalized, "x");
});

test("normalizeSymbolName: handles UPPERCASE constants", () => {
  const result = normalizeSymbolName("END");
  assert.equal(result.normalized, "end");
});

test("parseSymbolUrl: handles language-only path", () => {
  const result = parseSymbolUrl("/python");
  assert.equal(result.language, "python");
  assert.equal(result.packageSlug, "");
  assert.equal(result.symbolPath, "");
});

test("calculateMatchScore: handles empty symbol names gracefully", () => {
  const source = normalizeSymbolName("");
  const target = { title: "" };
  const score = calculateMatchScore(source, target);
  // Both empty should match exactly
  assert.equal(score, 1.0);
});
