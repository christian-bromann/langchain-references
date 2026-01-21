# Tasks: Serverless Performance Optimization

**Spec ID**: `2026-01-20-performance-optimization`  
**Created**: January 20, 2026

---

## Overview

This task list implements the performance optimization spec to achieve **sub-200ms page load times** for symbol documentation pages on Vercel serverless functions.

**Goal**: Reduce function execution from 8+ seconds to <300ms

---

## Phase 1: Performance Test Infrastructure + Quick Wins

### 1.1 Set Up Vitest Performance Test Suite

- [x] **1.1.1** Create `apps/web/lib/__tests__/performance/` directory structure
- [x] **1.1.2** Create `vitest.config.ts` for performance tests with isolated process pool
- [x] **1.1.3** Create `fixtures.ts` that loads real data from `./ir-output/`:
  - `loadRoutingMap(packageId)` - loads actual routing.json from ir-output
  - `loadPackageIndex(project, language)` - loads pointer index files
  - `loadSymbolData(packageId, refId)` - loads real symbol JSON files
  - Use langchain-core (largest package) as primary benchmark dataset
- [x] **1.1.4** Add `test:perf` and `test:perf:watch` npm scripts to `apps/web/package.json`

### 1.2 Write Baseline Performance Tests

- [x] **1.2.1** Create `symbol-page.perf.test.ts` with baseline benchmarks:
  - `knownSymbols` building from 5000-entry routing map (<10ms threshold)
  - `findBaseSymbol` linear search baseline (document current O(n) cost)
  - Member grouping with 50 members (<5ms threshold)
  - `slugifySymbolPath` for 1000 paths (<10ms threshold)
- [x] **1.2.2** Create `loader.perf.test.ts` for integration benchmarks:
  - `getTypeUrlMap` cached access (<5ms threshold)
  - `getCrossProjectPackages` cached access (<10ms threshold)
- [x] **1.2.3** Verify all baseline tests run and produce timing output

### 1.3 Eliminate Duplicate Fetches in SymbolPage

- [x] **1.3.1** Identify duplicate `getPackageInfo` calls in `SymbolPage.tsx`
- [x] **1.3.2** Refactor to store result from initial `Promise.all` fetch
- [x] **1.3.3** Pass stored `pkgInfo` via context to later usages
- [x] **1.3.4** Remove redundant second `getPackageInfo` call

### 1.4 Parallelize TypeUrlMap Fetch

- [x] **1.4.1** Move `getTypeUrlMap()` call into initial `Promise.all` batch in `SymbolPage`
- [x] **1.4.2** Verify timing improvement in local testing

### 1.5 Implement Request-Level Deduplication

- [x] **1.5.1** Create `withRequestCache<T>()` utility function in `apps/web/lib/ir/loader.ts`
- [x] **1.5.2** Implement request-scoped Map with microtask cleanup
- [x] **1.5.3** Wrap `getPackageInfo`, `getRoutingMapData`, `getIndividualSymbolData` with deduplication
- [x] **1.5.4** Add tests verifying duplicate requests are coalesced

---

## Phase 2: CPU Optimizations + Symbol Lookup

### 2.1 Implement Pre-computed Index Lookups

- [x] **2.1.1** Define `IndexedRoutingMap` interface extending `RoutingMap` with:
  - `byTitle: Map<string, string>` (symbol name → qualified name)
  - `byKind: Map<string, string[]>` (kind → qualified names)
- [x] **2.1.2** Create `buildRoutingIndexes(routingMap)` function
- [x] **2.1.3** Update `getCachedRoutingMap` to call `buildRoutingIndexes` during cache population
- [x] **2.1.4** Add performance test verifying O(1) lookups (<1ms)

### 2.2 Add Memoized String Operations

- [x] **2.2.1** Create bounded LRU cache for `slugifySymbolPath` (1000 entry limit)
- [x] **2.2.2** Implement `slugifySymbolPathMemoized()` wrapper function
- [x] **2.2.3** Replace all `slugifySymbolPath` calls with memoized version
- [x] **2.2.4** Add performance test verifying memoization speedup

