// oxlint-disable no-console
/**
 * MCP Server Route
 *
 * Model Context Protocol endpoint for AI assistants in IDEs.
 * Provides tools for searching and retrieving API documentation.
 *
 * @see https://modelcontextprotocol.io
 */

import { NextRequest } from "next/server";
import { getBuildIdForLanguage, getManifestData, getSymbols, getSymbolData } from "@/lib/ir/loader";
import { symbolToMarkdown } from "@/lib/ir/markdown-generator";
import { getBaseUrl } from "@/lib/config/mcp";
import { getEnabledProjects } from "@/lib/config/projects";
import { slugifyPackageName, slugifySymbolPath, unslugifyPackageName } from "@/lib/utils/url";
import type { SymbolRecord } from "@langchain/ir-schema";

// =============================================================================
// Types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface SearchResult {
  name: string;
  qualifiedName: string;
  kind: string;
  package: string;
  language: "python" | "typescript";
  summary: string;
  url: string;
}

// =============================================================================
// MCP Server Configuration
// =============================================================================

const MCP_PROTOCOL_VERSION = "2024-11-05";
const MCP_SERVER_NAME = "langchain-reference";
const MCP_SERVER_VERSION = "1.0.0";

const TOOLS: McpTool[] = [
  {
    name: "search_api",
    description:
      "Search the LangChain API reference documentation for classes, functions, and other symbols.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (class name, function name, or keyword)",
        },
        language: {
          type: "string",
          enum: ["python", "javascript", "java", "go"],
          description: "Programming language to search (defaults to all if not specified)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 10, max: 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_symbol",
    description:
      "Get detailed documentation for a specific symbol including signature, parameters, and examples.",
    inputSchema: {
      type: "object",
      properties: {
        package: {
          type: "string",
          description: "Package name (e.g., langchain-core, @langchain/core)",
        },
        symbol: {
          type: "string",
          description:
            "Symbol name or qualified path (e.g., ChatOpenAI, langchain_openai.ChatOpenAI)",
        },
      },
      required: ["package", "symbol"],
    },
  },
];

const RESOURCES: McpResource[] = [
  {
    uri: "langchain://llms.txt",
    name: "LangChain API Reference Index",
    description: "Index of all available API documentation",
    mimeType: "text/plain",
  },
];

// =============================================================================
// Route Handler
// =============================================================================

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as JsonRpcRequest;
    const { method, params, id } = body;

    switch (method) {
      case "initialize":
        return handleInitialize(id);

      case "tools/list":
        return handleToolsList(id);

      case "tools/call":
        return handleToolCall(params as Record<string, unknown>, id);

      case "resources/list":
        return handleResourcesList(id);

      case "resources/read":
        return handleResourceRead(params as Record<string, unknown>, id);

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    console.error("MCP Error:", error);
    return jsonRpcError(0, -32700, "Parse error");
  }
}

// =============================================================================
// MCP Method Handlers
// =============================================================================

function handleInitialize(id: string | number): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  });
}

function handleToolsList(id: string | number): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      tools: TOOLS,
    },
  });
}

function handleResourcesList(id: string | number): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      resources: RESOURCES,
    },
  });
}

async function handleToolCall(
  params: Record<string, unknown>,
  id: string | number,
): Promise<Response> {
  const { name, arguments: args } = params as {
    name: string;
    arguments: Record<string, unknown>;
  };

  switch (name) {
    case "search_api":
      return handleSearchApi(args, id);

    case "get_symbol":
      return handleGetSymbol(args, id);

    default:
      return jsonRpcError(id, -32601, `Unknown tool: ${name}`);
  }
}

async function handleResourceRead(
  params: Record<string, unknown>,
  id: string | number,
): Promise<Response> {
  const { uri } = params as { uri: string };

  if (uri === "langchain://llms.txt") {
    // Fetch the llms.txt content
    const baseUrl = getBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/llms.txt`);
      const text = await response.text();

      return Response.json({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text,
            },
          ],
        },
      });
    } catch {
      return jsonRpcError(id, -32002, `Failed to fetch resource: ${uri}`);
    }
  }

  return jsonRpcError(id, -32002, `Resource not found: ${uri}`);
}

// =============================================================================
// Tool Implementations
// =============================================================================

async function handleSearchApi(
  args: Record<string, unknown>,
  id: string | number,
): Promise<Response> {
  const query = (args.query as string) || "";
  const language = args.language as "python" | "javascript" | undefined;
  const limit = Math.min(Math.max((args.limit as number) || 10, 1), 50);

  if (!query.trim()) {
    return jsonRpcError(id, -32602, "Query parameter is required");
  }

  const results = await searchSymbols(query, language, limit);
  const formattedResults = formatSearchResults(results, query);

  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: formattedResults,
        },
      ],
    },
  });
}

async function handleGetSymbol(
  args: Record<string, unknown>,
  id: string | number,
): Promise<Response> {
  const packageName = args.package as string;
  const symbolName = args.symbol as string;

  if (!packageName || !symbolName) {
    return jsonRpcError(id, -32602, "Package and symbol parameters are required");
  }

  const symbol = await getSymbolByName(packageName, symbolName);

  if (!symbol) {
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Symbol "${symbolName}" not found in package "${packageName}".\n\nTry searching with the search_api tool to find the correct symbol name.`,
          },
        ],
      },
    });
  }

  const markdown = symbolToMarkdown(symbol, packageName);

  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: markdown,
        },
      ],
    },
  });
}

