/**
 * JavaExtractor tests
 */

import path from "node:path";
import url from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import { JavaExtractor, type ExtractionResult } from "../extractor.js";
import { createConfig } from "../config.js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.join(__dirname, "fixtures");

describe("JavaExtractor", () => {
  let result: ExtractionResult;

  beforeAll(async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def",
      excludePrivate: true,
      excludePackagePrivate: false,
    });

    const extractor = new JavaExtractor(config);
    result = await extractor.extract();
  });

  describe("extraction result", () => {
    it("should return the package name", () => {
      expect(result.packageName).toBe("test-package");
    });

    it("should extract multiple types", () => {
      expect(result.types.length).toBeGreaterThanOrEqual(5);
    });

    it("should detect version or return empty", () => {
      expect(typeof result.version).toBe("string");
    });
  });

  describe("class extraction", () => {
    it("should extract SimpleClass", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass).toBeDefined();
      expect(simpleClass!.kind).toBe("class");
    });

    it("should extract package name", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.packageName).toBe("com.example");
    });

    it("should extract modifiers", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.modifiers).toContain("public");
    });

    it("should extract extends clause", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.extends).toBe("BaseClass");
    });

    it("should extract implements list", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.implements).toContain("Runnable");
      expect(simpleClass!.implements.length).toBeGreaterThanOrEqual(1);
    });

    it("should extract Javadoc", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.javadoc).toBeDefined();
      expect(simpleClass!.javadoc).toContain("simple class for testing");
    });

    it("should extract source file path", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.sourceFile).toContain("SimpleClass.java");
    });

    it("should have a start line number", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.startLine).toBeGreaterThan(0);
    });
  });

  describe("method extraction", () => {
    it("should extract methods from SimpleClass", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.methods.length).toBeGreaterThan(0);
    });

    it("should extract method names", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const methodNames = simpleClass!.methods.map((m) => m.name);
      expect(methodNames).toContain("getCount");
      expect(methodNames).toContain("setCount");
    });

    it("should extract method return types", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const getCount = simpleClass!.methods.find((m) => m.name === "getCount");
      expect(getCount!.returnType).toBe("int");
    });

    it("should extract method parameters", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const setCount = simpleClass!.methods.find((m) => m.name === "setCount");
      expect(setCount!.parameters.length).toBe(1);
      expect(setCount!.parameters[0].name).toBe("count");
      expect(setCount!.parameters[0].type).toBe("int");
    });

    it("should extract method modifiers including public and static", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const doubleValue = simpleClass!.methods.find((m) => m.name === "doubleValue");
      expect(doubleValue!.modifiers).toContain("public");
      expect(doubleValue!.modifiers).toContain("static");
    });

    it("should extract throws clauses", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const combine = simpleClass!.methods.find((m) => m.name === "combine");
      expect(combine!.throws).toContain("IllegalArgumentException");
    });

    it("should extract method Javadoc", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const getCount = simpleClass!.methods.find((m) => m.name === "getCount");
      expect(getCount!.javadoc).toBeDefined();
      expect(getCount!.javadoc).toContain("Gets the count");
    });
  });

  describe("constructor extraction", () => {
    it("should extract constructors", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      expect(simpleClass!.constructors.length).toBeGreaterThanOrEqual(1);
    });

    it("should extract constructor parameters", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const ctorWithParams = simpleClass!.constructors.find((c) => c.parameters.length === 2);
      expect(ctorWithParams).toBeDefined();
      expect(ctorWithParams!.parameters[0].name).toBe("count");
      expect(ctorWithParams!.parameters[1].name).toBe("name");
    });

    it("should extract constructor Javadoc", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const ctorWithParams = simpleClass!.constructors.find((c) => c.parameters.length === 2);
      expect(ctorWithParams!.javadoc).toBeDefined();
      expect(ctorWithParams!.javadoc).toContain("Constructor with parameters");
    });
  });

  describe("field extraction", () => {
    it("should extract public fields", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const fieldNames = simpleClass!.fields.map((f) => f.name);
      expect(fieldNames).toContain("CONSTANT");
    });

    it("should extract field types", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const constant = simpleClass!.fields.find((f) => f.name === "CONSTANT");
      expect(constant!.type).toBe("String");
    });

    it("should extract all field modifiers", () => {
      const simpleClass = result.types.find((t) => t.name === "SimpleClass");
      const constant = simpleClass!.fields.find((f) => f.name === "CONSTANT");
      expect(constant!.modifiers).toContain("public");
      expect(constant!.modifiers).toContain("static");
      expect(constant!.modifiers).toContain("final");
    });
  });

  describe("generics extraction", () => {
    it("should extract GenericClass", () => {
      const genericClass = result.types.find((t) => t.name === "GenericClass");
      expect(genericClass).toBeDefined();
    });

    it("should extract both type parameters", () => {
      const genericClass = result.types.find((t) => t.name === "GenericClass");
      expect(genericClass!.typeParameters.length).toBe(2);
      expect(genericClass!.typeParameters[0].name).toBe("T");
      expect(genericClass!.typeParameters[1].name).toBe("K");
    });

    it("should extract type parameter bounds", () => {
      const genericClass = result.types.find((t) => t.name === "GenericClass");
      const tParam = genericClass!.typeParameters.find((tp) => tp.name === "T");
      expect(tParam!.bounds).toBeDefined();
      expect(tParam!.bounds).toContain("Comparable");
    });
  });

  describe("interface extraction", () => {
    it("should extract MyInterface", () => {
      const myInterface = result.types.find((t) => t.name === "MyInterface");
      expect(myInterface).toBeDefined();
      expect(myInterface!.kind).toBe("interface");
    });

    it("should extract interface methods", () => {
      const myInterface = result.types.find((t) => t.name === "MyInterface");
      const methodNames = myInterface!.methods.map((m) => m.name);
      expect(methodNames).toContain("process");
      expect(methodNames).toContain("processAll");
    });

    it("should extract default methods", () => {
      const myInterface = result.types.find((t) => t.name === "MyInterface");
      const defaultMethod = myInterface!.methods.find((m) => m.name === "getDefaultValue");
      expect(defaultMethod).toBeDefined();
      expect(defaultMethod!.modifiers).toContain("default");
    });

    it("should extract static methods", () => {
      const myInterface = result.types.find((t) => t.name === "MyInterface");
      const staticMethod = myInterface!.methods.find((m) => m.name === "create");
      expect(staticMethod).toBeDefined();
      expect(staticMethod!.modifiers).toContain("static");
    });
  });

  describe("enum extraction", () => {
    it("should extract MyEnum", () => {
      const myEnum = result.types.find((t) => t.name === "MyEnum");
      expect(myEnum).toBeDefined();
      expect(myEnum!.kind).toBe("enum");
    });

    it("should extract enum package", () => {
      const myEnum = result.types.find((t) => t.name === "MyEnum");
      expect(myEnum!.packageName).toBe("com.example.enums");
    });

    it("should extract enum methods", () => {
      const myEnum = result.types.find((t) => t.name === "MyEnum");
      const methodNames = myEnum!.methods.map((m) => m.name);
      expect(methodNames).toContain("getDisplayName");
      expect(methodNames).toContain("fromString");
    });
  });

  describe("record extraction", () => {
    it("should extract MyRecord", () => {
      const myRecord = result.types.find((t) => t.name === "MyRecord");
      expect(myRecord).toBeDefined();
      expect(myRecord!.kind).toBe("record");
    });

    it("should extract record methods", () => {
      const myRecord = result.types.find((t) => t.name === "MyRecord");
      const methodNames = myRecord!.methods.map((m) => m.name);
      expect(methodNames).toContain("withGeneratedId");
      expect(methodNames).toContain("doubledValue");
    });
  });

  describe("annotation extraction", () => {
    it("should extract MyAnnotation", () => {
      const myAnnotation = result.types.find((t) => t.name === "MyAnnotation");
      expect(myAnnotation).toBeDefined();
      expect(myAnnotation!.kind).toBe("annotation");
    });

    it("should extract annotation package", () => {
      const myAnnotation = result.types.find((t) => t.name === "MyAnnotation");
      expect(myAnnotation!.packageName).toBe("com.example.annotations");
    });
  });
});

describe("JavaExtractor with excludePrivate", () => {
  it("should exclude private fields when excludePrivate is true", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      excludePrivate: true,
    });

    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    const simpleClass = result.types.find((t) => t.name === "SimpleClass");
    const fieldNames = simpleClass!.fields.map((f) => f.name);

    // Private fields should be excluded
    expect(fieldNames).not.toContain("count");
  });

  it("should include protected fields when excludePackagePrivate is false", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      excludePrivate: true,
      excludePackagePrivate: false,
    });

    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    const simpleClass = result.types.find((t) => t.name === "SimpleClass");
    const fieldNames = simpleClass!.fields.map((f) => f.name);

    // Protected fields should be included
    expect(fieldNames).toContain("name");
  });
});

describe("JavaExtractor file discovery", () => {
  it("should find all Java files in the directory", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
    });

    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    // Should find all fixture files
    expect(result.types.length).toBeGreaterThanOrEqual(6);
  });

  it("should respect exclude patterns", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      excludePatterns: ["**/Simple*.java"],
    });

    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    // Should not include SimpleClass
    const simpleClass = result.types.find((t) => t.name === "SimpleClass");
    expect(simpleClass).toBeUndefined();
  });
});
