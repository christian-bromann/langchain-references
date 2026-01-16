/**
 * Search Query API Route
 *
 * Handles search queries server-side using MiniSearch.
 * Only returns matching results, not the entire index.
 */

import { NextRequest, NextResponse } from "next/server";
import MiniSearch from "minisearch";
import type { SearchRecord, SearchResult, Language } from "@langchain/ir-schema";
import { getBuildIdForLanguage, getManifestData, getSymbols } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";
import { slugifyPackageName } from "@/lib/utils/url";

// Cache the MiniSearch indices per language to avoid rebuilding on every request
const indexCache = new Map<string, { index: MiniSearch<SearchRecord>; buildId: string }>();

/**
 * Build a search record from a symbol
 */
function symbolToSearchRecord(
  symbol: {
    id: string;
    name: string;
    qualifiedName: string;
    kind: string;
    docs?: { summary?: string };
    urls?: { canonical?: string };
    tags?: { visibility?: string };
  },
  packageId: string,
  packageName: string,
  language: Language,
): SearchRecord | null {
  // Skip private symbols
  if (symbol.tags?.visibility === "private") {
    return null;
  }

  // Skip certain kinds that aren't useful to search
  const skipKinds = ["parameter", "enumMember"];
  if (skipKinds.includes(symbol.kind)) {
    return null;
  }

  // Build breadcrumbs from qualified name
  const parts = symbol.qualifiedName.split(/[./]/);
  const breadcrumbs = [packageName, ...parts.slice(0, -1)];

  // Build URL - always construct it ourselves as canonical URLs from TypeDoc
  // have incorrect format (e.g., /functions/useStream instead of /react/useStream)
  const langPath = language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(packageName);
  // Use qualified name to preserve module path (e.g., react.useStream -> react/useStream)
  // Convert dots to slashes for URL path
  const symbolPath = symbol.qualifiedName.replace(/\./g, "/");
  const url = `/${langPath}/${packageSlug}/${symbolPath}`;

  // Extract excerpt from summary
  const excerpt = symbol.docs?.summary?.slice(0, 150) || "";

  // Generate keywords from name
  const keywords = [
    symbol.name,
    ...symbol.name.split(/(?=[A-Z])/).map((s) => s.toLowerCase()), // camelCase parts
    ...symbol.name.split("_"), // snake_case parts
  ].filter(Boolean);

  return {
    // Make ID unique across packages by prefixing with packageId
    id: `${packageId}:${symbol.id}`,
    url,
    title: symbol.name,
    breadcrumbs,
    excerpt,
    keywords,
    kind: symbol.kind,
    language,
    packageId,
  };
}

/**
 * Build or get cached MiniSearch index for a language.
 * Searches across ALL enabled projects (langchain, langgraph, deepagent).
 */
async function getSearchIndex(language: Language): Promise<MiniSearch<SearchRecord> | null> {
  const irLanguage = language === "python" ? "python" : "javascript";
  const projects = getEnabledProjects();

  // Collect all build IDs for cache key
  const buildIds: string[] = [];
  for (const project of projects) {
    const buildId = await getBuildIdForLanguage(irLanguage, project.id);
    if (buildId) {
      buildIds.push(buildId);
    }
  }

  if (buildIds.length === 0) return null;

  // Check cache using combined build IDs
  const cacheKey = `${language}:${buildIds.sort().join(",")}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached.index;

  // Create MiniSearch index
  const index = new MiniSearch<SearchRecord>({
    fields: ["title", "excerpt", "keywords"],
    storeFields: ["id", "url", "title", "breadcrumbs", "excerpt", "kind", "language", "packageId"],
    searchOptions: {
      boost: { title: 3, keywords: 2, excerpt: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  // Build records from all symbols across all projects, deduplicating by ID
  const recordsMap = new Map<string, SearchRecord>();

  for (const project of projects) {
    const buildId = await getBuildIdForLanguage(irLanguage, project.id);
    if (!buildId) continue;

    const manifest = await getManifestData(buildId);
    if (!manifest) continue;

    // Filter packages by language
    const packages = manifest.packages.filter((p) =>
      language === "python"
        ? p.language === "python"
        : p.language === "typescript" || p.ecosystem === "javascript",
    );

    for (const pkg of packages) {
      const result = await getSymbols(buildId, pkg.packageId);

      if (result?.symbols) {
        for (const symbol of result.symbols) {
          const record = symbolToSearchRecord(symbol, pkg.packageId, pkg.displayName, language);
          if (record && !recordsMap.has(record.id)) {
            recordsMap.set(record.id, record);
          }
        }
      }
    }
  }

  // Add all unique records to index
  const records = Array.from(recordsMap.values());
  index.addAll(records);

  // Cache the index
  indexCache.set(cacheKey, { index, buildId: buildIds.join(",") });

  return index;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  const languageParam = request.nextUrl.searchParams.get("language");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const kindParam = request.nextUrl.searchParams.get("kind");
  const packageIdParam = request.nextUrl.searchParams.get("packageId");

  // Validate required parameters
  if (!query) {
    return NextResponse.json({ error: "Missing required 'q' parameter" }, { status: 400 });
  }

  if (!languageParam || !["python", "javascript"].includes(languageParam)) {
    return NextResponse.json(
      { error: "Invalid language parameter. Must be 'python' or 'javascript'" },
      { status: 400 },
    );
  }

  const language: Language = languageParam === "python" ? "python" : "typescript";
  const limit = Math.min(parseInt(limitParam || "20", 10), 50); // Max 50 results

  try {
    const index = await getSearchIndex(language);

    if (!index) {
      return NextResponse.json(
        { error: `No search index available for ${languageParam}` },
        { status: 404 },
      );
    }

    // Perform search
    let searchResults = index.search(query);

    // Filter by kind if specified
    if (kindParam) {
      searchResults = searchResults.filter((r) => r.kind === kindParam);
    }

    // Filter by package if specified
    if (packageIdParam) {
      searchResults = searchResults.filter((r) => r.packageId === packageIdParam);
    }

    // Map to SearchResult format and limit
    const results: SearchResult[] = searchResults.slice(0, limit).map((r) => ({
      id: r.id as string,
      url: r.url as string,
      title: r.title as string,
      breadcrumbs: r.breadcrumbs as string[],
      excerpt: r.excerpt as string,
      kind: r.kind as string,
      language,
      packageId: r.packageId as string,
      keywords: [],
      score: r.score,
    }));

    return NextResponse.json(
      { results, total: searchResults.length },
      {
        headers: {
          // Short cache for search results
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
