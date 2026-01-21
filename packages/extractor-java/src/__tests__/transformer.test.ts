/**
 * JavaTransformer tests
 */

import path from "node:path";
import url from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import { JavaExtractor, type ExtractionResult } from "../extractor.js";
import { JavaTransformer, type SymbolRecord, type MemberRecord } from "../transformer.js";
import { createConfig, type JavaExtractorConfig } from "../config.js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.join(__dirname, "fixtures");

describe("JavaTransformer", () => {
  let extractionResult: ExtractionResult;
  let symbols: SymbolRecord[];
  let config: JavaExtractorConfig;

  beforeAll(async () => {
    config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def456",
      excludePrivate: true,
      excludePackagePrivate: false,
    });

    const extractor = new JavaExtractor(config);
    extractionResult = await extractor.extract();

    const transformer = new JavaTransformer(extractionResult, config);
    symbols = transformer.transform();
  });

  describe("basic transformation", () => {
    it("should transform types, methods, and constructors to symbols", () => {
      // Symbols include types + methods + constructors (deduplicated by ID)
      // Total should be greater than just types
      expect(symbols.length).toBeGreaterThan(extractionResult.types.length);

      // Should have method symbols
      const methodSymbols = symbols.filter((s) => s.kind === "method");
      expect(methodSymbols.length).toBeGreaterThan(0);

      // Should have constructor symbols
      const ctorSymbols = symbols.filter((s) => s.kind === "constructor");
      expect(ctorSymbols.length).toBeGreaterThan(0);
    });

    it("should set language to java", () => {
      for (const symbol of symbols) {
        expect(symbol.language).toBe("java");
      }
    });

    it("should generate IDs with package prefix", () => {
      for (const symbol of symbols) {
        expect(symbol.id).toMatch(/^pkg_java_/);
      }
    });

    it("should generate unique IDs for symbols", () => {
      const ids = symbols.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("method symbol emission", () => {
    it("should emit methods as separate top-level symbols", () => {
      const methodSymbols = symbols.filter((s) => s.kind === "method");
      expect(methodSymbols.length).toBeGreaterThan(0);
    });

    it("should emit method symbol with qualified name including parent class", () => {
      // Find a method from SimpleClass specifically
      const methodSymbol = symbols.find(
        (s) => s.kind === "method" && s.qualifiedName?.includes("SimpleClass"),
      );
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol!.qualifiedName).toContain("com.example.SimpleClass.");
    });

    it("should include method signature", () => {
      const methodSymbol = symbols.find((s) => s.kind === "method");
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol!.signature).toBeDefined();
    });

    it("should include method parameters for parameterized methods", () => {
      // Find a method with parameters
      const methodSymbol = symbols.find(
        (s) => s.kind === "method" && s.parameters && s.parameters.length > 0,
      );
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol!.parameters!.length).toBeGreaterThan(0);
    });

    it("should include return type for methods", () => {
      const methodSymbol = symbols.find((s) => s.kind === "method" && s.returns?.type);
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol!.returns).toBeDefined();
    });

    it("should include source location for methods", () => {
      const methodSymbol = symbols.find((s) => s.kind === "method");
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol!.source).toBeDefined();
      expect(methodSymbol!.source!.path).toContain(".java");
    });
  });

  describe("constructor symbol emission", () => {
    it("should emit constructors as separate top-level symbols", () => {
      const ctorSymbols = symbols.filter((s) => s.kind === "constructor");
      expect(ctorSymbols.length).toBeGreaterThan(0);
    });

    it("should emit constructor with qualified name including parent class", () => {
      const ctorSymbol = symbols.find((s) => s.kind === "constructor");
      expect(ctorSymbol).toBeDefined();
      // Constructor qualified name should be ClassName.ClassName
      expect(ctorSymbol!.qualifiedName).toMatch(/\.\w+$/);
    });

    it("should include constructor parameters or empty array", () => {
      const ctorSymbol = symbols.find((s) => s.kind === "constructor");
      expect(ctorSymbol).toBeDefined();
      expect(ctorSymbol!.parameters).toBeDefined();
    });
  });

  describe("class transformation", () => {
    let simpleClassSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
    });

    it("should transform SimpleClass", () => {
      expect(simpleClassSymbol).toBeDefined();
    });

    it("should set kind to class", () => {
      expect(simpleClassSymbol!.kind).toBe("class");
    });

    it("should set qualified name", () => {
      expect(simpleClassSymbol!.qualifiedName).toBe("com.example.SimpleClass");
    });

    it("should extract summary from Javadoc", () => {
      expect(simpleClassSymbol!.summary).toBeDefined();
      expect(simpleClassSymbol!.summary).toContain("simple class");
    });

    it("should convert Javadoc to markdown description", () => {
      expect(simpleClassSymbol!.description).toBeDefined();
    });

    it("should build signature with extends", () => {
      expect(simpleClassSymbol!.signature).toContain("public");
      expect(simpleClassSymbol!.signature).toContain("class");
      expect(simpleClassSymbol!.signature).toContain("SimpleClass");
      expect(simpleClassSymbol!.signature).toContain("extends");
    });

    it("should include source location", () => {
      expect(simpleClassSymbol!.source).toBeDefined();
      expect(simpleClassSymbol!.source!.path).toContain("SimpleClass.java");
      expect(simpleClassSymbol!.source!.line).toBeGreaterThan(0);
    });

    it("should include repo and sha for source", () => {
      expect(simpleClassSymbol!.source!.repo).toBe("langchain-ai/test-repo");
      expect(simpleClassSymbol!.source!.sha).toBe("abc123def456");
    });
  });

  describe("member transformation", () => {
    let simpleClassSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
    });

    it("should include members", () => {
      expect(simpleClassSymbol!.members).toBeDefined();
      expect(simpleClassSymbol!.members!.length).toBeGreaterThan(0);
    });

    it("should include constructors as members", () => {
      const constructors = simpleClassSymbol!.members!.filter((m) => m.kind === "constructor");
      expect(constructors.length).toBeGreaterThanOrEqual(1);
    });

    it("should include methods as members", () => {
      const methods = simpleClassSymbol!.members!.filter((m) => m.kind === "method");
      expect(methods.length).toBeGreaterThan(0);
    });

    it("should include properties (fields) as members", () => {
      const properties = simpleClassSymbol!.members!.filter((m) => m.kind === "property");
      expect(properties.length).toBeGreaterThan(0);
    });

    it("should set member IDs correctly", () => {
      for (const member of simpleClassSymbol!.members!) {
        expect(member.id).toContain("SimpleClass.");
      }
    });
  });

  describe("method member transformation", () => {
    let getCountMethod: MemberRecord | undefined;

    beforeAll(() => {
      const simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
      getCountMethod = simpleClassSymbol?.members?.find((m) => m.name === "getCount");
    });

    it("should find getCount method", () => {
      expect(getCountMethod).toBeDefined();
    });

    it("should set method kind", () => {
      expect(getCountMethod!.kind).toBe("method");
    });

    it("should build method signature", () => {
      expect(getCountMethod!.signature).toContain("int");
      expect(getCountMethod!.signature).toContain("getCount");
    });

    it("should extract method summary", () => {
      expect(getCountMethod!.summary).toBeDefined();
      expect(getCountMethod!.summary).toContain("Gets the count");
    });

    it("should include return type", () => {
      expect(getCountMethod!.returns).toBeDefined();
      expect(getCountMethod!.returns!.type).toBe("int");
    });

    it("should include source location", () => {
      expect(getCountMethod!.source).toBeDefined();
      expect(getCountMethod!.source!.line).toBeGreaterThan(0);
    });
  });

  describe("method with parameters transformation", () => {
    let combineMethod: MemberRecord | undefined;

    beforeAll(() => {
      const simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
      combineMethod = simpleClassSymbol?.members?.find((m) => m.name === "combine");
    });

    it("should extract parameters", () => {
      expect(combineMethod!.parameters).toBeDefined();
      expect(combineMethod!.parameters!.length).toBe(2);
    });

    it("should include parameter names", () => {
      const paramNames = combineMethod!.parameters!.map((p) => p.name);
      expect(paramNames).toContain("first");
      expect(paramNames).toContain("second");
    });

    it("should include parameter types", () => {
      const firstParam = combineMethod!.parameters!.find((p) => p.name === "first");
      expect(firstParam!.type).toBe("String");
    });

    it("should extract parameter descriptions from Javadoc", () => {
      const firstParam = combineMethod!.parameters!.find((p) => p.name === "first");
      expect(firstParam!.description).toBeDefined();
      expect(firstParam!.description).toContain("first parameter");
    });

    it("should include throws in signature", () => {
      expect(combineMethod!.signature).toContain("throws");
      expect(combineMethod!.signature).toContain("IllegalArgumentException");
    });
  });

  describe("constructor transformation", () => {
    let constructor: MemberRecord | undefined;

    beforeAll(() => {
      const simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
      constructor = simpleClassSymbol?.members?.find(
        (m) => m.kind === "constructor" && m.parameters && m.parameters.length === 2,
      );
    });

    it("should transform constructor", () => {
      expect(constructor).toBeDefined();
    });

    it("should use class name as constructor name", () => {
      expect(constructor!.name).toBe("SimpleClass");
    });

    it("should include constructor parameters", () => {
      expect(constructor!.parameters!.length).toBe(2);
    });

    it("should build constructor signature", () => {
      expect(constructor!.signature).toContain("SimpleClass(");
      expect(constructor!.signature).toContain("int count");
      expect(constructor!.signature).toContain("String name");
    });
  });

  describe("field transformation", () => {
    let constantField: MemberRecord | undefined;

    beforeAll(() => {
      const simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
      constantField = simpleClassSymbol?.members?.find((m) => m.name === "CONSTANT");
    });

    it("should transform CONSTANT field", () => {
      expect(constantField).toBeDefined();
    });

    it("should set kind to property", () => {
      expect(constantField!.kind).toBe("property");
    });

    it("should build field signature with all modifiers", () => {
      expect(constantField!.signature).toContain("public");
      expect(constantField!.signature).toContain("static");
      expect(constantField!.signature).toContain("final");
      expect(constantField!.signature).toContain("String");
      expect(constantField!.signature).toContain("CONSTANT");
    });
  });

  describe("interface transformation", () => {
    let interfaceSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      interfaceSymbol = symbols.find((s) => s.name === "MyInterface");
    });

    it("should transform interface", () => {
      expect(interfaceSymbol).toBeDefined();
    });

    it("should set kind to interface", () => {
      expect(interfaceSymbol!.kind).toBe("interface");
    });

    it("should include type parameters", () => {
      expect(interfaceSymbol!.typeParameters).toBeDefined();
      expect(interfaceSymbol!.typeParameters!.length).toBe(1);
      expect(interfaceSymbol!.typeParameters![0].name).toBe("T");
    });
  });

  describe("enum transformation", () => {
    let enumSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      enumSymbol = symbols.find((s) => s.name === "MyEnum");
    });

    it("should transform enum", () => {
      expect(enumSymbol).toBeDefined();
    });

    it("should set kind to enum", () => {
      expect(enumSymbol!.kind).toBe("enum");
    });

    it("should include enum methods", () => {
      const methodMembers = enumSymbol!.members!.filter((m) => m.kind === "method");
      expect(methodMembers.length).toBeGreaterThan(0);
    });
  });

  describe("record transformation", () => {
    let recordSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      recordSymbol = symbols.find((s) => s.name === "MyRecord");
    });

    it("should transform record", () => {
      expect(recordSymbol).toBeDefined();
    });

    it("should set kind to class (records are treated as classes)", () => {
      expect(recordSymbol!.kind).toBe("class");
    });

    it("should build record signature", () => {
      expect(recordSymbol!.signature).toContain("record");
      expect(recordSymbol!.signature).toContain("MyRecord");
    });
  });

  describe("annotation transformation", () => {
    let annotationSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      annotationSymbol = symbols.find((s) => s.name === "MyAnnotation");
    });

    it("should transform annotation", () => {
      expect(annotationSymbol).toBeDefined();
    });

    it("should set kind to typeAlias for annotations", () => {
      expect(annotationSymbol!.kind).toBe("typeAlias");
    });

    it("should build annotation signature with @interface", () => {
      expect(annotationSymbol!.signature).toContain("@interface");
    });
  });

  describe("Javadoc to Markdown conversion", () => {
    it("should have description defined for classes with Javadoc", () => {
      const simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
      expect(simpleClassSymbol!.description).toBeDefined();
    });

    it("should strip @since, @author, @version tags", () => {
      const simpleClassSymbol = symbols.find((s) => s.name === "SimpleClass");
      expect(simpleClassSymbol!.description).not.toContain("@since");
    });
  });

  describe("generic class transformation", () => {
    let genericSymbol: SymbolRecord | undefined;

    beforeAll(() => {
      genericSymbol = symbols.find((s) => s.name === "GenericClass");
    });

    it("should transform generic class", () => {
      expect(genericSymbol).toBeDefined();
    });

    it("should include all type parameters", () => {
      expect(genericSymbol!.typeParameters).toBeDefined();
      expect(genericSymbol!.typeParameters!.length).toBe(2);
    });

    it("should include type parameter bounds as constraints", () => {
      const tParam = genericSymbol!.typeParameters!.find((tp) => tp.name === "T");
      expect(tParam).toBeDefined();
      expect(tParam!.constraint).toBeDefined();
      expect(tParam!.constraint).toContain("Comparable");
    });

    it("should include type parameters in signature", () => {
      expect(genericSymbol!.signature).toContain("<");
      expect(genericSymbol!.signature).toContain(">");
    });
  });
});

