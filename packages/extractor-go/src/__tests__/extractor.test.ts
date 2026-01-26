/**
 * GoExtractor tests
 */

import path from "node:path";
import url from "node:url";

import { describe, it, expect, beforeAll } from "vitest";

import { GoExtractor, type ExtractionResult } from "../extractor.js";
import { createConfig } from "../config.js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesPath = path.join(__dirname, "fixtures");

describe("GoExtractor", () => {
  let result: ExtractionResult;

  beforeAll(async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      repo: "langchain-ai/test-repo",
      sha: "abc123def",
      exportedOnly: true,
    });

    const extractor = new GoExtractor(config);
    result = await extractor.extract();
  });

  describe("extraction result", () => {
    it("should return the package name", () => {
      expect(result.packageName).toBe("test-package");
    });

    it("should detect module name from go.mod", () => {
      expect(result.moduleName).toBe("github.com/example/testpkg");
    });

    it("should extract multiple types", () => {
      expect(result.types.length).toBeGreaterThanOrEqual(5);
    });

    it("should extract top-level functions", () => {
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it("should extract constants and variables", () => {
      expect(result.constants.length).toBeGreaterThan(0);
    });

    it("should detect version or return default", () => {
      expect(typeof result.version).toBe("string");
    });
  });

  describe("struct extraction", () => {
    it("should extract Client struct", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client).toBeDefined();
      expect(client!.kind).toBe("struct");
    });

    it("should extract package name", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.packageName).toBe("example");
    });

    it("should extract doc comment", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.doc).toBeDefined();
      expect(client!.doc).toContain("Client represents a client connection");
    });

    it("should extract struct signature", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.signature).toBe("type Client struct");
    });

    it("should extract source file path", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.sourceFile).toContain("types.go");
    });

    it("should have start line number", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.startLine).toBeGreaterThan(0);
    });
  });

  describe("struct field extraction", () => {
    it("should extract exported fields", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.fields.length).toBeGreaterThan(0);
    });

    it("should extract field names", () => {
      const client = result.types.find((t) => t.name === "Client");
      const fieldNames = client!.fields.map((f) => f.name);
      expect(fieldNames).toContain("BaseURL");
      expect(fieldNames).toContain("APIKey");
      expect(fieldNames).toContain("Timeout");
    });

    it("should extract field types", () => {
      const client = result.types.find((t) => t.name === "Client");
      const baseURL = client!.fields.find((f) => f.name === "BaseURL");
      expect(baseURL!.type).toBe("string");
    });

    it("should extract field tags", () => {
      const client = result.types.find((t) => t.name === "Client");
      const apiKey = client!.fields.find((f) => f.name === "APIKey");
      expect(apiKey!.tag).toBe('json:"api_key,omitempty"');
    });

    it("should extract field doc comments", () => {
      const client = result.types.find((t) => t.name === "Client");
      const baseURL = client!.fields.find((f) => f.name === "BaseURL");
      expect(baseURL!.doc).toContain("base URL");
    });

    it("should not extract unexported fields", () => {
      const client = result.types.find((t) => t.name === "Client");
      const fieldNames = client!.fields.map((f) => f.name);
      expect(fieldNames).not.toContain("internal");
    });
  });

  describe("method extraction", () => {
    it("should extract methods for Client", () => {
      const client = result.types.find((t) => t.name === "Client");
      expect(client!.methods.length).toBeGreaterThan(0);
    });

    it("should extract method names", () => {
      const client = result.types.find((t) => t.name === "Client");
      const methodNames = client!.methods.map((m) => m.name);
      expect(methodNames).toContain("Get");
      expect(methodNames).toContain("Post");
      expect(methodNames).toContain("SetTimeout");
      expect(methodNames).toContain("Close");
    });

    it("should extract method signatures", () => {
      const client = result.types.find((t) => t.name === "Client");
      const get = client!.methods.find((m) => m.name === "Get");
      expect(get!.signature).toContain("func");
      expect(get!.signature).toContain("Get");
      expect(get!.signature).toContain("context.Context");
    });

    it("should extract method receiver", () => {
      const client = result.types.find((t) => t.name === "Client");
      const get = client!.methods.find((m) => m.name === "Get");
      expect(get!.receiverType).toBe("Client");
    });

    it("should extract method parameters", () => {
      const client = result.types.find((t) => t.name === "Client");
      const get = client!.methods.find((m) => m.name === "Get");
      expect(get!.parameters.length).toBe(2);
      expect(get!.parameters[0].name).toBe("ctx");
      expect(get!.parameters[0].type).toBe("context.Context");
    });

    it("should extract method return types", () => {
      const client = result.types.find((t) => t.name === "Client");
      const get = client!.methods.find((m) => m.name === "Get");
      expect(get!.returns).toContain("[]byte");
      expect(get!.returns).toContain("error");
    });

    it("should extract method doc comments", () => {
      const client = result.types.find((t) => t.name === "Client");
      const get = client!.methods.find((m) => m.name === "Get");
      expect(get!.doc).toContain("performs an HTTP GET request");
    });
  });

  describe("interface extraction", () => {
    it("should extract Handler interface", () => {
      const handler = result.types.find((t) => t.name === "Handler");
      expect(handler).toBeDefined();
      expect(handler!.kind).toBe("interface");
    });

    it("should extract Storage interface", () => {
      const storage = result.types.find((t) => t.name === "Storage");
      expect(storage).toBeDefined();
      expect(storage!.kind).toBe("interface");
    });

    it("should extract interface doc comment", () => {
      const storage = result.types.find((t) => t.name === "Storage");
      expect(storage!.doc).toContain("defines the interface for data storage");
    });

    it("should extract Logger interface", () => {
      const logger = result.types.find((t) => t.name === "Logger");
      expect(logger).toBeDefined();
      expect(logger!.kind).toBe("interface");
    });
  });

  describe("type alias extraction", () => {
    it("should extract type alias", () => {
      const middleware = result.types.find((t) => t.name === "Middleware");
      expect(middleware).toBeDefined();
      expect(middleware!.kind).toBe("alias");
    });

    it("should extract alias signature", () => {
      const middleware = result.types.find((t) => t.name === "Middleware");
      expect(middleware!.signature).toContain("=");
    });
  });

  describe("function extraction", () => {
    it("should extract top-level functions", () => {
      const functionNames = result.functions.map((f) => f.name);
      expect(functionNames).toContain("Connect");
      expect(functionNames).toContain("Ping");
      expect(functionNames).toContain("LoadConfig");
    });

    it("should extract function doc comments", () => {
      const connect = result.functions.find((f) => f.name === "Connect");
      expect(connect!.doc).toContain("establishes a connection");
    });

    it("should extract function parameters", () => {
      const connect = result.functions.find((f) => f.name === "Connect");
      expect(connect!.parameters.length).toBe(2);
      expect(connect!.parameters[0].name).toBe("host");
    });

    it("should extract function return types", () => {
      const connect = result.functions.find((f) => f.name === "Connect");
      expect(connect!.returns).toContain("*Client");
      expect(connect!.returns).toContain("error");
    });

    it("should extract function signature", () => {
      const connect = result.functions.find((f) => f.name === "Connect");
      expect(connect!.signature).toContain("func Connect");
    });

    it("should not include methods in top-level functions", () => {
      const functionNames = result.functions.map((f) => f.name);
      // These are methods, not functions
      expect(functionNames).not.toContain("Get");
      expect(functionNames).not.toContain("Post");
    });
  });

  describe("constant extraction", () => {
    it("should extract constants", () => {
      const constNames = result.constants.map((c) => c.name);
      expect(constNames).toContain("DefaultTimeout");
      expect(constNames).toContain("MaxRetries");
    });

    it("should extract constant kind", () => {
      const timeout = result.constants.find((c) => c.name === "DefaultTimeout");
      expect(timeout!.kind).toBe("const");
    });

    it("should extract constant type when specified", () => {
      const maxRetries = result.constants.find((c) => c.name === "MaxRetries");
      expect(maxRetries!.type).toBe("int");
    });

    it("should extract variable declarations", () => {
      const constNames = result.constants.map((c) => c.name);
      expect(constNames).toContain("ErrNotFound");
      expect(constNames).toContain("ErrUnauthorized");
    });

    it("should extract variable kind", () => {
      const errNotFound = result.constants.find((c) => c.name === "ErrNotFound");
      expect(errNotFound!.kind).toBe("var");
    });

    it("should not extract unexported constants", () => {
      const constNames = result.constants.map((c) => c.name);
      expect(constNames).not.toContain("unexportedConst");
    });
  });
});

describe("GoExtractor with exportedOnly=false", () => {
  it("should include unexported symbols when exportedOnly is false", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      exportedOnly: false,
    });

    const extractor = new GoExtractor(config);
    const result = await extractor.extract();

    const constNames = result.constants.map((c) => c.name);
    expect(constNames).toContain("unexportedConst");
  });
});

describe("GoExtractor file discovery", () => {
  it("should find all Go files in the directory", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
    });

    const extractor = new GoExtractor(config);
    const result = await extractor.extract();

    // Should find types from multiple files
    expect(result.types.length).toBeGreaterThanOrEqual(5);
  });

  it("should respect exclude patterns", async () => {
    const config = createConfig({
      packageName: "test-package",
      packagePath: fixturesPath,
      excludePatterns: ["**/types.go"],
    });

    const extractor = new GoExtractor(config);
    const result = await extractor.extract();

    // Should not include Client from types.go
    const client = result.types.find((t) => t.name === "Client");
    expect(client).toBeUndefined();
  });
});
