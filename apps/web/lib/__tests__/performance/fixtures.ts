/**
 * Performance test fixtures - loads static test data from ./fixtures/
 *
 * Uses a snapshot of langchain-core data for consistent benchmarking.
 * These fixtures are committed to the repo to ensure reproducible results.
 */
import { readFileSync } from "fs";
import { join } from "path";

// Path to static fixtures directory (relative to this file)
const FIXTURES_PATH = join(__dirname, "fixtures");

/**
 * Routing map entry structure
 */
interface RoutingEntry {
  kind: string;
  title: string;
  refId: string;
  qualifiedName?: string;
}

/**
 * Standard routing map structure
 */
export interface RoutingMap {
  slugs: Record<string, RoutingEntry>;
}

/**
 * Indexed routing map with pre-computed lookups
 */
export interface IndexedRoutingMap extends RoutingMap {
  byTitle: Map<string, string>; // symbol name → qualified name
  byKind: Map<string, string[]>; // kind → qualified names
}

/**
 * Load the langchain-core routing map fixture.
 * This is a static snapshot for consistent benchmark results.
 *
 * @param _packageId - Ignored, always loads langchain-core fixture
 */
export function loadRoutingMap(_packageId?: string): RoutingMap {
  const routingPath = join(FIXTURES_PATH, "routing-langchain-core.json");
  return JSON.parse(readFileSync(routingPath, "utf-8"));
}

/**
 * Load the langchain-python package index fixture.
 */
export function loadPackageIndex(
  _project?: string,
  _language?: string,
): Record<string, { buildId: string; publishedName?: string }> {
  const indexPath = join(FIXTURES_PATH, "index-langchain-python.json");
  const data = JSON.parse(readFileSync(indexPath, "utf-8"));
  return data.packages || {};
}

/**
 * Load individual symbol data (stub implementation for fixtures)
 */
export function loadSymbolData(_packageId: string, refId: string): Record<string, unknown> | null {
  // For fixture-based testing, return a mock symbol structure
  // Real symbol data would be too large to include in fixtures
  return {
    id: refId,
    name: refId.split("/").pop() || refId,
    kind: "class",
    members: [],
  };
}

/**
 * Build indexed routing map from fixture data for O(1) lookups
 */
export function loadIndexedRoutingMap(_packageId?: string): IndexedRoutingMap {
  const base = loadRoutingMap();
  const byTitle = new Map<string, string>();
  const byKind = new Map<string, string[]>();

  for (const [qualifiedName, entry] of Object.entries(base.slugs)) {
    // Index by title for O(1) name lookup
    byTitle.set(entry.title, qualifiedName);

    // Index by kind for filtered queries
    const kindList = byKind.get(entry.kind) || [];
    kindList.push(qualifiedName);
    byKind.set(entry.kind, kindList);
  }

  return { ...base, byTitle, byKind };
}

/**
 * Simple slugify function for symbol paths (matches production code)
 */
export function slugifySymbolPath(symbolPath: string, hasPackagePrefix = true): string {
  const parts = symbolPath.split(".");
  if (parts.length === 1) return parts[0];
  if (hasPackagePrefix) return parts.slice(1).join("/");
  return parts.join("/");
}

// Memoization cache for slugifySymbolPath
const slugifyCache = new Map<string, string>();
const CACHE_SIZE = 1000;

/**
 * Memoized version of slugifySymbolPath with bounded LRU cache
 */
export function slugifySymbolPathMemoized(symbolPath: string, hasPackagePrefix = true): string {
  const cacheKey = `${symbolPath}:${hasPackagePrefix}`;

  if (slugifyCache.has(cacheKey)) {
    return slugifyCache.get(cacheKey)!;
  }

  // Evict oldest if at capacity (simple FIFO eviction)
  if (slugifyCache.size >= CACHE_SIZE) {
    const firstKey = slugifyCache.keys().next().value;
    if (firstKey) slugifyCache.delete(firstKey);
  }

  const result = slugifySymbolPath(symbolPath, hasPackagePrefix);
  slugifyCache.set(cacheKey, result);
  return result;
}

/**
 * Clear the slugify cache (for testing)
 */
export function clearSlugifyCache(): void {
  slugifyCache.clear();
}