// =============================================================================
// Search Implementation
// =============================================================================

async function searchSymbols(
  query: string,
  language?: "python" | "javascript",
  limit: number = 10,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const baseUrl = getBaseUrl();
  const projects = getEnabledProjects();

  // Search all languages if not specified
  const languages: Array<"python" | "javascript" | "java" | "go"> = language
    ? [language]
    : ["python", "javascript", "java", "go"];

  // Search across all projects
  for (const project of projects) {
    for (const lang of languages) {
      const buildId = await getBuildIdForLanguage(lang, project.id);
      if (!buildId) continue;

      const manifest = await getManifestData(buildId);
      if (!manifest) continue;

      // Map URL language to symbol language
      const langMap: Record<string, string> = {
        python: "python",
        javascript: "typescript",
        java: "java",
        go: "go",
      };
      const targetLang = langMap[lang] || lang;
      const packages = manifest.packages.filter((p) => p.language === targetLang);

      for (const pkg of packages) {
        const symbolsData = await getSymbols(buildId, pkg.packageId);
        if (!symbolsData?.symbols) continue;

        for (const symbol of symbolsData.symbols) {
          // Match by name or qualified name
          const nameMatch = symbol.name.toLowerCase().includes(queryLower);
          const qualifiedMatch = symbol.qualifiedName.toLowerCase().includes(queryLower);

          if (nameMatch || qualifiedMatch) {
            const pkgSlug = slugifyPackageName(pkg.publishedName);
            const langPath = lang === "python" ? "python" : "javascript";
            // Use slugifySymbolPath to properly strip package prefix for Python
            const hasPackagePrefix = lang === "python" && symbol.qualifiedName.includes("_");
            const symbolPath = slugifySymbolPath(symbol.qualifiedName, hasPackagePrefix);

            results.push({
              name: symbol.name,
              qualifiedName: symbol.qualifiedName,
              kind: symbol.kind,
              package: pkg.publishedName,
              language: lang === "python" ? "python" : "typescript",
              summary: symbol.docs?.summary || "",
              url: `${baseUrl}/${langPath}/${pkgSlug}/${symbolPath}`,
            });

            if (results.length >= limit * 2) {
              // Collect extra for sorting
              break;
            }
          }
        }

        if (results.length >= limit * 2) break;
      }

      if (results.length >= limit * 2) break;
    }

    if (results.length >= limit * 2) break;
  }

  // Sort results: exact matches first, then by name length
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === queryLower;
    const bExact = b.name.toLowerCase() === queryLower;

    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStartsWith = a.name.toLowerCase().startsWith(queryLower);
    const bStartsWith = b.name.toLowerCase().startsWith(queryLower);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    return a.name.length - b.name.length;
  });

  return results.slice(0, limit);
}

function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No symbols found matching "${query}".\n\nTry a different search term or specify a language filter.`;
  }

  const lines: string[] = [
    `# Search Results for "${query}"`,
    "",
    `Found ${results.length} matching symbol${results.length > 1 ? "s" : ""}:`,
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.name} (${result.kind})`);
    lines.push("");
    lines.push(`- **Package**: \`${result.package}\``);
    lines.push(`- **Language**: ${result.language === "python" ? "Python" : "JavaScript"}`);
    if (result.summary) {
      lines.push(`- **Summary**: ${result.summary}`);
    }
    lines.push(`- **Documentation**: [View full documentation](${result.url})`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "Use the `get_symbol` tool with the package and symbol name to get full documentation.",
  );

  return lines.join("\n");
}

// =============================================================================
// Symbol Lookup
// =============================================================================

async function getSymbolByName(
  packageName: string,
  symbolName: string,
): Promise<SymbolRecord | null> {
  // Determine language from package name
  const isJavaScript = packageName.startsWith("@");
  const language = isJavaScript ? "javascript" : "python";

  const buildId = await getBuildIdForLanguage(language);
  if (!buildId) return null;

  const manifest = await getManifestData(buildId);
  if (!manifest) return null;

  // Find the package
  const pkg = manifest.packages.find(
    (p) =>
      p.publishedName === packageName ||
      p.publishedName === unslugifyPackageName(packageName, language),
  );

  if (!pkg) return null;

  // Try to find the symbol by path or name
  const symbol = await getSymbolData(buildId, pkg.packageId, symbolName);

  if (symbol) return symbol;

  // If not found by path, search in package symbols
  const symbolsData = await getSymbols(buildId, pkg.packageId);
  if (!symbolsData?.symbols) return null;

  // Try exact name match
  const exactMatch = symbolsData.symbols.find((s) => s.name === symbolName);
  if (exactMatch) return exactMatch;

  // Try qualified name match
  const qualifiedMatch = symbolsData.symbols.find((s) => s.qualifiedName === symbolName);
  if (qualifiedMatch) return qualifiedMatch;

  return null;
}

// =============================================================================
// Utilities
// =============================================================================

function jsonRpcError(id: string | number, code: number, message: string): Response {
  return Response.json({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  });
}
