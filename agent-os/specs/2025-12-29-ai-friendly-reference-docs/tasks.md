# Tasks: AI-Friendly Reference Documentation

**Spec ID**: `2025-12-29-ai-friendly-reference-docs`  
**Created**: December 29, 2025

---

## Task Overview

| Group                  | Tasks | Estimated Effort |
| ---------------------- | ----- | ---------------- |
| 1. Foundation          | 3     | Small            |
| 2. Markdown Generation | 2     | Medium           |
| 3. Content Negotiation | 2     | Medium           |
| 4. Copy Page UI        | 3     | Medium           |
| 5. Context Menu        | 2     | Medium           |
| 6. llms.txt            | 2     | Small            |
| 7. MCP Server          | 3     | Large            |
| 8. Integration         | 2     | Medium           |

**Total**: 19 tasks

---

## Group 1: Foundation

Utility functions, types, and icon components needed by other features.

### Task 1.1: Create AI Icon Components

**Priority**: P0  
**Effort**: Small  
**Dependencies**: None

Create reusable SVG icon components for the context menu.

**Files to create**:

- `apps/web/components/icons/ai-icons.tsx`

**Implementation**:

```typescript
// Export all icons needed for the context menu:
// - CopyIcon (page copy icon)
// - MarkdownIcon (M↓ icon)
// - OpenAIIcon (OpenAI logo)
// - AnthropicIcon (Anthropic logo)
// - MCPIcon (chain/link icon)
// - CursorIcon (Cursor IDE logo)
// - VSCodeIcon (VS Code logo)
```

**Acceptance Criteria**:

- [x] All icons render correctly in light and dark mode
- [x] Icons accept className prop for sizing
- [x] Icons use currentColor for theming

---

### Task 1.2: Create Content Format Types

**Priority**: P0  
**Effort**: Small  
**Dependencies**: None

Define TypeScript types for content negotiation.

**Files to create**:

- `apps/web/lib/utils/content-negotiation.ts`

**Implementation**:

```typescript
export type ContentFormat = "html" | "markdown" | "json";

export interface RequestContext {
  headers: Headers;
  searchParams: URLSearchParams;
}
```

**Acceptance Criteria**:

- [x] Types exported and importable
- [x] No TypeScript errors

---

### Task 1.3: Create MCP Configuration

**Priority**: P1  
**Effort**: Small  
**Dependencies**: None

Configuration constants for MCP server URLs and deep links.

**Files to create**:

- `apps/web/lib/config/mcp.ts`

**Implementation**:

