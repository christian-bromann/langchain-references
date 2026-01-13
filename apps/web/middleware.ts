/**
 * Middleware for Content Negotiation
 *
 * Redirects requests for markdown/JSON format to the API endpoint
 * when the ?format= parameter is present or when the request comes
 * from an LLM crawler.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { mapLegacyReferencePath } from "@/lib/utils/legacy-redirects";

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

/**
 * Best-effort: resolve the newest available 0.3.x version for a package
 * by looking at its changelog and selecting the newest entry prefixed with "0.3.".
 *
 * This is only used for redirects from /v0.3/python/** and is intentionally
 * isolated to keep the common path fast.
 */
const v03VersionCache = new Map<string, string | null>();
async function resolveV03VersionFromChangelog(params: {
  packageId: string;
}): Promise<string | null> {
  if (v03VersionCache.has(params.packageId)) {
    return v03VersionCache.get(params.packageId) ?? null;
  }

  const blobBaseUrl = process.env.BLOB_BASE_URL || process.env.BLOB_URL;
  if (!blobBaseUrl) {
    v03VersionCache.set(params.packageId, null);
    return null;
  }

  // These legacy links are specifically for the old LangChain Python v0.3 site.
  // We resolve via the latest langchain-python build pointer and then read the per-package changelog.
  const pointerUrl = `${blobBaseUrl}/pointers/latest-langchain-python.json`;

  try {
    const pointerRes = await fetch(pointerUrl, { cache: "force-cache" });
    if (!pointerRes.ok) {
      v03VersionCache.set(params.packageId, null);
      return null;
    }

    const pointer = (await pointerRes.json()) as { buildId?: string };
    const buildId = pointer.buildId;
    if (!buildId) {
      v03VersionCache.set(params.packageId, null);
      return null;
    }

    const changelogUrl = `${blobBaseUrl}/ir/${buildId}/packages/${params.packageId}/changelog.json`;
    const changelogRes = await fetch(changelogUrl, { cache: "force-cache" });
    if (!changelogRes.ok) {
      v03VersionCache.set(params.packageId, null);
      return null;
    }

    const changelog = (await changelogRes.json()) as { history?: Array<{ version?: string }> };
    const candidates =
      changelog.history
        ?.map((h) => h.version)
        .filter((v): v is string => typeof v === "string" && v.startsWith("0.3."))
        ?? [];

    if (candidates.length === 0) {
      v03VersionCache.set(params.packageId, null);
      return null;
    }

    const newest = candidates.sort((a, b) => {
      const pa = a.split(".").map((n) => Number(n));
      const pb = b.split(".").map((n) => Number(n));
      for (let i = 0; i < 3; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db) return db - da;
      }
      return 0;
    })[0]!;

    v03VersionCache.set(params.packageId, newest);
    return newest;
  } catch {
    v03VersionCache.set(params.packageId, null);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only handle reference doc pages:
  // - /python...
  // - /javascript...
  // - /v0.3/python... (legacy)
  const isRefPage =
    pathname === "/python" ||
    pathname.startsWith("/python/") ||
    pathname === "/javascript" ||
    pathname.startsWith("/javascript/") ||
    pathname === "/v0.3/python" ||
    pathname.startsWith("/v0.3/python/");

  if (!isRefPage) {
    return NextResponse.next();
  }

  // ---------------------------------------------------------------------------
  // Legacy redirects (Python docs + JS TypeDoc + /v0.3/python)
  // ---------------------------------------------------------------------------
  // NOTE: This must run BEFORE the older internal "classes/functions/modules" redirect,
  // because TypeDoc uses /javascript/classes/... and /javascript/modules/... paths.
  const legacy = mapLegacyReferencePath(pathname);
  if (legacy) {
    // No-op guard (avoid redirect loops)
    if (legacy.pathname !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = legacy.pathname;

      // Best-effort: add ?v=<newest 0.3.x> for v0.3 python redirects if we can resolve it.
      if ("meta" in legacy && legacy.meta?.v03?.packageId) {
        const v = await resolveV03VersionFromChangelog({ packageId: legacy.meta.v03.packageId });
        if (v) url.searchParams.set("v", v);
      }

      return NextResponse.redirect(url, 301);
    }
  }

  // Handle backwards compatibility redirects for legacy URLs
  // Legacy URLs: /python/classes/... or /python/functions/...
  // New URLs: /python/langchain/classes/... or /python/langchain/functions/...
  //
  // IMPORTANT: Only apply this to our own old schema (no .html). TypeDoc uses
  // /javascript/classes/<reflection>.html and must be handled by legacy mapping above.
  const legacyPatterns = [
    /^\/(python|javascript)\/(classes|functions|modules|interfaces)\//,
  ];

  for (const pattern of legacyPatterns) {
    if (pattern.test(pathname)) {
      // Skip TypeDoc / other HTML-based legacy paths
      if (pathname.includes(".html")) {
        continue;
      }
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
    // Guard: do not apply to legacy TypeDoc directories like /javascript/classes/*
    const legacyKindDirs = new Set([
      "classes",
      "functions",
      "modules",
      "interfaces",
      "type-aliases",
      "enumerations",
      "variables",
      "namespaces",
      "integrations",
    ]);
    if (legacyKindDirs.has(segments[1]!)) {
      // Skip
    } else {
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
     * - /v0.3/python/... (legacy)
     */
    "/python/:path*",
    "/javascript/:path*",
    "/v0.3/python/:path*",
  ],
};


