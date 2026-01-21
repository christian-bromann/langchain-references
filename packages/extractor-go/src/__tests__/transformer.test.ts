/**
 * GoTransformer tests
 */

import path from "node:path";
import url from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import { GoExtractor, type ExtractionResult } from "../extractor.js";
import { GoTransformer } from "../transformer.js";
import { createConfig, type GoExtractorConfig } from "../config.js";
import type { SymbolRecord, MemberReference } from "@langchain/ir-schema";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.join(__dirname, "fixtures");

describe("GoTransformer", () => {
  let extractionResult: ExtractionResult;
  let symbols: SymbolRecord[];
  let config: GoExtractorConfig;

  beforeAll(async () => {
    config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def456",
      exportedOnly: true,
    });

    const extractor = new GoExtractor(config);
    extractionResult = await extractor.extract();

    const transformer = new GoTransformer(extractionResult, config);
    symbols = transformer.transform();
  });

  describe("basic transformation", () => {
    it("should transform types, functions, and constants", () => {
      expect(symbols.length).toBeGreaterThan(0);
    });

    it("should set language to go", () => {
      for (const symbol of symbols) {
        expect(symbol.language).toBe("go");
      }
    });

    it("should generate IDs with package prefix", () => {
      for (const symbol of symbols) {
        expect(symbol.id).toMatch(/^pkg_go_/);
      }
    });

    it("should generate unique IDs", () => {
      const ids = symbols.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("struct transformation", () => {
    let clientSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      clientSymbol = symbols.find((s) => s.name === "Client");
    });

    it("should transform Client struct", () => {
      expect(clientSymbol).toBeDefined();
    });

    it("should set kind to class for structs", () => {
      expect(clientSymbol!.kind).toBe("class");
    });

    it("should set qualified name without module path", () => {
      // Go qualified names now use just the symbol name (module is implicit)
      expect(clientSymbol!.qualifiedName).toBe("Client");
    });

    it("should extract summary from doc", () => {
      expect(clientSymbol!.docs.summary).toBeDefined();
      expect(clientSymbol!.docs.summary).toContain("Client represents");
    });

    it("should convert doc to markdown description", () => {
      expect(clientSymbol!.docs.description).toBeDefined();
    });

    it("should include signature", () => {
      expect(clientSymbol!.signature).toBe("type Client struct");
    });

    it("should include source location", () => {
      expect(clientSymbol!.source).toBeDefined();
      expect(clientSymbol!.source!.path).toContain("types.go");
      expect(clientSymbol!.source!.line).toBeGreaterThan(0);
    });

    it("should include repo and sha for source", () => {
      expect(clientSymbol!.source!.repo).toBe("langchain-ai/test-repo");
      expect(clientSymbol!.source!.sha).toBe("abc123def456");
    });
  });

  describe("member transformation", () => {
    let clientSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      clientSymbol = symbols.find((s) => s.name === "Client");
    });

    it("should include members", () => {
      expect(clientSymbol!.members).toBeDefined();
      expect(clientSymbol!.members!.length).toBeGreaterThan(0);
    });

    it("should include methods as members", () => {
      const methods = clientSymbol!.members!.filter((m) => m.kind === "method");
      expect(methods.length).toBeGreaterThan(0);
    });

    it("should include fields as properties", () => {
      const properties = clientSymbol!.members!.filter((m) => m.kind === "property");
      expect(properties.length).toBeGreaterThan(0);
    });

    it("should set member IDs correctly", () => {
      for (const member of clientSymbol!.members!) {
        expect(member.refId).toContain("Client.");
      }
    });
  });

  describe("method member transformation", () => {
    let getMember: MemberReference | undefined;

    beforeAll(() => {
      const clientSymbol = symbols.find((s) => s.name === "Client");
      getMember = clientSymbol?.members?.find((m) => m.name === "Get");
    });

    it("should find Get method", () => {
      expect(getMember).toBeDefined();
    });

    it("should set method kind", () => {
      expect(getMember!.kind).toBe("method");
    });

    it("should have refId for the method symbol", () => {
      expect(getMember!.refId).toContain("Client_Get");
    });

    it("should set visibility", () => {
      expect(getMember!.visibility).toBe("public");
    });
  });

  describe("field member transformation", () => {
    let baseURLField: MemberReference | undefined;

    beforeAll(() => {
      const clientSymbol = symbols.find((s) => s.name === "Client");
      baseURLField = clientSymbol?.members?.find((m) => m.name === "BaseURL");
    });

    it("should find BaseURL field", () => {
      expect(baseURLField).toBeDefined();
    });

    it("should set kind to property", () => {
      expect(baseURLField!.kind).toBe("property");
    });

    it("should have refId for the field", () => {
      expect(baseURLField!.refId).toContain("Client_BaseURL");
    });

    it("should include field type", () => {
      expect(baseURLField!.type).toBe("string");
    });
  });

  describe("field with tag transformation", () => {
    let apiKeyField: MemberReference | undefined;

    beforeAll(() => {
      const clientSymbol = symbols.find((s) => s.name === "Client");
      apiKeyField = clientSymbol?.members?.find((m) => m.name === "APIKey");
    });

    it("should have type information", () => {
      expect(apiKeyField!.type).toBe("string");
    });
  });

  describe("interface transformation", () => {
    let handlerSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      handlerSymbol = symbols.find((s) => s.name === "Handler");
    });

    it("should transform interface", () => {
      expect(handlerSymbol).toBeDefined();
    });

    it("should set kind to interface", () => {
      expect(handlerSymbol!.kind).toBe("interface");
    });

    it("should include interface signature", () => {
      expect(handlerSymbol!.signature).toBe("type Handler interface");
    });
  });

  describe("type alias transformation", () => {
    let middlewareSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      middlewareSymbol = symbols.find((s) => s.name === "Middleware");
    });

    it("should transform type alias", () => {
      expect(middlewareSymbol).toBeDefined();
    });

    it("should set kind to typeAlias", () => {
      expect(middlewareSymbol!.kind).toBe("typeAlias");
    });

    it("should include alias in signature", () => {
      expect(middlewareSymbol!.signature).toContain("=");
    });
  });

  describe("function transformation", () => {
    let connectSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      connectSymbol = symbols.find((s) => s.name === "Connect");
    });

    it("should transform top-level function", () => {
      expect(connectSymbol).toBeDefined();
    });

    it("should set kind to function", () => {
      expect(connectSymbol!.kind).toBe("function");
    });

    it("should include function signature", () => {
      expect(connectSymbol!.signature).toContain("func Connect");
    });

    it("should extract summary from doc", () => {
      expect(connectSymbol!.docs.summary).toBeDefined();
      expect(connectSymbol!.docs.summary).toContain("establishes a connection");
    });

    it("should include parameters", () => {
      expect(connectSymbol!.params).toBeDefined();
      expect(connectSymbol!.params!.length).toBe(2);
    });

    it("should include return type", () => {
      expect(connectSymbol!.returns).toBeDefined();
    });
  });

  describe("constant transformation", () => {
    let timeoutSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      timeoutSymbol = symbols.find((s) => s.name === "DefaultTimeout");
    });

    it("should transform constant", () => {
      expect(timeoutSymbol).toBeDefined();
    });

    it("should set kind to variable", () => {
      expect(timeoutSymbol!.kind).toBe("variable");
    });

    it("should include signature with kind", () => {
      expect(timeoutSymbol!.signature).toContain("const");
      expect(timeoutSymbol!.signature).toContain("DefaultTimeout");
    });
  });

  describe("variable transformation", () => {
    let errSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      errSymbol = symbols.find((s) => s.name === "ErrNotFound");
    });

    it("should transform variable", () => {
      expect(errSymbol).toBeDefined();
    });

    it("should set kind to variable", () => {
      expect(errSymbol!.kind).toBe("variable");
    });

    it("should include var in signature", () => {
      expect(errSymbol!.signature).toContain("var");
    });
  });

  describe("Go doc to Markdown conversion", () => {
    it("should have description defined for types with doc", () => {
      const clientSymbol = symbols.find((s) => s.name === "Client");
      expect(clientSymbol!.docs.description).toBeDefined();
    });

    it("should convert DEPRECATED to markdown", () => {
      const parseConfig = symbols.find((s) => s.name === "ParseConfig");
      if (parseConfig?.docs?.description) {
        expect(parseConfig.docs.description).toContain("**Deprecated:**");
      }
    });
  });
});

