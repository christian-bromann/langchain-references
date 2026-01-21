# Specification: Serverless Performance Optimization

**Spec ID**: `2026-01-20-performance-optimization`  
**Created**: January 20, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Performance Analysis](#3-performance-analysis)
4. [Target State](#4-target-state)
5. [Optimization Strategies](#5-optimization-strategies)
6. [Performance Testing with Vitest](#6-performance-testing-with-vitest)
7. [Implementation Plan](#7-implementation-plan)
8. [Edge Cases & Safety](#8-edge-cases--safety)
9. [Acceptance Criteria](#9-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Achieve **sub-200ms page load times** for symbol documentation pages on Vercel serverless functions. Currently, function execution times can exceed **8 seconds** even on "Hot" starts, causing poor user experience during page loads and transitions.

### 1.2 Problem Statement

The reference documentation pages experience significant latency primarily due to **CPU-bound operations**, not I/O. Vercel logs show "Hot" starts (cached I/O) still taking 8+ seconds, confirming CPU is the bottleneck:

**Primary Issues (CPU-bound):**

1. **Object.entries() iterations** over routing maps with 10,000+ entries
2. **Nested loops** in `resolveInheritedMembers()` and `findBaseSymbol()`
3. **String operations** (`slugifySymbolPath`, regex matching, `split`/`join`)
4. **Redundant data transformations** on every render (Map→Array→Map conversions)
5. **Unoptimized search algorithms** - linear scans where indexed lookups are possible

**Secondary Issues (I/O-related):**

6. **Sequential async operations** in the render critical path
7. **N+1 query patterns** when loading member symbols individually
8. **Redundant data fetches** where the same data is requested multiple times

### 1.3 Scope

**In scope:**

- **CPU Optimizations**: Reduce iterations, pre-compute lookups, optimize algorithms
- **Performance Testing**: Vitest benchmarks to guarantee <200ms page renders
- **Data Structure Optimization**: Index-based lookups instead of linear scans
- Reduce sequential awaits in `SymbolPage.tsx`
- Pre-compute expensive operations during cache population
- Request-level deduplication

**Out of scope:**

- CDN/edge caching strategies (separate optimization)
- Build pipeline changes
- IR schema modifications
- UI/UX changes

### 1.4 Performance Targets

| Metric                   | Current | Target |
| ------------------------ | ------- | ------ |
| Symbol page load (Hot)   | 1-8s    | <200ms |
| Symbol page load (Cold)  | 8-15s   | <500ms |
| Page transition time     | 2-5s    | <150ms |
| Vercel function duration | 8s+     | <300ms |

---

## 2. Current State

### 2.1 Critical Path Analysis

The `SymbolPage` component has the following critical path:

```
1. getPackageBuildId()           → Fetch pointer file (I/O)
2. getPackageInfo()              → Fetch package.json (I/O)
3. getRoutingMapData()           → Fetch routing.json (I/O)
4. findSymbolOptimized()         → Multiple sequential lookups (I/O)
   └── For each candidate:
       └── getIndividualSymbolData() (sequential!)
5. For each member:
   └── getIndividualSymbolData()   → N parallel fetches (I/O)
   └── findSymbolQualifiedNameByName() → Fallback lookup (I/O)
6. resolveInheritedMembers()     → Recursive cross-package lookups (I/O)
   └── getManifestData()           → Build synthetic manifest (I/O)
   └── For each base class:
       └── getRoutingMapData()      → Per-package routing (I/O)
       └── getIndividualSymbolData() → Symbol fetch (I/O)
7. getTypeUrlMap()               → Cross-project symbol mapping (I/O)
8. getPackageInfo()              → DUPLICATE FETCH (I/O)
```

### 2.2 Identified Bottlenecks

#### Bottleneck 1: Sequential Symbol Lookups in `findSymbolOptimized`

```typescript
// Current: Sequential awaits in loop
for (const key of candidates) {
  const entry = routingMap.slugs[key];
  if (!entry?.refId) continue;
  const symbol = await getIndividualSymbolData(buildId, entry.refId, packageId);
  if (symbol) return symbol; // Early exit, but still sequential
}
```

**Impact**: Each iteration awaits the previous one, causing waterfall fetches.

#### Bottleneck 2: Inherited Member Resolution Loop

```typescript
// Current: Sequential processing of base classes
while (toProcess.length > 0) {
  const baseName = toProcess.shift()!;
  const found = await findBaseSymbol(simpleBaseName);  // Sequential!
  if (found) {
    await extractMembersFromBase(...);  // Sequential!
  }
}
```

**Impact**: Deep inheritance chains cause cumulative latency.

#### Bottleneck 3: Duplicate `getPackageInfo` Calls

```typescript
// In SymbolPage - called twice:
const [, routingMap] = await Promise.all([
  getPackageInfo(buildId, packageId), // Call 1
  getRoutingMapData(buildId, packageId),
]);
// ... later ...
const pkgInfo = buildId ? await getPackageInfo(buildId, packageId) : null; // Call 2
```

**Impact**: Same data fetched twice, even with caching there's overhead.

#### Bottleneck 4: Sequential Fallback in `findSymbolOptimized`

```typescript
// After routing map lookup fails, tries sharded lookup sequentially
for (const path of pathVariations) {
  const symbol = await getSymbolViaShardedLookup(buildId, packageId, path);
  if (symbol) return symbol;

  if (packagePrefix) {
    const prefixedSymbol = await getSymbolViaShardedLookup(...);
    if (prefixedSymbol) return prefixedSymbol;
  }
}
```

**Impact**: Up to 8+ sequential fetches when symbol path doesn't match first try.

#### Bottleneck 5: Manifest Building on Cold Starts

```typescript
// buildManifestFromPackageIndexes() fetches all package.json files
const packageInfoPromises: Array<Promise<Package | null>> = [];
for (const { project, language, index } of results) {
  for (const [pkgName, pkgInfo] of Object.entries(index.packages)) {
    packageInfoPromises.push(getPackageInfoV2(packageId, pkgInfo.buildId));
  }
}
```

**Impact**: ~50+ parallel fetches on cold start, can overwhelm blob storage.

#### Bottleneck 6: Cross-Project Type URL Map

```typescript
// fetchCrossProjectPackagesData() loads routing maps for all packages
for (const project of enabledProjects) {
  for (const pkg of projectPkgs) {
    const routingMap = await getRoutingMapData(pkg.buildId, pkg.packageId);
    // Iterates through all entries...
  }
}
```

**Impact**: Even with caching, initial population is expensive (~30 packages).

### 2.3 Vercel Log Analysis

From Vercel dashboard logs, typical request shows:

```
GET Using cache langchain-references 4ms
GET langchain-references 8ms
SET langchain-references 29ms
... (80+ cache operations)
```

**Observations:**

- 80+ cache GET/SET operations per request
- Individual operations are fast (4-86ms)
- Cumulative time from operations: 500ms-2s
- Cold starts trigger manifest rebuilding

### 2.4 CPU-Bound Bottlenecks (Primary Focus)

Based on "Hot" start analysis (8s+ with cached I/O), the following CPU-intensive operations dominate:

#### CPU Bottleneck 1: Routing Map Iteration in `knownSymbols` Building

```typescript
// SymbolPage.tsx - Iterates ~5,000+ entries per package
if (routingMap?.slugs) {
  for (const [slug, entry] of Object.entries(routingMap.slugs)) {
    if (["class", "interface", "typeAlias", "enum"].includes(entry.kind)) {
      knownSymbols.set(entry.title, slug);
    }
  }
}
```

**CPU Cost**: ~50-100ms per package × multiple calls = 200-500ms total

#### CPU Bottleneck 2: Linear Search in `findBaseSymbol`

```typescript
// Searches entire routing map for each base class
for (const [qualifiedName, entry] of Object.entries(routingMap.slugs)) {
  if (
    (entry.kind === "class" || entry.kind === "interface") &&
    (entry.title === simpleBaseName ||
      qualifiedName === simpleBaseName ||
      qualifiedName.endsWith(`.${simpleBaseName}`) ||
      qualifiedName.endsWith(`/${simpleBaseName}`))
  ) {
    foundEntry = { refId: entry.refId, qualifiedName };
    break;
  }
}
```

**CPU Cost**: O(n) search on 5,000+ entries × 3-5 base classes = 500-1000ms

#### CPU Bottleneck 3: Member Grouping with `.reduce()`

```typescript
// Runs on every render for TOC generation
const groupedMembers = symbol.members.reduce(
  (acc, member) => {
    const kind = member.kind;
    if (!Object.hasOwn(acc, kind)) {
      acc[kind] = [];
    }
    acc[kind].push(member);
    return acc;
  },
  Object.create(null) as Record<string, DisplayMember[]>,
);
```

**CPU Cost**: 20-50ms per call × 2 calls (TOC + render) = 40-100ms

#### CPU Bottleneck 4: String Operations in Symbol Path Resolution

```typescript
// Called thousands of times during type linking
function slugifySymbolPath(symbolPath: string, hasPackagePrefix = true): string {
  const parts = symbolPath.split("."); // String allocation
  if (parts.length === 1) return parts[0];
  if (hasPackagePrefix) return parts.slice(1).join("/"); // More allocations
  return parts.join("/");
}
```

**CPU Cost**: 0.1-1ms × 5,000+ calls = 500-5000ms total

#### CPU Bottleneck 5: TypeReferenceDisplay Regex Matching

```typescript
// Runs for every type string in signatures
const typeNamePattern = /([A-Za-z][a-zA-Z0-9_]*)/g;
while ((match = typeNamePattern.exec(typeStr)) !== null) {
  // Map lookups and React element creation per match
}
```

**CPU Cost**: Complex signatures can trigger 100+ regex matches

---

## 3. Performance Analysis

### 3.1 Waterfall Diagram (Current)

```
Time (ms)  0    100   200   300   400   500   600   700   800+
           ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
getBuildId ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
getPkgInfo      ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
getRouting      ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
findSymbol           ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ├─try1                  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ├─try2                      ████░░░░░░░░░░░░░░░░░░░░░░░░░░
  └─try3                          ████░░░░░░░░░░░░░░░░░░░░░░
getMember1                            ████░░░░░░░░░░░░░░░░░░
getMember2                            ████░░░░░░░░░░░░░░░░░░
getMember3                            ████░░░░░░░░░░░░░░░░░░
inherited                                  ████████████░░░░░
typeUrlMap                                              ████
getPkgInfo                                              ████ (duplicate!)
```

### 3.2 Target Waterfall Diagram

```
Time (ms)  0    50   100   150   200
           ├────┼────┼────┼────┤
getBuildId ██░░░░░░░░░░░░░░░░░░░
parallel   ├── getPkgInfo ██░░░░░
           ├── getRouting ██░░░░░
           └── typeUrlMap ██░░░░░
findSymbol      ████░░░░░░░░░░░░░
  └─batch            ██░░░░░░░░░░
members              ████░░░░░░░░ (single batch)
inherited                 ████░░░ (pre-fetched cores)
render                        ████
```

### 3.3 Key Optimization Opportunities

| Opportunity                 | Potential Savings | Complexity |
| --------------------------- | ----------------- | ---------- |
| Parallelize initial fetches | 100-200ms         | Low        |
| Batch symbol lookups        | 200-400ms         | Medium     |
| Pre-fetch core package data | 500-1000ms        | Medium     |
| Eliminate duplicate fetches | 50-100ms          | Low        |
| Request-level deduplication | 100-300ms         | Medium     |
| Lazy load inherited members | 200-500ms         | Medium     |

---

## 4. Target State

### 4.1 Architecture Changes

#### 4.1.1 Request Context with Deduplication

```typescript
// New: Request-scoped cache for deduplication
interface RequestContext {
  buildId: string;
  packageId: string;
  // Deduplication maps
  pendingFetches: Map<string, Promise<unknown>>;
  resolvedData: Map<string, unknown>;
}

function withRequestDedup<T>(
  ctx: RequestContext,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (ctx.resolvedData.has(key)) {
    return Promise.resolve(ctx.resolvedData.get(key) as T);
  }
  if (ctx.pendingFetches.has(key)) {
    return ctx.pendingFetches.get(key) as Promise<T>;
  }
  const promise = fetcher().then((result) => {
    ctx.resolvedData.set(key, result);
    ctx.pendingFetches.delete(key);
    return result;
  });
  ctx.pendingFetches.set(key, promise);
  return promise;
}
```

#### 4.1.2 Batch Symbol Fetcher

```typescript
// New: Batch fetch multiple symbols in single request
interface BatchSymbolRequest {
  buildId: string;
  packageId: string;
  symbolIds: string[];
}

async function batchGetSymbols(requests: BatchSymbolRequest[]): Promise<Map<string, SymbolRecord>> {
  // Group by buildId+packageId for efficient fetching
  const grouped = groupBy(requests, (r) => `${r.buildId}:${r.packageId}`);

  // Parallel fetch per package
  const results = await Promise.all(
    Object.entries(grouped).map(async ([key, reqs]) => {
      const [buildId, packageId] = key.split(":");
      const allIds = reqs.flatMap((r) => r.symbolIds);
      return fetchSymbolsBatch(buildId, packageId, allIds);
    }),
  );

  return mergeMaps(results);
}
```

#### 4.1.3 Pre-fetched Core Package Data

```typescript
// New: Pre-warm core package routing maps in getCrossProjectPackages
const CORE_PACKAGES = [
  "pkg_py_langchain_core",
  "pkg_js_langchain_core",
  "pkg_py_langgraph",
  "pkg_js_langgraph",
];

async function prewarmCorePackages(language: Language): Promise<void> {
  const coreForLang = CORE_PACKAGES.filter((p) =>
    language === "python" ? p.includes("_py_") : p.includes("_js_"),
  );

  await Promise.all(
    coreForLang.map((pkgId) => {
      const buildId = getBuildIdForPackageId(pkgId);
      return Promise.all([getRoutingMapData(buildId, pkgId), getPackageInfo(buildId, pkgId)]);
    }),
  );
}
```

### 4.2 Optimized Data Flow

```
1. getPackageBuildId()
2. Promise.all([
     getPackageInfo(),
     getRoutingMapData(),
     getTypeUrlMap(),
     prewarmCorePackages(),  // Background
   ])
3. findSymbolOptimized() with:
   - First match from routing map
   - No sequential fallbacks
4. batchGetSymbols() for all members
5. Lazy/deferred inherited members
```

---

## 5. Optimization Strategies

### 5.1 Strategy A: Parallelize Initial Data Loading

**Current:**

```typescript
const buildId = await getPackageBuildId(language, packageName);
const [, routingMap] = await Promise.all([
  getPackageInfo(buildId, packageId),
  getRoutingMapData(buildId, packageId),
]);
const irSymbol = await findSymbolOptimized(buildId, packageId, symbolPath);
```

**Optimized:**

```typescript
const buildId = await getPackageBuildId(language, packageName);

// Parallel: Load all initial data at once
const [pkgInfo, routingMap, typeUrlMap] = await Promise.all([
  getPackageInfo(buildId, packageId),
  getRoutingMapData(buildId, packageId),
  getTypeUrlMap(language, slugifyPackageName(packageName)),
]);

// Store pkgInfo for later use (avoid duplicate fetch)
const ctx = { pkgInfo, routingMap, typeUrlMap };

const irSymbol = await findSymbolOptimized(buildId, packageId, symbolPath, ctx);
```

**Savings**: ~100-150ms

### 5.2 Strategy B: Optimize Symbol Lookup Strategy

**Current: Sequential fallback attempts**

**Optimized: Priority-ordered single attempt**

```typescript
async function findSymbolOptimized(
  buildId: string,
  packageId: string,
  symbolPath: string,
  ctx: RequestContext,
): Promise<SymbolRecord | null> {
  const routingMap = ctx.routingMap;

  // Fast path: Direct lookup in routing map
  const directMatch = routingMap?.slugs?.[symbolPath];
  if (directMatch?.refId) {
    return getIndividualSymbolData(buildId, directMatch.refId, packageId);
  }

  // Generate all candidate keys upfront
  const candidates = generateCandidateKeys(symbolPath, ctx.packagePrefix);

  // Find first matching key (no fetches yet)
  const matchingKey = candidates.find((key) => routingMap?.slugs?.[key]?.refId);
  if (matchingKey) {
    const entry = routingMap.slugs[matchingKey];
    return getIndividualSymbolData(buildId, entry.refId, packageId);
  }

  // Fallback: Batch try all variations at once
  const shardedLookups = await Promise.all(
    candidates.slice(0, 3).map((path) => getSymbolViaShardedLookup(buildId, packageId, path)),
  );

  return shardedLookups.find(Boolean) || null;
}
```

**Savings**: ~200-400ms

### 5.3 Strategy C: Batch Member Symbol Loading

**Current: N parallel fetches + fallback logic per member**

**Optimized: Single batch fetch + optimistic rendering**

```typescript
// Collect all member IDs upfront
const memberIds = irSymbol.members
  ?.map((m) => m.refId || (m as { id?: string }).id)
  .filter(Boolean) as string[];

if (memberIds.length > 0) {
  // Single batch fetch for all members
  const memberSymbols = await batchGetSymbols({
    buildId,
    packageId,
    symbolIds: memberIds,
  });

  // For missing members, render with basic info (no summary)
  // Fallback fetch can happen client-side if needed
}
```

**Savings**: ~200-500ms for classes with many members

### 5.4 Strategy D: Defer Inherited Member Resolution

**Current:** Synchronously resolves all inherited members during SSR

**Optimized:**

1. Render page immediately with direct members
2. Defer inherited member resolution to:
   - Client-side hydration (preferred for interactivity)
   - Or: Edge middleware pre-computation

```typescript
// Option 1: Server Component with Suspense
<Suspense fallback={<InheritedMembersSkeleton />}>
  <InheritedMembers
    buildId={buildId}
    packageId={packageId}
    baseClassNames={irSymbol.relations?.extends || []}
  />
</Suspense>

// Option 2: Cache inherited members during build
// Pre-compute in build pipeline, store as part of symbol
```

**Savings**: ~500-2000ms for deep inheritance chains

### 5.5 Strategy E: Request-Level Deduplication

**Problem:** Same data can be requested multiple times in a single render

**Solution:** Request-scoped memoization

```typescript
// At module level - reset per request
let requestCache: Map<string, Promise<unknown>> | null = null;

export function withRequestCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  // In React Server Components, this naturally scopes to the request
  if (!requestCache) {
    requestCache = new Map();
    // Reset after microtask (end of request)
    queueMicrotask(() => {
      requestCache = null;
    });
  }

  if (requestCache.has(key)) {
    return requestCache.get(key) as Promise<T>;
  }

  const promise = fetcher();
  requestCache.set(key, promise);
  return promise;
}
```

**Savings**: ~50-100ms per duplicate fetch eliminated

### 5.6 Strategy F: Optimize Manifest Building

**Current:** Build synthetic manifest from scratch on cold start

**Optimized:**

1. Store pre-built manifest in blob storage
2. Use `unstable_cache` with longer TTL
3. Incremental updates when packages change

```typescript
// New: Direct manifest fetch (generated during build)
async function getPrebuiltManifest(language: Language): Promise<Manifest | null> {
  const path = `ir/manifests/${language}.json`;
  return fetchBlobJson<Manifest>(path);
}

// Fallback to synthetic only if prebuilt unavailable
const getCachedManifest = unstable_cache(
  async (language: Language) => {
    const prebuilt = await getPrebuiltManifest(language);
    if (prebuilt) return prebuilt;
    return buildManifestFromPackageIndexes();
  },
  ["manifest"],
  { revalidate: 86400 }, // 24 hours - manifests rarely change
);
```

**Savings**: ~500-1000ms on cold starts

### 5.7 Strategy G: CPU Optimization - Pre-computed Index Lookups

**Current:** Linear O(n) searches on every render

**Optimized:** Pre-compute indexed Maps during cache population

```typescript
// Pre-compute symbol name → entry index during cache population
interface IndexedRoutingMap extends RoutingMap {
  // Original slugs map
  slugs: Record<string, RoutingEntry>;
  // Pre-computed indexes for O(1) lookups
  byTitle: Map<string, string>; // symbol name → qualified name
  byKind: Map<string, string[]>; // kind → qualified names
}

// Build once during fetchRoutingMap, store in cache
function buildRoutingIndexes(routingMap: RoutingMap): IndexedRoutingMap {
  const byTitle = new Map<string, string>();
  const byKind = new Map<string, string[]>();

  for (const [qualifiedName, entry] of Object.entries(routingMap.slugs)) {
    byTitle.set(entry.title, qualifiedName);

    const kindList = byKind.get(entry.kind) || [];
    kindList.push(qualifiedName);
    byKind.set(entry.kind, kindList);
  }

  return { ...routingMap, byTitle, byKind };
}

// Usage: O(1) lookup instead of O(n) iteration
const qualifiedName = indexedMap.byTitle.get(simpleBaseName);
```

**Savings**: ~300-500ms for base symbol resolution

### 5.8 Strategy H: CPU Optimization - Memoized String Operations

**Current:** `slugifySymbolPath` called thousands of times with repeated inputs

**Optimized:** Memoize expensive string operations

```typescript
// Bounded LRU cache for string transformations
const slugifyCache = new Map<string, string>();
const CACHE_SIZE = 1000;

function slugifySymbolPathMemoized(symbolPath: string, hasPackagePrefix = true): string {
  const cacheKey = `${symbolPath}:${hasPackagePrefix}`;

  if (slugifyCache.has(cacheKey)) {
    return slugifyCache.get(cacheKey)!;
  }

  // Evict oldest if at capacity
  if (slugifyCache.size >= CACHE_SIZE) {
    const firstKey = slugifyCache.keys().next().value;
    slugifyCache.delete(firstKey);
  }

  const result = slugifySymbolPathOriginal(symbolPath, hasPackagePrefix);
  slugifyCache.set(cacheKey, result);
  return result;
}
```

**Savings**: ~100-200ms across full page render

### 5.9 Strategy I: CPU Optimization - Lazy Member Grouping

**Current:** `generateTOCData` groups members on every render

**Optimized:** Cache grouped members with symbol data

```typescript
// Store pre-grouped data in DisplaySymbol
interface DisplaySymbol {
  // ... existing fields

  // Pre-computed grouped members (lazy, computed once)
  _groupedMembers?: Map<string, DisplayMember[]>;
  _tocData?: { topItems: TOCItem[]; sections: TOCSection[] };
}

function getGroupedMembers(symbol: DisplaySymbol): Map<string, DisplayMember[]> {
  if (!symbol._groupedMembers && symbol.members) {
    symbol._groupedMembers = new Map();
    for (const member of symbol.members) {
      const list = symbol._groupedMembers.get(member.kind) || [];
      list.push(member);
      symbol._groupedMembers.set(member.kind, list);
    }
  }
  return symbol._groupedMembers || new Map();
}
```

**Savings**: ~40-80ms per page (eliminates redundant grouping)

---

## 6. Performance Testing with Vitest

### 6.1 Test Infrastructure Setup

Create a new test package for performance testing:

**File:** `apps/web/lib/__tests__/performance/vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.perf.test.ts"],
    testTimeout: 30000,
    // Performance-specific settings
    pool: "forks", // Isolated processes for accurate timing
    reporters: ["verbose", "json"],
    outputFile: "./perf-results.json",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../.."),
    },
  },
});
```

### 6.2 Core Performance Test Suite

**File:** `apps/web/lib/__tests__/performance/symbol-page.perf.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "vitest";

// Load real IR data for accurate benchmarking
import { loadRoutingMap, loadIndexedRoutingMap, loadSymbolData } from "./fixtures";

describe("SymbolPage Performance", () => {
  const TIMING_THRESHOLD_MS = 50; // Individual function limit
  const TOTAL_RENDER_THRESHOLD_MS = 200; // Full page render limit

  describe("knownSymbols building", () => {
    it("should build knownSymbols from langchain-core routing map in <10ms", async () => {
      // Uses real langchain-core data (~5000+ entries)
      const routingMap = loadRoutingMap("pkg_py_langchain_core");
      const knownSymbols = new Map<string, string>();

      const start = performance.now();

      for (const [slug, entry] of Object.entries(routingMap.slugs)) {
        if (["class", "interface", "typeAlias", "enum"].includes(entry.kind)) {
          knownSymbols.set(entry.title, slug);
        }
      }

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
      console.log(
        `knownSymbols build (${Object.keys(routingMap.slugs).length} entries): ${duration.toFixed(2)}ms`,
      );
    });

    it("should build knownSymbols with pre-computed index in <1ms", async () => {
      const indexedMap = loadIndexedRoutingMap("pkg_py_langchain_core");

      const start = performance.now();
      const knownSymbols = indexedMap.byTitle; // Already computed
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
      expect(knownSymbols.size).toBeGreaterThan(0);
    });
  });

  describe("findBaseSymbol performance", () => {
    it("should find base symbol with O(1) index lookup in <1ms", async () => {
      const indexedMap = loadIndexedRoutingMap("pkg_py_langchain_core");
      const targetName = "BaseChatModel"; // Real symbol from langchain-core

      const start = performance.now();
      const qualifiedName = indexedMap.byTitle.get(targetName);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
      expect(qualifiedName).toBeDefined();
    });

    it("should NOT use linear search (regression test)", async () => {
      const routingMap = loadRoutingMap("pkg_py_langchain_core");
      const targetName = "BaseChatModel";

      // Simulate old O(n) approach - this documents the baseline
      const start = performance.now();
      let found = null;
      for (const [qualifiedName, entry] of Object.entries(routingMap.slugs)) {
        if (entry.title === targetName) {
          found = qualifiedName;
          break;
        }
      }
      const duration = performance.now() - start;

      // This should be slower than indexed - documents regression risk
      console.log(
        `Linear search took: ${duration.toFixed(2)}ms (baseline for ${Object.keys(routingMap.slugs).length} entries)`,
      );
    });
  });

  describe("member grouping performance", () => {
    it("should group members by kind in <5ms", async () => {
      // Load a real class symbol with many members (e.g., BaseMessage, ChatPromptTemplate)
      const routingMap = loadRoutingMap("pkg_py_langchain_core");
      const classEntry = Object.entries(routingMap.slugs).find(
        ([, entry]) => entry.kind === "class" && entry.title === "BaseMessage",
      );
      const symbol = classEntry
        ? loadSymbolData("pkg_py_langchain_core", classEntry[1].refId)
        : null;
      const members = symbol?.members || [];

      const start = performance.now();

      const grouped = members.reduce(
        (acc: Record<string, unknown[]>, member: { kind: string }) => {
          const kind = member.kind;
          if (!acc[kind]) acc[kind] = [];
          acc[kind].push(member);
          return acc;
        },
        {} as Record<string, unknown[]>,
      );

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
      console.log(`Member grouping (${members.length} members): ${duration.toFixed(2)}ms`);
    });
  });

  describe("slugifySymbolPath performance", () => {
    it("should slugify 1000 paths in <10ms with memoization", async () => {
      // Use real symbol paths from langchain-core
      const routingMap = loadRoutingMap("pkg_py_langchain_core");
      const paths = Object.keys(routingMap.slugs).slice(0, 1000);

      const start = performance.now();

      for (const path of paths) {
        slugifySymbolPathMemoized(path, true);
      }

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
      console.log(`Memoized slugify (1000 paths): ${duration.toFixed(2)}ms`);
    });
  });
});
```

### 6.3 Integration Performance Tests

**File:** `apps/web/lib/__tests__/performance/loader.perf.test.ts`

```typescript
import { describe, it, expect, beforeAll } from "vitest";

describe("Loader Performance", () => {
  describe("getTypeUrlMap", () => {
    it("should return pre-computed map in <5ms", async () => {
      // First call populates cache
      await getTypeUrlMap("python", "langchain-core", new Set());

      // Second call should be instant
      const start = performance.now();
      const map = await getTypeUrlMap("python", "langchain-core", new Set());
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
      expect(map.size).toBeGreaterThan(0);
    });
  });

  describe("getCrossProjectPackages", () => {
    it("should return cached packages in <10ms after warm-up", async () => {
      // Warm up cache
      await getCrossProjectPackages("python");

      const start = performance.now();
      const packages = await getCrossProjectPackages("python");
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });
});
```

### 6.4 Test Fixtures

**File:** `apps/web/lib/__tests__/performance/fixtures.ts`

Uses real IR data from `./ir-output/` for accurate benchmarking:

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import type { RoutingMap } from "@/lib/ir/types";

const IR_OUTPUT_PATH = join(process.cwd(), "../../ir-output");

/**
 * Load actual routing.json from ir-output for a package
 * Uses langchain-core as the primary benchmark (largest package, ~5000+ entries)
 */
export function loadRoutingMap(packageId: string = "pkg_py_langchain_core"): RoutingMap {
  const buildId = getLatestBuildId(packageId);
  const path = join(IR_OUTPUT_PATH, "packages", packageId, buildId, "routing.json");
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Load package pointer index for a project
 */
export function loadPackageIndex(
  project: string = "langchain",
  language: string = "python",
): Record<string, { buildId: string; publishedName: string }> {
  const path = join(IR_OUTPUT_PATH, "pointers", `index-${project}-${language}.json`);
  return JSON.parse(readFileSync(path, "utf-8")).packages;
}

/**
 * Load individual symbol data
 */
export function loadSymbolData(packageId: string, refId: string): Record<string, unknown> | null {
  const buildId = getLatestBuildId(packageId);
  const path = join(IR_OUTPUT_PATH, "packages", packageId, buildId, "symbols", `${refId}.json`);
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Build indexed routing map from real data
 */
export function loadIndexedRoutingMap(packageId?: string) {
  const base = loadRoutingMap(packageId);
  const byTitle = new Map<string, string>();
  const byKind = new Map<string, string[]>();

  for (const [qualifiedName, entry] of Object.entries(base.slugs)) {
    byTitle.set(entry.title, qualifiedName);

    const list = byKind.get(entry.kind) || [];
    list.push(qualifiedName);
    byKind.set(entry.kind, list);
  }

  return { ...base, byTitle, byKind };
}

function getLatestBuildId(packageId: string): string {
  // Read from pointer index to get current build ID
  const indexPath = join(IR_OUTPUT_PATH, "pointers", "index-langchain-python.json");
  const index = JSON.parse(readFileSync(indexPath, "utf-8"));
  return index.packages[packageId]?.buildId || "latest";
}
```

### 6.5 CI Integration

**File:** `.github/workflows/perf-tests.yml` (or add to existing)

```yaml
name: Performance Tests

on:
  pull_request:
    paths:
      - "apps/web/lib/**"
      - "apps/web/components/reference/**"

jobs:
  perf-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install

      - name: Run Performance Tests
        run: pnpm --filter web test:perf

      - name: Check Performance Thresholds
        run: |
          # Fail if any perf test exceeds thresholds
          node scripts/check-perf-results.js
```

### 6.6 NPM Scripts

Add to `apps/web/package.json`:

```json
{
  "scripts": {
    "test:perf": "vitest run --config lib/__tests__/performance/vitest.config.ts",
    "test:perf:watch": "vitest --config lib/__tests__/performance/vitest.config.ts"
  }
}
```

### 6.7 Performance Regression Detection

**File:** `apps/web/scripts/check-perf-results.js`

```javascript
const fs = require("fs");
const results = JSON.parse(fs.readFileSync("./perf-results.json"));

const thresholds = {
  "knownSymbols building": 10,
  "findBaseSymbol performance": 1,
  "member grouping performance": 5,
  "slugifySymbolPath performance": 10,
};

let failed = false;

for (const test of results.testResults) {
  for (const assertion of test.assertionResults) {
    // Check duration annotations in test output
    // Fail CI if thresholds exceeded
  }
}

if (failed) {
  process.exit(1);
}
```

---

## 7. Implementation Plan

### 7.1 Phase 1: Performance Test Infrastructure + Quick Wins (Day 1)

**Low risk, immediate impact + establish measurement baseline**

1. **Set up Vitest performance test suite**
   - Create `apps/web/lib/__tests__/performance/` directory
   - Add `vitest.config.ts` for performance tests
   - Create test fixtures with realistic data sizes (5000+ entries)
   - Add `test:perf` npm script

2. **Write baseline performance tests**
   - `knownSymbols` building benchmark
   - `findBaseSymbol` linear search baseline
   - Member grouping benchmark
   - `slugifySymbolPath` benchmark

3. **Eliminate duplicate `getPackageInfo` call in SymbolPage**
   - Store result from initial parallel fetch
   - Pass through context to later usage

4. **Parallelize typeUrlMap fetch**
   - Move to initial Promise.all batch
   - Already cached, just timing optimization

5. **Add request-level deduplication**
   - Implement `withRequestCache` utility
   - Wrap high-frequency fetchers

**Expected Impact**: 150-250ms reduction + measurable baselines

**Deliverables**:

- [ ] `apps/web/lib/__tests__/performance/vitest.config.ts`
- [ ] `apps/web/lib/__tests__/performance/fixtures.ts`
- [ ] `apps/web/lib/__tests__/performance/symbol-page.perf.test.ts`
- [ ] Performance tests passing in CI

### 7.2 Phase 2: CPU Optimizations + Symbol Lookup (Day 2)

**Medium risk, high impact - Focus on CPU-bound bottlenecks**

1. **Implement pre-computed index lookups (Strategy G)**
   - Add `byTitle` and `byKind` Maps to routing map
   - Replace O(n) `Object.entries()` loops with O(1) Map lookups
   - Update `getCachedRoutingMap` to build indexes

2. **Add memoized string operations (Strategy H)**
   - Implement bounded LRU cache for `slugifySymbolPath`
   - Cache common path transformations

3. **Optimize `findSymbolOptimized` candidate strategy**
   - Prioritize exact match using indexed lookups
   - Batch fallback attempts with `Promise.all`
   - Limit fallback iterations to 3

4. **Update performance tests to verify improvements**
   - Tests should fail if O(1) lookups regress to O(n)
   - Add regression test markers

**Expected Impact**: 500-1000ms reduction

**Deliverables**:

- [ ] `IndexedRoutingMap` type and builder function
- [ ] `slugifySymbolPathMemoized` function
- [ ] Updated `findBaseSymbol` using indexed lookups
- [ ] Performance tests verifying <1ms lookups

### 7.3 Phase 3: Member Loading Optimization (Day 3)

**Medium risk, high impact**

1. **Batch member symbol fetching**
   - Single request for all member IDs
   - Optimistic rendering for missing

2. **Simplify fallback logic**
   - Remove `findSymbolQualifiedNameByName` from hot path
   - Accept partial member info

**Expected Impact**: 200-500ms reduction

### 7.4 Phase 4: Inherited Members (Day 4-5)

**Higher risk, variable impact**

1. **Defer inherited member resolution**
   - Suspense boundary for inherited section
   - Client-side resolution as fallback

2. **Pre-warm core package data**
   - langchain-core routing maps
   - Cache during cross-project population

**Expected Impact**: 500-2000ms reduction for affected pages

### 7.5 Phase 5: Manifest Optimization (Day 5)

**Low risk, cold start focused**

1. **Generate pre-built manifests**
   - Add to build pipeline
   - Upload alongside package data

2. **Increase manifest cache TTL**
   - 24 hours (currently 1 hour)
   - Manifests rarely change mid-day

**Expected Impact**: 500-1000ms reduction on cold starts

---

## 8. Edge Cases & Safety

### 8.1 Cache Invalidation

**Risk:** Stale data after deployments

**Mitigation:**

- Use build ID in cache keys
- Revalidate on deployment via tags
- Short TTL for development

### 8.2 Batch Fetch Failures

**Risk:** Single symbol failure affects entire batch

**Mitigation:**

```typescript
async function batchGetSymbols(ids: string[]): Promise<Map<string, SymbolRecord>> {
  const results = await Promise.allSettled(
    ids.map((id) => getIndividualSymbolData(buildId, id, packageId)),
  );

  // Return successful results, log failures
  const successful = new Map();
  results.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      successful.set(ids[i], result.value);
    }
  });
  return successful;
}
```

### 8.3 Deferred Content Flash

**Risk:** Visible loading states for inherited members

**Mitigation:**

- Skeleton matches final layout
- Preload during initial render when possible
- Consider streaming with proper loading UI

### 8.4 Request Cache Memory

**Risk:** Memory leak if cache not cleared

**Mitigation:**

- Use WeakMap or microtask clearing
- Bound cache size
- Monitor memory in production

### 8.5 Fallback Degradation

**Risk:** Removing fallbacks breaks edge cases

**Mitigation:**

- Log fallback usage patterns before removing
- Keep fallbacks as last resort
- A/B test changes with metrics

---

## 9. Acceptance Criteria

### 9.1 Performance Requirements

| ID  | Requirement                  | Target | Measurement              |
| --- | ---------------------------- | ------ | ------------------------ |
| P1  | Hot symbol page load         | <200ms | Vercel function duration |
| P2  | Cold symbol page load        | <500ms | Vercel function duration |
| P3  | Page transition time         | <150ms | Client-side navigation   |
| P4  | Cache operations per request | <20    | Vercel dashboard logs    |
| P5  | 95th percentile load time    | <300ms | Vercel analytics         |

### 9.2 Functional Requirements

| ID  | Requirement                                 | Priority |
| --- | ------------------------------------------- | -------- |
| F1  | All symbol pages render correctly           | P0       |
| F2  | Member information displays accurately      | P0       |
| F3  | Type links work for cross-project types     | P0       |
| F4  | Inherited members display (may be deferred) | P1       |
| F5  | Source links work correctly                 | P1       |
| F6  | Version history displays                    | P2       |

### 9.3 Quality Requirements

| ID  | Requirement                  | Target |
| --- | ---------------------------- | ------ |
| Q1  | No increase in error rate    | <0.1%  |
| Q2  | No visual regressions        | 0      |
| Q3  | Lighthouse performance score | >90    |
| Q4  | Core Web Vitals LCP          | <2.5s  |

### 9.4 Vitest Performance Test Requirements

| ID  | Test                                | Threshold | Description              |
| --- | ----------------------------------- | --------- | ------------------------ |
| VT1 | `knownSymbols` build (5000 entries) | <10ms     | Object.entries iteration |
| VT2 | `findBaseSymbol` indexed lookup     | <1ms      | O(1) Map.get()           |
| VT3 | Member grouping (50 members)        | <5ms      | reduce() operation       |
| VT4 | `slugifySymbolPath` (1000 calls)    | <10ms     | Memoized string ops      |
| VT5 | `getTypeUrlMap` (cached)            | <5ms      | Pre-computed map access  |
| VT6 | Full page data assembly             | <50ms     | All CPU ops combined     |

**CI Requirements:**

- All VT tests MUST pass on every PR
- Performance regression = test failure
- Tests run in isolated Node.js processes for accurate timing

### 9.5 Integration Test Cases

| Test | Scenario                         | Expected         |
| ---- | -------------------------------- | ---------------- |
| TC1  | Load simple function page        | <200ms           |
| TC2  | Load class with 20 members       | <250ms           |
| TC3  | Load class with deep inheritance | <400ms           |
| TC4  | Cold start after deployment      | <500ms           |
| TC5  | Rapid page transitions           | No visible delay |
| TC6  | Cross-project type links         | Correct URLs     |

---

## Appendix A: Profiling Commands

### A.1 Local Performance Testing

```bash
# Build production locally
pnpm build

# Start production server
pnpm start

# Profile specific page
curl -w "@curl-format.txt" -o /dev/null -s \
  "http://localhost:3000/python/langchain-core/messages/BaseMessage"
```

### A.2 Vercel Function Analysis

```bash
# View recent function logs
vercel logs --follow

# Check function duration in dashboard
# Vercel Dashboard → Project → Analytics → Functions
```

### A.3 Memory Profiling

```typescript
// Add to loader.ts for debugging
if (process.env.DEBUG_MEMORY) {
  console.log("[memory]", {
    manifestCache: manifestCache.size,
    routingCache: routingCache.size,
    symbolCache: packageSymbolsCache.size,
    heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
  });
}
```

---

## Appendix B: Metrics Dashboard

### B.1 Key Metrics to Track

```typescript
// Add to middleware or API routes
const metrics = {
  functionDuration: number,
  cacheHits: number,
  cacheMisses: number,
  blobFetches: number,
  symbolsLoaded: number,
  inheritedMembersResolved: number,
};
```

### B.2 Vercel Analytics Integration

```typescript
// Track page performance
import { track } from "@vercel/analytics";

track("symbol-page-load", {
  language,
  packageName,
  symbolKind: symbol.kind,
  memberCount: symbol.members?.length || 0,
  hasInheritance: !!symbol.bases?.length,
  duration: Date.now() - startTime,
});
```

---

_End of Specification_
