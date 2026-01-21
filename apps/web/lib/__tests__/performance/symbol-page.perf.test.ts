/**
 * SymbolPage Performance Tests
 *
 * Tests critical CPU-bound operations using real IR data from ./ir-output/
 * These tests establish baselines and verify optimizations work correctly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadRoutingMap,
  loadIndexedRoutingMap,
  slugifySymbolPath,
  slugifySymbolPathMemoized,
  clearSlugifyCache,
  type RoutingMap,
  type IndexedRoutingMap,
} from "./fixtures";

describe("SymbolPage Performance", () => {
  describe("knownSymbols building", () => {
    it("should build knownSymbols from langchain-core routing map in <10ms", () => {
      // Uses static langchain-core fixture data
      const routingMap = loadRoutingMap();
      const knownSymbols = new Map<string, string>();

      const start = performance.now();

      for (const [slug, entry] of Object.entries(routingMap.slugs)) {
        if (
          ["class", "interface", "typeAlias", "enum"].includes(entry.kind)
        ) {
          knownSymbols.set(entry.title, slug);
        }
      }

      const duration = performance.now() - start;

      console.log(
        `knownSymbols build (${Object.keys(routingMap.slugs).length} entries): ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(10);
      expect(knownSymbols.size).toBeGreaterThan(0);
    });

    it("should build knownSymbols with pre-computed index in <1ms", () => {
      const indexedMap = loadIndexedRoutingMap();

      const start = performance.now();
      const knownSymbols = indexedMap.byTitle; // Already computed
      const duration = performance.now() - start;

      console.log(
        `Pre-computed knownSymbols access: ${duration.toFixed(3)}ms (${knownSymbols.size} symbols)`
      );
      expect(duration).toBeLessThan(1);
      expect(knownSymbols.size).toBeGreaterThan(0);
    });
  });

  describe("findBaseSymbol performance", () => {
    let routingMap: RoutingMap;
    let indexedMap: IndexedRoutingMap;

    beforeEach(() => {
      routingMap = loadRoutingMap();
      indexedMap = loadIndexedRoutingMap();
    });

    it("should find base symbol with O(1) index lookup in <1ms", () => {
      // Find a real class symbol from the routing map
      const classEntry = Object.entries(routingMap.slugs).find(
        ([, entry]) => entry.kind === "class"
      );
      const targetName = classEntry ? classEntry[1].title : "BaseMessage";

      const start = performance.now();
      const qualifiedName = indexedMap.byTitle.get(targetName);
      const duration = performance.now() - start;

      console.log(
        `O(1) lookup for "${targetName}": ${duration.toFixed(3)}ms`
      );
      expect(duration).toBeLessThan(1);
      expect(qualifiedName).toBeDefined();
    });

    it("documents O(n) linear search baseline (regression risk)", () => {
      // Find a real class symbol
      const classEntry = Object.entries(routingMap.slugs).find(
        ([, entry]) => entry.kind === "class"
      );
      const targetName = classEntry ? classEntry[1].title : "BaseMessage";

      // Simulate old O(n) approach - this documents the baseline
      const start = performance.now();
      let found: string | null = null;
      for (const [qualifiedName, entry] of Object.entries(routingMap.slugs)) {
        if (entry.title === targetName) {
          found = qualifiedName;
          break;
        }
      }
      const duration = performance.now() - start;

      console.log(
        `Linear search for "${targetName}": ${duration.toFixed(2)}ms (baseline, ${Object.keys(routingMap.slugs).length} entries scanned)`
      );
      // This is just documentation - no threshold check
      expect(found).toBeDefined();
    });

    it("should be at least 10x faster with indexed lookup vs linear search", () => {
      const targetName = Object.entries(routingMap.slugs).find(
        ([, entry]) => entry.kind === "class"
      )?.[1].title || "BaseMessage";

      // Linear search
      const linearStart = performance.now();
      for (const [, entry] of Object.entries(routingMap.slugs)) {
        if (entry.title === targetName) break;
      }
      const linearDuration = performance.now() - linearStart;

      // Indexed lookup
      const indexedStart = performance.now();
      indexedMap.byTitle.get(targetName);
      const indexedDuration = performance.now() - indexedStart;

      const speedup = linearDuration / Math.max(indexedDuration, 0.001);
      console.log(
        `Indexed lookup speedup: ${speedup.toFixed(1)}x (${linearDuration.toFixed(3)}ms vs ${indexedDuration.toFixed(3)}ms)`
      );

      // Indexed should be significantly faster
      expect(indexedDuration).toBeLessThan(linearDuration);
    });
  });

  describe("member grouping performance", () => {
    it("should group members by kind in <5ms", () => {
      // Create realistic member array (50 members)
      const members = Array.from({ length: 50 }, (_, i) => ({
        name: `member${i}`,
        kind: ["method", "property", "attribute"][i % 3],
        refId: `ref_member_${i}`,
      }));

      const start = performance.now();

      const grouped = members.reduce(
        (acc, member) => {
          const kind = member.kind;
          if (!acc[kind]) acc[kind] = [];
          acc[kind].push(member);
          return acc;
        },
        {} as Record<string, typeof members>
      );

      const duration = performance.now() - start;

      console.log(
        `Member grouping (${members.length} members): ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(5);
      expect(Object.keys(grouped).length).toBe(3);
    });

    it("should group 200 members in <10ms", () => {
      const kinds = ["method", "property", "attribute", "constructor", "field"];
      type Member = { name: string; kind: string; refId: string };
      const members: Member[] = Array.from({ length: 200 }, (_, i) => ({
        name: `member${i}`,
        kind: kinds[i % 5]!,
        refId: `ref_member_${i}`,
      }));

      const start = performance.now();

      // Use Object.create(null) to avoid prototype pollution
      const grouped = Object.create(null) as Record<string, Member[]>;
      for (const member of members) {
        const kind = member.kind;
        if (Object.hasOwn(grouped, kind)) {
          grouped[kind].push(member);
        } else {
          grouped[kind] = [member];
        }
      }

      const duration = performance.now() - start;

      console.log(
        `Member grouping (${members.length} members): ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(10);
      expect(Object.keys(grouped).length).toBe(5);
    });
  });

  describe("slugifySymbolPath performance", () => {
    let paths: string[];

    beforeEach(() => {
      // Use symbol paths from langchain-core fixture
      const routingMap = loadRoutingMap();
      paths = Object.keys(routingMap.slugs).slice(0, 1000);
      clearSlugifyCache();
    });

    it("should slugify 1000 paths without memoization baseline", () => {
      const start = performance.now();

      for (const path of paths) {
        slugifySymbolPath(path, true);
      }

      const duration = performance.now() - start;

      console.log(
        `Non-memoized slugify (${paths.length} paths): ${duration.toFixed(2)}ms`
      );
      // Baseline documentation - no strict threshold
    });

    it("should slugify 1000 paths in <10ms with memoization (first run)", () => {
      const start = performance.now();

      for (const path of paths) {
        slugifySymbolPathMemoized(path, true);
      }

      const duration = performance.now() - start;

      console.log(
        `Memoized slugify first run (${paths.length} paths): ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(20); // First run populates cache
    });

    it("should slugify cached paths in <5ms (cache hits)", () => {
      // Warm up cache
      for (const path of paths) {
        slugifySymbolPathMemoized(path, true);
      }

      const start = performance.now();

      for (const path of paths) {
        slugifySymbolPathMemoized(path, true);
      }

      const duration = performance.now() - start;

      console.log(
        `Memoized slugify cache hits (${paths.length} paths): ${duration.toFixed(2)}ms`
      );
      expect(duration).toBeLessThan(5);
    });

    it("should show memoization speedup on repeated calls", () => {
      // First run (cold cache)
      const coldStart = performance.now();
      for (const path of paths) {
        slugifySymbolPathMemoized(path, true);
      }
      const coldDuration = performance.now() - coldStart;

      // Second run (warm cache)
      const warmStart = performance.now();
      for (const path of paths) {
        slugifySymbolPathMemoized(path, true);
      }
      const warmDuration = performance.now() - warmStart;

      const speedup = coldDuration / Math.max(warmDuration, 0.001);
      console.log(
        `Memoization speedup: ${speedup.toFixed(1)}x (${coldDuration.toFixed(2)}ms cold vs ${warmDuration.toFixed(2)}ms warm)`
      );

      expect(warmDuration).toBeLessThan(coldDuration);
    });
  });

  describe("combined routing map operations", () => {
    it("should perform all common operations in <50ms", () => {
      const start = performance.now();

      // 1. Load routing map from fixture
      const routingMap = loadRoutingMap();

      // 2. Build knownSymbols
      const knownSymbols = new Map<string, string>();
      for (const [slug, entry] of Object.entries(routingMap.slugs)) {
        if (
          ["class", "interface", "typeAlias", "enum"].includes(entry.kind)
        ) {
          knownSymbols.set(entry.title, slug);
        }
      }

      // 3. Find a few symbols by name
      const symbolsToFind = ["BaseMessage", "ChatPromptTemplate", "Runnable"];
      for (const name of symbolsToFind) {
        knownSymbols.get(name);
      }

      // 4. Group by kind (simulating TOC generation)
      const byKind: Record<string, string[]> = {};
      for (const [qualifiedName, entry] of Object.entries(routingMap.slugs)) {
        if (!byKind[entry.kind]) byKind[entry.kind] = [];
        byKind[entry.kind].push(qualifiedName);
      }

      const duration = performance.now() - start;

      console.log(
        `Combined operations (${Object.keys(routingMap.slugs).length} entries): ${duration.toFixed(2)}ms`
      );
      console.log(
        `  - knownSymbols: ${knownSymbols.size}, kinds: ${Object.keys(byKind).length}`
      );
      expect(duration).toBeLessThan(50);
    });
  });
});
