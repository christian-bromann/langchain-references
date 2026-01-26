/**
 * Extraction snapshot test - verifies complete extraction output
 */

import path from "node:path";
import url from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import { JavaExtractor, type ExtractionResult, type JavaType } from "../extractor.js";
import { JavaTransformer } from "../transformer.js";
import type { SymbolRecord, MemberReference } from "@langchain/ir-schema";
import { createConfig } from "../config.js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.join(__dirname, "fixtures");

describe("Extraction completeness", () => {
  let result: ExtractionResult;
  let symbols: SymbolRecord[];

  beforeAll(async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123",
      excludePrivate: true,
      excludePackagePrivate: false,
    });

    const extractor = new JavaExtractor(config);
    result = await extractor.extract();

    const transformer = new JavaTransformer(result, config);
    symbols = transformer.transform();
  });

  describe("SimpleClass extraction details", () => {
    let simpleClass: JavaType;

    beforeAll(() => {
      simpleClass = result.types.find((t) => t.name === "SimpleClass")!;
    });

    it("should have correct class structure", () => {
      expect(simpleClass.name).toBe("SimpleClass");
      expect(simpleClass.kind).toBe("class");
      expect(simpleClass.packageName).toBe("com.example");
      expect(simpleClass.modifiers).toEqual(["public"]);
      expect(simpleClass.extends).toBe("BaseClass");
      expect(simpleClass.implements).toContain("Runnable");
    });

    it("should extract full Javadoc for class", () => {
      expect(simpleClass.javadoc).toBeDefined();
      expect(simpleClass.javadoc).toContain("A simple class for testing");
      expect(simpleClass.javadoc).toContain("second line of description");
      expect(simpleClass.javadoc).toContain("@since 1.0.0");
    });

    it("should extract CONSTANT field with full details", () => {
      const constant = simpleClass.fields.find((f) => f.name === "CONSTANT");
      expect(constant).toBeDefined();
      expect(constant!.type).toBe("String");
      expect(constant!.modifiers).toContain("public");
      expect(constant!.modifiers).toContain("static");
      expect(constant!.modifiers).toContain("final");
      expect(constant!.javadoc).toContain("A public static final field");
    });

    it("should extract protected field 'name' with Javadoc", () => {
      const nameField = simpleClass.fields.find((f) => f.name === "name");
      expect(nameField).toBeDefined();
      expect(nameField!.type).toBe("String");
      expect(nameField!.modifiers).toContain("protected");
      expect(nameField!.javadoc).toContain("A protected field");
    });

    it("should extract getCount method with full Javadoc", () => {
      const getCount = simpleClass.methods.find((m) => m.name === "getCount");
      expect(getCount).toBeDefined();
      expect(getCount!.returnType).toBe("int");
      expect(getCount!.modifiers).toContain("public");
      expect(getCount!.javadoc).toContain("Gets the count");
      expect(getCount!.javadoc).toContain("@return The current count value");
    });

    it("should extract setCount method with parameter Javadoc", () => {
      const setCount = simpleClass.methods.find((m) => m.name === "setCount");
      expect(setCount).toBeDefined();
      expect(setCount!.returnType).toBe("void");
      expect(setCount!.parameters.length).toBe(1);
      expect(setCount!.parameters[0].name).toBe("count");
      expect(setCount!.parameters[0].type).toBe("int");
      expect(setCount!.javadoc).toContain("Sets the count value");
      expect(setCount!.javadoc).toContain("@param count The new count value");
    });

    it("should extract combine method with throws and full Javadoc", () => {
      const combine = simpleClass.methods.find((m) => m.name === "combine");
      expect(combine).toBeDefined();
      expect(combine!.returnType).toBe("String");
      expect(combine!.parameters.length).toBe(2);
      expect(combine!.throws).toContain("IllegalArgumentException");
      expect(combine!.javadoc).toContain("A method with multiple parameters");
      expect(combine!.javadoc).toContain("@param first The first parameter");
      expect(combine!.javadoc).toContain("@param second The second parameter");
      expect(combine!.javadoc).toContain("@return A combined string");
      expect(combine!.javadoc).toContain("@throws IllegalArgumentException");
    });

    it("should extract static method doubleValue with correct modifiers", () => {
      const doubleValue = simpleClass.methods.find((m) => m.name === "doubleValue");
      expect(doubleValue).toBeDefined();
      expect(doubleValue!.returnType).toBe("int");
      expect(doubleValue!.modifiers).toContain("public");
      expect(doubleValue!.modifiers).toContain("static");
      expect(doubleValue!.javadoc).toContain("Static method example");
    });

    it("should extract constructors with Javadoc", () => {
      // Default constructor
      const defaultCtor = simpleClass.constructors.find((c) => c.parameters.length === 0);
      expect(defaultCtor).toBeDefined();
      expect(defaultCtor!.javadoc).toContain("Default constructor");

      // Parameterized constructor
      const paramCtor = simpleClass.constructors.find((c) => c.parameters.length === 2);
      expect(paramCtor).toBeDefined();
      expect(paramCtor!.javadoc).toContain("Constructor with parameters");
      expect(paramCtor!.javadoc).toContain("@param count The initial count");
      expect(paramCtor!.javadoc).toContain("@param name The name");
    });
  });

  describe("GenericClass extraction details", () => {
    let genericClass: JavaType;

    beforeAll(() => {
      genericClass = result.types.find((t) => t.name === "GenericClass")!;
    });

    it("should extract type parameters with bounds", () => {
      expect(genericClass.typeParameters.length).toBe(2);

      const tParam = genericClass.typeParameters.find((tp) => tp.name === "T");
      expect(tParam).toBeDefined();
      expect(tParam!.bounds).toContain("Comparable<T>");

      const kParam = genericClass.typeParameters.find((tp) => tp.name === "K");
      expect(kParam).toBeDefined();
      expect(kParam!.bounds).toBeUndefined();
    });

    it("should extract generic method with type parameter", () => {
      const transform = genericClass.methods.find((m) => m.name === "transform");
      expect(transform).toBeDefined();
      expect(transform!.javadoc).toContain("A generic method with its own type parameter");
      expect(transform!.javadoc).toContain("@param <R> The result type");
    });

    it("should extract method returning complex generic type", () => {
      const getMapping = genericClass.methods.find((m) => m.name === "getMapping");
      expect(getMapping).toBeDefined();
      expect(getMapping!.returnType).toContain("Map");
    });
  });

  describe("MyInterface extraction details", () => {
    let myInterface: JavaType;

    beforeAll(() => {
      myInterface = result.types.find((t) => t.name === "MyInterface")!;
    });

    it("should have correct interface structure", () => {
      expect(myInterface.kind).toBe("interface");
      expect(myInterface.typeParameters.length).toBe(1);
      expect(myInterface.typeParameters[0].name).toBe("T");
    });

    it("should extract interface Javadoc with HTML", () => {
      expect(myInterface.javadoc).toContain("An example interface");
      expect(myInterface.javadoc).toContain("<p>This interface defines methods");
      expect(myInterface.javadoc).toContain("@param <T> The type of items");
    });

    it("should extract default method", () => {
      const getDefaultValue = myInterface.methods.find((m) => m.name === "getDefaultValue");
      expect(getDefaultValue).toBeDefined();
      expect(getDefaultValue!.modifiers).toContain("default");
      expect(getDefaultValue!.javadoc).toContain("A default method implementation");
    });

    it("should extract static method in interface", () => {
      const create = myInterface.methods.find((m) => m.name === "create");
      expect(create).toBeDefined();
      expect(create!.modifiers).toContain("static");
      expect(create!.javadoc).toContain("A static factory method");
    });
  });

  describe("MyEnum extraction details", () => {
    let myEnum: JavaType;

    beforeAll(() => {
      myEnum = result.types.find((t) => t.name === "MyEnum")!;
    });

    it("should have correct enum structure", () => {
      expect(myEnum.kind).toBe("enum");
      expect(myEnum.packageName).toBe("com.example.enums");
    });

    it("should extract enum Javadoc", () => {
      expect(myEnum.javadoc).toContain("An example enum for testing");
      expect(myEnum.javadoc).toContain("<p>This enum represents different status values");
    });

    it("should extract enum constructor", () => {
      const ctor = myEnum.constructors.find((c) => c.parameters.length === 1);
      expect(ctor).toBeDefined();
      expect(ctor!.parameters[0].name).toBe("displayName");
      expect(ctor!.javadoc).toContain("Creates a new enum constant");
    });

    it("should extract enum methods", () => {
      const getDisplayName = myEnum.methods.find((m) => m.name === "getDisplayName");
      expect(getDisplayName).toBeDefined();
      expect(getDisplayName!.returnType).toBe("String");

      const fromString = myEnum.methods.find((m) => m.name === "fromString");
      expect(fromString).toBeDefined();
      expect(fromString!.modifiers).toContain("static");
    });
  });

  describe("MyRecord extraction details", () => {
    let myRecord: JavaType;

    beforeAll(() => {
      myRecord = result.types.find((t) => t.name === "MyRecord")!;
    });

    it("should have correct record structure", () => {
      expect(myRecord.kind).toBe("record");
      expect(myRecord.packageName).toBe("com.example.records");
    });

    it("should extract record Javadoc with @param tags", () => {
      expect(myRecord.javadoc).toContain("A record class (Java 16+)");
      expect(myRecord.javadoc).toContain("Records are immutable data carriers");
      expect(myRecord.javadoc).toContain("@param id The unique identifier");
      expect(myRecord.javadoc).toContain("@param name The name");
      expect(myRecord.javadoc).toContain("@param value The numeric value");
    });

    it("should extract static factory method", () => {
      const withGeneratedId = myRecord.methods.find((m) => m.name === "withGeneratedId");
      expect(withGeneratedId).toBeDefined();
      expect(withGeneratedId!.modifiers).toContain("static");
      expect(withGeneratedId!.returnType).toBe("MyRecord");
    });

    it("should extract instance method", () => {
      const doubledValue = myRecord.methods.find((m) => m.name === "doubledValue");
      expect(doubledValue).toBeDefined();
      expect(doubledValue!.returnType).toBe("int");
      expect(doubledValue!.javadoc).toContain("Returns the value doubled");
    });
  });

  describe("MyAnnotation extraction details", () => {
    let myAnnotation: JavaType;

    beforeAll(() => {
      myAnnotation = result.types.find((t) => t.name === "MyAnnotation")!;
    });

    it("should have correct annotation structure", () => {
      expect(myAnnotation.kind).toBe("annotation");
      expect(myAnnotation.packageName).toBe("com.example.annotations");
    });

    it("should extract annotation Javadoc", () => {
      expect(myAnnotation.javadoc).toContain("A custom annotation for testing");
      expect(myAnnotation.javadoc).toContain("<p>Use this annotation to mark classes");
    });

    it("should extract annotation methods (elements)", () => {
      const name = myAnnotation.methods.find((m) => m.name === "name");
      expect(name).toBeDefined();
      expect(name!.returnType).toBe("String");
      expect(name!.javadoc).toContain("The name value");

      const enabled = myAnnotation.methods.find((m) => m.name === "enabled");
      expect(enabled).toBeDefined();
      expect(enabled!.returnType).toBe("boolean");

      const priority = myAnnotation.methods.find((m) => m.name === "priority");
      expect(priority).toBeDefined();
      expect(priority!.returnType).toBe("int");
    });
  });

  describe("Transformed symbols completeness", () => {
    it("should generate correct symbol IDs", () => {
      const simpleClass = symbols.find((s) => s.name === "SimpleClass" && s.kind === "class");
      // ID uses qualified name with dots replaced by underscores
      expect(simpleClass!.id).toBe("pkg_java_test_package:com_example_SimpleClass");
    });

    it("should include all members with correct kinds", () => {
      const simpleClass = symbols.find((s) => s.name === "SimpleClass");
      expect(simpleClass!.members).toBeDefined();

      const memberKinds = simpleClass!.members!.map((m: MemberReference) => m.kind);
      expect(memberKinds).toContain("constructor");
      expect(memberKinds).toContain("method");
      expect(memberKinds).toContain("property");
    });

    it("should include source info in symbols", () => {
      const simpleClass = symbols.find((s) => s.name === "SimpleClass");
      expect(simpleClass!.source!.repo).toBe("langchain-ai/test-repo");
      expect(simpleClass!.source!.sha).toBe("abc123");
      expect(simpleClass!.source!.path).toContain("SimpleClass.java");
    });

    it("should convert Javadoc to markdown in descriptions", () => {
      const genericClass = symbols.find((s) => s.name === "GenericClass");
      expect(genericClass!.docs.description).toBeDefined();
      // @param <T> should be converted
      expect(genericClass!.docs.description).toContain("- **T**:");
    });
  });
});