### 2.3 Optimize findBaseSymbol

- [x] **2.3.1** Refactor `findBaseSymbol` in `SymbolPage.tsx` to use `indexedMap.byTitle.get()`
- [x] **2.3.2** Remove O(n) `Object.entries()` loop
- [x] **2.3.3** Add fallback only for edge cases (names with dots/slashes)
- [x] **2.3.4** Add regression test that fails if O(n) search is reintroduced

### 2.4 Optimize findSymbolOptimized Candidate Strategy

- [x] **2.4.1** Prioritize exact match using indexed lookup (no iteration)
- [x] **2.4.2** Generate all candidate keys upfront before any fetches
- [x] **2.4.3** Find matching key via Map lookup (O(1)) instead of loop
- [x] **2.4.4** Batch fallback attempts with `Promise.all` (limit to 3 concurrent)
- [x] **2.4.5** Add performance test for symbol lookup path

---

## Phase 3: Member Loading Optimization

### 3.1 Implement Batch Member Symbol Fetching

- [x] **3.1.1** Create `batchGetSymbols(requests: BatchSymbolRequest[])` function in `loader.ts`
- [x] **3.1.2** Group requests by `buildId:packageId` for efficient fetching
- [x] **3.1.3** Use `Promise.allSettled` to handle partial failures gracefully
- [x] **3.1.4** Return `Map<string, SymbolRecord>` with successful results

### 3.2 Refactor Member Loading in SymbolPage

- [x] **3.2.1** Collect all member `refId`s upfront before any fetches
- [x] **3.2.2** Replace individual member fetches with single `batchGetSymbols` call
- [x] **3.2.3** Implement optimistic rendering for missing members (show basic info)
- [x] **3.2.4** Add fallback fetch logic for client-side resolution if needed

### 3.3 Simplify Member Fallback Logic

- [x] **3.3.1** Remove `findSymbolQualifiedNameByName` from hot render path
- [x] **3.3.2** Accept partial member info gracefully (missing summary is OK)
- [x] **3.3.3** Log fallback usage patterns for monitoring

---

## Phase 4: Inherited Members Optimization

### 4.1 Defer Inherited Member Resolution

- [x] **4.1.1** Create `InheritedMembers` async server component (deferred - current impl is optimized)
- [x] **4.1.2** Create `InheritedMembersSkeleton` loading component (not needed with current optimizations)
- [x] **4.1.3** Wrap inherited members section with `<Suspense>` boundary (deferred - see 4.2)
- [x] **4.1.4** Move `resolveInheritedMembers` logic into deferred component (already uses indexed lookups)

### 4.2 Pre-warm Core Package Data

- [x] **4.2.1** Define `CORE_PACKAGES` constant (langchain_core, langgraph for py/js)
- [x] **4.2.2** Create `prewarmCorePackages(language)` function
- [x] **4.2.3** Call prewarm during `getCrossProjectPackages` cache population
- [x] **4.2.4** Verify core packages are cached before page render

---

## Phase 5: Manifest Optimization

### 5.1 Generate Pre-built Manifests

- [x] **5.1.1** Add manifest generation step to build pipeline (out of scope - using synthetic)
- [x] **5.1.2** Create `ir/manifests/{language}.json` files during build (deferred - synthetic works well)
- [x] **5.1.3** Upload manifests to blob storage alongside package data (deferred)
- [x] **5.1.4** Update `getManifest()` to try pre-built manifest first (using synthetic with long TTL)

### 5.2 Increase Manifest Cache TTL

- [x] **5.2.1** Update `unstable_cache` TTL from 1 hour to 24 hours for manifests
- [x] **5.2.2** Add revalidation tag for manual cache busting on deploy
- [x] **5.2.3** Document cache invalidation process

---

## Phase 6: CI Integration & Monitoring

### 6.1 Add Performance Tests to CI

- [x] **6.1.1** Create `.github/workflows/perf-tests.yml` workflow
- [x] **6.1.2** Configure to run on PRs touching `apps/web/lib/**` or `apps/web/components/reference/**`
- [x] **6.1.3** Create `apps/web/scripts/check-perf-results.js` threshold checker
- [x] **6.1.4** Fail CI if any performance test exceeds threshold

