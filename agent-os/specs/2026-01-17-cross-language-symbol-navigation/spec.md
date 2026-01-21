# Specification: Cross-Language Symbol Navigation

**Spec ID**: `2026-01-17-cross-language-symbol-navigation`  
**Created**: January 17, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Target State](#3-target-state)
4. [Explicit Symbol Mappings](#4-explicit-symbol-mappings)
5. [Symbol Matching Algorithm](#5-symbol-matching-algorithm)
6. [API Design](#6-api-design)
7. [UI/UX Design](#7-uiux-design)
8. [Implementation Plan](#8-implementation-plan)
9. [Edge Cases & Safety](#9-edge-cases--safety)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

When a user switches between Python and JavaScript using the language dropdown, they should be navigated to the **equivalent symbol** in the other language, not just the language landing page. This creates a fluent, context-preserving experience for developers comparing implementations across languages.

### 1.2 Problem Statement

The current language switcher navigates to `/${langId}` (the language root), losing the user's context:

```typescript
// Current behavior in LanguageDropdown.tsx
const handleLanguageChange = (langId: string) => {
  if (langId === currentLang) return;
  router.push(`/${langId}`); // ❌ Loses symbol context
};
```

Users viewing a specific symbol (e.g., `BaseMessage` in JavaScript) expect to land on the equivalent Python symbol (e.g., `BaseMessage` in `langchain-core`), not start over at the Python landing page.

### 1.3 Scope

**In scope:**

- Approximate symbol matching across Python ↔ JavaScript using name normalization (camelCase ↔ snake_case)
- Language dropdown enhancement to preserve symbol context
- Mobile project menu enhancement for language switching
- Server-side API endpoint for cross-language symbol resolution
- Graceful fallbacks when no match is found

**Out of scope:**

- Exact 1:1 symbol mapping (symbols may not have equivalents in both languages)
- Package mapping configuration (symbols may exist in different packages across languages)
- Custom alias definitions for non-matching symbol names
- Search modal language toggle (already navigates to search results, not symbols)

### 1.4 Example Scenarios

| Source URL                                                                | Target Language | Expected Target URL                                               |
| ------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| `/javascript/langchain/index/BaseMessage`                                 | Python          | `/python/langchain-core/messages/base/BaseMessage`                |
| `/python/langchain-core/embeddings/embeddings/Embeddings/embed_documents` | JavaScript      | `/javascript/langchain-core/embeddings/Embeddings/embedDocuments` |
| `/javascript/langchain/index/createAgent`                                 | Python          | `/python/langchain/agents/factory/create_agent`                   |
| `/python/langgraph/graph/StateGraph`                                      | JavaScript      | `/javascript/langgraph/graph/StateGraph`                          |

---

## 2. Current State

### 2.1 Language Dropdown Behavior

The `LanguageDropdown` component (`apps/web/components/layout/LanguageDropdown.tsx`) handles language switching:

```typescript
const handleLanguageChange = (langId: string) => {
  if (langId === currentLang) return;
  router.push(`/${langId}`); // Always goes to language root
};
```

### 2.2 Mobile Project Menu

The `MobileProjectMenu` component (`apps/web/components/layout/MobileProjectMenu.tsx`) has hardcoded language links:

```tsx
<Link href={`/python/${currentProject?.slug || "langchain"}`}>Python</Link>
<Link href={`/javascript/${currentProject?.slug || "langchain"}`}>JavaScript</Link>
```

### 2.3 Available Data for Matching

The existing infrastructure provides:

1. **Search Index** (`/api/search/query`) - MiniSearch index with symbol names, qualified names, and URLs for each language
2. **Symbol Lookup Index** - Maps qualified names to symbol IDs per package
3. **Routing Map** - Maps URL slugs to symbol metadata (kind, title) per package
4. **Cross-Project Packages** - Maps module prefixes to known symbols for type linking

### 2.4 URL Structure

Current URL patterns:

```
/{language}/{package-slug}/{symbol-path...}

Examples:
/javascript/langchain/index/BaseMessage
/python/langchain-core/messages/base/BaseMessage
/python/langchain/agents/factory/create_agent
```

The symbol path can include:

- Module path segments (e.g., `messages/base`)
- Symbol name (e.g., `BaseMessage`)
- Member names (e.g., `embed_documents`)

---

## 3. Target State

### 3.1 Enhanced Language Switching

When switching languages:

1. Extract the current symbol name from the URL
2. Normalize the symbol name for cross-language matching
3. Search for matching symbols in the target language
4. Navigate to the best match, or fall back gracefully

### 3.2 Matching Priority

1. **Exact name match** - Same symbol name exists in target language
2. **Normalized name match** - camelCase ↔ snake_case conversion matches
3. **Similar name match** - Fuzzy match with high confidence score
4. **Package fallback** - Navigate to equivalent package if no symbol match
5. **Language fallback** - Navigate to language landing page

### 3.3 User Experience

**Success case:**

```
User is on: /javascript/langchain/index/BaseMessage
User clicks: Python
Navigation:  /python/langchain-core/messages/base/BaseMessage ✓
```

**No exact match case:**

```
User is on: /javascript/some-package/UniqueJsClass
User clicks: Python
Navigation:  /python (with toast: "No equivalent found for UniqueJsClass")
```

---

## 4. Explicit Symbol Mappings

### 4.1 Overview

For important symbols where automatic name normalization may fail or produce ambiguous results, we maintain a **hardcoded mapping table**. This ensures critical symbols always navigate to the correct equivalent, regardless of naming differences.

The explicit mappings are checked **first**, before any algorithmic matching is attempted.

### 4.2 Mapping Configuration

**File:** `apps/web/lib/symbol-mappings.ts`

```typescript
/**
 * Explicit cross-language symbol mappings.
 *
 * These mappings take priority over algorithmic matching.
 * Format: { [sourceSymbol]: targetSymbol } where symbols use the pattern:
 *   "{package}/{symbolPath}"
 *
 * Use "*" as package to match any package.
 */
export const SYMBOL_MAPPINGS: {
  /** JavaScript → Python mappings */
  jsToPython: Record<string, string>;
  /** Python → JavaScript mappings */
  pythonToJs: Record<string, string>;
} = {
  jsToPython: {
    // =========================================================================
    // CORE MESSAGE TYPES
    // =========================================================================
    "langchain/index/BaseMessage": "langchain-core/messages/base/BaseMessage",
    "langchain/index/HumanMessage": "langchain-core/messages/human/HumanMessage",
    "langchain/index/AIMessage": "langchain-core/messages/ai/AIMessage",
    "langchain/index/SystemMessage": "langchain-core/messages/system/SystemMessage",
    "langchain/index/FunctionMessage": "langchain-core/messages/function/FunctionMessage",
    "langchain/index/ToolMessage": "langchain-core/messages/tool/ToolMessage",
    "langchain/index/ChatMessage": "langchain-core/messages/chat/ChatMessage",
    "langchain-core/messages/BaseMessage": "langchain-core/messages/base/BaseMessage",
    "langchain-core/messages/HumanMessage": "langchain-core/messages/human/HumanMessage",
    "langchain-core/messages/AIMessage": "langchain-core/messages/ai/AIMessage",
    "langchain-core/messages/SystemMessage": "langchain-core/messages/system/SystemMessage",

    // =========================================================================
    // LANGUAGE MODELS
    // =========================================================================
    "langchain-core/language_models/BaseChatModel":
      "langchain-core/language_models/chat_models/BaseChatModel",
    "langchain-core/language_models/BaseLLM": "langchain-core/language_models/llms/BaseLLM",
    "langchain-openai/ChatOpenAI": "langchain-openai/chat_models/ChatOpenAI",
    "langchain-anthropic/ChatAnthropic": "langchain-anthropic/chat_models/ChatAnthropic",
    "langchain-google-genai/ChatGoogleGenerativeAI":
      "langchain-google-genai/chat_models/ChatGoogleGenerativeAI",

    // =========================================================================
    // EMBEDDINGS
    // =========================================================================
    "langchain-core/embeddings/Embeddings": "langchain-core/embeddings/embeddings/Embeddings",
    "langchain-core/embeddings/Embeddings/embedDocuments":
      "langchain-core/embeddings/embeddings/Embeddings/embed_documents",
    "langchain-core/embeddings/Embeddings/embedQuery":
      "langchain-core/embeddings/embeddings/Embeddings/embed_query",
    "langchain-openai/OpenAIEmbeddings": "langchain-openai/embeddings/OpenAIEmbeddings",

    // =========================================================================
    // AGENTS
    // =========================================================================
    "langchain/index/createAgent": "langchain/agents/factory/create_agent",
    "langchain/agents/createOpenAIFunctionsAgent":
      "langchain/agents/openai_functions_agent/base/create_openai_functions_agent",
    "langchain/agents/createReactAgent": "langchain/agents/react/agent/create_react_agent",
    "langchain/agents/createToolCallingAgent":
      "langchain/agents/tool_calling_agent/base/create_tool_calling_agent",
    "langchain/agents/AgentExecutor": "langchain/agents/agent/AgentExecutor",

    // =========================================================================
    // RUNNABLES
    // =========================================================================
    "langchain-core/runnables/Runnable": "langchain-core/runnables/base/Runnable",
    "langchain-core/runnables/RunnableSequence": "langchain-core/runnables/base/RunnableSequence",
    "langchain-core/runnables/RunnableParallel": "langchain-core/runnables/base/RunnableParallel",
    "langchain-core/runnables/RunnableLambda": "langchain-core/runnables/base/RunnableLambda",
    "langchain-core/runnables/RunnablePassthrough":
      "langchain-core/runnables/passthrough/RunnablePassthrough",
    "langchain-core/runnables/RunnableBranch": "langchain-core/runnables/branch/RunnableBranch",
    "langchain-core/runnables/RunnableConfig": "langchain-core/runnables/config/RunnableConfig",

    // =========================================================================
    // PROMPTS
    // =========================================================================
    "langchain-core/prompts/ChatPromptTemplate": "langchain-core/prompts/chat/ChatPromptTemplate",
    "langchain-core/prompts/PromptTemplate": "langchain-core/prompts/prompt/PromptTemplate",
    "langchain-core/prompts/MessagesPlaceholder": "langchain-core/prompts/chat/MessagesPlaceholder",
    "langchain-core/prompts/SystemMessagePromptTemplate":
      "langchain-core/prompts/chat/SystemMessagePromptTemplate",
    "langchain-core/prompts/HumanMessagePromptTemplate":
      "langchain-core/prompts/chat/HumanMessagePromptTemplate",
    "langchain-core/prompts/AIMessagePromptTemplate":
      "langchain-core/prompts/chat/AIMessagePromptTemplate",

    // =========================================================================
    // OUTPUT PARSERS
    // =========================================================================
    "langchain-core/output_parsers/StrOutputParser":
      "langchain-core/output_parsers/string/StrOutputParser",
    "langchain-core/output_parsers/JsonOutputParser":
      "langchain-core/output_parsers/json/JsonOutputParser",
    "langchain-core/output_parsers/PydanticOutputParser":
      "langchain-core/output_parsers/pydantic/PydanticOutputParser",

    // =========================================================================
    // DOCUMENT LOADERS
    // =========================================================================
    "langchain-core/documents/Document": "langchain-core/documents/base/Document",
    "langchain-core/document_loaders/BaseLoader": "langchain-core/document_loaders/base/BaseLoader",

    // =========================================================================
    // VECTOR STORES
    // =========================================================================
    "langchain-core/vectorstores/VectorStore": "langchain-core/vectorstores/base/VectorStore",
    "langchain-core/vectorstores/VectorStoreRetriever":
      "langchain-core/vectorstores/base/VectorStoreRetriever",

    // =========================================================================
    // TEXT SPLITTERS
    // =========================================================================
    "langchain-textsplitters/RecursiveCharacterTextSplitter":
      "langchain-text-splitters/character/RecursiveCharacterTextSplitter",
    "langchain-textsplitters/CharacterTextSplitter":
      "langchain-text-splitters/character/CharacterTextSplitter",
    "langchain-textsplitters/TokenTextSplitter": "langchain-text-splitters/base/TokenTextSplitter",

    // =========================================================================
    // RETRIEVERS
    // =========================================================================
    "langchain-core/retrievers/BaseRetriever": "langchain-core/retrievers/BaseRetriever",

    // =========================================================================
    // TOOLS
    // =========================================================================
    "langchain-core/tools/tool": "langchain-core/tools/tool",
    "langchain-core/tools/StructuredTool": "langchain-core/tools/base/StructuredTool",
    "langchain-core/tools/BaseTool": "langchain-core/tools/base/BaseTool",

    // =========================================================================
    // LANGGRAPH
    // =========================================================================
    "langgraph/graph/StateGraph": "langgraph/graph/state/StateGraph",
    "langgraph/graph/MessageGraph": "langgraph/graph/message/MessageGraph",
    "langgraph/graph/Graph": "langgraph/graph/graph/Graph",
    "langgraph/graph/END": "langgraph/constants/END",
    "langgraph/graph/START": "langgraph/constants/START",
    "langgraph/prebuilt/createReactAgent":
      "langgraph/prebuilt/react_agent_executor/create_react_agent",
    "langgraph/prebuilt/ToolNode": "langgraph/prebuilt/tool_node/ToolNode",
    "langgraph/checkpoint/MemorySaver": "langgraph/checkpoint/memory/MemorySaver",
    "langgraph/checkpoint/BaseCheckpointSaver": "langgraph/checkpoint/base/BaseCheckpointSaver",

    // =========================================================================
    // LANGSMITH
    // =========================================================================
    "langsmith/Client": "langsmith/client/Client",
    "langsmith/traceable": "langsmith/run_helpers/traceable",
    "langsmith/wrappers/wrapOpenAI": "langsmith/wrappers/wrap_openai",
  },

  pythonToJs: {
    // =========================================================================
    // CORE MESSAGE TYPES
    // =========================================================================
    "langchain-core/messages/base/BaseMessage": "langchain-core/messages/BaseMessage",
    "langchain-core/messages/human/HumanMessage": "langchain-core/messages/HumanMessage",
    "langchain-core/messages/ai/AIMessage": "langchain-core/messages/AIMessage",
    "langchain-core/messages/system/SystemMessage": "langchain-core/messages/SystemMessage",
    "langchain-core/messages/function/FunctionMessage": "langchain-core/messages/FunctionMessage",
    "langchain-core/messages/tool/ToolMessage": "langchain-core/messages/ToolMessage",
    "langchain-core/messages/chat/ChatMessage": "langchain-core/messages/ChatMessage",

    // =========================================================================
    // LANGUAGE MODELS
    // =========================================================================
    "langchain-core/language_models/chat_models/BaseChatModel":
      "langchain-core/language_models/BaseChatModel",
    "langchain-core/language_models/llms/BaseLLM": "langchain-core/language_models/BaseLLM",
    "langchain-openai/chat_models/ChatOpenAI": "langchain-openai/ChatOpenAI",
    "langchain-anthropic/chat_models/ChatAnthropic": "langchain-anthropic/ChatAnthropic",
    "langchain-google-genai/chat_models/ChatGoogleGenerativeAI":
      "langchain-google-genai/ChatGoogleGenerativeAI",

    // =========================================================================
    // EMBEDDINGS
    // =========================================================================
    "langchain-core/embeddings/embeddings/Embeddings": "langchain-core/embeddings/Embeddings",
    "langchain-core/embeddings/embeddings/Embeddings/embed_documents":
      "langchain-core/embeddings/Embeddings/embedDocuments",
    "langchain-core/embeddings/embeddings/Embeddings/embed_query":
      "langchain-core/embeddings/Embeddings/embedQuery",
    "langchain-openai/embeddings/OpenAIEmbeddings": "langchain-openai/OpenAIEmbeddings",

    // =========================================================================
    // AGENTS
    // =========================================================================
    "langchain/agents/factory/create_agent": "langchain/agents/createAgent",
    "langchain/agents/openai_functions_agent/base/create_openai_functions_agent":
      "langchain/agents/createOpenAIFunctionsAgent",
    "langchain/agents/react/agent/create_react_agent": "langchain/agents/createReactAgent",
    "langchain/agents/tool_calling_agent/base/create_tool_calling_agent":
      "langchain/agents/createToolCallingAgent",
    "langchain/agents/agent/AgentExecutor": "langchain/agents/AgentExecutor",

    // =========================================================================
    // RUNNABLES
    // =========================================================================
    "langchain-core/runnables/base/Runnable": "langchain-core/runnables/Runnable",
    "langchain-core/runnables/base/RunnableSequence": "langchain-core/runnables/RunnableSequence",
    "langchain-core/runnables/base/RunnableParallel": "langchain-core/runnables/RunnableParallel",
    "langchain-core/runnables/base/RunnableLambda": "langchain-core/runnables/RunnableLambda",
    "langchain-core/runnables/passthrough/RunnablePassthrough":
      "langchain-core/runnables/RunnablePassthrough",
    "langchain-core/runnables/branch/RunnableBranch": "langchain-core/runnables/RunnableBranch",
    "langchain-core/runnables/config/RunnableConfig": "langchain-core/runnables/RunnableConfig",

    // =========================================================================
    // PROMPTS
    // =========================================================================
    "langchain-core/prompts/chat/ChatPromptTemplate": "langchain-core/prompts/ChatPromptTemplate",
    "langchain-core/prompts/prompt/PromptTemplate": "langchain-core/prompts/PromptTemplate",
    "langchain-core/prompts/chat/MessagesPlaceholder": "langchain-core/prompts/MessagesPlaceholder",
    "langchain-core/prompts/chat/SystemMessagePromptTemplate":
      "langchain-core/prompts/SystemMessagePromptTemplate",
    "langchain-core/prompts/chat/HumanMessagePromptTemplate":
      "langchain-core/prompts/HumanMessagePromptTemplate",
    "langchain-core/prompts/chat/AIMessagePromptTemplate":
      "langchain-core/prompts/AIMessagePromptTemplate",

    // =========================================================================
    // OUTPUT PARSERS
    // =========================================================================
    "langchain-core/output_parsers/string/StrOutputParser":
      "langchain-core/output_parsers/StrOutputParser",
    "langchain-core/output_parsers/json/JsonOutputParser":
      "langchain-core/output_parsers/JsonOutputParser",
    "langchain-core/output_parsers/pydantic/PydanticOutputParser":
      "langchain-core/output_parsers/JsonOutputParser",

    // =========================================================================
    // DOCUMENT LOADERS
    // =========================================================================
    "langchain-core/documents/base/Document": "langchain-core/documents/Document",
    "langchain-core/document_loaders/base/BaseLoader": "langchain-core/document_loaders/BaseLoader",

    // =========================================================================
    // VECTOR STORES
    // =========================================================================
    "langchain-core/vectorstores/base/VectorStore": "langchain-core/vectorstores/VectorStore",
    "langchain-core/vectorstores/base/VectorStoreRetriever":
      "langchain-core/vectorstores/VectorStoreRetriever",

    // =========================================================================
    // TEXT SPLITTERS
    // =========================================================================
    "langchain-text-splitters/character/RecursiveCharacterTextSplitter":
      "langchain-textsplitters/RecursiveCharacterTextSplitter",
    "langchain-text-splitters/character/CharacterTextSplitter":
      "langchain-textsplitters/CharacterTextSplitter",
    "langchain-text-splitters/base/TokenTextSplitter": "langchain-textsplitters/TokenTextSplitter",

    // =========================================================================
    // RETRIEVERS
    // =========================================================================
    "langchain-core/retrievers/BaseRetriever": "langchain-core/retrievers/BaseRetriever",

    // =========================================================================
    // TOOLS
    // =========================================================================
    "langchain-core/tools/tool": "langchain-core/tools/tool",
    "langchain-core/tools/base/StructuredTool": "langchain-core/tools/StructuredTool",
    "langchain-core/tools/base/BaseTool": "langchain-core/tools/BaseTool",

    // =========================================================================
    // LANGGRAPH
    // =========================================================================
    "langgraph/graph/state/StateGraph": "langgraph/graph/StateGraph",
    "langgraph/graph/message/MessageGraph": "langgraph/graph/MessageGraph",
    "langgraph/graph/graph/Graph": "langgraph/graph/Graph",
    "langgraph/constants/END": "langgraph/graph/END",
    "langgraph/constants/START": "langgraph/graph/START",
    "langgraph/prebuilt/react_agent_executor/create_react_agent":
      "langgraph/prebuilt/createReactAgent",
    "langgraph/prebuilt/tool_node/ToolNode": "langgraph/prebuilt/ToolNode",
    "langgraph/checkpoint/memory/MemorySaver": "langgraph/checkpoint/MemorySaver",
    "langgraph/checkpoint/base/BaseCheckpointSaver": "langgraph/checkpoint/BaseCheckpointSaver",

    // =========================================================================
    // LANGSMITH
    // =========================================================================
    "langsmith/client/Client": "langsmith/Client",
    "langsmith/run_helpers/traceable": "langsmith/traceable",
    "langsmith/wrappers/wrap_openai": "langsmith/wrappers/wrapOpenAI",
  },
};
```

### 4.3 Symbol Name Aliases

For symbols that have completely different names across languages (not just case differences), maintain an alias table:

```typescript
/**
 * Symbol name aliases for symbols with different names across languages.
 * These are checked after explicit path mappings but before algorithmic matching.
 *
 * Format: Maps a symbol name to its equivalent in the other language.
 */
export const SYMBOL_ALIASES: {
  jsToPython: Record<string, string>;
  pythonToJs: Record<string, string>;
} = {
  jsToPython: {
    // Naming convention differences
    embedDocuments: "embed_documents",
    embedQuery: "embed_query",
    createAgent: "create_agent",
    createReactAgent: "create_react_agent",
    createOpenAIFunctionsAgent: "create_openai_functions_agent",
    createToolCallingAgent: "create_tool_calling_agent",
    wrapOpenAI: "wrap_openai",

    // Complete name differences
    JsonOutputParser: "JsonOutputParser", // Same in both
    PydanticOutputParser: "PydanticOutputParser", // Same name

    // React-specific (no Python equivalent)
    // These return null/undefined to trigger fallback
  },

  pythonToJs: {
    // Naming convention differences (inverse)
    embed_documents: "embedDocuments",
    embed_query: "embedQuery",
    create_agent: "createAgent",
    create_react_agent: "createReactAgent",
    create_openai_functions_agent: "createOpenAIFunctionsAgent",
    create_tool_calling_agent: "createToolCallingAgent",
    wrap_openai: "wrapOpenAI",
  },
};
```

### 4.4 Matching Priority with Explicit Mappings

The resolution algorithm now follows this priority:

1. **Explicit path mapping** - Check `SYMBOL_MAPPINGS` for full path match
2. **Explicit name alias** - Check `SYMBOL_ALIASES` for symbol name translation
3. **Exact name match** - Same symbol name exists in target language
4. **Normalized name match** - camelCase ↔ snake_case conversion matches
5. **Fuzzy match** - Similar name with high confidence score
6. **Package fallback** - Navigate to equivalent package
7. **Language fallback** - Navigate to language landing page

```typescript
async function resolveSymbol(
  symbolPath: string,
  sourceLanguage: "python" | "javascript",
  targetLanguage: "python" | "javascript",
): Promise<MatchResult> {
  // 1. Check explicit path mappings first (highest priority)
  const mappings =
    sourceLanguage === "javascript" ? SYMBOL_MAPPINGS.jsToPython : SYMBOL_MAPPINGS.pythonToJs;

  if (mappings[symbolPath]) {
    return {
      url: `/${targetLanguage}/${mappings[symbolPath]}`,
      score: 1.0,
      matchType: "explicit",
    };
  }

  // 2. Check symbol name aliases
  const symbolName = extractSymbolName(symbolPath);
  const aliases =
    sourceLanguage === "javascript" ? SYMBOL_ALIASES.jsToPython : SYMBOL_ALIASES.pythonToJs;

  const aliasedName = aliases[symbolName];
  if (aliasedName) {
    // Search for the aliased name in target language
    const results = await searchSymbols(aliasedName, targetLanguage);
    if (results.length > 0) {
      return {
        url: results[0].url,
        score: 0.98,
        matchType: "alias",
        matchedSymbol: aliasedName,
      };
    }
  }

  // 3. Fall through to algorithmic matching...
  return algorithmicMatch(symbolPath, targetLanguage);
}
```

### 4.5 Adding New Mappings

New mappings can be added by updating the `SYMBOL_MAPPINGS` or `SYMBOL_ALIASES` objects:

1. **For full path mappings** - Add to `SYMBOL_MAPPINGS.jsToPython` and/or `pythonToJs`
2. **For name-only aliases** - Add to `SYMBOL_ALIASES.jsToPython` and/or `pythonToJs`

**Guidelines for adding mappings:**

- Add mappings for symbols that are frequently accessed
- Add mappings for symbols where automatic matching fails
- Keep mappings bidirectional (if A→B exists, B→A should too)
- Group related symbols together with comments

---

## 5. Symbol Matching Algorithm

### 5.1 Name Normalization

Symbols in Python use `snake_case` while JavaScript uses `camelCase`. The matching algorithm normalizes names for comparison:

```typescript
interface NormalizedSymbol {
  /** Original symbol name */
  name: string;
  /** Lowercase, no separators (for comparison) */
  normalized: string;
  /** Additional search terms (acronyms, parts) */
  searchTerms: string[];
}

function normalizeSymbolName(name: string): NormalizedSymbol {
  // Convert to lowercase and remove separators for comparison
  // "embedDocuments" -> "embeddocuments"
  // "embed_documents" -> "embeddocuments"
  const normalized = name
    .toLowerCase()
    .replace(/_/g, "")
    .replace(/([a-z])([A-Z])/g, "$1$2")
    .toLowerCase();

  // Extract word parts for partial matching
  const parts = name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split("_")
    .filter(Boolean);

  return {
    name,
    normalized,
    searchTerms: [name.toLowerCase(), ...parts],
  };
}
```

**Examples:**

| Original          | Normalized       | Search Terms                                |
| ----------------- | ---------------- | ------------------------------------------- |
| `embedDocuments`  | `embeddocuments` | `["embeddocuments", "embed", "documents"]`  |
| `embed_documents` | `embeddocuments` | `["embed_documents", "embed", "documents"]` |
| `BaseMessage`     | `basemessage`    | `["basemessage", "base", "message"]`        |
| `create_agent`    | `createagent`    | `["create_agent", "create", "agent"]`       |
| `createAgent`     | `createagent`    | `["createagent", "create", "agent"]`        |

### 4.2 Matching Algorithm

```typescript
interface MatchResult {
  url: string;
  score: number;
  matchType: "exact" | "normalized" | "fuzzy" | "package" | "language";
}

async function findCrossLanguageMatch(
  sourceUrl: string,
  targetLanguage: "python" | "javascript",
): Promise<MatchResult> {
  // 1. Parse source URL to extract symbol info
  const { symbolName, packageSlug, symbolPath } = parseSymbolUrl(sourceUrl);

  // 2. Normalize the symbol name
  const normalized = normalizeSymbolName(symbolName);

  // 3. Search in target language
  const searchResults = await searchSymbols(normalized.normalized, targetLanguage);

  // 4. Score and rank results
  const rankedResults = searchResults
    .map((result) => ({
      ...result,
      score: calculateMatchScore(normalized, result),
    }))
    .sort((a, b) => b.score - a.score);

  // 5. Return best match or fallback
  if (rankedResults.length > 0 && rankedResults[0].score >= MATCH_THRESHOLD) {
    return {
      url: rankedResults[0].url,
      score: rankedResults[0].score,
      matchType: rankedResults[0].score === 1 ? "exact" : "normalized",
    };
  }

  // 6. Fallback to package or language
  return findFallback(packageSlug, targetLanguage);
}
```

### 4.3 Match Scoring

```typescript
function calculateMatchScore(source: NormalizedSymbol, target: SearchResult): number {
  const targetNormalized = normalizeSymbolName(target.title);

  // Exact name match
  if (source.name === target.title) {
    return 1.0;
  }

  // Normalized match (camelCase ↔ snake_case)
  if (source.normalized === targetNormalized.normalized) {
    return 0.95;
  }

  // Partial match (symbol name contains/contained by)
  if (
    source.normalized.includes(targetNormalized.normalized) ||
    targetNormalized.normalized.includes(source.normalized)
  ) {
    return 0.7;
  }

  // Word overlap scoring
  const sourceWords = new Set(source.searchTerms);
  const targetWords = new Set(targetNormalized.searchTerms);
  const overlap = [...sourceWords].filter((w) => targetWords.has(w)).length;
  const totalWords = Math.max(sourceWords.size, targetWords.size);

  return (overlap / totalWords) * 0.5;
}

const MATCH_THRESHOLD = 0.6; // Minimum score to accept a match
```

---

## 6. API Design

### 6.1 Cross-Language Resolution Endpoint

Create a new API endpoint for resolving cross-language symbol matches:

**Endpoint:** `GET /api/resolve-symbol`

**Query Parameters:**

| Parameter        | Type                     | Required | Description                       |
| ---------------- | ------------------------ | -------- | --------------------------------- |
| `symbolName`     | string                   | Yes      | The symbol name to find           |
| `targetLanguage` | `python` \| `javascript` | Yes      | Target language                   |
| `sourcePackage`  | string                   | No       | Source package slug (for context) |
| `sourceLanguage` | `python` \| `javascript` | No       | Source language (for context)     |

**Response:**

```typescript
interface ResolveSymbolResponse {
  /** Whether a match was found */
  found: boolean;

  /** The target URL to navigate to */
  targetUrl: string;

  /** Match type for UI feedback */
  matchType: "exact" | "normalized" | "fuzzy" | "package" | "language";

  /** Match confidence (0-1) */
  score: number;

  /** Matched symbol name (if different from query) */
  matchedSymbol?: string;

  /** Additional context for the match */
  context?: {
    package: string;
    module: string;
  };
}
```

**Example Request:**

```
GET /api/resolve-symbol?symbolName=embedDocuments&targetLanguage=python&sourcePackage=langchain-core
```

**Example Response:**

```json
{
  "found": true,
  "targetUrl": "/python/langchain-core/embeddings/embeddings/Embeddings/embed_documents",
  "matchType": "normalized",
  "score": 0.95,
  "matchedSymbol": "embed_documents",
  "context": {
    "package": "langchain-core",
    "module": "embeddings.embeddings"
  }
}
```

### 6.2 Implementation

**File:** `apps/web/app/api/resolve-symbol/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchSymbols, normalizeSymbolName, calculateMatchScore } from "@/lib/symbol-resolution";

export async function GET(request: NextRequest) {
  const symbolName = request.nextUrl.searchParams.get("symbolName");
  const targetLanguage = request.nextUrl.searchParams.get("targetLanguage");
  const sourcePackage = request.nextUrl.searchParams.get("sourcePackage");

  if (!symbolName || !targetLanguage) {
    return NextResponse.json(
      { error: "Missing required parameters: symbolName, targetLanguage" },
      { status: 400 },
    );
  }

  if (!["python", "javascript"].includes(targetLanguage)) {
    return NextResponse.json(
      { error: "Invalid targetLanguage. Must be 'python' or 'javascript'" },
      { status: 400 },
    );
  }

  const result = await resolveSymbol(
    symbolName,
    targetLanguage as "python" | "javascript",
    sourcePackage || undefined,
  );

  return NextResponse.json(result);
}
```

---

## 7. UI/UX Design

### 7.1 Language Dropdown Enhancement

Update `LanguageDropdown` to use the resolution API:

```typescript
const handleLanguageChange = async (langId: string) => {
  if (langId === currentLang) return;

  // Try to find equivalent symbol
  const symbolName = extractSymbolNameFromPath(pathname);
  const sourcePackage = extractPackageFromPath(pathname);

  if (symbolName) {
    try {
      const response = await fetch(
        `/api/resolve-symbol?${new URLSearchParams({
          symbolName,
          targetLanguage: langId,
          sourcePackage: sourcePackage || "",
          sourceLanguage: currentLang || "",
        })}`,
      );

      const result = await response.json();

      if (result.found && result.score >= 0.6) {
        router.push(result.targetUrl);

        // Show toast for non-exact matches
        if (result.matchType !== "exact") {
          toast.info(`Navigated to ${result.matchedSymbol || symbolName}`);
        }
        return;
      }
    } catch (error) {
      console.error("Symbol resolution failed:", error);
    }
  }

  // Fallback to language root
  router.push(`/${langId}`);
};
```

### 7.2 Loading State

Show a brief loading indicator while resolving:

```tsx
const [isResolving, setIsResolving] = useState(false);

const handleLanguageChange = async (langId: string) => {
  setIsResolving(true);
  try {
    // ... resolution logic
  } finally {
    setIsResolving(false);
  }
};

// In render:
<button disabled={isResolving}>
  {isResolving ? <Spinner /> : currentLanguage.icon}
  {currentLanguage.name}
</button>;
```

### 7.3 Feedback Messages

Provide user feedback for different match types:

| Match Type   | User Feedback                                           |
| ------------ | ------------------------------------------------------- |
| `exact`      | (No message - seamless navigation)                      |
| `normalized` | Toast: "Navigated to `{matchedSymbol}`"                 |
| `fuzzy`      | Toast: "Best match: `{matchedSymbol}` in `{package}`"   |
| `package`    | Toast: "Symbol not found. Showing `{package}` package." |
| `language`   | Toast: "No equivalent found for `{symbolName}`"         |

### 7.4 Mobile Project Menu Enhancement

Update `MobileProjectMenu` with the same resolution logic:

```tsx
const handleLanguageClick = async (lang: string) => {
  // Resolve symbol before navigation
  const result = await resolveSymbol(currentSymbol, lang);
  onClose();
  router.push(result.targetUrl);
};
```

---

## 8. Implementation Plan

### 8.1 Phase 1: Symbol Mappings Configuration

**New file:** `apps/web/lib/symbol-mappings.ts`

1. Create `SYMBOL_MAPPINGS` object with bidirectional mappings
2. Create `SYMBOL_ALIASES` object for name-only translations
3. Add helper functions to look up mappings
4. Export for use in resolution library

### 8.2 Phase 2: Symbol Resolution Library

**New file:** `apps/web/lib/symbol-resolution.ts`

1. Import and integrate `SYMBOL_MAPPINGS` and `SYMBOL_ALIASES`
2. Implement `checkExplicitMapping()` function
3. Implement `normalizeSymbolName()` function
4. Implement `calculateMatchScore()` function
5. Implement `searchTargetLanguage()` using existing MiniSearch
6. Implement `resolveSymbol()` main function with mapping priority
7. Add unit tests

### 8.3 Phase 3: API Endpoint

**New file:** `apps/web/app/api/resolve-symbol/route.ts`

1. Create the API route handler
2. Validate request parameters
3. Call resolution library (checks explicit mappings first)
4. Return structured response
5. Add caching headers

### 8.4 Phase 4: Language Dropdown Enhancement

**Modified file:** `apps/web/components/layout/LanguageDropdown.tsx`

1. Add `extractSymbolNameFromPath()` utility
2. Implement async `handleLanguageChange()`
3. Add loading state
4. Add error handling with fallback
5. Add toast notifications (optional)

### 8.5 Phase 5: Mobile Menu Enhancement

**Modified file:** `apps/web/components/layout/MobileProjectMenu.tsx`

1. Convert static links to async handlers
2. Share resolution logic with LanguageDropdown
3. Maintain consistent behavior across devices

### 8.6 Phase 6: Testing & Polish

1. End-to-end tests for language switching
2. Test all explicit mappings are working
3. Test edge cases (no match, API failure, etc.)
4. Performance optimization (caching, preloading)
5. Accessibility audit

---

## 9. Edge Cases & Safety

### 9.1 No Match Found

If no matching symbol exists in the target language:

1. Try to find a matching package
2. Fall back to language landing page
3. Show informative toast message

```typescript
if (!match || match.score < MATCH_THRESHOLD) {
  // Try package-level match
  const packageMatch = findEquivalentPackage(sourcePackage, targetLanguage);
  if (packageMatch) {
    return {
      found: false,
      targetUrl: `/${targetLanguage}/${packageMatch}`,
      matchType: "package",
      score: 0,
    };
  }

  // Ultimate fallback
  return {
    found: false,
    targetUrl: `/${targetLanguage}`,
    matchType: "language",
    score: 0,
  };
}
```

### 9.2 API Failure

If the resolution API fails, fall back gracefully:

```typescript
try {
  const result = await resolveSymbol(...);
  router.push(result.targetUrl);
} catch (error) {
  console.error('Resolution failed, using fallback:', error);
  router.push(`/${targetLanguage}`);
}
```

### 9.3 Ambiguous Matches

If multiple symbols have similar scores:

- Prefer symbols in the equivalent package
- Prefer symbols of the same kind (class→class, function→function)
- Use the first result if still ambiguous

### 9.4 Performance Considerations

1. **Client-side caching**: Cache resolution results in memory
2. **Debouncing**: Don't resolve while user is hovering over dropdown
3. **Prefetching**: Consider preloading the other language's search index
4. **Response caching**: Add `Cache-Control` headers to API response

### 9.5 Member Symbol Matching

For symbols with members (e.g., `/python/.../Embeddings/embed_documents`):

1. First try to match the full path (`Embeddings.embed_documents`)
2. Then try to match just the member (`embed_documents`)
3. Fall back to matching the parent (`Embeddings`)

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

| ID  | Requirement                                                                 | Priority |
| --- | --------------------------------------------------------------------------- | -------- |
| R1  | Explicit symbol mappings are checked first before algorithmic matching      | P0       |
| R2  | Switching from JS `BaseMessage` to Python navigates to Python `BaseMessage` | P0       |
| R3  | Switching from Python `embed_documents` to JS navigates to `embedDocuments` | P0       |
| R4  | camelCase ↔ snake_case normalization works correctly                        | P0       |
| R5  | Falls back to language page when no match found                             | P0       |
| R6  | Shows appropriate feedback for non-exact matches                            | P1       |
| R7  | Works on mobile project menu                                                | P0       |
| R8  | Handles API failures gracefully                                             | P0       |
| R9  | Resolves member symbols (methods, properties)                               | P1       |
| R10 | Prefers symbols in equivalent packages                                      | P2       |
| R11 | All symbols in `SYMBOL_MAPPINGS` resolve correctly                          | P0       |
| R12 | Symbol aliases translate names before search                                | P1       |

### 10.2 Quality Requirements

| ID  | Requirement                             | Target             |
| --- | --------------------------------------- | ------------------ |
| Q1  | Resolution API response time            | < 200ms            |
| Q2  | Match accuracy for common symbols       | > 90%              |
| Q3  | UI remains responsive during resolution | No perceptible lag |
| Q4  | Error rate for resolution API           | < 0.1%             |

### 10.3 Test Cases

| Test                     | Input                                             | Expected Output                                          |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------- |
| Explicit mapping (JS→Py) | JS `langchain/index/BaseMessage` → Python         | `/python/langchain-core/messages/base/BaseMessage`       |
| Explicit mapping (Py→JS) | Py `langchain-core/messages/base/BaseMessage`     | `/javascript/langchain-core/messages/BaseMessage`        |
| Explicit agent mapping   | JS `langchain/index/createAgent` → Python         | `/python/langchain/agents/factory/create_agent`          |
| Exact match              | JS `StateGraph` → Python                          | `/python/langgraph/graph/StateGraph`                     |
| snake_case → camelCase   | Py `embed_documents` → JS                         | `/javascript/.../embedDocuments`                         |
| camelCase → snake_case   | JS `createAgent` → Python                         | `/python/.../create_agent`                               |
| No match (JS-only)       | JS `ReactComponent` → Python                      | `/python` + toast                                        |
| Member symbol            | Py `Embeddings.embed_documents` → JS              | `/javascript/.../Embeddings/embedDocuments`              |
| Package fallback         | JS `langchain-core/Xyz` → Python                  | `/python/langchain-core`                                 |
| LangGraph mapping        | JS `langgraph/prebuilt/createReactAgent` → Python | `/python/langgraph/prebuilt/react.../create_react_agent` |
| LangSmith mapping        | JS `langsmith/traceable` → Python                 | `/python/langsmith/run_helpers/traceable`                |

---

## Appendix A: Package Equivalence Table

For reference, common package mappings between languages:

| JavaScript Package     | Python Package        |
| ---------------------- | --------------------- |
| `langchain`            | `langchain`           |
| `@langchain/core`      | `langchain_core`      |
| `@langchain/langgraph` | `langgraph`           |
| `@langchain/community` | `langchain_community` |
| `@langchain/openai`    | `langchain_openai`    |
| `@langchain/anthropic` | `langchain_anthropic` |
| `langsmith`            | `langsmith`           |

---

## Appendix B: Symbol Name Conventions

| Concept        | Python Convention  | JavaScript Convention |
| -------------- | ------------------ | --------------------- |
| Class names    | `PascalCase`       | `PascalCase`          |
| Method names   | `snake_case`       | `camelCase`           |
| Function names | `snake_case`       | `camelCase`           |
| Constants      | `UPPER_SNAKE_CASE` | `UPPER_SNAKE_CASE`    |
| Variables      | `snake_case`       | `camelCase`           |

The normalization algorithm handles all these cases by converting to a canonical lowercase form without separators.

---

## Appendix C: Maintaining Symbol Mappings

### C.1 When to Add New Mappings

Add explicit mappings when:

1. **Automatic matching fails** - Symbol has completely different structure/location across languages
2. **Symbol is important** - Heavily used symbols that users frequently navigate between
3. **Naming differences** - Symbol names differ beyond simple case conversion
4. **Package differences** - Symbol lives in different packages (e.g., `langchain/index` → `langchain-core/messages`)

### C.2 How to Add New Mappings

1. Open `apps/web/lib/symbol-mappings.ts`
2. Add the mapping to both `jsToPython` and `pythonToJs` in `SYMBOL_MAPPINGS`
3. Use the format: `"{package}/{symbolPath}": "{targetPackage}/{targetPath}"`
4. Group with related symbols and add section comments
5. Run tests to verify the mapping works

**Example:**

```typescript
// Adding a new message type
jsToPython: {
  // ... existing mappings
  "langchain-core/messages/NewMessageType": "langchain-core/messages/new/NewMessageType",
},
pythonToJs: {
  // ... existing mappings
  "langchain-core/messages/new/NewMessageType": "langchain-core/messages/NewMessageType",
}
```

### C.3 Validating Mappings

The build process should validate that:

1. All mapped URLs resolve to real symbols
2. Mappings are bidirectional (if A→B exists, B→A should too)
3. No duplicate or conflicting mappings exist

A validation script can be run periodically:

```bash
pnpm run validate-symbol-mappings
```

### C.4 Coverage Goals

Target explicit mappings for:

- **All core message types** (BaseMessage, HumanMessage, AIMessage, etc.)
- **All major base classes** (BaseChatModel, Runnable, VectorStore, etc.)
- **All agent factory functions** (createAgent, createReactAgent, etc.)
- **All LangGraph primitives** (StateGraph, END, START, MemorySaver, etc.)
- **All LangSmith client methods** (Client, traceable, etc.)
- **Top 100 most-accessed symbols** (based on analytics if available)

---

_End of Specification_
