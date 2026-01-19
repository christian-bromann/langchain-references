/**
 * Extraction snapshot test - verifies complete extraction output
 */

import path from "node:path";
import url from "node:url";

import { describe, it, expect, beforeAll } from "vitest";
import { GoExtractor, type ExtractionResult, type GoType, type GoMethod } from "../extractor.js";
import { GoTransformer, type SymbolRecord } from "../transformer.js";
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
      exportedOnly: true,
    });

    const extractor = new GoExtractor(config);
    result = await extractor.extract();

    const transformer = new GoTransformer(result, config);
    symbols = transformer.transform();
  });

  describe("Client struct extraction details", () => {
    let client: GoType;

    beforeAll(() => {
      client = result.types.find((t) => t.name === "Client")!;
    });

    it("should have correct struct structure", () => {
      expect(client.name).toBe("Client");
      expect(client.kind).toBe("struct");
      expect(client.packageName).toBe("example");
    });

    it("should extract full doc comment", () => {
      expect(client.doc).toBeDefined();
      expect(client.doc).toContain("Client represents a client connection");
      expect(client.doc).toContain("handles authentication");
    });

    it("should extract all exported fields", () => {
      const fieldNames = client.fields.map((f) => f.name);
      expect(fieldNames).toContain("BaseURL");
      expect(fieldNames).toContain("APIKey");
      expect(fieldNames).toContain("Timeout");
    });

    it("should extract field with tag correctly", () => {
      const apiKey = client.fields.find((f) => f.name === "APIKey");
      expect(apiKey!.type).toBe("string");
      expect(apiKey!.tag).toBe('json:"api_key,omitempty"');
      expect(apiKey!.doc).toContain("authentication key");
    });

    it("should extract all methods", () => {
      const methodNames = client.methods.map((m) => m.name);
      expect(methodNames).toContain("Get");
      expect(methodNames).toContain("Post");
      expect(methodNames).toContain("SetTimeout");
      expect(methodNames).toContain("Close");
    });

    it("should extract Get method with full details", () => {
      const get = client.methods.find((m) => m.name === "Get");
      expect(get!.doc).toContain("performs an HTTP GET request");
      expect(get!.doc).toContain("returns the response body");
      expect(get!.parameters.length).toBe(2);
      expect(get!.parameters[0].name).toBe("ctx");
      expect(get!.parameters[0].type).toBe("context.Context");
      expect(get!.parameters[1].name).toBe("path");
      expect(get!.parameters[1].type).toBe("string");
      expect(get!.returns).toContain("[]byte");
      expect(get!.returns).toContain("error");
    });

    it("should extract Post method with io.Reader parameter", () => {
      const post = client.methods.find((m) => m.name === "Post");
      expect(post!.parameters.length).toBe(3);
      expect(post!.parameters[2].name).toBe("body");
      expect(post!.parameters[2].type).toBe("io.Reader");
    });
  });

  describe("Response struct extraction details", () => {
    let response: GoType;

    beforeAll(() => {
      response = result.types.find((t) => t.name === "Response")!;
    });

    it("should extract Response struct", () => {
      expect(response).toBeDefined();
      expect(response.kind).toBe("struct");
    });

    it("should extract map field type", () => {
      const headers = response.fields.find((f) => f.name === "Headers");
      expect(headers!.type).toBe("map[string]string");
    });

    it("should extract byte slice field", () => {
      const body = response.fields.find((f) => f.name === "Body");
      expect(body!.type).toBe("[]byte");
    });

    it("should extract method returning bool", () => {
      const isSuccess = response.methods.find((m) => m.name === "IsSuccess");
      expect(isSuccess).toBeDefined();
      expect(isSuccess!.returns).toBe("bool");
    });
  });

  describe("Handler interface extraction details", () => {
    let handler: GoType;

    beforeAll(() => {
      handler = result.types.find((t) => t.name === "Handler")!;
    });

    it("should have correct interface structure", () => {
      expect(handler.name).toBe("Handler");
      expect(handler.kind).toBe("interface");
    });

    it("should extract interface doc comment", () => {
      expect(handler.doc).toContain("defines the interface for request handlers");
    });

    it("should have no fields (interfaces don't have fields)", () => {
      expect(handler.fields.length).toBe(0);
    });
  });

  describe("Storage interface extraction details", () => {
    let storage: GoType;

    beforeAll(() => {
      storage = result.types.find((t) => t.name === "Storage")!;
    });

    it("should extract Storage interface", () => {
      expect(storage).toBeDefined();
      expect(storage.kind).toBe("interface");
    });

    it("should extract multi-line doc comment", () => {
      expect(storage.doc).toContain("defines the interface for data storage");
      expect(storage.doc).toContain("thread-safe");
    });
  });

  describe("Logger interface extraction details", () => {
    let logger: GoType;

    beforeAll(() => {
      logger = result.types.find((t) => t.name === "Logger")!;
    });

    it("should extract Logger interface", () => {
      expect(logger).toBeDefined();
      expect(logger.kind).toBe("interface");
    });
  });

  describe("Type alias extraction details", () => {
    let middleware: GoType;

    beforeAll(() => {
      middleware = result.types.find((t) => t.name === "Middleware")!;
    });

    it("should extract Middleware alias", () => {
      expect(middleware).toBeDefined();
      expect(middleware.kind).toBe("alias");
    });

    it("should include aliased type in signature", () => {
      expect(middleware.signature).toContain("=");
      expect(middleware.signature).toContain("func(Handler) Handler");
    });
  });

  describe("Function extraction details", () => {
    let connect: GoMethod;

    beforeAll(() => {
      connect = result.functions.find((f) => f.name === "Connect")!;
    });

    it("should extract Connect function", () => {
      expect(connect).toBeDefined();
    });

    it("should extract multi-line doc with example", () => {
      expect(connect.doc).toContain("establishes a connection");
      expect(connect.doc).toContain("Example:");
    });

    it("should extract function parameters", () => {
      expect(connect.parameters.length).toBe(2);
      expect(connect.parameters[0].name).toBe("host");
      expect(connect.parameters[1].name).toBe("apiKey");
    });

    it("should extract return types", () => {
      expect(connect.returns).toContain("*Client");
      expect(connect.returns).toContain("error");
    });

    it("should not have receiver", () => {
      expect(connect.receiver).toBeUndefined();
    });
  });

  describe("ParseConfig function with DEPRECATED", () => {
    let parseConfig: GoMethod;

    beforeAll(() => {
      parseConfig = result.functions.find((f) => f.name === "ParseConfig")!;
    });

    it("should extract deprecated function", () => {
      expect(parseConfig).toBeDefined();
    });

    it("should include DEPRECATED in doc", () => {
      expect(parseConfig.doc).toContain("DEPRECATED");
    });
  });

  describe("Config struct with methods", () => {
    let config: GoType;

    beforeAll(() => {
      config = result.types.find((t) => t.name === "Config")!;
    });

    it("should extract Config struct", () => {
      expect(config).toBeDefined();
    });

    it("should extract fields with json tag", () => {
      const debug = config.fields.find((f) => f.name === "Debug");
      expect(debug!.tag).toBe('json:"debug"');
    });

    it("should extract Validate method", () => {
      const validate = config.methods.find((m) => m.name === "Validate");
      expect(validate).toBeDefined();
      expect(validate!.returns).toBe("error");
    });

    it("should extract String method", () => {
      const stringMethod = config.methods.find((m) => m.name === "String");
      expect(stringMethod).toBeDefined();
      expect(stringMethod!.returns).toBe("string");
    });
  });

  describe("Constant extraction details", () => {
    it("should extract DefaultTimeout constant", () => {
      const timeout = result.constants.find((c) => c.name === "DefaultTimeout");
      expect(timeout).toBeDefined();
      expect(timeout!.kind).toBe("const");
      expect(timeout!.doc).toContain("default timeout");
    });

    it("should extract MaxRetries with explicit type", () => {
      const maxRetries = result.constants.find((c) => c.name === "MaxRetries");
      expect(maxRetries).toBeDefined();
      expect(maxRetries!.type).toBe("int");
    });

    it("should extract ErrNotFound variable", () => {
      const err = result.constants.find((c) => c.name === "ErrNotFound");
      expect(err).toBeDefined();
      expect(err!.kind).toBe("var");
      expect(err!.doc).toContain("not found");
    });

    it("should extract ErrUnauthorized with explicit type", () => {
      const err = result.constants.find((c) => c.name === "ErrUnauthorized");
      expect(err).toBeDefined();
      expect(err!.type).toBe("error");
    });
  });

  describe("Transformed symbols completeness", () => {
    it("should generate correct symbol IDs", () => {
      const client = symbols.find((s) => s.name === "Client");
      expect(client!.id).toBe("pkg_go_test_package:Client");
    });

    it("should have simple qualified name without module path", () => {
      // Go qualified names now use just the symbol name (module is implicit from package context)
      const client = symbols.find((s) => s.name === "Client" && s.kind === "class");
      expect(client!.qualifiedName).toBe("Client");
    });

    it("should include all members with correct kinds", () => {
      const client = symbols.find((s) => s.name === "Client");
      expect(client!.members).toBeDefined();

      const memberKinds = client!.members!.map((m) => m.kind);
      expect(memberKinds).toContain("method");
      expect(memberKinds).toContain("property");
    });

    it("should include source info in symbols", () => {
      const client = symbols.find((s) => s.name === "Client");
      expect(client!.source!.repo).toBe("langchain-ai/test-repo");
      expect(client!.source!.sha).toBe("abc123");
      expect(client!.source!.path).toContain("types.go");
    });

    it("should extract summary as first sentence", () => {
      const client = symbols.find((s) => s.name === "Client");
      expect(client!.summary).toBe("Client represents a client connection to a service.");
    });
  });
});
