/**
 * Symbol Resolution Library
 *
 * Core logic for resolving symbols across languages when users switch
 * between Python and JavaScript documentation.
 *
 * Resolution priority:
 * 1. Explicit path mappings (SYMBOL_MAPPINGS)
 * 2. Symbol name aliases (SYMBOL_ALIASES)
 * 3. Exact name match in target language
 * 4. Normalized name match (camelCase ↔ snake_case)
 * 5. Fuzzy match with high confidence
 * 6. Package fallback
 * 7. Language fallback
 */

import {
  getExplicitMapping,
  getSymbolAlias,
  getEquivalentPackage,
  type Language,
} from "./symbol-mappings";

// =============================================================================
// Types
// =============================================================================

/**
 * Normalized symbol representation for matching.
 */
export interface NormalizedSymbol {
  /** Original symbol name */
  name: string;
  /** Lowercase, no separators (for comparison) */
  normalized: string;
  /** Additional search terms (word parts) */
  searchTerms: string[];
}

/**
 * Result of a symbol match operation.
 */
export interface MatchResult {
  /** Target URL to navigate to */
  url: string;
  /** Match confidence score (0-1) */
  score: number;
  /** Type of match found */
  matchType: "explicit" | "alias" | "exact" | "normalized" | "fuzzy" | "package" | "language";
  /** Matched symbol name (if different from query) */
  matchedSymbol?: string;
}

/**
 * API response format for symbol resolution.
 */
export interface ResolveSymbolResponse {
  /** Whether a match was found */
  found: boolean;
  /** The target URL to navigate to */
  targetUrl: string;
  /** Match type for UI feedback */
  matchType: MatchResult["matchType"];
  /** Match confidence (0-1) */
  score: number;
  /** Matched symbol name (if different from query) */
  matchedSymbol?: string;
  /** Additional context for the match */
  context?: {
    package: string;
    module?: string;
  };
}

/**
 * Parsed URL components.
 */
export interface ParsedSymbolUrl {
  /** Language from URL */
  language: Language;
  /** Package slug from URL */
  packageSlug: string;
  /** Full symbol path (after package) */
  symbolPath: string;
  /** Symbol name (last segment) */
  symbolName: string;
  /** Parent path (without symbol name) */
  parentPath: string;
}

/**
 * Search result from the search API.
 */