```typescript
export const MCP_CONFIG = {
  serverUrl: process.env.NEXT_PUBLIC_MCP_URL || "https://reference.langchain.com/mcp",
  cursorInstallUrl: (serverUrl: string) =>
    `cursor://mcp/install?url=${encodeURIComponent(serverUrl)}`,
  vscodeInstallUrl: (serverUrl: string) =>
    `vscode://mcp/install?url=${encodeURIComponent(serverUrl)}`,
};
```

**Acceptance Criteria**:

- [x] Configuration exports correctly
- [x] Environment variable fallback works

---

## Group 2: Markdown Generation

Core markdown generation from symbol data.

### Task 2.1: Implement Symbol to Markdown Converter

**Priority**: P0  
**Effort**: Medium  
**Dependencies**: None

Create the markdown generator that converts IR symbol data to clean markdown.

**Files to create**:

- `apps/web/lib/ir/markdown-generator.ts`

**Implementation**:

- `symbolToMarkdown(symbol, packageName, options)` function
- Handle all symbol kinds (class, function, interface, module, etc.)
- Include signature, description, parameters, returns, examples
- Optimize output for LLM token efficiency
- Include canonical URL and source link

**Acceptance Criteria**:

- [x] Generates valid markdown for all symbol kinds
- [x] Includes signature with proper code fencing
- [x] Parameters formatted as markdown table
- [x] Examples included with proper language tags
- [x] Source link included when available
- [x] Output is clean and parseable by LLMs

---

### Task 2.2: Add Markdown Generator Tests

**Priority**: P1  
**Effort**: Small  
**Dependencies**: Task 2.1

Unit tests for the markdown generator.

**Files to create**:

- `apps/web/lib/ir/__tests__/markdown-generator.test.ts`

**Implementation**:

- Test class symbol generation
- Test function symbol generation
- Test module symbol generation
- Test handling of missing fields
- Test examples and parameters formatting

**Acceptance Criteria**:

- [ ] Tests pass for all symbol kinds
- [ ] Edge cases covered (missing docs, no params, etc.)

---

## Group 3: Content Negotiation

Automatic format detection based on request headers and user agent.

### Task 3.1: Implement Request Format Detection

**Priority**: P0  
**Effort**: Medium  
**Dependencies**: Task 1.2

Implement the logic to detect requested content format.

**Files to modify**:

- `apps/web/lib/utils/content-negotiation.ts`

**Implementation**:

- `detectRequestedFormat(ctx: RequestContext): ContentFormat`
- Check `?format=md` query parameter first
- Check Accept header for `text/markdown`
- Check User-Agent for LLM patterns (GPTBot, Claude-Web, etc.)
- Check for CLI tools (curl, wget)
- Default to HTML for browsers

**LLM User Agent Patterns**:

```typescript
const llmPatterns = [
  "GPTBot",
  "ChatGPT-User",
  "Claude-Web",
  "Anthropic-AI",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "YouBot",
  "cohere-ai",
  "Bytespider",
  "cursor",
  "copilot",
  "aider",
  "continue",
];
```

**Acceptance Criteria**:

- [x] Query param takes precedence
- [x] Accept header detected correctly
- [x] Known LLM user agents return markdown
- [x] CLI tools without Accept header return markdown
- [x] Browsers return HTML

---

### Task 3.2: Integrate Content Negotiation into Routes

**Priority**: P0  
**Effort**: Medium  
**Dependencies**: Task 2.1, Task 3.1

Modify symbol page routes to serve markdown when appropriate.

**Files to modify**:

- `apps/web/app/(ref)/python/[...slug]/page.tsx`
- `apps/web/app/(ref)/javascript/[...slug]/page.tsx`

**Implementation**:

- Import `detectRequestedFormat` and `symbolToMarkdown`
- Check format at start of page component
- Return `Response` with markdown content-type for non-HTML
- Return `Response.json` for JSON format
- Continue with normal React rendering for HTML

**Note**: Implemented using middleware for content negotiation and a dedicated API route at `/api/ref/[lang]/[...slug]/route.ts`.

**Acceptance Criteria**:

- [x] `?format=md` returns markdown content
- [x] Correct Content-Type header set
- [x] Cache-Control headers included
- [x] HTML rendering unchanged for browsers

---

## Group 4: Copy Page UI

The copy button component for symbol pages.

### Task 4.1: Create Copy Page Button Component

**Priority**: P0  
**Effort**: Small  
**Dependencies**: Task 1.1

Create the copy button that copies markdown to clipboard.

**Files to create**:

- `apps/web/components/reference/CopyPageButton.tsx`

**Implementation**:

- Accept `markdown` prop with pre-generated content
- Use `navigator.clipboard.writeText`
- Show "Copied!" feedback with checkmark icon
- Reset after 2 seconds
- Match Mintlify styling (rounded-l-xl, border, hover states)

**Acceptance Criteria**:

- [x] Copies markdown to clipboard on click
- [x] Shows success feedback
- [x] Matches Mintlify design
- [x] Works in light and dark mode
- [x] Accessible (aria-label)

---

### Task 4.2: Create Responsive Copy Button Styles

**Priority**: P1  
**Effort**: Small  
**Dependencies**: Task 4.1

Ensure copy button works well on mobile.

**Files to modify**:

- `apps/web/components/reference/CopyPageButton.tsx`

**Implementation**:

- Hide text label on small screens (`hidden sm:inline`)
- Keep icon visible at all sizes
- Adjust padding for icon-only mode

**Acceptance Criteria**:

- [x] Icon-only on mobile
- [x] Full button with text on desktop
- [x] Touch-friendly tap target

---

### Task 4.3: Add Copy Button Tests

**Priority**: P2  
**Effort**: Small  
**Dependencies**: Task 4.1

Tests for the copy button component.

**Files to create**:

- `apps/web/components/reference/__tests__/CopyPageButton.test.tsx`

**Implementation**:

- Test clipboard write is called with correct content
- Test success state shows
- Test state resets after timeout

**Acceptance Criteria**:

- [ ] Tests pass
- [ ] Clipboard mock works correctly

---

## Group 5: Context Menu

The dropdown menu with AI-focused actions.

### Task 5.1: Create Page Context Menu Component

**Priority**: P0  
**Effort**: Medium  
**Dependencies**: Task 1.1, Task 1.3

Create the dropdown menu with all AI actions.

**Files to create**:

- `apps/web/components/reference/PageContextMenu.tsx`

**Implementation**:

- Use Radix UI DropdownMenu
- Accept props: `pageUrl`, `markdown`, `mcpServerUrl`, `llmsTxtUrl`
- Menu items:
  1. Copy page (copies markdown)
  2. View as Markdown (opens `?format=md` URL)
  3. llms.txt (links to `/llms.txt`)
  4. Separator
  5. Open in ChatGPT (constructs URL with markdown)
  6. Open in Claude (constructs URL with markdown)
  7. Separator
  8. Copy MCP Server (copies URL)
  9. Connect to Cursor (deep link)
  10. Connect to VS Code (deep link)
- Show check icon on successful copy
- Match Mintlify dropdown styling

**Acceptance Criteria**:

- [x] All menu items present and functional
- [x] Copy actions show success feedback
- [x] External links open in new tab
- [x] Keyboard navigation works
- [x] Matches Mintlify design

---

### Task 5.2: Add Radix UI Dropdown Menu Dependency

**Priority**: P0  
**Effort**: Small  
**Dependencies**: None

Install required Radix UI package.

**Files to modify**:

- `apps/web/package.json`

**Command**:

```bash
pnpm add @radix-ui/react-dropdown-menu
```

**Acceptance Criteria**:

- [x] Package installed
- [x] No version conflicts

---

## Group 6: llms.txt

Standard LLM index files.

### Task 6.1: Create llms.txt Route

**Priority**: P0  
**Effort**: Small  
**Dependencies**: None

Implement the `/llms.txt` endpoint.

**Files to create**:

- `apps/web/app/llms.txt/route.ts`

**Implementation**:

- GET handler returning plain text
- Include site overview and purpose
- List packages by language (Python/JavaScript)
- Include key classes with links
- Document `?format=md` API access
- Include MCP server URL
- Set appropriate caching headers

**Acceptance Criteria**:

- [x] Accessible at `/llms.txt`
- [x] Returns valid plain text
- [x] Includes package listings
- [x] Cache-Control header set

---

### Task 6.2: Create llms-full.txt Route

**Priority**: P2  
**Effort**: Small  
**Dependencies**: Task 6.1

Comprehensive symbol listing for LLMs.

**Files to create**:

- `apps/web/app/llms-full.txt/route.ts`

**Implementation**:

- GET handler returning plain text
- List all symbols grouped by package
- Include symbol summaries (truncated)
- Limit output size to prevent excessive length

**Acceptance Criteria**:

- [x] Accessible at `/llms-full.txt`
- [x] Lists symbols from all packages
- [x] Output size reasonable (<500KB)

---

## Group 7: MCP Server

Model Context Protocol server implementation.

### Task 7.1: Create MCP Server Endpoint

**Priority**: P1  
**Effort**: Large  
**Dependencies**: Task 2.1

Implement the MCP JSON-RPC endpoint.

**Files to create**:

- `apps/web/app/mcp/route.ts`

**Implementation**:

- POST handler for MCP protocol
- Handle `initialize` method
- Handle `tools/list` method (return available tools)
- Handle `tools/call` method (execute tools)
- Handle `resources/list` method
- Handle `resources/read` method

**Tools to implement**:

1. `search_api` - Search symbols by query
2. `get_symbol` - Get detailed symbol documentation

**Acceptance Criteria**:

- [x] Responds to MCP initialize
- [x] Lists available tools
- [x] Executes search_api tool
- [x] Executes get_symbol tool
- [x] Returns proper JSON-RPC responses

---

### Task 7.2: Implement MCP Search Tool

**Priority**: P1  
**Effort**: Medium  
**Dependencies**: Task 7.1

Implement the search functionality for MCP.

**Files to modify**:

- `apps/web/app/mcp/route.ts`

**Implementation**:

- `searchSymbols(query, language)` helper function
- Search by symbol name
- Return formatted results with links
- Limit result count

**Acceptance Criteria**:

- [x] Searches return relevant symbols
- [x] Results include URLs
- [x] Results formatted as markdown

---

### Task 7.3: Add MCP Server Tests

**Priority**: P2  
**Effort**: Medium  
**Dependencies**: Task 7.1, Task 7.2

Tests for MCP server functionality.

**Files to create**:

- `apps/web/app/mcp/__tests__/route.test.ts`

**Implementation**:

- Test initialize response
- Test tools/list response
- Test tools/call with search_api
- Test tools/call with get_symbol
- Test error handling

**Acceptance Criteria**:

- [ ] All MCP methods tested
- [ ] Error cases covered

---

## Group 8: Integration

Connect all components together.

### Task 8.1: Integrate Copy Button and Context Menu into SymbolPage

**Priority**: P0  
**Effort**: Medium  
**Dependencies**: Task 2.1, Task 4.1, Task 5.1

Add the copy button and context menu to the symbol page header.

**Files to modify**:

- `apps/web/components/reference/SymbolPage.tsx`

**Implementation**:

- Import CopyPageButton and PageContextMenu
- Generate markdown using symbolToMarkdown
- Build URLs (pageUrl, mcpServerUrl, llmsTxtUrl)
- Add button group to header layout
- Position in top-right of header area

**Acceptance Criteria**:

- [x] Copy button visible on all symbol pages
- [x] Context menu opens and functions
- [x] Layout doesn't break on mobile
- [x] Markdown content is accurate

---

### Task 8.2: End-to-End Testing

**Priority**: P1  
**Effort**: Medium  
**Dependencies**: All previous tasks

Comprehensive E2E tests for all features.

**Files to create**:

- `apps/web/e2e/ai-friendly.spec.ts`

**Implementation**:

- Test copy button visibility
- Test copy to clipboard functionality
- Test context menu opens
- Test markdown format response
- Test llms.txt accessibility
- Test MCP basic response

**Acceptance Criteria**:

- [ ] All E2E tests pass
- [ ] Tests run in CI

---

## Task Dependency Graph

```
Group 1 (Foundation)
├── 1.1 Icons ──────────────────────┐
├── 1.2 Types ──────────────────────┤
└── 1.3 MCP Config ─────────────────┤
                                    │
