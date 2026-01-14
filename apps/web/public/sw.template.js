/**
 * Service Worker for LangChain Reference Docs
 *
 * Implements offline-first caching with stale-while-revalidate strategy
 * for symbol data to enable instant page loads and offline access.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE_NAME = `langchain-static-${CACHE_VERSION}`;
const SYMBOL_CACHE_NAME = `langchain-symbols-${CACHE_VERSION}`;

// Paths that should use stale-while-revalidate
const API_PATTERNS = [
  /^\/api\/ref\//,
  /^\/api\/search\/query/,
];

// Static assets to pre-cache
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicons/light/favicon.ico",
  "/favicons/light/favicon-32x32.png",
  "/favicons/dark/favicon.ico",
  "/favicons/dark/favicon-32x32.png",
  "/reference-light.svg",
  "/reference-dark.svg",
];

/**
 * Install event - pre-cache static assets
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Failed to pre-cache some assets:", err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete old versions of our caches
            return (
              (name.startsWith("langchain-static-") && name !== STATIC_CACHE_NAME) ||
              (name.startsWith("langchain-symbols-") && name !== SYMBOL_CACHE_NAME)
            );
          })
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

/**
 * Check if a request matches our API patterns
 */
function isApiRequest(url) {
  const pathname = new URL(url).pathname;
  return API_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Check if a request is for a static asset
 */
function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".ico")
  );
}

/**
 * Check if a request is an RSC (React Server Component) request
 */
function isRSCRequest(url) {
  const searchParams = new URL(url).searchParams;
  return searchParams.has("_rsc");
}

/**
 * Stale-while-revalidate strategy for API requests
 * Returns cached response immediately, then fetches fresh data in background
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SYMBOL_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Start fetching fresh data in parallel
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      // Only cache successful responses
      if (networkResponse.ok) {
        // Clone the response because we need to consume it twice
        const clonedResponse = networkResponse.clone();

        // Store in cache with timestamp header
        const headers = new Headers(clonedResponse.headers);
        headers.set("sw-cached-at", Date.now().toString());

        // Put in cache asynchronously
        cache.put(
          request,
          new Response(clonedResponse.body, {
            status: clonedResponse.status,
            statusText: clonedResponse.statusText,
            headers,
          })
        );

        // Notify clients that fresh data is available
        notifyClientsOfUpdate(request.url);
      }
      return networkResponse;
    })
    .catch((error) => {
      console.warn("[SW] Network fetch failed:", error);
      // Return cached response if network fails
      if (cachedResponse) {
        return cachedResponse;
      }
      throw error;
    });

  // Return cached response immediately if available
  if (cachedResponse) {
    // Add header to indicate this is from cache
    const headers = new Headers(cachedResponse.headers);
    headers.set("sw-from-cache", "true");

    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  }

  // No cache, wait for network
  return fetchPromise;
}

/**
 * Cache-first strategy for static assets
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }

  return networkResponse;
}

/**
 * Notify all clients that fresh data is available
 */
function notifyClientsOfUpdate(url) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "CACHE_UPDATED",
        url,
      });
    });
  });
}

