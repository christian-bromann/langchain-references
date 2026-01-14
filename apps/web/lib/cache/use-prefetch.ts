"use client";

/**
 * usePrefetch Hook
 *
 * React hook for background prefetching of related symbols.
 * Automatically prefetches members, base classes, and referenced types
 * after the main content is rendered.
 */

import { useEffect, useRef, useCallback } from "react";
import { prefetchSymbols, isSymbolCached } from "./symbol-client";
import { prefetchUrls } from "./sw-register";

/**
 * Symbol info needed for prefetching related symbols
 */
export interface PrefetchableSymbol {
  /** Kind of symbol (class, function, etc.) */
  kind: string;
  /** Full qualified name */
  qualifiedName: string;
  /** Member references */
  members?: Array<{
    name: string;
    refId?: string;
  }>;
  /** Base classes/interfaces */
  bases?: string[];
  /** Type references in signature */
  typeRefs?: Array<{
    name: string;
    qualifiedName?: string;
  }>;
}

/**
 * Options for the prefetch hook
 */
export interface UsePrefetchOptions {
  /** Language for prefetching */
  language: "python" | "javascript";
  /** Package slug */
  packageSlug: string;
  /** Current symbol being viewed */
  symbol?: PrefetchableSymbol | null;
  /** Whether prefetching is enabled */
  enabled?: boolean;
  /** Delay before starting prefetch (ms) */
  delay?: number;
  /** Maximum number of symbols to prefetch */
  maxPrefetch?: number;
}

/**
 * Hook for prefetching related symbols in the background
 *
 * Usage:
 * ```tsx
 * usePrefetch({
 *   language: "python",
 *   packageSlug: "langchain-core",
 *   symbol: currentSymbol,
 * });
 * ```
 */
export function usePrefetch({
  language,
  packageSlug,
  symbol,
  enabled = true,
  delay = 1000,
  maxPrefetch = 20,
}: UsePrefetchOptions): void {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract related symbol paths from the current symbol
  const getRelatedPaths = useCallback((): string[] => {
    if (!symbol) return [];

    const paths: string[] = [];
    const currentQualified = symbol.qualifiedName;

    // Add member paths
    if (symbol.members) {
      for (const member of symbol.members.slice(0, maxPrefetch)) {
        const memberPath = `${currentQualified}.${member.name}`;
        paths.push(memberPath);
      }
    }

    // Add base class paths
    if (symbol.bases) {
      for (const base of symbol.bases) {
        // Extract simple name from generic types like "BaseChatModel<T>"
        const simpleName = base.replace(/<.*$/, "").replace(/^.*\./, "");
        if (simpleName && simpleName !== currentQualified) {
          paths.push(simpleName);
        }
      }
    }

    // Add type reference paths
    if (symbol.typeRefs) {
      for (const ref of symbol.typeRefs) {
        if (ref.qualifiedName && ref.qualifiedName !== currentQualified) {
          paths.push(ref.qualifiedName);
        } else if (ref.name && ref.name !== symbol.qualifiedName.split(".").pop()) {
          paths.push(ref.name);
        }
      }
    }

    // Deduplicate and limit
    return [...new Set(paths)].slice(0, maxPrefetch);
  }, [symbol, maxPrefetch]);

  useEffect(() => {
    if (!enabled || !symbol) return;

    // Clear any pending prefetch
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Start prefetching after delay
    timeoutRef.current = setTimeout(async () => {
      const relatedPaths = getRelatedPaths();

      // Filter out already prefetched symbols
      const newPaths = relatedPaths.filter(
        (path) => !prefetchedRef.current.has(path)
      );

      if (newPaths.length === 0) return;

      // Mark as prefetched to avoid duplicates
      for (const path of newPaths) {
        prefetchedRef.current.add(path);
      }

      // Check which ones are not cached yet
      const uncachedPaths: string[] = [];
      for (const path of newPaths) {
        const cached = await isSymbolCached(language, packageSlug, path);
        if (!cached) {
          uncachedPaths.push(path);
        }
      }

      if (uncachedPaths.length === 0) return;

      // Prefetch via client
      await prefetchSymbols(language, packageSlug, uncachedPaths);

      console.debug(
        `[usePrefetch] Prefetched ${uncachedPaths.length} symbols for ${packageSlug}`
      );
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, symbol, language, packageSlug, delay, getRelatedPaths]);
}

/**
 * Prefetch specific URLs directly via Service Worker
 *
 * Useful for prefetching on link hover or other interactions.
 */
export function usePrefetchOnHover(urls: string[]): {
  onMouseEnter: () => void;
} {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const onMouseEnter = useCallback(() => {
    const newUrls = urls.filter((url) => !prefetchedRef.current.has(url));
    if (newUrls.length === 0) return;

    for (const url of newUrls) {
      prefetchedRef.current.add(url);
    }

    prefetchUrls(newUrls);
  }, [urls]);

  return { onMouseEnter };
}

/**
 * Prefetch a single symbol path on link hover
 */
export function usePrefetchSymbolOnHover(
  language: "python" | "javascript",
  packageSlug: string,
  symbolPath: string
): {
  onMouseEnter: () => void;
} {
  const prefetchedRef = useRef(false);

  const onMouseEnter = useCallback(async () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    const cached = await isSymbolCached(language, packageSlug, symbolPath);
    if (cached) return;

    await prefetchSymbols(language, packageSlug, [symbolPath]);
  }, [language, packageSlug, symbolPath]);

  return { onMouseEnter };
}
