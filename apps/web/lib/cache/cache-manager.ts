/**
 * Cache Manager
 *
 * High-level cache orchestration with LRU eviction and quota management.
 * Coordinates between Service Worker cache and IndexedDB storage.
 */

import { getSymbolCache, type CachedSymbol, type CachedCatalog } from "./symbol-cache";
import type { SymbolRecord } from "@/lib/ir/types";
import type { CatalogEntry } from "@/lib/ir/loader";

// Default cache configuration
const DEFAULT_MAX_CACHE_SIZE_MB = 50;
const DEFAULT_EVICTION_THRESHOLD = 0.9; // Start evicting at 90% capacity
const DEFAULT_EVICTION_TARGET = 0.7; // Evict down to 70% capacity
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cache manager configuration
 */
export interface CacheConfig {
  /** Maximum cache size in megabytes */
  maxSizeMB: number;
  /** Threshold (0-1) at which to start eviction */
  evictionThreshold: number;
  /** Target (0-1) to evict down to */
  evictionTarget: number;
  /** Time-to-live for cached entries in milliseconds */
  ttlMs: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cached symbols */
  symbolCount: number;
  /** Number of cached catalogs */
  catalogCount: number;
  /** Total cache size in bytes */
  totalSizeBytes: number;
  /** Total cache size formatted as string */
  totalSizeFormatted: string;
  /** Maximum cache size in bytes */
  maxSizeBytes: number;
  /** Cache usage as percentage (0-100) */
  usagePercent: number;
  /** Whether cache is near capacity */
  isNearCapacity: boolean;
  /** Oldest cached entry timestamp */
  oldestEntry: Date | null;
  /** Newest cached entry timestamp */
  newestEntry: Date | null;
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Cache Manager class
 */
export class CacheManager {
  private config: CacheConfig;
  private isEvicting = false;
  private evictionPromise: Promise<void> | null = null;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSizeMB: config?.maxSizeMB ?? DEFAULT_MAX_CACHE_SIZE_MB,
      evictionThreshold: config?.evictionThreshold ?? DEFAULT_EVICTION_THRESHOLD,
      evictionTarget: config?.evictionTarget ?? DEFAULT_EVICTION_TARGET,
      ttlMs: config?.ttlMs ?? CACHE_TTL_MS,
    };
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const cache = getSymbolCache();
    const stats = await cache.getStats();
    const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;
    const usagePercent = (stats.totalSize / maxSizeBytes) * 100;

