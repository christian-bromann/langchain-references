/**
 * IndexedDB Symbol Cache
 *
 * Provides persistent client-side storage for symbol data using IndexedDB.
 * Supports offline access and reduces network requests for frequently viewed symbols.
 */

import type { SymbolRecord } from "@/lib/ir/types";
import type { CatalogEntry } from "@/lib/ir/loader";

// Database configuration
const DB_NAME = "langchain-reference-cache";
const DB_VERSION = 1;

// Store names
const SYMBOLS_STORE = "symbols";
const CATALOGS_STORE = "catalogs";
const METADATA_STORE = "metadata";

/**
 * Cached symbol entry
 */
export interface CachedSymbol {
  /** Cache key: "python/langchain_core/ChatOpenAI" */
  key: string;
  /** Full symbol data */
  data: SymbolRecord;
  /** Timestamp when cached */
  cachedAt: number;
  /** Build ID for cache invalidation */
  buildId: string;
  /** Approximate size in bytes */
  size: number;
  /** Last accessed timestamp for LRU */
  accessedAt: number;
}

/**
 * Cached catalog entry for package pages
 */
export interface CachedCatalog {
  /** Cache key: "python/langchain_core" */
  key: string;
  /** Catalog entries */
  entries: CatalogEntry[];
  /** Timestamp when cached */
  cachedAt: number;
  /** Build ID for cache invalidation */
  buildId: string;
  /** Approximate size in bytes */
  size: number;
  /** Last accessed timestamp for LRU */
  accessedAt: number;
}

/**
 * Cache metadata
 */
export interface CacheMetadata {
  key: string;
  value: string | number | boolean;
}

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create symbols store with indexes
      if (!db.objectStoreNames.contains(SYMBOLS_STORE)) {
        const symbolStore = db.createObjectStore(SYMBOLS_STORE, { keyPath: "key" });
        symbolStore.createIndex("cachedAt", "cachedAt", { unique: false });
        symbolStore.createIndex("accessedAt", "accessedAt", { unique: false });
        symbolStore.createIndex("buildId", "buildId", { unique: false });
      }

      // Create catalogs store with indexes
      if (!db.objectStoreNames.contains(CATALOGS_STORE)) {
        const catalogStore = db.createObjectStore(CATALOGS_STORE, { keyPath: "key" });
        catalogStore.createIndex("cachedAt", "cachedAt", { unique: false });
        catalogStore.createIndex("accessedAt", "accessedAt", { unique: false });
        catalogStore.createIndex("buildId", "buildId", { unique: false });
      }

      // Create metadata store
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };
  });
}

/**
 * Generate cache key for a symbol
 */
export function getSymbolCacheKey(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPath: string,
): string {
  return `${language}/${packageSlug}/${symbolPath}`;
}

/**
 * Generate cache key for a catalog
 */
export function getCatalogCacheKey(language: "python" | "javascript", packageSlug: string): string {
  return `${language}/${packageSlug}`;
}

/**
 * Estimate size of an object in bytes
 */
function estimateSize(obj: unknown): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return 0;
  }
}

/**
 * Symbol Cache class for managing cached symbols
 */