describe("GoTransformer without repo/sha", () => {
  it("should handle missing repo/sha gracefully", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      // No repo or sha
    });

    const extractor = new GoExtractor(config);
    const result = await extractor.extract();

    const transformer = new GoTransformer(result, config);
    const symbols = transformer.transform();

    // Should still produce symbols
    expect(symbols.length).toBeGreaterThan(0);

    // Source should still have repo/sha (even if empty)
    const client = symbols.find((s) => s.name === "Client");
    expect(client!.source).toBeDefined();
    expect(client!.source!.repo).toBe("");
    expect(client!.source!.sha).toBe("");
  });
});

describe("GoTransformer kind mapping", () => {
  let symbols: SymbolRecord[];

  beforeAll(async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def456",
      exportedOnly: true,
    });

    const extractor = new GoExtractor(config);
    const result = await extractor.extract();

    const transformer = new GoTransformer(result, config);
    symbols = transformer.transform();
  });

  it("should map struct to class", () => {
    const structSymbol = symbols.find((s) => s.name === "Client");
    expect(structSymbol!.kind).toBe("class");
  });

  it("should map interface to interface", () => {
    const interfaceSymbol = symbols.find((s) => s.name === "Handler");
    expect(interfaceSymbol!.kind).toBe("interface");
  });

  it("should map alias to typeAlias", () => {
    const aliasSymbol = symbols.find((s) => s.name === "Middleware");
    expect(aliasSymbol!.kind).toBe("typeAlias");
  });

  it("should map function to function", () => {
    const funcSymbol = symbols.find((s) => s.name === "Connect");
    expect(funcSymbol!.kind).toBe("function");
  });

  it("should map const/var to variable", () => {
    const constSymbol = symbols.find((s) => s.name === "DefaultTimeout");
    expect(constSymbol!.kind).toBe("variable");
  });
});

