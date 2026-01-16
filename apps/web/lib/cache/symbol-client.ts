/**
 * Symbol Client
 *
 * Client-side API for fetching symbols with cache-first strategy.
 * Uses IndexedDB for persistent storage and Service Worker for network caching.
 */

import { getSymbolCache, getSymbolCacheKey, getCatalogCacheKey } from "./symbol-cache";
import { getCacheManager } from "./cache-manager";
import type { SymbolRecord } from "@/lib/ir/types";
import type { CatalogEntry } from "@/lib/ir/loader";

/**
 * Result of a cached fetch operation
 */
export interface CachedFetchResult<T> {
  /** The data */
  data: T;
  /** Whether the data came from cache */
  fromCache: boolean;
  /** Timestamp when cached (null if from network) */
  cachedAt: number | null;
  /** Whether the data is stale and should be refreshed */
  isStale: boolean;
}

/**
 * Stale threshold - data older than this is considered stale
 */
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Build the API URL for a symbol
 */
function buildSymbolApiUrl(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPath: string,
): string {
  const basePath = `/api/ref/${language}/${packageSlug}`;
  if (symbolPath) {
    return `${basePath}/${symbolPath}?format=json`;
  }
  return `${basePath}?format=json`;
}

/**
 * Fetch a symbol with cache-first strategy
 *
 * 1. Check IndexedDB cache first
 * 2. If cached and not stale, return immediately
 * 3. If cached but stale, return cached and refresh in background
 * 4. If not cached, fetch from network and cache
 */
export async function getSymbol(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPath: string,
): Promise<CachedFetchResult<SymbolRecord> | null> {
  const cacheKey = getSymbolCacheKey(language, packageSlug, symbolPath);
  const manager = getCacheManager();

  // Check cache first
  const cached = await manager.getSymbol(cacheKey);

  if (cached) {
    const isStale = Date.now() - cached.cachedAt > STALE_THRESHOLD_MS;

    // If stale, trigger background refresh
    if (isStale && navigator.onLine) {
      refreshSymbolInBackground(language, packageSlug, symbolPath, cacheKey);
    }

    return {
      data: cached.data,
      fromCache: true,
      cachedAt: cached.cachedAt,
      isStale,
    };
  }

  // Not in cache, fetch from network
  if (!navigator.onLine) {
    // Offline and no cache
    return null;
  }

  try {
    const url = buildSymbolApiUrl(language, packageSlug, symbolPath);
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[SymbolClient] Failed to fetch symbol: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as SymbolRecord;

    // Get build ID from response header or generate one
    const buildId = response.headers.get("x-build-id") || Date.now().toString();

    // Cache the result
    await manager.cacheSymbol(cacheKey, data, buildId);

    return {
      data,
      fromCache: false,
      cachedAt: null,
      isStale: false,
    };
  } catch (error) {
    console.error("[SymbolClient] Fetch error:", error);
    return null;
  }
}

/**
 * Refresh a symbol in the background without blocking
 */
async function refreshSymbolInBackground(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPath: string,
  cacheKey: string,
): Promise<void> {
  try {
    const url = buildSymbolApiUrl(language, packageSlug, symbolPath);
    const response = await fetch(url);

    if (!response.ok) return;

    const data = (await response.json()) as SymbolRecord;
    const buildId = response.headers.get("x-build-id") || Date.now().toString();
    const manager = getCacheManager();

    await manager.cacheSymbol(cacheKey, data, buildId);

    // Dispatch event for UI updates
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("symbol-cache-updated", {
          detail: { key: cacheKey },
        }),
      );
    }
  } catch (error) {
    // Silently fail background refresh
    console.debug("[SymbolClient] Background refresh failed:", error);
  }
}

/**
 * Fetch a package catalog with cache-first strategy
 */
