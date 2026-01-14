/**
 * Service Worker Registration
 *
 * Handles registering, updating, and communicating with the Service Worker.
 */

/**
 * Service Worker message types
 */
export type SWMessageType =
  | "SKIP_WAITING"
  | "GET_CACHE_STATS"
  | "CLEAR_CACHE"
  | "PREFETCH"
  | "CACHE_UPDATED"
  | "CACHE_STATS"
  | "CACHE_CLEARED";

/**
 * Cache stats from Service Worker
 */
export interface SWCacheStats {
  symbolCount: number;
  staticCount: number;
  totalSize: number;
  entries: Array<{
    url: string;
    size: number;
    cachedAt: string | null;
  }>;
}

/**
 * Service Worker registration options
 */
export interface SWRegistrationOptions {
  /** Called when a new service worker is installed and waiting */
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  /** Called when the cache is updated */
  onCacheUpdated?: (url: string) => void;
  /** Called when cache stats are received */
  onCacheStats?: (stats: SWCacheStats) => void;
}

// Store callbacks for SW messages
let onCacheUpdatedCallback: ((url: string) => void) | null = null;
let onCacheStatsCallback: ((stats: SWCacheStats) => void) | null = null;

/**
 * Register the Service Worker
 */
export async function registerServiceWorker(
  options: SWRegistrationOptions = {}
): Promise<ServiceWorkerRegistration | null> {
  // Only run in browser
  if (typeof window === "undefined") return null;

  // Check for service worker support
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] Service workers not supported");
    return null;
  }

  // Store callbacks
  onCacheUpdatedCallback = options.onCacheUpdated || null;
  onCacheStatsCallback = options.onCacheStats || null;

  try {
    // Register the service worker
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    console.log("[SW] Registered with scope:", registration.scope);

    // Handle updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // New service worker is waiting
          console.log("[SW] New version available");
          options.onUpdate?.(registration);
        }
      });
    });

    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener("message", handleSWMessage);

    // Check for waiting service worker on page load
    if (registration.waiting) {
      options.onUpdate?.(registration);
    }

    return registration;
  } catch (error) {
    console.error("[SW] Registration failed:", error);
    return null;
  }
}

/**
 * Handle messages from the Service Worker
 */
function handleSWMessage(event: MessageEvent): void {
  const { type, payload, url } = event.data || {};

  switch (type) {
    case "CACHE_UPDATED":
      onCacheUpdatedCallback?.(url);
      break;

    case "CACHE_STATS":
      onCacheStatsCallback?.(payload);
      break;

    case "CACHE_CLEARED":
      console.log("[SW] Cache cleared");
      break;
  }
}

/**
 * Skip waiting and activate a new service worker
 */
export function skipWaiting(): void {
  navigator.serviceWorker.controller?.postMessage({
    type: "SKIP_WAITING",
  });
}

/**
 * Request cache statistics from the Service Worker
 */
export function requestCacheStats(): void {
  navigator.serviceWorker.controller?.postMessage({
    type: "GET_CACHE_STATS",
  });
}

/**
 * Clear Service Worker cache
 */
export function clearSWCache(cacheType?: "symbols" | "static"): void {
  navigator.serviceWorker.controller?.postMessage({
    type: "CLEAR_CACHE",
    payload: cacheType ? { cacheType } : undefined,
  });
}

/**
 * Request prefetching of URLs
 */
export function prefetchUrls(urls: string[]): void {
  navigator.serviceWorker.controller?.postMessage({
    type: "PREFETCH",
    payload: { urls },
  });
}

/**
 * Check if service worker is active
 */
export function isSWActive(): boolean {
  return !!(typeof navigator !== "undefined" && navigator.serviceWorker?.controller);
}

/**
 * Unregister all service workers
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    return true;
  } catch (error) {
    console.error("[SW] Unregister failed:", error);
    return false;
  }
}