interface SearchResult {
  id: string;
  url: string;
  title: string;
  kind: string;
  score?: number;
  packageId?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Minimum score to accept a match */
export const MATCH_THRESHOLD = 0.6;

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Parse a symbol URL into its components.
 *
 * @param url - The URL path (e.g., "/javascript/langchain-core/messages/BaseMessage")
 * @returns Parsed URL components
 */
export function parseSymbolUrl(url: string): ParsedSymbolUrl {
  // Remove leading slash and split
  const parts = url.replace(/^\//, "").split("/");

  // First part is language
  const languageStr = parts[0] || "";
  const language: Language = languageStr === "python" ? "python" : "javascript";

  // Second part is package slug
  const packageSlug = parts[1] || "";

  // Remaining parts are the symbol path
  const symbolPathParts = parts.slice(2);
  const symbolPath = symbolPathParts.join("/");

  // Last segment is the symbol name
  const symbolName = symbolPathParts[symbolPathParts.length - 1] || "";

  // Parent path is everything except the last segment
  const parentPath = symbolPathParts.slice(0, -1).join("/");

  return {
    language,
    packageSlug,
    symbolPath,
    symbolName,
    parentPath,
  };
}

/**
 * Extract symbol name from a URL pathname.
 */
export function extractSymbolNameFromPath(pathname: string): string | null {
  const parsed = parseSymbolUrl(pathname);
  return parsed.symbolName || null;
}

/**
 * Extract package slug from a URL pathname.
 */
export function extractPackageFromPath(pathname: string): string | null {
  const parsed = parseSymbolUrl(pathname);
  return parsed.packageSlug || null;
}

/**
 * Extract full symbol path for mapping lookup.
 * Returns format: "{package}/{symbolPath}"
 */
export function extractSymbolPathForMapping(pathname: string): string | null {
  const parsed = parseSymbolUrl(pathname);
  if (!parsed.packageSlug || !parsed.symbolPath) return null;
  return `${parsed.packageSlug}/${parsed.symbolPath}`;
}

// =============================================================================
// Name Normalization
// =============================================================================

/**
 * Normalize a symbol name for cross-language matching.
 *
 * Converts both camelCase and snake_case to a canonical lowercase form
 * without separators for comparison.
 *
 * @param name - The symbol name to normalize
 * @returns Normalized symbol with search terms
 */
export function normalizeSymbolName(name: string): NormalizedSymbol {
  // Convert camelCase to parts: "embedDocuments" -> ["embed", "Documents"]
  const camelParts = name.split(/(?=[A-Z])/);

  // Convert snake_case to parts: "embed_documents" -> ["embed", "documents"]
  const snakeParts = name.split("_");

  // Combine and dedupe parts
  const allParts = [...new Set([...camelParts, ...snakeParts])]
    .map((p) => p.toLowerCase())
    .filter((p) => p.length > 0);

  // Create normalized form: lowercase, no separators
  const normalized = name
    .replace(/_/g, "")
    .replace(/([a-z])([A-Z])/g, "$1$2")
    .toLowerCase();

  return {
    name,
    normalized,
    searchTerms: [name.toLowerCase(), ...allParts],
  };
}

// =============================================================================
// Match Scoring
// =============================================================================

/**
 * Calculate the match score between a source symbol and a search result.
 *
 * @param source - Normalized source symbol
 * @param target - Search result to compare against
 * @returns Match score between 0 and 1
 */
export function calculateMatchScore(source: NormalizedSymbol, target: { title: string }): number {
  const targetNormalized = normalizeSymbolName(target.title);

  // Exact name match (highest priority)
  if (source.name === target.title) {
    return 1.0;
  }

  // Normalized match (camelCase ↔ snake_case equivalence)
  if (source.normalized === targetNormalized.normalized) {
    return 0.95;
  }

  // Partial match (one contains the other)
  if (
    source.normalized.includes(targetNormalized.normalized) ||
    targetNormalized.normalized.includes(source.normalized)
  ) {
    // Prefer longer matches
    const ratio =
      Math.min(source.normalized.length, targetNormalized.normalized.length) /
      Math.max(source.normalized.length, targetNormalized.normalized.length);
    return 0.5 + ratio * 0.2; // 0.5-0.7 range
  }

  // Word overlap scoring
  const sourceWords = new Set(source.searchTerms);
  const targetWords = new Set(targetNormalized.searchTerms);
  const overlap = [...sourceWords].filter((w) => targetWords.has(w)).length;
  const totalWords = Math.max(sourceWords.size, targetWords.size);

  if (overlap > 0 && totalWords > 0) {
    return (overlap / totalWords) * 0.5; // 0-0.5 range
  }

  return 0;
}

// =============================================================================
// Search Integration
// =============================================================================

/**
 * Search for symbols in the target language using the search API.
 *
 * @param query - Search query (symbol name or normalized form)
 * @param targetLanguage - Target language to search in
 * @param limit - Maximum number of results
 * @returns Array of search results
 */
export async function searchTargetLanguage(
  query: string,
  targetLanguage: Language,
  limit: number = 10,
): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      language: targetLanguage,
      limit: String(limit),
    });

    const response = await fetch(`/api/search/query?${params}`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.warn(`[symbol-resolution] Search API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("[symbol-resolution] Search failed:", error);
    return [];
  }
}

// =============================================================================
// Main Resolution Logic
// =============================================================================

/**
 * Resolve a symbol to its equivalent in another language.
 *
 * Resolution priority:
 * 1. Explicit path mappings (SYMBOL_MAPPINGS)
 * 2. Symbol name aliases (SYMBOL_ALIASES) + search
 * 3. Exact/normalized name search
 * 4. Package fallback
 * 5. Language fallback
 *
 * @param symbolPath - Full symbol path from URL (e.g., "langchain-core/messages/BaseMessage")
 * @param symbolName - Symbol name (e.g., "BaseMessage")
 * @param sourceLanguage - Source language
 * @param targetLanguage - Target language
 * @param sourcePackage - Source package slug (optional)
 * @returns Resolution result
 */
export async function resolveSymbol(
  symbolPath: string,
  symbolName: string,
  sourceLanguage: Language,
  targetLanguage: Language,
  sourcePackage?: string,
): Promise<ResolveSymbolResponse> {
  // 1. Check explicit path mappings (highest priority)
  const explicitMapping = getExplicitMapping(symbolPath, sourceLanguage, targetLanguage);
  if (explicitMapping) {
    return {
      found: true,
      targetUrl: `/${targetLanguage}/${explicitMapping}`,
      matchType: "explicit",
      score: 1.0,
      context: {
        package: explicitMapping.split("/")[0],
      },
    };
  }

  // 2. Check symbol name aliases
  const aliasedName = getSymbolAlias(symbolName, sourceLanguage, targetLanguage);
  if (aliasedName) {
    // Search for the aliased name
    const aliasResults = await searchTargetLanguage(aliasedName, targetLanguage, 5);
    if (aliasResults.length > 0) {
      const bestMatch = aliasResults[0];
      return {
        found: true,
        targetUrl: bestMatch.url,
        matchType: "alias",
        score: 0.98,
        matchedSymbol: aliasedName,
        context: {
          package: bestMatch.url.split("/")[2] || "",
        },
      };
    }
  }

  // 3. Search for exact/normalized match
  const normalized = normalizeSymbolName(symbolName);
  const searchResults = await searchTargetLanguage(symbolName, targetLanguage, 20);

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
      const equivalentPkg = getEquivalentPackage(sourcePackage, sourceLanguage, targetLanguage);
      if (equivalentPkg) {
        const packageMatch = rankedResults.find((r) => r.result.url.includes(`/${equivalentPkg}/`));
        if (packageMatch && packageMatch.score >= MATCH_THRESHOLD) {
          return {
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
        }
      }
    }

    // Use best overall match if it meets threshold
    if (bestMatch.score >= MATCH_THRESHOLD) {
      const matchType: MatchResult["matchType"] =
        bestMatch.score === 1 ? "exact" : bestMatch.score >= 0.9 ? "normalized" : "fuzzy";

      return {
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
    }
  }

  // 4. Fallback to equivalent package
  if (sourcePackage) {
    const equivalentPkg = getEquivalentPackage(sourcePackage, sourceLanguage, targetLanguage);
    if (equivalentPkg) {
      return {
        found: false,
        targetUrl: `/${targetLanguage}/${equivalentPkg}`,
        matchType: "package",
        score: 0,
        context: {
          package: equivalentPkg,
        },
      };
    }
  }

  // 5. Ultimate fallback to language landing
  return {
    found: false,
    targetUrl: `/${targetLanguage}`,
    matchType: "language",
    score: 0,
  };
}

/**
 * Convenience function to resolve from a full URL pathname.
 *
 * @param pathname - Full URL pathname (e.g., "/javascript/langchain-core/messages/BaseMessage")
 * @param targetLanguage - Target language to resolve to
 * @returns Resolution result
 */
export async function resolveFromPathname(
  pathname: string,
  targetLanguage: Language,
): Promise<ResolveSymbolResponse> {
  const parsed = parseSymbolUrl(pathname);

  // If no symbol path, just return language landing
  if (!parsed.symbolPath) {
    const equivalentPkg = getEquivalentPackage(parsed.packageSlug, parsed.language, targetLanguage);
    if (equivalentPkg) {
      return {
        found: false,
        targetUrl: `/${targetLanguage}/${equivalentPkg}`,
        matchType: "package",
        score: 0,
        context: { package: equivalentPkg },
      };
    }
    return {
      found: false,
      targetUrl: `/${targetLanguage}`,
      matchType: "language",
      score: 0,
    };
  }

  const symbolPath = `${parsed.packageSlug}/${parsed.symbolPath}`;

  return resolveSymbol(
    symbolPath,
    parsed.symbolName,
    parsed.language,
    targetLanguage,
    parsed.packageSlug,
  );
}