export async function getCatalog(
  language: "python" | "javascript",
  packageSlug: string,
): Promise<CachedFetchResult<CatalogEntry[]> | null> {
  const cacheKey = getCatalogCacheKey(language, packageSlug);
  const manager = getCacheManager();

  // Check cache first
  const cached = await manager.getCatalog(cacheKey);

  if (cached) {
    const isStale = Date.now() - cached.cachedAt > STALE_THRESHOLD_MS;

    // If stale, trigger background refresh
    if (isStale && navigator.onLine) {
      refreshCatalogInBackground(language, packageSlug, cacheKey);
    }

    return {
      data: cached.entries,
      fromCache: true,
      cachedAt: cached.cachedAt,
      isStale,
    };
  }

  // Not in cache, fetch from network
  if (!navigator.onLine) {
    return null;
  }

  try {
    const url = buildSymbolApiUrl(language, packageSlug, "");
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    const entries = json.symbols as CatalogEntry[];
    const buildId = response.headers.get("x-build-id") || Date.now().toString();

    // Cache the result
    await manager.cacheCatalog(cacheKey, entries, buildId);

    return {
      data: entries,
      fromCache: false,
      cachedAt: null,
      isStale: false,
    };
  } catch (error) {
    console.error("[SymbolClient] Catalog fetch error:", error);
    return null;
  }
}

/**
 * Refresh a catalog in the background
 */
async function refreshCatalogInBackground(
  language: "python" | "javascript",
  packageSlug: string,
  cacheKey: string,
): Promise<void> {
  try {
    const url = buildSymbolApiUrl(language, packageSlug, "");
    const response = await fetch(url);

    if (!response.ok) return;

    const json = await response.json();
    const entries = json.symbols as CatalogEntry[];
    const buildId = response.headers.get("x-build-id") || Date.now().toString();
    const manager = getCacheManager();

    await manager.cacheCatalog(cacheKey, entries, buildId);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("catalog-cache-updated", {
          detail: { key: cacheKey },
        }),
      );
    }
  } catch {
    // Silently fail background refresh
  }
}

/**
 * Prefetch symbols for faster navigation
 */
export async function prefetchSymbols(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPaths: string[],
): Promise<void> {
  const manager = getCacheManager();

  // Filter out already cached symbols
  const uncachedPaths: string[] = [];
  for (const path of symbolPaths) {
    const cacheKey = getSymbolCacheKey(language, packageSlug, path);
    const isCached = await manager.hasSymbol(cacheKey);
    if (!isCached) {
      uncachedPaths.push(path);
    }
  }

  if (uncachedPaths.length === 0) return;

  // Build URLs for prefetching
  const urls = uncachedPaths.map((path) => buildSymbolApiUrl(language, packageSlug, path));

  // Use Service Worker to prefetch if available
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    navigator.serviceWorker.controller.postMessage({
      type: "PREFETCH",
      payload: { urls },
    });
    return;
  }

  // Fallback: fetch directly (limited to 3 concurrent)
  const batchSize = 3;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (url, index) => {
        try {
          const response = await fetch(url);
          if (!response.ok) return;

          const data = (await response.json()) as SymbolRecord;
          const buildId = response.headers.get("x-build-id") || Date.now().toString();
          const cacheKey = getSymbolCacheKey(language, packageSlug, uncachedPaths[i + index]);

          await manager.cacheSymbol(cacheKey, data, buildId);
        } catch {
          // Ignore prefetch failures
        }
      }),
    );
  }
}

/**
 * Check if a symbol is cached
 */
export async function isSymbolCached(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPath: string,
): Promise<boolean> {
  const cacheKey = getSymbolCacheKey(language, packageSlug, symbolPath);
  const manager = getCacheManager();
  return manager.hasSymbol(cacheKey);
}

/**
 * Get all cached symbol keys for a package
 */
export async function getCachedSymbolsForPackage(
  language: "python" | "javascript",
  packageSlug: string,
): Promise<string[]> {
  const cache = getSymbolCache();
  const allKeys = await cache.getAllSymbolKeys();
  const prefix = `${language}/${packageSlug}/`;

  return allKeys.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
}
