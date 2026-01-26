/**
 * MCP Server API E2E Tests
 *
 * Tests the MCP server using @langchain/mcp-adapters.
 * These tests require the Next.js dev server to be running.
 *
 * Run with: MCP_TEST_URL=http://localhost:3000 pnpm test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";

const MCP_TEST_URL = process.env.MCP_TEST_URL || "http://localhost:3000";

describe("MCP Server API", () => {
  let client: MultiServerMCPClient;
  let tools: StructuredToolInterface[];

  beforeAll(async () => {
    client = new MultiServerMCPClient({
      "langchain-reference": {
        transport: "http",
        url: `${MCP_TEST_URL}/mcp`,
      },
    });

    tools = await client.getTools();
  });

  afterAll(async () => {
    if (client) {
      await client.close?.();
    }
  });

  describe("tools/list", () => {
    it("should load tools from the MCP server", () => {
      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThanOrEqual(2);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("search_api");
      expect(toolNames).toContain("get_symbol");
    });

    it("should have correct tool schemas for search_api", () => {
      const searchTool = tools.find((t) => t.name === "search_api");
      expect(searchTool).toBeDefined();
      expect(searchTool!.description).toContain("Search");
    });

    it("should have correct tool schemas for get_symbol", () => {
      const symbolTool = tools.find((t) => t.name === "get_symbol");
      expect(symbolTool).toBeDefined();
      expect(symbolTool!.description).toContain("documentation");
    });
  });

  describe("search_api tool", () => {
    it("should search for symbols by query", async () => {
      const searchTool = tools.find((t) => t.name === "search_api");
      expect(searchTool).toBeDefined();

      const result = await searchTool!.invoke({
        query: "ChatOpenAI",
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(result).toContain("Search Results");
    });

    it("should filter by language", async () => {
      const searchTool = tools.find((t) => t.name === "search_api");

      const result = await searchTool!.invoke({
        query: "ChatOpenAI",
        language: "python",
      });

      expect(result).toContain("Python");
      // Should not contain JavaScript results
      expect(result).not.toMatch(/Language: JavaScript/i);
    });

    it("should respect limit parameter", async () => {
      const searchTool = tools.find((t) => t.name === "search_api");

      const result = await searchTool!.invoke({
        query: "Chat",
        limit: 3,
      });

      // Count the number of "##" headers (each result has one)
      const resultCount = (String(result).match(/^## /gm) || []).length;
      expect(resultCount).toBeLessThanOrEqual(3);
    });

    it("should return helpful message for no results", async () => {
      const searchTool = tools.find((t) => t.name === "search_api");

      const result = await searchTool!.invoke({
        query: "xyznonexistentsymbolxyz",
      });

      expect(result).toContain("No symbols found");
    });
  });

  describe("get_symbol tool", () => {
    it("should fetch symbol documentation", async () => {
      const symbolTool = tools.find((t) => t.name === "get_symbol");
      expect(symbolTool).toBeDefined();

      // This test requires actual data - adjust package/symbol as needed
      const result = await symbolTool!.invoke({
        package: "langchain-core",
        symbol: "ChatPromptTemplate",
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      expect(String(result).length).toBeGreaterThan(100);
    });

    it("should return not found message for unknown symbol", async () => {
      const symbolTool = tools.find((t) => t.name === "get_symbol");

      const result = await symbolTool!.invoke({
        package: "langchain-core",
        symbol: "NonExistentSymbol",
      });

      expect(result).toContain("not found");
      expect(result).toContain("search_api");
    });
  });
});