    return {
      symbolCount: stats.symbolCount,
      catalogCount: stats.catalogCount,
      totalSizeBytes: stats.totalSize,
      totalSizeFormatted: formatBytes(stats.totalSize),
      maxSizeBytes,
      usagePercent: Math.min(usagePercent, 100),
      isNearCapacity: usagePercent >= this.config.evictionThreshold * 100,
      oldestEntry: stats.oldestEntry ? new Date(stats.oldestEntry) : null,
      newestEntry: stats.newestEntry ? new Date(stats.newestEntry) : null,
    };
  }

  /**
   * Cache a symbol with automatic eviction if needed
   */
  async cacheSymbol(key: string, data: SymbolRecord, buildId: string): Promise<void> {
    const cache = getSymbolCache();

    // Check if we need to evict first
    await this.maybeEvict();

    // Store the symbol
    await cache.setSymbol(key, data, buildId);
  }

  /**
   * Get a cached symbol
   */
  async getSymbol(key: string): Promise<CachedSymbol | null> {
    const cache = getSymbolCache();
    const entry = await cache.getSymbol(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.cachedAt > this.config.ttlMs) {
      // Entry is stale, but still return it (stale-while-revalidate)
      // The caller can refresh in the background
      entry.data = { ...entry.data };
    }

    return entry;
  }

  /**
   * Check if a symbol is cached
   */
  async hasSymbol(key: string): Promise<boolean> {
    const cache = getSymbolCache();
    return cache.hasSymbol(key);
  }

  /**
   * Cache a catalog with automatic eviction if needed
   */
  async cacheCatalog(key: string, entries: CatalogEntry[], buildId: string): Promise<void> {
    const cache = getSymbolCache();

    // Check if we need to evict first
    await this.maybeEvict();

    // Store the catalog
    await cache.setCatalog(key, entries, buildId);
  }

  /**
   * Get a cached catalog
   */
  async getCatalog(key: string): Promise<CachedCatalog | null> {
    const cache = getSymbolCache();
    const entry = await cache.getCatalog(key);

    if (!entry) return null;

    // Check if entry is expired (but still return stale data)
    if (Date.now() - entry.cachedAt > this.config.ttlMs) {
      entry.entries = [...entry.entries];
    }

    return entry;
  }

  /**
   * Check if eviction is needed and run it if so
   */
  private async maybeEvict(): Promise<void> {
    // If already evicting, wait for it to complete
    if (this.evictionPromise) {
      await this.evictionPromise;
      return;
    }

    const stats = await this.getStats();

    if (stats.isNearCapacity) {
      this.evictionPromise = this.runEviction();
      await this.evictionPromise;
      this.evictionPromise = null;
    }
  }

  /**
   * Run LRU eviction to free up space
   */
  private async runEviction(): Promise<void> {
    if (this.isEvicting) return;
    this.isEvicting = true;

    try {
      const cache = getSymbolCache();
      const maxBytes = this.config.maxSizeMB * 1024 * 1024;
      const targetBytes = maxBytes * this.config.evictionTarget;

      let stats = await cache.getStats();
      let currentSize = stats.totalSize;

      // First, delete entries older than TTL
      const ttlThreshold = Date.now() - this.config.ttlMs;
      await cache.deleteOlderThan(ttlThreshold);

      stats = await cache.getStats();
      currentSize = stats.totalSize;

      // If still over target, use LRU eviction
      while (currentSize > targetBytes) {
        const lruEntries = await cache.getLRUEntries(10);

        if (lruEntries.length === 0) break;

        const keysToDelete = lruEntries.map((e) => e.key);
        const sizeToFree = lruEntries.reduce((sum, e) => sum + e.size, 0);

        await cache.deleteByKeys(keysToDelete);
        currentSize -= sizeToFree;

        // Safety check to prevent infinite loop
        if (sizeToFree === 0) break;
      }

      console.log(
        `[CacheManager] Eviction complete. Size: ${formatBytes(currentSize)} / ${formatBytes(maxBytes)}`,
      );
    } catch (error) {
      console.error("[CacheManager] Eviction failed:", error);
    } finally {
      this.isEvicting = false;
    }
  }

  /**
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    const cache = getSymbolCache();
    await cache.clear();

    // Also clear Service Worker cache if available
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({
        type: "CLEAR_CACHE",
      });
    }
  }

  /**
   * Clear symbol cache only
   */
  async clearSymbols(): Promise<void> {
    const cache = getSymbolCache();
    await cache.clear();

    // Also clear Service Worker symbol cache
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({
        type: "CLEAR_CACHE",
        payload: { cacheType: "symbols" },
      });
    }
  }

  /**
   * Prefetch symbols in the background
   */
  async prefetch(urls: string[]): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Ask the Service Worker to prefetch
    navigator.serviceWorker.controller?.postMessage({
      type: "PREFETCH",
      payload: { urls },
    });
  }

  /**
   * Get all cached symbol keys
   */
  async getCachedKeys(): Promise<string[]> {
    const cache = getSymbolCache();
    return cache.getAllSymbolKeys();
  }

  /**
   * Check if we're online
   */
  isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CacheConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }
}

// Singleton instance
let cacheManagerInstance: CacheManager | null = null;

/**
 * Get the cache manager singleton
 */
export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
  }
  return cacheManagerInstance;
}

/**
 * Initialize cache manager with custom configuration
 */
export function initCacheManager(config?: Partial<CacheConfig>): CacheManager {
  cacheManagerInstance = new CacheManager(config);
  return cacheManagerInstance;
}
