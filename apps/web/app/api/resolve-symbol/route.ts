/**
 * Symbol Resolution API Route
 *
 * Resolves symbols across languages for seamless navigation when users
 * switch between Python and JavaScript documentation.
 *
 * GET /api/resolve-symbol?symbolPath=...&symbolName=...&targetLanguage=...
 */

import { NextRequest, NextResponse } from "next/server";
import MiniSearch from "minisearch";
import type { SearchRecord, Language as IRLanguage } from "@langchain/ir-schema";
import { getBuildIdForLanguage, getManifestData, getSymbols } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";
import { slugifyPackageName, slugifySymbolPath } from "@/lib/utils/url";
import {
  getExplicitMapping,
  getSymbolAlias,
  getEquivalentPackage,
  type Language,
} from "@/lib/symbol-mappings";
import {
  normalizeSymbolName,
  calculateMatchScore,
  MATCH_THRESHOLD,
  type ResolveSymbolResponse,
} from "@/lib/symbol-resolution";

// =============================================================================
// Search Index Cache
// =============================================================================

const indexCache = new Map<string, { index: MiniSearch<SearchRecord>; buildId: string }>();

/**
 * Build a search record from a symbol (adapted from search/query/route.ts)
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
  packagePublishedName: string,
  packageDisplayName: string,
  language: IRLanguage,
): SearchRecord | null {
  if (symbol.tags?.visibility === "private") return null;

  const skipKinds = ["parameter", "enumMember"];
  if (skipKinds.includes(symbol.kind)) return null;

  // Use displayName for human-readable breadcrumbs (e.g., "Deep Agents")
  const parts = symbol.qualifiedName.split(/[./]/);
  const breadcrumbs = [packageDisplayName, ...parts.slice(0, -1)];

  // Use publishedName for URL slugification (e.g., "deepagents" not "Deep Agents")
  const langPath = language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(packagePublishedName);
  const isPython = language === "python";
  const hasPackagePrefix = isPython && symbol.qualifiedName.includes("_");
  const symbolPath = slugifySymbolPath(symbol.qualifiedName, hasPackagePrefix);
  const url = `/${langPath}/${packageSlug}/${symbolPath}`;

  const excerpt = symbol.docs?.summary?.slice(0, 150) || "";

  // Build comprehensive keywords for cross-convention matching
  // Include: original name, word parts, normalized form, and alternative convention form
  const camelParts = symbol.name.split(/(?=[A-Z])/).map((s) => s.toLowerCase());
  const snakeParts = symbol.name.split("_").filter(Boolean);
  const normalized = symbol.name.replace(/_/g, "").replace(/([a-z])([A-Z])/g, "$1$2").toLowerCase();

  // Generate alternative naming convention form
  const alternativeForm =
    language === "python"
      ? // For Python symbols (snake_case), add camelCase version
        symbol.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      : // For JS symbols (camelCase), add snake_case version
        symbol.name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

  const keywords = [
    symbol.name,
    ...camelParts,
    ...snakeParts,
    normalized,
    alternativeForm,
  ].filter((k, i, arr) => k && arr.indexOf(k) === i); // Dedupe

  return {
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
 */
