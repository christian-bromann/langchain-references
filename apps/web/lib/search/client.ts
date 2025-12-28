/**
 * Search Client
 *
 * Client-side search implementation that calls the backend search API.
 * The actual search is performed server-side to avoid loading large indices.
 */

import type { SearchResult, SearchOptions } from "@langchain/ir-schema";

// Re-export types for convenience
export type { SearchResult, SearchOptions };

/** Supported search languages */
type SearchLanguage = "python" | "javascript";

/**
 * Search API response
 */
interface SearchResponse {
  results: SearchResult[];
  total: number;
}

/**
 * Search the documentation via the backend API
 *
 * @param query - Search query string
 * @param language - Language to search ("python" or "javascript")
 * @param options - Search options
 * @returns Array of search results sorted by relevance
 */
export async function search(
  query: string,
  language: SearchLanguage,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 20, kind, packageId } = options;

  if (!query.trim()) {
    return [];
  }

  // Build query parameters
  const params = new URLSearchParams({
    q: query,
    language,
    limit: String(limit),
  });

  if (kind) {
    params.set("kind", kind);
  }

  if (packageId) {
    params.set("packageId", packageId);
  }

  try {
    const response = await fetch(`/api/search/query?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data: SearchResponse = await response.json();
    return data.results;
  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}

/**
 * Preload is now a no-op since search is handled server-side.
 * Kept for API compatibility.
 */
export async function preloadIndex(
  _language: SearchLanguage
): Promise<void> {
  // No-op: search is handled server-side
}

/**
 * Clear cache is now a no-op since caching is handled server-side.
 * Kept for API compatibility.
 */
export function clearCache(): void {
  // No-op: caching is handled server-side
}
