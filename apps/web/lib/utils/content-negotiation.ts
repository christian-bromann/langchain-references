/**
 * Content Negotiation
 *
 * Utilities for detecting the requested content format based on
 * request headers, query parameters, and user agent patterns.
 *
 * This enables the API reference to serve:
 * - HTML for browsers
 * - Markdown for LLM crawlers and programmatic access
 * - JSON for API consumers
 */

/**
 * Supported content formats
 */
export type ContentFormat = "html" | "markdown" | "json";

/**
 * Request context for format detection
 */
export interface RequestContext {
  headers: Headers;
  searchParams: URLSearchParams;
}

/**
 * Known LLM and AI crawler user agent patterns
 */
const LLM_USER_AGENT_PATTERNS = [
  // OpenAI
  "GPTBot",
  "ChatGPT-User",
  // Anthropic
  "Claude-Web",
  "Anthropic-AI",
  // Other AI services
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "YouBot",
  "cohere-ai",
  "Bytespider",
  "Amazonbot",
  // IDE and coding assistants
  "cursor",
  "copilot",
  "aider",
  "continue",
  "codeium",
  "tabnine",
];

/**
 * CLI tool user agent patterns that typically want plain text
 */
const CLI_USER_AGENT_PATTERNS = [
  "curl",
  "wget",
  "httpie",
  "axios",
  "node-fetch",
  "python-requests",
  "go-http-client",
];

/**
 * Detect the requested content format from a request context.
 *
 * Priority order:
 * 1. Explicit query parameter (?format=md)
 * 2. Accept header
 * 3. User-Agent detection for LLMs
 * 4. CLI tools default to markdown
 * 5. Default to HTML
 *
 * @param ctx - Request context with headers and search params
 * @returns The detected content format
 */
export function detectRequestedFormat(ctx: RequestContext): ContentFormat {
  const { headers, searchParams } = ctx;

  // 1. Check explicit query parameter first (highest priority)
  const formatParam = searchParams.get("format")?.toLowerCase();
  if (formatParam === "md" || formatParam === "markdown") {
    return "markdown";
  }
  if (formatParam === "json") {
    return "json";
  }

  // 2. Check Accept header
  const accept = headers.get("accept") || "";
  if (accept.includes("text/markdown")) {
    return "markdown";
  }
  if (
    accept.includes("application/json") &&
    !accept.includes("text/html")
  ) {
    return "json";
  }

  // 3. Check User-Agent for known LLM/AI patterns
  const userAgent = headers.get("user-agent") || "";
  const userAgentLower = userAgent.toLowerCase();

  const isLlmRequest = LLM_USER_AGENT_PATTERNS.some((pattern) =>
    userAgentLower.includes(pattern.toLowerCase())
  );

  if (isLlmRequest) {
    return "markdown";
  }

  // 4. Check for CLI tools (curl, wget, etc.)
  // These typically want plain text unless they explicitly request HTML
  const isCliRequest = CLI_USER_AGENT_PATTERNS.some((pattern) =>
    userAgentLower.includes(pattern.toLowerCase())
  );

  if (isCliRequest && !accept.includes("text/html")) {
    return "markdown";
  }

  // 5. Default to HTML for browsers
  return "html";
}

/**
 * Check if a request is from an LLM or AI crawler
 *
 * @param userAgent - The User-Agent header value
 * @returns Whether the request appears to be from an LLM/AI
 */
export function isLlmUserAgent(userAgent: string): boolean {
  const userAgentLower = userAgent.toLowerCase();
  return LLM_USER_AGENT_PATTERNS.some((pattern) =>
    userAgentLower.includes(pattern.toLowerCase())
  );
}

/**
 * Get the appropriate Content-Type header for a format
 *
 * @param format - The content format
 * @returns The Content-Type header value
 */
export function getContentTypeForFormat(format: ContentFormat): string {
  switch (format) {
    case "markdown":
      return "text/markdown; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "html":
    default:
      return "text/html; charset=utf-8";
  }
}

/**
 * Get cache control headers for markdown/JSON responses
 */
export function getCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
  };
}

