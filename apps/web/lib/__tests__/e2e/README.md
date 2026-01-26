# MCP Server E2E Tests

End-to-end tests for the LangChain Reference MCP server integration using `@langchain/mcp-adapters`.

## Prerequisites

1. **Start the development server:**

   ```bash
   pnpm dev
   ```

2. **Set API keys (for agent tests):**

   ```bash
   # For Anthropic Claude models
   export ANTHROPIC_API_KEY=your-api-key

   # OR for OpenAI models
   export OPENAI_API_KEY=your-api-key
   ```

## Running Tests

### Run all e2e tests

```bash
pnpm test:e2e
```

### Run with custom server URL

```bash
MCP_TEST_URL=http://localhost:3000 pnpm test:e2e
```

### Run in watch mode

```bash
pnpm test:e2e:watch
```

## Test Structure

### `mcp-api.e2e.test.ts`

MCP tool tests using `MultiServerMCPClient` that verify:

- Tool loading from MCP server (`search_api`, `get_symbol`)
- Direct tool invocation
- Search functionality with filters
- Symbol documentation retrieval
- Error handling for unknown symbols

### `mcp-agent.e2e.test.ts`

Agent-based integration tests that verify:

- MCP tools loading via `@langchain/mcp-adapters`
- Agent tool invocation with LangChain's `createAgent`
- Multi-step tool usage workflows

## Notes

- E2E tests require the Next.js server to be running
- Agent tests require an LLM API key and will be skipped if none is set
- Agent tests have longer timeouts (60-90s) due to LLM API calls
- The MCP server URL defaults to `http://localhost:3000`