export class SymbolCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Get database connection (lazy initialization)
   */
  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase();
    }
    return this.dbPromise;
  }

  /**
   * Store a symbol in the cache
   */
  async setSymbol(key: string, data: SymbolRecord, buildId: string): Promise<void> {
    try {
      const db = await this.getDb();
      const now = Date.now();

      const entry: CachedSymbol = {
        key,
        data,
        cachedAt: now,
        buildId,
        size: estimateSize(data),
        accessedAt: now,
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYMBOLS_STORE, "readwrite");
        const store = transaction.objectStore(SYMBOLS_STORE);
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error("Failed to cache symbol"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to set symbol:", error);
    }
  }

  /**
   * Get a symbol from the cache
   */
  async getSymbol(key: string): Promise<CachedSymbol | null> {
    try {
      const db = await this.getDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYMBOLS_STORE, "readwrite");
        const store = transaction.objectStore(SYMBOLS_STORE);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result as CachedSymbol | undefined;
          if (result) {
            // Update accessedAt for LRU
            result.accessedAt = Date.now();
            store.put(result);
          }
          resolve(result || null);
        };
        request.onerror = () => reject(new Error("Failed to get cached symbol"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to get symbol:", error);
      return null;
    }
  }

  /**
   * Check if a symbol exists in cache
   */
  async hasSymbol(key: string): Promise<boolean> {
    try {
      const db = await this.getDb();

      return new Promise((resolve) => {
        const transaction = db.transaction(SYMBOLS_STORE, "readonly");
        const store = transaction.objectStore(SYMBOLS_STORE);
        const request = store.count(IDBKeyRange.only(key));

        request.onsuccess = () => resolve(request.result > 0);
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * Store a catalog in the cache
   */
  async setCatalog(key: string, entries: CatalogEntry[], buildId: string): Promise<void> {
    try {
      const db = await this.getDb();
      const now = Date.now();

      const entry: CachedCatalog = {
        key,
        entries,
        cachedAt: now,
        buildId,
        size: estimateSize(entries),
        accessedAt: now,
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CATALOGS_STORE, "readwrite");
        const store = transaction.objectStore(CATALOGS_STORE);
        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error("Failed to cache catalog"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to set catalog:", error);
    }
  }

  /**
   * Get a catalog from the cache
   */
  async getCatalog(key: string): Promise<CachedCatalog | null> {
    try {
      const db = await this.getDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CATALOGS_STORE, "readwrite");
        const store = transaction.objectStore(CATALOGS_STORE);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result as CachedCatalog | undefined;
          if (result) {
            // Update accessedAt for LRU
            result.accessedAt = Date.now();
            store.put(result);
          }
          resolve(result || null);
        };
        request.onerror = () => reject(new Error("Failed to get cached catalog"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to get catalog:", error);
      return null;
    }
  }

  /**
   * Get all cached symbol keys
   */
  async getAllSymbolKeys(): Promise<string[]> {
    try {
      const db = await this.getDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(SYMBOLS_STORE, "readonly");
        const store = transaction.objectStore(SYMBOLS_STORE);
        const request = store.getAllKeys();

        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(new Error("Failed to get symbol keys"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to get symbol keys:", error);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    symbolCount: number;
    catalogCount: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    try {
      const db = await this.getDb();

      const getStoreStats = (
        storeName: string,
      ): Promise<{
        count: number;
        size: number;
        oldest: number | null;
        newest: number | null;
      }> => {
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.getAll();

          request.onsuccess = () => {
            const entries = request.result as Array<{ size: number; cachedAt: number }>;
            const size = entries.reduce((sum, e) => sum + (e.size || 0), 0);
            const timestamps = entries.map((e) => e.cachedAt).filter(Boolean);

            resolve({
              count: entries.length,
              size,
              oldest: timestamps.length > 0 ? Math.min(...timestamps) : null,
              newest: timestamps.length > 0 ? Math.max(...timestamps) : null,
            });
          };
          request.onerror = () => resolve({ count: 0, size: 0, oldest: null, newest: null });
        });
      };

      const [symbolStats, catalogStats] = await Promise.all([
        getStoreStats(SYMBOLS_STORE),
        getStoreStats(CATALOGS_STORE),
      ]);

      const allTimestamps = [
        symbolStats.oldest,
        symbolStats.newest,
        catalogStats.oldest,
        catalogStats.newest,
      ].filter((t): t is number => t !== null);

      return {
        symbolCount: symbolStats.count,
        catalogCount: catalogStats.count,
        totalSize: symbolStats.size + catalogStats.size,
        oldestEntry: allTimestamps.length > 0 ? Math.min(...allTimestamps) : null,
        newestEntry: allTimestamps.length > 0 ? Math.max(...allTimestamps) : null,
      };
    } catch (error) {
      console.warn("[SymbolCache] Failed to get stats:", error);
      return {
        symbolCount: 0,
        catalogCount: 0,
        totalSize: 0,
        oldestEntry: null,
        newestEntry: null,
      };
    }
  }

  /**
   * Delete symbols older than a specified timestamp
   */
  async deleteOlderThan(timestamp: number): Promise<number> {
    try {
      const db = await this.getDb();
      let deletedCount = 0;

      const deleteFromStore = (storeName: string): Promise<number> => {
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const index = store.index("accessedAt");
          const range = IDBKeyRange.upperBound(timestamp);
          const request = index.openCursor(range);
          let count = 0;

          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              cursor.delete();
              count++;
              cursor.continue();
            } else {
              resolve(count);
            }
          };
          request.onerror = () => resolve(0);
        });
      };

      const [symbolsDeleted, catalogsDeleted] = await Promise.all([
        deleteFromStore(SYMBOLS_STORE),
        deleteFromStore(CATALOGS_STORE),
      ]);

      deletedCount = symbolsDeleted + catalogsDeleted;
      return deletedCount;
    } catch (error) {
      console.warn("[SymbolCache] Failed to delete old entries:", error);
      return 0;
    }
  }

  /**
   * Get the least recently used entries
   */
  async getLRUEntries(
    limit: number,
  ): Promise<Array<{ key: string; accessedAt: number; size: number }>> {
    try {
      const db = await this.getDb();
      const entries: Array<{ key: string; accessedAt: number; size: number }> = [];

      const getFromStore = (storeName: string): Promise<void> => {
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const index = store.index("accessedAt");
          const request = index.openCursor();

          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor && entries.length < limit * 2) {
              const value = cursor.value as { key: string; accessedAt: number; size: number };
              entries.push({
                key: value.key,
                accessedAt: value.accessedAt,
                size: value.size,
              });
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => resolve();
        });
      };

      await Promise.all([getFromStore(SYMBOLS_STORE), getFromStore(CATALOGS_STORE)]);

      // Sort by accessedAt and take the limit
      return entries.sort((a, b) => a.accessedAt - b.accessedAt).slice(0, limit);
    } catch (error) {
      console.warn("[SymbolCache] Failed to get LRU entries:", error);
      return [];
    }
  }

  /**
   * Delete specific entries by key
   */
  async deleteByKeys(keys: string[]): Promise<void> {
    try {
      const db = await this.getDb();

      const deleteFromStore = (storeName: string): Promise<void> => {
        return new Promise((resolve) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);

          let remaining = keys.length;
          if (remaining === 0) {
            resolve();
            return;
          }

          for (const key of keys) {
            const request = store.delete(key);
            request.onsuccess = () => {
              remaining--;
              if (remaining === 0) resolve();
            };
            request.onerror = () => {
              remaining--;
              if (remaining === 0) resolve();
            };
          }
        });
      };

      await Promise.all([deleteFromStore(SYMBOLS_STORE), deleteFromStore(CATALOGS_STORE)]);
    } catch (error) {
      console.warn("[SymbolCache] Failed to delete entries:", error);
    }
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    try {
      const db = await this.getDb();

      const clearStore = (storeName: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.clear();

          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error(`Failed to clear ${storeName}`));
        });
      };

      await Promise.all([clearStore(SYMBOLS_STORE), clearStore(CATALOGS_STORE)]);
    } catch (error) {
      console.warn("[SymbolCache] Failed to clear cache:", error);
    }
  }

  /**
   * Set metadata value
   */
  async setMetadata(key: string, value: string | number | boolean): Promise<void> {
    try {
      const db = await this.getDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE, "readwrite");
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error("Failed to set metadata"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to set metadata:", error);
    }
  }

  /**
   * Get metadata value
   */
  async getMetadata<T extends string | number | boolean>(key: string): Promise<T | null> {
    try {
      const db = await this.getDb();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE, "readonly");
        const store = transaction.objectStore(METADATA_STORE);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result as CacheMetadata | undefined;
          resolve(result ? (result.value as T) : null);
        };
        request.onerror = () => reject(new Error("Failed to get metadata"));
      });
    } catch (error) {
      console.warn("[SymbolCache] Failed to get metadata:", error);
      return null;
    }
  }
}

// Singleton instance
let symbolCacheInstance: SymbolCache | null = null;

/**
 * Get the symbol cache singleton
 */
export function getSymbolCache(): SymbolCache {
  if (!symbolCacheInstance) {
    symbolCacheInstance = new SymbolCache();
  }
  return symbolCacheInstance;
}
