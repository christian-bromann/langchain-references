/**
 * Middleware for Content Negotiation
 *
 * Redirects requests for markdown/JSON format to the API endpoint
 * when the ?format= parameter is present or when the request comes
 * from an LLM crawler.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Known LLM and AI crawler user agent patterns
 */
const LLM_USER_AGENT_PATTERNS = [
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

/**
 * CLI tools that typically want plain text
 */
const CLI_USER_AGENT_PATTERNS = ["curl", "wget", "httpie"];

/**
 * Check if request wants non-HTML format
 */
function wantsAlternateFormat(request: NextRequest): "markdown" | "json" | null {
  // Check explicit format parameter
  const format = request.nextUrl.searchParams.get("format")?.toLowerCase();
  if (format === "md" || format === "markdown") {
    return "markdown";
  }
  if (format === "json") {
    return "json";
  }

  // Check Accept header
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/markdown")) {
    return "markdown";
  }
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return "json";
  }

  // Check User-Agent for LLMs
  const userAgent = request.headers.get("user-agent") || "";
  const userAgentLower = userAgent.toLowerCase();

  const isLlm = LLM_USER_AGENT_PATTERNS.some((pattern) =>
    userAgentLower.includes(pattern.toLowerCase())
  );
  if (isLlm) {
    return "markdown";
  }

  // Check for CLI tools
  const isCli = CLI_USER_AGENT_PATTERNS.some((pattern) =>
    userAgentLower.includes(pattern.toLowerCase())
  );
  if (isCli && !accept.includes("text/html")) {
    return "markdown";
  }

  return null;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only handle reference doc pages (/python/... and /javascript/...)
  const isRefPage =
    pathname.startsWith("/python/") || pathname.startsWith("/javascript/");

  if (!isRefPage) {
    return NextResponse.next();
  }

  // Handle backwards compatibility redirects for legacy URLs
  // Legacy URLs: /python/classes/... or /python/functions/...
  // New URLs: /python/langchain/classes/... or /python/langchain/functions/...
  const legacyPatterns = [
    /^\/(python|javascript)\/(classes|functions|modules|interfaces)\//,
  ];

  for (const pattern of legacyPatterns) {
    if (pattern.test(pathname)) {
      const newPath = pathname.replace(
        /^\/(python|javascript)\//,
        "/$1/langchain/"
      );
      return NextResponse.redirect(new URL(newPath, request.url), 301);
    }
  }

  // Handle dot-notation URLs and convert to slash-notation
  // Example: /javascript/langchain-core/embeddings.EmbeddingsInterface
  //       -> /javascript/langchain-core/embeddings/EmbeddingsInterface
  // This supports both URL formats for better user experience
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 3) {
    // segments[0] is language (python/javascript)
    // segments[1] is package slug (langchain-core)
    // segments[2+] is symbol path which might contain dots
    const symbolSegments = segments.slice(2);
    const lastSegment = symbolSegments[symbolSegments.length - 1];
    
    // Check if any symbol segment contains a dot (indicating qualified name format)
    // But ignore URL-encoded dots (%2F) which are already handled
    if (lastSegment && lastSegment.includes(".") && !lastSegment.includes("%")) {
      // Convert dots to slashes in the symbol path
      const expandedSegments = symbolSegments.flatMap(seg => seg.split("."));
      const newPath = `/${segments[0]}/${segments[1]}/${expandedSegments.join("/")}`;
      return NextResponse.redirect(new URL(newPath, request.url), 301);
    }
  }

  // Check if this request wants an alternate format
  const wantedFormat = wantsAlternateFormat(request);

  if (wantedFormat) {
    // Extract the language and slug from the path
    // /python/langchain-core/ChatOpenAI -> /api/ref/python/langchain-core/ChatOpenAI
    const apiPath = `/api/ref${pathname}`;
    const url = new URL(apiPath, request.url);

    // Add format parameter if it's JSON (markdown is default for API)
    if (wantedFormat === "json") {
      url.searchParams.set("format", "json");
    }

    // Rewrite to the API endpoint (internal rewrite, not redirect)
    return NextResponse.rewrite(url);
  }

  // Continue with normal page rendering for browsers
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all reference doc paths:
     * - /python/...
     * - /javascript/...
     */
    "/python/:path*",
    "/javascript/:path*",
  ],
};