/**
 * Fetch event handler
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip non-http(s) requests
  if (!request.url.startsWith("http")) {
    return;
  }

  const url = new URL(request.url);

  // Handle root /favicon.ico requests - redirect to themed favicon
  if (url.pathname === "/favicon.ico") {
    event.respondWith(
      caches.match("/favicons/dark/favicon.ico").then((cached) => {
        if (cached) return cached;
        // Fallback to fetching the dark favicon
        return fetch("/favicons/dark/favicon.ico");
      })
    );
    return;
  }

  // Handle API requests with stale-while-revalidate
  if (isApiRequest(request.url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Handle static assets with cache-first
  if (isStaticAsset(request.url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Handle RSC requests - cache them separately (don't mix with HTML)
  // RSC requests are for client-side navigation, not full page loads
  if (isRSCRequest(request.url)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(SYMBOL_CACHE_NAME).then((cache) => {
              // Store RSC responses in symbol cache, not static cache
              cache.put(request.url, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Try to serve RSC from cache
          return caches.match(request.url);
        })
    );
    return;
  }

  // For navigation requests (HTML), use network-first with caching
  // These are full page loads (F5 refresh, direct URL access)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Cache successful HTML navigation responses for offline access
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              // Store HTML pages in static cache with exact URL
              cache.put(request.url, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline, try to serve HTML from static cache
          return caches.match(request.url).then((response) => {
            if (response) {
              return response;
            }
            // No cached HTML - show offline page
            return new Response(
              `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline | LangChain Reference Docs</title>
  <link rel="icon" href="/favicons/dark/favicon.ico">
  <style>
    :root {
      /* Colors from globals.css dark mode */
      --bg-primary: #0D0D0D;
      --bg-secondary: #1A1A1A;
      --text-primary: #FAFAFA;
      --text-secondary: #A0A0A0;
      --text-muted: #707070;
      --border-light: #2A2A2A;
      --color-primary: #2F6868;
      --color-light: #84C4C0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background-color: var(--bg-secondary);
      border-bottom: 1px solid var(--border-light);
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .logo {
      height: 24px;
      width: auto;
    }
    .site-name {
      font-family: 'Manrope', sans-serif;
      font-weight: 600;
      font-size: 1.1rem;
      color: var(--text-primary);
    }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
    }
    .offline-icon-container {
      position: relative;
      width: 80px;
      height: 80px;
      margin-bottom: 1.5rem;
    }
    .offline-icon {
      width: 80px;
      height: 80px;
      color: var(--color-light);
    }
    h1 {
      font-family: 'Manrope', sans-serif;
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
      font-size: 1.1rem;
      max-width: 400px;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .retry-btn {
      background: var(--color-primary);
      color: #FFFFFF;
      border: none;
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .retry-btn:hover {
      background: var(--color-light);
      color: #0D0D0D;
    }
    .cache-hint {
      margin-top: 2rem;
      padding: 1rem 1.25rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      font-size: 0.9rem;
      color: var(--text-secondary);
      max-width: 400px;
    }
    .cache-hint strong {
      color: var(--text-primary);
    }
    /* Logo visibility based on color scheme */
    .logo-light {
      display: block;
    }
    .logo-dark {
      display: none;
    }
    @media (prefers-color-scheme: dark) {
      .logo-light {
        display: none;
      }
      .logo-dark {
        display: block;
      }
    }
  </style>
</head>
<body>
  <header>
    <img class="logo logo-light" src="/reference-light.svg" alt="LangChain Reference" onerror="this.style.display='none'">
    <img class="logo logo-dark" src="/reference-dark.svg" alt="LangChain Reference" onerror="this.style.display='none'">
  </header>
  <main>
    <div class="offline-icon-container">
      <svg class="offline-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <circle cx="12" cy="20" r="1" fill="currentColor"></circle>
      </svg>
    </div>
    <h1>You're Offline</h1>
    <p>It looks like you've lost your internet connection. Previously viewed pages may still be available from cache.</p>
    <button class="retry-btn" onclick="window.location.reload()">Try Again</button>
    <div class="cache-hint">
      <strong>Tip:</strong> Pages you've visited before are saved for offline access. Try navigating to a page you've viewed recently.
    </div>
  </main>
</body>
</html>`,
              {
                headers: { "Content-Type": "text/html" },
              }
            );
          });
        })
    );
    return;
  }
});

/**
 * Handle messages from clients
 */
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case "SKIP_WAITING":
      self.skipWaiting();
      break;

    case "GET_CACHE_STATS":
      getCacheStats().then((stats) => {
        event.source.postMessage({
          type: "CACHE_STATS",
          payload: stats,
        });
      });
      break;

    case "CLEAR_CACHE":
      clearCache(payload?.cacheType).then(() => {
        event.source.postMessage({
          type: "CACHE_CLEARED",
        });
      });
      break;

    case "PREFETCH":
      prefetchUrls(payload?.urls || []);
      break;
  }
});

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const stats = {
    symbolCount: 0,
    staticCount: 0,
    totalSize: 0,
    entries: [],
  };

  try {
    const symbolCache = await caches.open(SYMBOL_CACHE_NAME);
    const symbolKeys = await symbolCache.keys();
    stats.symbolCount = symbolKeys.length;

    // Get size estimates for symbol cache
    for (const request of symbolKeys) {
      const response = await symbolCache.match(request);
      if (response) {
        const blob = await response.clone().blob();
        stats.totalSize += blob.size;
        stats.entries.push({
          url: request.url,
          size: blob.size,
          cachedAt: response.headers.get("sw-cached-at"),
        });
      }
    }

    const staticCache = await caches.open(STATIC_CACHE_NAME);
    const staticKeys = await staticCache.keys();
    stats.staticCount = staticKeys.length;

    for (const request of staticKeys) {
      const response = await staticCache.match(request);
      if (response) {
        const blob = await response.clone().blob();
        stats.totalSize += blob.size;
      }
    }
  } catch (error) {
    console.error("[SW] Error getting cache stats:", error);
  }

  return stats;
}

/**
 * Clear cache
 */
async function clearCache(cacheType) {
  try {
    if (!cacheType || cacheType === "symbols") {
      await caches.delete(SYMBOL_CACHE_NAME);
      await caches.open(SYMBOL_CACHE_NAME);
    }
    if (!cacheType || cacheType === "static") {
      await caches.delete(STATIC_CACHE_NAME);
      await caches.open(STATIC_CACHE_NAME);
    }
  } catch (error) {
    console.error("[SW] Error clearing cache:", error);
  }
}

/**
 * Prefetch URLs in background
 */
async function prefetchUrls(urls) {
  const cache = await caches.open(SYMBOL_CACHE_NAME);

  for (const url of urls) {
    try {
      // Skip if already cached
      const cached = await cache.match(url);
      if (cached) continue;

      const response = await fetch(url);
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.set("sw-cached-at", Date.now().toString());
        headers.set("sw-prefetched", "true");

        await cache.put(
          url,
          new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        );
      }
    } catch (error) {
      console.warn("[SW] Prefetch failed for:", url, error);
    }
  }
}
