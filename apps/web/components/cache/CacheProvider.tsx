"use client";

/**
 * Cache Provider Component
 *
 * Provides cache context and registers the Service Worker.
 * Must be placed near the root of the app to ensure caching is available everywhere.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  registerServiceWorker,
  requestCacheStats,
  clearSWCache,
  skipWaiting,
  isSWActive,
  type SWCacheStats,
} from "@/lib/cache/sw-register";
import { getCacheManager, type CacheStats } from "@/lib/cache/cache-manager";

/**
 * Cache context value
 */
interface CacheContextValue {
  /** Whether the Service Worker is active */
  isServiceWorkerActive: boolean;
  /** Whether a SW update is available */
  hasUpdate: boolean;
  /** Apply the pending SW update */
  applyUpdate: () => void;
  /** Current online status */
  isOnline: boolean;
  /** Cache statistics */
  cacheStats: CacheStats | null;
  /** Service Worker cache stats */
  swCacheStats: SWCacheStats | null;
  /** Refresh cache statistics */
  refreshStats: () => Promise<void>;
  /** Clear all caches */
  clearCache: () => Promise<void>;
  /** Whether cache is loading */
  isLoading: boolean;
  /** Last cache update URL */
  lastCacheUpdate: string | null;
}

const CacheContext = createContext<CacheContextValue | null>(null);

/**
 * Hook to access cache context
 */
export function useCache(): CacheContextValue {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error("useCache must be used within a CacheProvider");
  }
  return context;
}

/**
 * Hook to safely access cache context (returns null if not in provider)
 */
export function useCacheSafe(): CacheContextValue | null {
  return useContext(CacheContext);
}

interface CacheProviderProps {
  children: ReactNode;
}

export function CacheProvider({ children }: CacheProviderProps) {
  const [isServiceWorkerActive, setIsServiceWorkerActive] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [swCacheStats, setSwCacheStats] = useState<SWCacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<string | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Register Service Worker on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Set initial online status
      setIsOnline(navigator.onLine);

      // Register service worker
      const registration = await registerServiceWorker({
        onUpdate: (reg) => {
          if (mounted) {
            setHasUpdate(true);
            setSwRegistration(reg);
          }
        },
        onCacheUpdated: (url) => {
          if (mounted) {
            setLastCacheUpdate(url);
          }
        },
        onCacheStats: (stats) => {
          if (mounted) {
            setSwCacheStats(stats);
          }
        },
      });

      if (mounted) {
        setIsServiceWorkerActive(!!registration?.active || isSWActive());
        setIsLoading(false);
      }
    }

    init();

    // Listen for online/offline events
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Refresh cache statistics
  const refreshStats = useCallback(async () => {
    try {
      const manager = getCacheManager();
      const stats = await manager.getStats();
      setCacheStats(stats);

      // Also request SW cache stats
      if (isSWActive()) {
        requestCacheStats();
      }
    } catch (error) {
      console.error("[CacheProvider] Failed to refresh stats:", error);
    }
  }, []);

  // Load initial stats
  useEffect(() => {
    if (!isLoading) {
      refreshStats();
    }
  }, [isLoading, refreshStats]);

  // Apply SW update
  const applyUpdate = useCallback(() => {
    if (swRegistration?.waiting) {
      skipWaiting();
      // Reload to get the new version
      window.location.reload();
    }
  }, [swRegistration]);

  // Clear all caches
  const clearCache = useCallback(async () => {
    try {
      const manager = getCacheManager();
      await manager.clearAll();
      clearSWCache();
      await refreshStats();
    } catch (error) {
      console.error("[CacheProvider] Failed to clear cache:", error);
    }
  }, [refreshStats]);

  const value: CacheContextValue = {
    isServiceWorkerActive,
    hasUpdate,
    applyUpdate,
    isOnline,
    cacheStats,
    swCacheStats,
    refreshStats,
    clearCache,
    isLoading,
    lastCacheUpdate,
  };

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}