describe("GoTransformer - method symbol emission", () => {
  let extractionResult: ExtractionResult;
  let symbols: SymbolRecord[];
  let config: GoExtractorConfig;

  beforeAll(async () => {
    config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def456",
      exportedOnly: true,
    });

    const extractor = new GoExtractor(config);
    extractionResult = await extractor.extract();

    const transformer = new GoTransformer(extractionResult, config);
    symbols = transformer.transform();
  });

  it("should emit methods as separate top-level symbols", () => {
    const methodSymbols = symbols.filter((s) => s.kind === "method");
    expect(methodSymbols.length).toBeGreaterThan(0);
  });

  it("should emit method symbol with qualified name including parent type", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.qualifiedName).toBe("Client.Get");
  });

  it("should include method signature", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.signature).toContain("func");
    expect(methodSymbol!.signature).toContain("Get");
  });

  it("should capture the method docstring in docs.summary", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.docs.summary).toBeDefined();
    expect(methodSymbol!.docs.summary).toContain("performs an HTTP GET request");
  });

  it("should include method parameters", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.params).toBeDefined();
    expect(methodSymbol!.params!.length).toBeGreaterThan(0);
  });

  it("should include return type for methods", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.returns).toBeDefined();
  });

  it("should include source location for methods", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.source).toBeDefined();
    expect(methodSymbol!.source!.path).toContain("types.go");
  });

  it("should set visibility based on method name case", () => {
    const methodSymbol = symbols.find((s) => s.kind === "method" && s.name === "Get");
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.tags.visibility).toBe("public");
  });

  it("should count types plus their methods", () => {
    // Count expected symbols: types + methods for each type + functions + constants
    let expectedMethodCount = 0;
    for (const type of extractionResult.types) {
      expectedMethodCount += type.methods.length;
    }

    const methodSymbols = symbols.filter((s) => s.kind === "method");
    // Method symbols appear twice: once as members and once as top-level symbols
    // But only top-level symbols with kind "method" are counted here
    expect(methodSymbols.length).toBe(expectedMethodCount);
  });
});