async function getSearchIndex(language: Language): Promise<MiniSearch<SearchRecord> | null> {
  const irLanguage = language === "python" ? "python" : "javascript";
  const projects = getEnabledProjects();

  const buildIds: string[] = [];
  for (const project of projects) {
    const buildId = await getBuildIdForLanguage(irLanguage, project.id);
    if (buildId) {
      buildIds.push(buildId);
    }
  }

  if (buildIds.length === 0) return null;

  const cacheKey = `resolve:${language}:${buildIds.sort().join(",")}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached.index;

  const index = new MiniSearch<SearchRecord>({
    fields: ["title", "excerpt", "keywords"],
    storeFields: ["id", "url", "title", "breadcrumbs", "excerpt", "kind", "language", "packageId"],
    searchOptions: {
      boost: { title: 3, keywords: 2, excerpt: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  const recordsMap = new Map<string, SearchRecord>();

  for (const project of projects) {
    const buildId = await getBuildIdForLanguage(irLanguage, project.id);
    if (!buildId) continue;

    const manifest = await getManifestData(buildId);
    if (!manifest) continue;

    const packages = manifest.packages.filter((p) =>
      language === "python"
        ? p.language === "python"
        : p.language === "typescript" || p.ecosystem === "javascript",
    );

    for (const pkg of packages) {
      const result = await getSymbols(buildId, pkg.packageId);
      if (result?.symbols) {
        for (const symbol of result.symbols) {
          // Pass both publishedName (for URLs) and displayName (for breadcrumbs)
          const record = symbolToSearchRecord(
            symbol,
            pkg.packageId,
            pkg.publishedName,
            pkg.displayName,
            language as IRLanguage,
          );
          if (record && !recordsMap.has(record.id)) {
            recordsMap.set(record.id, record);
          }
        }
      }
    }
  }

  const records = Array.from(recordsMap.values());
  index.addAll(records);

  indexCache.set(cacheKey, { index, buildId: buildIds.join(",") });
  return index;
}

/**
 * Convert camelCase to snake_case.
 * @example "createFileData" → "create_file_data"
 */
function camelToSnake(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Convert snake_case to camelCase.
 * @example "create_file_data" → "createFileData"
 */
function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert a symbol name to the target language's naming convention.
 * JavaScript uses camelCase, Python uses snake_case.
 */
function convertNameForLanguage(name: string, targetLanguage: Language): string {
  if (targetLanguage === "python") {
    // Convert camelCase to snake_case for Python
    return camelToSnake(name);
  } else {
    // Convert snake_case to camelCase for JavaScript
    return snakeToCamel(name);
  }
}

/**
 * Search for symbols in target language.
 */
async function searchSymbols(
  query: string,
  targetLanguage: Language,
  limit: number = 20,
): Promise<Array<{ url: string; title: string; kind: string; score: number }>> {
  const index = await getSearchIndex(targetLanguage);
  if (!index) return [];

  const results = index.search(query);

  return results.slice(0, limit).map((r) => ({
    url: r.url as string,
    title: r.title as string,
    kind: r.kind as string,
    score: r.score,
  }));
}

/**
 * Extract word parts from a symbol name (handles both camelCase and snake_case).
 * @example "createFileData" → ["create", "file", "data"]
 * @example "create_file_data" → ["create", "file", "data"]
 */
function extractWordParts(name: string): string[] {
  // Split on camelCase boundaries and underscores
  return name
    .split(/(?=[A-Z])|_/)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Search for symbols with both original and converted naming conventions.
 * This helps find snake_case symbols when searching with camelCase and vice versa.
 *
 * Strategy:
 * 1. Search with original name
 * 2. Search with converted name (camelCase ↔ snake_case)
 * 3. Search with word parts to ensure cross-convention matching
 * 4. Use title-focused search for better accuracy
 */
async function searchSymbolsWithConversion(
  symbolName: string,
  targetLanguage: Language,
  limit: number = 20,
): Promise<Array<{ url: string; title: string; kind: string; score: number }>> {
  const index = await getSearchIndex(targetLanguage);
  if (!index) return [];

  // Search with original name
  const originalResults = index.search(symbolName);

  // Also search with converted name (camelCase ↔ snake_case)
  const convertedName = convertNameForLanguage(symbolName, targetLanguage);
  const convertedResults = convertedName !== symbolName ? index.search(convertedName) : [];

  // Search with word parts joined by space (helps MiniSearch match across conventions)
  const wordParts = extractWordParts(symbolName);
  const wordPartsQuery = wordParts.join(" ");
  const wordPartsResults =
    wordPartsQuery !== symbolName.toLowerCase() ? index.search(wordPartsQuery) : [];

  // Also try a title-focused search with the converted name for better precision
  const titleFocusedResults = index.search(convertedName, {
    fields: ["title"],
    boost: { title: 10 },
    fuzzy: 0.1,
    prefix: true,
  });

  // Combine and dedupe results by URL, keeping highest score
  const resultMap = new Map<string, { url: string; title: string; kind: string; score: number }>();

  for (const r of [
    ...originalResults,
    ...convertedResults,
    ...wordPartsResults,
    ...titleFocusedResults,
  ]) {
    const url = r.url as string;
    const existing = resultMap.get(url);
    if (!existing || r.score > existing.score) {
      resultMap.set(url, {
        url,
        title: r.title as string,
        kind: r.kind as string,
        score: r.score,
      });
    }
  }

  // Sort by score and limit
  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// =============================================================================
// API Handler
// =============================================================================

export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams;

  // Parse query parameters
  const symbolPath = searchParams.get("symbolPath");
  const symbolName = searchParams.get("symbolName");
  const targetLanguage = searchParams.get("targetLanguage") as Language | null;
  const sourceLanguage = searchParams.get("sourceLanguage") as Language | null;
  const sourcePackage = searchParams.get("sourcePackage");

  // Validate required parameters
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

  try {
    const effectiveSourceLanguage: Language =
      sourceLanguage && ["python", "javascript"].includes(sourceLanguage)
        ? sourceLanguage
        : targetLanguage === "python"
          ? "javascript"
          : "python";

    // 1. Check explicit path mappings (highest priority)
    if (symbolPath) {
      const explicitMapping = getExplicitMapping(symbolPath, effectiveSourceLanguage, targetLanguage);
      if (explicitMapping) {
        const response: ResolveSymbolResponse = {
          found: true,
          targetUrl: `/${targetLanguage}/${explicitMapping}`,
          matchType: "explicit",
          score: 1.0,
          context: {
            package: explicitMapping.split("/")[0],
          },
        };
        return NextResponse.json(response, {
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          },
        });
      }
    }

    // 2. Check symbol name aliases
    const aliasedName = getSymbolAlias(symbolName, effectiveSourceLanguage, targetLanguage);
    if (aliasedName) {
      const aliasResults = await searchSymbols(aliasedName, targetLanguage, 5);
      if (aliasResults.length > 0) {
        const bestMatch = aliasResults[0];
        const response: ResolveSymbolResponse = {
          found: true,
          targetUrl: bestMatch.url,
          matchType: "alias",
          score: 0.98,
          matchedSymbol: aliasedName,
          context: {
            package: bestMatch.url.split("/")[2] || "",
          },
        };
        return NextResponse.json(response, {
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          },
        });
      }
    }

    // 3. Search for exact/normalized match (with automatic camelCase ↔ snake_case conversion)
    const normalized = normalizeSymbolName(symbolName);
    const searchResults = await searchSymbolsWithConversion(symbolName, targetLanguage, 20);

    if (searchResults.length > 0) {
      // Score and rank results
      const rankedResults = searchResults
        .map((result) => ({
          result,
          score: calculateMatchScore(normalized, result),
        }))
        .sort((a, b) => b.score - a.score);

      const bestMatch = rankedResults[0];

      // If we have a source package, prefer results in the equivalent package
      if (sourcePackage && rankedResults.length > 1) {
        const equivalentPkg = getEquivalentPackage(
          sourcePackage,
          effectiveSourceLanguage,
          targetLanguage,
        );
        if (equivalentPkg) {
          const packageMatch = rankedResults.find((r) =>
            r.result.url.includes(`/${equivalentPkg}/`),
          );
          if (packageMatch && packageMatch.score >= MATCH_THRESHOLD) {
            const response: ResolveSymbolResponse = {
              found: true,
              targetUrl: packageMatch.result.url,
              matchType: packageMatch.score === 1 ? "exact" : "normalized",
              score: packageMatch.score,
              matchedSymbol:
                packageMatch.result.title !== symbolName ? packageMatch.result.title : undefined,
              context: {
                package: equivalentPkg,
              },
            };
            return NextResponse.json(response, {
              headers: {
                "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
              },
            });
          }
        }
      }

      // Use best overall match if it meets threshold
      if (bestMatch.score >= MATCH_THRESHOLD) {
        const matchType =
          bestMatch.score === 1 ? "exact" : bestMatch.score >= 0.9 ? "normalized" : "fuzzy";

        const response: ResolveSymbolResponse = {
          found: true,
          targetUrl: bestMatch.result.url,
          matchType,
          score: bestMatch.score,
          matchedSymbol:
            bestMatch.result.title !== symbolName ? bestMatch.result.title : undefined,
          context: {
            package: bestMatch.result.url.split("/")[2] || "",
          },
        };
        return NextResponse.json(response, {
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          },
        });
      }
    }

    // 4. Fallback to equivalent package
    if (sourcePackage) {
      const equivalentPkg = getEquivalentPackage(
        sourcePackage,
        effectiveSourceLanguage,
        targetLanguage,
      );
      if (equivalentPkg) {
        const response: ResolveSymbolResponse = {
          found: false,
          targetUrl: `/${targetLanguage}/${equivalentPkg}`,
          matchType: "package",
          score: 0,
          context: {
            package: equivalentPkg,
          },
        };
        return NextResponse.json(response, {
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          },
        });
      }
    }

    // 5. Ultimate fallback to language landing
    const response: ResolveSymbolResponse = {
      found: false,
      targetUrl: `/${targetLanguage}`,
      matchType: "language",
      score: 0,
    };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[resolve-symbol] Resolution failed:", error);
    return NextResponse.json(
      { error: "Symbol resolution failed" },
      { status: 500 },
    );
  }
}