describe("JavaTransformer without repo/sha", () => {
  it("should handle missing repo/sha gracefully", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      // No repo or sha
    });

    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    const transformer = new JavaTransformer(result, config);
    const symbols = transformer.transform();

    // Should still produce symbols
    expect(symbols.length).toBeGreaterThan(0);

    // Source should still have repo/sha (even if empty)
    const simpleClass = symbols.find((s) => s.name === "SimpleClass");
    expect(simpleClass!.source).toBeDefined();
    expect(simpleClass!.source!.repo).toBe("");
    expect(simpleClass!.source!.sha).toBe("");
  });
});

describe("JavaTransformer kind mapping", () => {
  let symbols: SymbolRecord[];

  beforeAll(async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def456",
      excludePrivate: true,
      excludePackagePrivate: false,
    });

    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    const transformer = new JavaTransformer(result, config);
    symbols = transformer.transform();
  });

  it("should map class to class", () => {
    const classSymbol = symbols.find((s) => s.name === "SimpleClass");
    expect(classSymbol!.kind).toBe("class");
  });

  it("should map interface to interface", () => {
    const interfaceSymbol = symbols.find((s) => s.name === "MyInterface");
    expect(interfaceSymbol!.kind).toBe("interface");
  });

  it("should map enum to enum", () => {
    const enumSymbol = symbols.find((s) => s.name === "MyEnum");
    expect(enumSymbol!.kind).toBe("enum");
  });

  it("should map record to class", () => {
    const recordSymbol = symbols.find((s) => s.name === "MyRecord");
    expect(recordSymbol!.kind).toBe("class");
  });

  it("should map annotation to typeAlias", () => {
    const annotationSymbol = symbols.find((s) => s.name === "MyAnnotation");
    expect(annotationSymbol!.kind).toBe("typeAlias");
  });
});