Group 2 (Markdown)                  │
├── 2.1 Generator ──────────────────┼──┐
└── 2.2 Tests ◄─────────────────────┘  │
                                       │
Group 3 (Content Negotiation)          │
├── 3.1 Detection ◄── 1.2              │
└── 3.2 Routes ◄────── 2.1, 3.1        │
                                       │
Group 4 (Copy Button)                  │
├── 4.1 Button ◄────── 1.1             │
├── 4.2 Responsive ◄── 4.1             │
└── 4.3 Tests ◄─────── 4.1             │
                                       │
Group 5 (Context Menu)                 │
├── 5.1 Menu ◄──────── 1.1, 1.3        │
└── 5.2 Radix ─────────────────────────┤
                                       │
Group 6 (llms.txt)                     │
├── 6.1 Basic ─────────────────────────┤
└── 6.2 Full ◄──────── 6.1             │
                                       │
Group 7 (MCP Server)                   │
├── 7.1 Endpoint ◄───── 2.1            │
├── 7.2 Search ◄─────── 7.1            │
└── 7.3 Tests ◄──────── 7.1, 7.2       │
                                       │
Group 8 (Integration)                  │
├── 8.1 SymbolPage ◄─── 2.1, 4.1, 5.1  │
└── 8.2 E2E Tests ◄──── ALL            │
```

---

## Implementation Order

**Phase 1 - Foundation** (Day 1 morning)

1. Task 5.2: Install Radix UI
2. Task 1.1: Create icon components
3. Task 1.2: Create types
4. Task 1.3: Create MCP config

**Phase 2 - Core Functionality** (Day 1 afternoon)

1. Task 2.1: Markdown generator
2. Task 3.1: Request format detection
3. Task 4.1: Copy page button

**Phase 3 - UI Components** (Day 2 morning)

1. Task 5.1: Context menu
2. Task 4.2: Responsive button
3. Task 8.1: SymbolPage integration

**Phase 4 - Routes** (Day 2 afternoon)

1. Task 3.2: Content negotiation in routes
2. Task 6.1: llms.txt route
3. Task 6.2: llms-full.txt route

**Phase 5 - MCP Server** (Day 3)

1. Task 7.1: MCP endpoint
2. Task 7.2: MCP search tool

**Phase 6 - Testing** (Day 3 afternoon)

1. Task 2.2: Markdown generator tests
2. Task 4.3: Copy button tests
3. Task 7.3: MCP tests
4. Task 8.2: E2E tests

---

## Notes

- **Radix UI**: Already may be in project - check package.json first
- **Content Negotiation**: May require middleware or route handler pattern change
- **MCP Protocol**: Follow spec at https://modelcontextprotocol.io
- **Testing**: Prioritize E2E tests for user-facing features

---

_End of Tasks_
