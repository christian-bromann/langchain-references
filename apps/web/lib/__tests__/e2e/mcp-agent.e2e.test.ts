/**
 * MCP Agent E2E Tests
 *
 * Tests the MCP server integration using LangChain agents.
 * Verifies that an AI agent can successfully use the MCP tools to search
 * and retrieve symbol documentation.
 *
 * Prerequisites:
 * - Next.js dev server running at MCP_TEST_URL
 * - ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable set
 *
 * Run with: MCP_TEST_URL=http://localhost:3000 pnpm test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

const SearchResultSchema = z.object({
  foundResults: z.boolean().describe("Whether any search results were found"),
  resultCount: z.number().describe("The number of results found"),
});

const SymbolDocumentationSchema = z.object({
  found: z.boolean().describe("Whether the symbol documentation was found"),
  symbolName: z.string().describe("The name of the symbol"),
  description: z.string().describe("A brief description of the symbol"),
});

const MultiStepResultSchema = z.object({
  searchPerformed: z.boolean().describe("Whether the search was performed"),
  symbolFound: z.boolean().describe("Whether a symbol was found and retrieved"),
  symbolName: z.string().describe("The name of the symbol that was retrieved"),
  symbolType: z
    .string()
    .describe("The type of the symbol (e.g., class, function, interface)"),
});

const MCP_TEST_URL = process.env.MCP_TEST_URL || "http://localhost:3000";

// Skip tests if no API key is available
const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
const openAIModel = process.env.OPENAI_MODEL || "gpt-5.2";
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const model = process.env.ANTHROPIC_API_KEY ? anthropicModel : openAIModel;

describe.skipIf(!hasApiKey)("MCP Agent Integration", () => {
  let client: MultiServerMCPClient;
  let tools: StructuredToolInterface[];

  beforeAll(async () => {
    // Create MCP client connecting to our reference server
    client = new MultiServerMCPClient({
      "langchain-reference": {
        transport: "http",
        url: `${MCP_TEST_URL}/mcp`,
      },
    });

    // Load tools from the MCP server
    tools = await client.getTools();
  });

  afterAll(async () => {
    // Clean up MCP client connection
    if (client) {
      await client.close?.();
    }
  });

  describe("Agent with MCP tools", () => {
    it("should search for symbols using agent", async () => {
      const agent = createAgent({
        model,
        tools,
        responseFormat: SearchResultSchema,
      });

      const response = await agent.invoke({
        messages: [
          {
            role: "user",
            content:
              "Search for ChatOpenAI in the LangChain documentation. Report the results in the required JSON format.",
          },
        ],
      });

      const lastMessage = response.messages[response.messages.length - 1];
      expect(lastMessage.content).toBeDefined();
      const result = response.structuredResponse;
      expect(result.foundResults).toBe(true);
      expect(result.resultCount).toBeGreaterThan(0);
    }, 60000); // 60s timeout for LLM calls

    it("should fetch symbol documentation using agent", async () => {
      const agent = createAgent({
        model,
        tools,
        responseFormat: SymbolDocumentationSchema,
      });

      const response = await agent.invoke({
        messages: [
          {
            role: "user",
            content:
              "Get the documentation for the ChatPromptTemplate class from langchain-core package. Report your findings in the required JSON format.",
          },
        ],
      });

      const lastMessage = response.messages[response.messages.length - 1];
      expect(lastMessage.content).toBeDefined();
      const result = response.structuredResponse;
      expect(result.found).toBe(true);
      expect(result.symbolName.toLowerCase()).toContain("chatprompttemplate");
      expect(result.description).toBeTruthy();
    }, 60000);

    it("should handle multi-step tool usage", async () => {
      const agent = createAgent({
        model,
        tools,
        responseFormat: MultiStepResultSchema,
      });

      const response = await agent.invoke({
        messages: [
          {
            role: "user",
            content:
              "First search for 'Runnable' in the Python documentation, then get the details for one of the results. Report your findings in the required JSON format.",
          },
        ],
      });

      const lastMessage = response.messages[response.messages.length - 1];
      expect(lastMessage.content).toBeDefined();
      const result = response.structuredResponse;
      expect(result.searchPerformed).toBe(true);
      expect(result.symbolFound).toBe(true);
      expect(result.symbolName).toBeTruthy();
      expect(result.symbolName.toLowerCase()).toContain("runnable");
      expect(result.symbolType).toBeTruthy();
    }, 90000); // 90s timeout for multi-step
  });
});
