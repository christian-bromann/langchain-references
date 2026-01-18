/**
 * Symbol Mappings for Cross-Language Navigation
 *
 * This module provides hardcoded bidirectional mappings between JavaScript and Python
 * symbols, enabling seamless navigation when users switch languages in the documentation.
 *
 * Mappings are checked BEFORE algorithmic matching for important symbols that require
 * explicit translation due to:
 * - Different package structures (e.g., langchain/index → langchain-core/messages)
 * - Different module paths (e.g., flat vs nested)
 * - Naming convention differences beyond simple camelCase ↔ snake_case
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Bidirectional symbol mappings between languages.
 * Keys are source paths (package/symbolPath), values are target paths.
 */
export interface SymbolMappings {
  /** JavaScript → Python path mappings */
  jsToPython: Record<string, string>;
  /** Python → JavaScript path mappings */
  pythonToJs: Record<string, string>;
}

/**
 * Symbol name aliases for camelCase ↔ snake_case translations.
 * Used when the symbol name itself differs between languages.
 */
export interface SymbolAliases {
  /** JavaScript → Python name aliases */
  jsToPython: Record<string, string>;
  /** Python → JavaScript name aliases */
  pythonToJs: Record<string, string>;
}

export type Language = "python" | "javascript";

// =============================================================================
// Explicit Symbol Mappings
// =============================================================================

/**
 * Explicit cross-language symbol mappings.
 *
 * These mappings take priority over algorithmic matching.
 * Format: { [sourceSymbol]: targetSymbol } where symbols use the pattern:
 *   "{package}/{symbolPath}"
 */
export const SYMBOL_MAPPINGS: SymbolMappings = {
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
    "langchain-core/prompts/MessagesPlaceholder":
      "langchain-core/prompts/chat/MessagesPlaceholder",
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
    "langchain-core/document_loaders/BaseLoader":
      "langchain-core/document_loaders/base/BaseLoader",

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
    "langchain-textsplitters/TokenTextSplitter":
      "langchain-text-splitters/base/TokenTextSplitter",

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
    "langchain/agents/factory/create_agent": "langchain/index/createAgent",
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
    "langchain-core/prompts/chat/MessagesPlaceholder":
      "langchain-core/prompts/MessagesPlaceholder",
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

// =============================================================================
// Symbol Name Aliases
// =============================================================================

/**
 * Symbol name aliases for symbols with different names across languages.
 * These are checked after explicit path mappings but before algorithmic matching.
 *
 * Format: Maps a symbol name to its equivalent in the other language.
 */
export const SYMBOL_ALIASES: SymbolAliases = {
  jsToPython: {
    // Naming convention differences (camelCase → snake_case)
    embedDocuments: "embed_documents",
    embedQuery: "embed_query",
    createAgent: "create_agent",
    createReactAgent: "create_react_agent",
    createOpenAIFunctionsAgent: "create_openai_functions_agent",
    createToolCallingAgent: "create_tool_calling_agent",
    wrapOpenAI: "wrap_openai",
    addNode: "add_node",
    addEdge: "add_edge",
    addConditionalEdges: "add_conditional_edges",
    getGraph: "get_graph",
    invokeAsync: "ainvoke",
    streamAsync: "astream",
  },

  pythonToJs: {
    // Naming convention differences (snake_case → camelCase)
    embed_documents: "embedDocuments",
    embed_query: "embedQuery",
    create_agent: "createAgent",
    create_react_agent: "createReactAgent",
    create_openai_functions_agent: "createOpenAIFunctionsAgent",
    create_tool_calling_agent: "createToolCallingAgent",
    wrap_openai: "wrapOpenAI",
    add_node: "addNode",
    add_edge: "addEdge",
    add_conditional_edges: "addConditionalEdges",
    get_graph: "getGraph",
    ainvoke: "invoke",
    astream: "stream",
  },
};

// =============================================================================
// Package Equivalence Table
// =============================================================================

/**
 * Maps JavaScript package slugs to their Python equivalents and vice versa.
 */
export const PACKAGE_EQUIVALENCE: {
  jsToPython: Record<string, string>;
  pythonToJs: Record<string, string>;
} = {
  jsToPython: {
    langchain: "langchain",
    "langchain-core": "langchain-core",
    "langchain-community": "langchain-community",
    "langchain-openai": "langchain-openai",
    "langchain-anthropic": "langchain-anthropic",
    "langchain-google-genai": "langchain-google-genai",
    "langchain-textsplitters": "langchain-text-splitters",
    langgraph: "langgraph",
    langsmith: "langsmith",
    deepagents: "deepagents",
  },
  pythonToJs: {
    langchain: "langchain",
    "langchain-core": "langchain-core",
    "langchain-community": "langchain-community",
    "langchain-openai": "langchain-openai",
    "langchain-anthropic": "langchain-anthropic",
    "langchain-google-genai": "langchain-google-genai",
    "langchain-text-splitters": "langchain-textsplitters",
    langgraph: "langgraph",
    langsmith: "langsmith",
    deepagents: "deepagents",
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Look up an explicit mapping for a symbol path.
 *
 * @param symbolPath - The source symbol path (e.g., "langchain/index/BaseMessage")
 * @param sourceLanguage - The source language
 * @param targetLanguage - The target language
 * @returns The mapped target path, or null if no mapping exists
 */
export function getExplicitMapping(
  symbolPath: string,
  sourceLanguage: Language,
  targetLanguage: Language,
): string | null {
  if (sourceLanguage === targetLanguage) return null;

  const mappings = sourceLanguage === "javascript" ? SYMBOL_MAPPINGS.jsToPython : SYMBOL_MAPPINGS.pythonToJs;

  return mappings[symbolPath] ?? null;
}

/**
 * Look up an alias for a symbol name.
 *
 * @param symbolName - The symbol name (e.g., "embedDocuments")
 * @param sourceLanguage - The source language
 * @param targetLanguage - The target language
 * @returns The aliased name, or null if no alias exists
 */
export function getSymbolAlias(
  symbolName: string,
  sourceLanguage: Language,
  targetLanguage: Language,
): string | null {
  if (sourceLanguage === targetLanguage) return null;

  const aliases = sourceLanguage === "javascript" ? SYMBOL_ALIASES.jsToPython : SYMBOL_ALIASES.pythonToJs;

  return aliases[symbolName] ?? null;
}

/**
 * Get the equivalent package slug in the target language.
 *
 * @param packageSlug - The source package slug
 * @param sourceLanguage - The source language
 * @param targetLanguage - The target language
 * @returns The equivalent package slug, or null if no equivalent exists
 */
export function getEquivalentPackage(
  packageSlug: string,
  sourceLanguage: Language,
  targetLanguage: Language,
): string | null {
  if (sourceLanguage === targetLanguage) return packageSlug;

  const equivalence =
    sourceLanguage === "javascript" ? PACKAGE_EQUIVALENCE.jsToPython : PACKAGE_EQUIVALENCE.pythonToJs;

  return equivalence[packageSlug] ?? null;
}
