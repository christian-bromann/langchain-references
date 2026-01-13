/**
 * API Route for Reference Documentation
 *
 * Serves symbol documentation in markdown or JSON format.
 * This endpoint handles programmatic access to the API reference.
 *
 * URL patterns:
 * - /api/ref/python/langchain-core/ChatOpenAI
 * - /api/ref/javascript/langchain-core/RunnableSequence
 *
 * Query parameters:
 * - format: "md" | "markdown" | "json" (default: "markdown")
 */

import { NextRequest, NextResponse } from "next/server";
import { parseSlugWithLanguage } from "@/lib/utils/url";
import {
  getBuildIdForLanguage,
  getSymbols,
  getManifestData,
  getSymbolOptimized,
  getPackageInfo,
} from "@/lib/ir/loader";
import {
  symbolToMarkdown,
  packageToMarkdown,
} from "@/lib/ir/markdown-generator";
import {
  getContentTypeForFormat,
  getCacheHeaders,
} from "@/lib/utils/content-negotiation";
import type { SymbolRecord } from "@/lib/ir/types";
import type { UrlLanguage } from "@/lib/utils/url";

interface RouteParams {
  params: Promise<{
    lang: string;
    slug: string[];
  }>;
}

/**
 * Find a symbol by path in the symbols array
 */
function findSymbolByPath(
  symbols: SymbolRecord[],
  symbolPath: string,
  language: UrlLanguage
): SymbolRecord | null {
  // Try exact match on qualifiedName
  let symbol = symbols.find((s) => s.qualifiedName === symbolPath);
  if (symbol) return symbol;

  // Try matching just the symbol name (last part of path)
  const symbolName = symbolPath.split(".").pop() || symbolPath;
  symbol = symbols.find((s) => s.name === symbolName);
  if (symbol) return symbol;

  // For Python, try matching with package prefix
  if (language === "python") {
    const withDots = symbolPath.replace(/\//g, ".");
    symbol = symbols.find(
      (s) =>
        s.qualifiedName === withDots ||
        s.qualifiedName.endsWith(`.${withDots}`)
    );
    if (symbol) return symbol;
  }

  // For JavaScript, try matching module paths
  if (language === "javascript" || language === "typescript") {
    const withSlashes = symbolPath.replace(/\./g, "/");
    symbol = symbols.find(
      (s) => s.name === withSlashes || s.qualifiedName === withSlashes
    );
    if (symbol) return symbol;
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { lang, slug } = await params;

  // Validate language
  if (lang !== "python" && lang !== "javascript") {
    return NextResponse.json(
      { error: "Invalid language. Use 'python' or 'javascript'." },
      { status: 400 }
    );
  }

  const language: UrlLanguage = lang;

  // Get format from query params (default to markdown)
  const format = request.nextUrl.searchParams.get("format")?.toLowerCase();
  const wantsJson = format === "json";

  // Parse the slug
  const parsed = parseSlugWithLanguage(slug, language);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Get build ID for this language
  const buildId = await getBuildIdForLanguage(language);
  if (!buildId) {
    return NextResponse.json(
      { error: "No build available for this language" },
      { status: 503 }
    );
  }

  // Get package info from manifest
  const manifest = await getManifestData(buildId);
  if (!manifest) {
    return NextResponse.json(
      { error: "Failed to load manifest" },
      { status: 500 }
    );
  }

  const packageInfo = manifest.packages.find(
    (p) => p.packageId === parsed.packageId
  );
  if (!packageInfo) {
    return NextResponse.json(
      { error: `Package not found: ${parsed.packageName}` },
      { status: 404 }
    );
  }

  // If no symbol path, return package overview (needs all symbols)
  if (parsed.symbolPath.length === 0) {
    const symbolsResult = await getSymbols(buildId, parsed.packageId);
    if (!symbolsResult?.symbols) {
      return NextResponse.json(
        { error: "Failed to load symbols" },
        { status: 500 }
      );
    }

    if (wantsJson) {
      return NextResponse.json(
        {
          package: packageInfo,
          symbols: symbolsResult.symbols.map((s) => ({
            name: s.name,
            kind: s.kind,
            qualifiedName: s.qualifiedName,
            summary: s.docs?.summary,
          })),
        },
        { headers: getCacheHeaders() }
      );
    }

    const irLanguage = language === "python" ? "python" : "typescript";
    const markdown = packageToMarkdown(
      parsed.packageName,
      symbolsResult.symbols,
      irLanguage
    );

    return new Response(markdown, {
      headers: {
        "Content-Type": getContentTypeForFormat("markdown"),
        ...getCacheHeaders(),
      },
    });
  }

  // OPTIMIZATION: Use optimized lookup for single symbol (~1-5KB instead of 11MB)
  let symbol = await getSymbolOptimized(buildId, parsed.packageId, parsed.fullPath);

  // Fall back to full symbol search if optimized lookup fails
  if (!symbol) {
    const symbolsResult = await getSymbols(buildId, parsed.packageId);
    if (symbolsResult?.symbols) {
      symbol = findSymbolByPath(symbolsResult.symbols, parsed.fullPath, language);
    }
  }

  if (!symbol) {
    return NextResponse.json(
      { error: `Symbol not found: ${parsed.fullPath}` },
      { status: 404 }
    );
  }

  // Return JSON or markdown
  if (wantsJson) {
    return NextResponse.json(symbol, { headers: getCacheHeaders() });
  }

  const pkgInfo = await getPackageInfo(buildId, parsed.packageId);
  const markdown = symbolToMarkdown(symbol, parsed.packageName, {
    repoPathPrefix: pkgInfo?.repo?.path || undefined,
  });

  return new Response(markdown, {
    headers: {
      "Content-Type": getContentTypeForFormat("markdown"),
      ...getCacheHeaders(),
    },
  });
}

