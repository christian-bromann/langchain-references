/**
 * Cache Module
 *
 * Exports all caching utilities for offline symbol storage.
 */

// Core cache utilities
export {
  getSymbolCache,
  getSymbolCacheKey,
  getCatalogCacheKey,
  type CachedSymbol,
  type CachedCatalog,
  type CacheMetadata,
  SymbolCache,
} from "./symbol-cache";

// Cache manager
export {
  getCacheManager,
  initCacheManager,
  CacheManager,
  type CacheConfig,
  type CacheStats,
} from "./cache-manager";

// Client API
export {
  getSymbol,
  getCatalog,
  prefetchSymbols,
  isSymbolCached,
  getCachedSymbolsForPackage,
  type CachedFetchResult,
} from "./symbol-client";

// Service Worker utilities
export {
  registerServiceWorker,
  skipWaiting,
  requestCacheStats,
  clearSWCache,
  prefetchUrls,
  isSWActive,
  unregisterServiceWorker,
  type SWMessageType,
  type SWCacheStats,
  type SWRegistrationOptions,
} from "./sw-register";

// React hooks
export {
  usePrefetch,
  usePrefetchOnHover,
  usePrefetchSymbolOnHover,
  type PrefetchableSymbol,
  type UsePrefetchOptions,
} from "./use-prefetch";
