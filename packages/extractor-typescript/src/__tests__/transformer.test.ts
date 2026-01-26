/**
 * TypeDocTransformer tests
 */

import { describe, it, expect } from "vitest";
import { TypeDocTransformer, type TypeDocProject } from "../transformer.js";

// TypeDoc uses branded types for IDs, so we need to cast
type ReflectionId = number & { __reflectionIdBrand: never };
const id = (n: number): ReflectionId => n as ReflectionId;

/**
 * Create a minimal TypeDoc project for testing
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockChild = Record<string, any> & { id?: number };

function createMockProject(
  overrides: Partial<Omit<TypeDocProject, "id" | "children">> & {
    id?: number;
    children?: MockChild[];
  } = {},
): TypeDocProject {
  const { id: projectId = 0, children = [], ...rest } = overrides;
  return {
    id: id(projectId),
    name: "test-project",
    variant: "project",
    kind: 1, // Project
    flags: {},
    children: children.map((child) => ({
      ...child,
      id: id(child.id ?? 0),
    })),
    ...rest,
  } as TypeDocProject;
}

describe("TypeDocTransformer", () => {
  describe("basic transformation", () => {
    it("should transform an empty project to empty symbols", () => {
      const project = createMockProject();
      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols).toEqual([]);
    });

    it("should set language to typescript for all symbols", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "TestClass",
            kind: 128, // Class
            flags: {},
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols.length).toBe(1);
      expect(symbols[0].language).toBe("typescript");
    });

    it("should generate package ID from package name", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "TestFunction",
            kind: 64, // Function
            flags: {},
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].packageId).toBe("pkg_js_langchain_core");
    });

    it("should generate unique symbol IDs", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "ClassA",
            kind: 128, // Class
            flags: {},
          },
          {
            id: 2,
            name: "ClassB",
            kind: 128, // Class
            flags: {},
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols.length).toBe(2);

      const ids = symbols.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("kind mapping", () => {
    it("should map class kind correctly", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "MyClass", kind: 128, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].kind).toBe("class");
    });

    it("should map interface kind correctly", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "MyInterface", kind: 256, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].kind).toBe("interface");
    });

    it("should map function kind correctly", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "myFunction", kind: 64, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].kind).toBe("function");
    });

    it("should map type alias kind correctly", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "MyType", kind: 2097152, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].kind).toBe("typeAlias");
    });

    it("should map enum kind correctly", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "MyEnum", kind: 8, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].kind).toBe("enum");
    });

    it("should map variable kind correctly", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "MY_CONSTANT", kind: 32, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].kind).toBe("variable");
    });
  });

  describe("URL generation", () => {
    it("should generate correct URL for class", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "ChatOpenAI", kind: 128, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/openai",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].urls.canonical).toBe("/javascript/langchain_openai/classes/ChatOpenAI/");
    });

    it("should generate correct URL for interface", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "RunnableConfig", kind: 256, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].urls.canonical).toBe(
        "/javascript/langchain_core/interfaces/RunnableConfig/",
      );
    });

    it("should generate correct URL for function", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "createAgent", kind: 64, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/agents",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].urls.canonical).toBe("/javascript/langchain_agents/functions/createAgent/");
    });
  });

  describe("qualified name generation", () => {
    it("should set qualified name for top-level symbol", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "BaseMessage", kind: 128, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].qualifiedName).toBe("BaseMessage");
    });

    it("should build qualified name for nested symbols", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "messages",
            kind: 2, // Module
            flags: {},
            children: [{ id: 2, name: "HumanMessage", kind: 128, flags: {} }],
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      const humanMessage = symbols.find((s) => s.name === "HumanMessage");
      expect(humanMessage?.qualifiedName).toBe("messages.HumanMessage");
    });
  });

  describe("visibility extraction", () => {
    it("should detect public visibility (default)", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "PublicClass", kind: 128, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].tags.visibility).toBe("public");
    });

    it("should detect protected visibility", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "ProtectedMethod", kind: 2048, flags: { isProtected: true } }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].tags.visibility).toBe("protected");
    });

    it("should detect private visibility", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "privateField", kind: 1024, flags: { isPrivate: true } }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].tags.visibility).toBe("private");
    });
  });

  describe("source extraction", () => {
    it("should extract source location", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "TestClass",
            kind: 128,
            flags: {},
            sources: [{ fileName: "src/test.ts", line: 42 }],
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].source.repo).toBe("langchain-ai/langchainjs");
      expect(symbols[0].source.sha).toBe("abc123");
      expect(symbols[0].source.path).toBe("src/test.ts");
      expect(symbols[0].source.line).toBe(42);
    });

    it("should handle missing source gracefully", () => {
      const project = createMockProject({
        children: [{ id: 1, name: "NoSourceClass", kind: 128, flags: {} }],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].source.path).toBe("");
      expect(symbols[0].source.line).toBe(0);
    });
  });

  describe("docs extraction", () => {
    it("should extract summary from comment", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "DocumentedClass",
            kind: 128,
            flags: {},
            comment: {
              summary: [{ kind: "text", text: "This is a documented class." }],
            },
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].docs.summary).toBe("This is a documented class.");
    });

    it("should extract examples from block tags", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "ExampleClass",
            kind: 128,
            flags: {},
            comment: {
              summary: [{ kind: "text", text: "A class with examples." }],
              blockTags: [
                {
                  tag: "@example",
                  content: [
                    {
                      kind: "text",
                      text: "```typescript\nconst x = new ExampleClass();\n```",
                    },
                  ],
                },
              ],
            },
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].docs.examples).toBeDefined();
      expect(symbols[0].docs.examples!.length).toBe(1);
      expect(symbols[0].docs.examples![0].code).toContain("new ExampleClass()");
    });

    it("should detect deprecated status", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "DeprecatedClass",
            kind: 128,
            flags: {},
            comment: {
              summary: [{ kind: "text", text: "An old class." }],
              blockTags: [
                {
                  tag: "@deprecated",
                  content: [{ kind: "text", text: "Use NewClass instead." }],
                },
              ],
            },
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols[0].docs.deprecated?.isDeprecated).toBe(true);
      expect(symbols[0].docs.deprecated?.message).toBe("Use NewClass instead.");
      expect(symbols[0].tags.stability).toBe("deprecated");
    });
  });

  describe("external symbols filtering", () => {
    it("should skip symbols from node_modules", () => {
      const project = createMockProject({
        children: [
          {
            id: 1,
            name: "ExternalType",
            kind: 128,
            flags: {},
            sources: [{ fileName: "node_modules/some-package/types.d.ts", line: 10 }],
          },
          {
            id: 2,
            name: "InternalType",
            kind: 128,
            flags: {},
            sources: [{ fileName: "src/types.ts", line: 5 }],
          },
        ],
      });

      const transformer = new TypeDocTransformer(
        project,
        "@langchain/core",
        "langchain-ai/langchainjs",
        "abc123",
      );

      const symbols = transformer.transform();
      expect(symbols.length).toBe(1);
      expect(symbols[0].name).toBe("InternalType");
    });
  });
});
