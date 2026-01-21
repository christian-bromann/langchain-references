/**
 * Loader Performance Tests
 *
 * Tests for data loading functions to ensure caching works correctly
 * and cached access is fast.
 *
 * Uses static fixture data for consistent, reproducible results.
 */
import { describe, it, expect } from "vitest";
import {
  loadRoutingMap,
  loadIndexedRoutingMap,
  loadPackageIndex,
} from "./fixtures";

describe("Loader Performance", () => {
  describe("loadRoutingMap", () => {
    it("should load langchain-core routing map fixture in reasonable time", () => {
      const start = performance.now();
      const routingMap = loadRoutingMap();
      const duration = performance.now() - start;

      console.log(
        `loadRoutingMap (${Object.keys(routingMap.slugs).length} entries): ${duration.toFixed(2)}ms`,
      );

      expect(Object.keys(routingMap.slugs).length).toBeGreaterThan(100);
      // File I/O can vary, but should be reasonable
      expect(duration).toBeLessThan(500);
    });

    it("should return consistent data from fixtures", () => {
      const routingMap1 = loadRoutingMap();
      const routingMap2 = loadRoutingMap();

      // Fixture data should be consistent
      expect(Object.keys(routingMap1.slugs).length).toBe(
        Object.keys(routingMap2.slugs).length,
      );
    });
  });

  describe("loadIndexedRoutingMap", () => {
    it("should build indexes during load", () => {
      const start = performance.now();
      const indexedMap = loadIndexedRoutingMap();
      const duration = performance.now() - start;

      console.log(
        `loadIndexedRoutingMap: ${duration.toFixed(2)}ms (${indexedMap.byTitle.size} by title, ${indexedMap.byKind.size} kinds)`,
      );

      expect(indexedMap.byTitle.size).toBeGreaterThan(0);
      expect(indexedMap.byKind.size).toBeGreaterThan(0);
    });

    it("should have all required kinds indexed", () => {
      const indexedMap = loadIndexedRoutingMap();

      const expectedKinds = ["class", "function", "method"];
      for (const kind of expectedKinds) {
        const entries = indexedMap.byKind.get(kind);
        if (entries) {
          console.log(`  ${kind}: ${entries.length} entries`);
        }
      }

      // Should have at least some classes and functions
      expect(
        indexedMap.byKind.get("class")?.length ||
          indexedMap.byKind.get("function")?.length ||
          0,
      ).toBeGreaterThan(0);
    });
  });

  describe("loadPackageIndex", () => {
    it("should load package index fixture quickly", () => {
      const start = performance.now();
      const index = loadPackageIndex();
      const duration = performance.now() - start;

      console.log(
        `loadPackageIndex: ${duration.toFixed(2)}ms (${Object.keys(index).length} packages)`,
      );

      expect(Object.keys(index).length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });
  });

  describe("simulated cached access patterns", () => {
    it("should benefit from in-memory caching for repeated access", () => {
      // Simulate the pattern of accessing the same data multiple times
      // within a single request (what withRequestCache would do)

      const cache = new Map<string, unknown>();

      function getCachedRoutingMap() {
        const cacheKey = "routing";
        if (cache.has(cacheKey)) {
          return cache.get(cacheKey);
        }
        const data = loadRoutingMap();
        cache.set(cacheKey, data);
        return data;
      }

      // First access (cold)
      const coldStart = performance.now();
      getCachedRoutingMap();
      const coldDuration = performance.now() - coldStart;

      // Second access (warm)
      const warmStart = performance.now();
      getCachedRoutingMap();
      const warmDuration = performance.now() - warmStart;

      console.log(
        `Cache speedup: cold=${coldDuration.toFixed(2)}ms, warm=${warmDuration.toFixed(3)}ms`,
      );

      expect(warmDuration).toBeLessThan(1); // Cache hit should be instant
      expect(warmDuration).toBeLessThan(coldDuration / 10); // At least 10x faster
    });
  });
});