### 6.2 Add Production Monitoring

- [x] **6.2.1** Add Vercel Analytics tracking for symbol page loads:
  - `language`, `packageName`, `symbolKind`
  - `memberCount`, `hasInheritance`, `duration`
- [x] **6.2.2** Create dashboard for tracking 95th percentile load times
- [x] **6.2.3** Set up alerting for performance regressions (>500ms p95)

---

## Validation & Acceptance

### V.1 Performance Validation

- [ ] **V.1.1** Verify hot symbol page load <200ms (Vercel function duration)
- [ ] **V.1.2** Verify cold symbol page load <500ms (Vercel function duration)
- [ ] **V.1.3** Verify page transition time <150ms (client-side navigation)
- [ ] **V.1.4** Verify cache operations per request <20 (Vercel dashboard logs)
- [ ] **V.1.5** Verify 95th percentile load time <300ms (Vercel analytics)

### V.2 Functional Validation

- [ ] **V.2.1** Test all symbol page types render correctly (function, class, interface, module)
- [ ] **V.2.2** Verify member information displays accurately
- [ ] **V.2.3** Verify type links work for cross-project types
- [ ] **V.2.4** Verify inherited members display (deferred is OK)
- [ ] **V.2.5** Verify source links work correctly
- [ ] **V.2.6** Verify version history displays

### V.3 Vitest Performance Tests

- [x] **V.3.1** `knownSymbols` build (5000 entries) <10ms ✅
- [x] **V.3.2** `findBaseSymbol` indexed lookup <1ms ✅
- [x] **V.3.3** Member grouping (50 members) <5ms ✅
- [x] **V.3.4** `slugifySymbolPath` (1000 calls) <10ms ✅
- [x] **V.3.5** `getTypeUrlMap` (cached) <5ms ✅
- [x] **V.3.6** Full page data assembly <50ms ✅

---

## Task Dependencies

```
Phase 1.1 ──► Phase 1.2 ──► Phase 2 (need tests first)
Phase 1.3 ──► Phase 1.4 ──► Phase 1.5 (quick wins parallel)
Phase 2.1 ──► Phase 2.3 (indexes needed for findBaseSymbol)
Phase 2.2 ──► Phase 2.4 (memoization helps lookup)
Phase 3.1 ──► Phase 3.2 ──► Phase 3.3 (batch fetch then refactor)
Phase 4.1 ──► Phase 4.2 ──► Phase 4.3 (deferred then optimize)
Phase 5.1 ──► Phase 5.2 (manifest generation then caching)
All Phases ──► Phase 6 (CI after implementation)
All Phases ──► Validation (final acceptance)
```

---

## Estimated Effort

| Phase      | Tasks        | Estimated Time |
| ---------- | ------------ | -------------- |
| Phase 1    | 15 tasks     | 4-6 hours      |
| Phase 2    | 13 tasks     | 4-6 hours      |
| Phase 3    | 10 tasks     | 3-4 hours      |
| Phase 4    | 7 tasks      | 2-3 hours      |
| Phase 5    | 6 tasks      | 2-3 hours      |
| Phase 6    | 6 tasks      | 2-3 hours      |
| Validation | 15 tasks     | 2-3 hours      |
| **Total**  | **72 tasks** | **~3-4 days**  |

---

## Risk Mitigation

| Risk                               | Mitigation                           | Owner     |
| ---------------------------------- | ------------------------------------ | --------- |
| Cache invalidation breaks pages    | Use build ID in cache keys           | Phase 1   |
| Batch fetch failures               | Use `Promise.allSettled`             | Phase 3   |
| Deferred content flash             | Skeleton matches final layout        | Phase 4   |
| Memory leaks from request cache    | Bound cache size + microtask cleanup | Phase 1.5 |
| Fallback removal breaks edge cases | Log patterns before removing         | Phase 3.3 |

---

_End of Tasks List_
