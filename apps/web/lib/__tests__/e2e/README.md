# E2E Tests

End-to-end tests for the LangChain Reference documentation site.

## Test Suites

### 1. MCP Server Tests (Vitest)

Tests for the MCP server integration using `@langchain/mcp-adapters`.

#### Prerequisites

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

#### Running MCP Tests

```bash
# Run all e2e tests
pnpm test:e2e

# Run with custom server URL
MCP_TEST_URL=http://localhost:3000 pnpm test:e2e

# Run in watch mode
pnpm test:e2e:watch
```

#### Test Files

- **`mcp-api.e2e.test.ts`** - MCP tool tests using `MultiServerMCPClient`:
  - Tool loading from MCP server (`search_api`, `get_symbol`)
  - Direct tool invocation
  - Search functionality with filters
  - Symbol documentation retrieval
  - Error handling for unknown symbols

- **`mcp-agent.e2e.test.ts`** - Agent-based integration tests:
  - MCP tools loading via `@langchain/mcp-adapters`
  - Agent tool invocation with LangChain's `createAgent`
  - Multi-step tool usage workflows

### 2. Symbol Resolution Tests (WebdriverIO)

Browser-based tests that verify symbols can be resolved and pages render properly using headless Chrome.

#### Link Check: Prerequisites

No manual setup required! The tests use a custom WebdriverIO service that automatically:

- Starts the Next.js development server
- Waits for the server to be ready
- Shuts down the server after tests complete

#### Running WebdriverIO Tests

```bash
# Run symbol resolution e2e tests
pnpm test:e2e:wdio

# Run with debug output
DEBUG=true pnpm test:e2e:wdio

# Run against a specific base URL (skips dev server startup)
BASE_URL=https://staging.example.com pnpm test:e2e:wdio
```

#### Link Check: Test Files

- **`wdio/symbol-resolution.wdio.test.ts`** - Symbol resolution tests:
  - Page navigation across all projects and languages
  - Link navigation between packages and symbols
  - Language switching via URL
  - Content verification (documentation, code blocks, member cards)
  - Error handling for invalid symbols
  - Performance benchmarks

#### Configuration

- **`wdio.conf.ts`** - WebdriverIO configuration
- **`services/DevServerService.ts`** - Custom service to bootstrap the Next.js dev server

#### Test Coverage

The tests cover sample pages from:

- **LangChain** (Python, JavaScript)
- **LangGraph** (Python, JavaScript)
- **LangSmith** (Python, JavaScript, Java, Go)

## Notes

### MCP Tests

- E2E tests require the Next.js server to be running
- Agent tests require an LLM API key and will be skipped if none is set
- Agent tests have longer timeouts (60-90s) due to LLM API calls
- The MCP server URL defaults to `http://localhost:3000`

### WebdriverIO Tests

- Uses headless Chrome for browser automation
- Screenshots are saved on test failure in `./screenshots/`
- The dev server is automatically started and stopped
- Tests run in parallel (3 instances locally, 1 in CI)
