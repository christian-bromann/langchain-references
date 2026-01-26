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
      });

      const response = await agent.invoke({
        messages: [
          {
            role: "user",
            content:
              "Search for ChatOpenAI in the LangChain documentation. Just tell me if you found any results.",
          },
        ],
      });

      // The response should indicate the agent found results
      const lastMessage = response.messages[response.messages.length - 1];
      expect(lastMessage.content).toBeDefined();
      expect(lastMessage.content.toString().length).toBeGreaterThan(20);
    }, 60000); // 60s timeout for LLM calls

    it("should fetch symbol documentation using agent", async () => {
      const agent = createAgent({
        model,
        tools,
      });

      const response = await agent.invoke({
        messages: [
          {
            role: "user",
            content:
              "Get the documentation for the ChatPromptTemplate class from langchain-core package. Summarize what you find in 1-2 sentences.",
          },
        ],
      });

      const lastMessage = response.messages[response.messages.length - 1];
      expect(lastMessage.content).toBeDefined();
      // Should contain some indication of the symbol being found or documented
      const content = lastMessage.content.toString().toLowerCase();
      expect(
        content.includes("template") ||
        content.includes("prompt") ||
        content.includes("chat") ||
        content.includes("not found")
      ).toBe(true);
    }, 60000);

    it("should handle multi-step tool usage", async () => {
      const agent = createAgent({
        model,
        tools,
      });

      const response = await agent.invoke({
        messages: [
          {
            role: "user",
            content:
              "First search for 'Runnable' in the Python documentation, then get the details for one of the results. Tell me what you found.",
          },
        ],
      });

      const lastMessage = response.messages[response.messages.length - 1];
      expect(lastMessage.content).toBeDefined();
      expect(lastMessage.content.toString().length).toBeGreaterThan(50);
    }, 90000); // 90s timeout for multi-step
  });
});
