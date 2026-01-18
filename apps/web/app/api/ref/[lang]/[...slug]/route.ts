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
  getBuildIdForPackageId,
  getManifestData,
  getPackageInfo,
  getCatalogEntries,
  findSymbolWithVariations,
} from "@/lib/ir/loader";
import { symbolToMarkdown, packageToMarkdownFromCatalog } from "@/lib/ir/markdown-generator";
import { getContentTypeForFormat, getCacheHeaders } from "@/lib/utils/content-negotiation";
import type { UrlLanguage } from "@/lib/utils/url";

interface RouteParams {
  params: Promise<{
    lang: string;
    slug: string[];
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { lang, slug } = await params;

  // Validate language
  if (lang !== "python" && lang !== "javascript") {
    return NextResponse.json(
      { error: "Invalid language. Use 'python' or 'javascript'." },
      { status: 400 },
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

  // Get build ID for this specific package (each package has its own build ID)
  const packageBuildId = await getBuildIdForPackageId(parsed.packageId);
  if (!packageBuildId) {
    return NextResponse.json(
      { error: `No build available for package: ${parsed.packageName}` },
      { status: 503 },
    );
  }

  // Get package info from manifest
  const manifest = await getManifestData(packageBuildId);
  if (!manifest) {
    return NextResponse.json({ error: "Failed to load manifest" }, { status: 500 });
  }

  const packageInfo = manifest.packages.find((p) => p.packageId === parsed.packageId);
  if (!packageInfo) {
    return NextResponse.json(
      { error: `Package not found: ${parsed.packageName}` },
      { status: 404 },
    );
  }

  // If no symbol path, return package overview
  // OPTIMIZATION: Use sharded catalog (<500KB) instead of symbols.json (23MB+)
  if (parsed.symbolPath.length === 0) {
    const catalogEntries = await getCatalogEntries(packageBuildId, parsed.packageId);
    if (!catalogEntries || catalogEntries.length === 0) {
      return NextResponse.json({ error: "Failed to load symbols" }, { status: 500 });
    }

    if (wantsJson) {
      return NextResponse.json(
        {
          package: packageInfo,
          symbols: catalogEntries.map((e) => ({
            name: e.name,
            kind: e.kind,
            qualifiedName: e.qualifiedName,
            summary: e.summary,
          })),
        },
        { headers: getCacheHeaders() },
      );
    }

    const irLanguage = language === "python" ? "python" : "typescript";
    const markdown = packageToMarkdownFromCatalog(parsed.packageName, catalogEntries, irLanguage);

    return new Response(markdown, {
      headers: {
        "Content-Type": getContentTypeForFormat("markdown"),
        ...getCacheHeaders(),
      },
    });
  }

  // Use robust lookup that tries multiple path variations
  // This handles dot/slash notation, kind prefixes, and package prefixes
  const symbol = await findSymbolWithVariations(packageBuildId, parsed.packageId, parsed.fullPath);

  if (!symbol) {
    return NextResponse.json({ error: `Symbol not found: ${parsed.fullPath}` }, { status: 404 });
  }

  // Return JSON or markdown
  if (wantsJson) {
    return NextResponse.json(symbol, { headers: getCacheHeaders() });
  }

  const pkgInfo = await getPackageInfo(packageBuildId, parsed.packageId);
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
