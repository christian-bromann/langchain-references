# Performance Guide

This document describes the performance characteristics of the LangChain References web application, including data loading patterns, known bottlenecks, and optimization strategies.

## Table of Contents

- [Page Types](#page-types)
- [Data Architecture](#data-architecture)
- [Data Loading Flow](#data-loading-flow)
- [Performance Bottlenecks](#performance-bottlenecks)
- [Optimizations Implemented](#optimizations-implemented)
- [Future Improvements](#future-improvements)
- [Monitoring](#monitoring)

---

## Page Types

The application renders three main types of reference documentation pages:

### 1. Package Page (`PackagePage.tsx`)

**URL Pattern:** `/{language}/{package-name}`

**Example:** `/javascript/langchain-core`, `/python/langchain`

**Purpose:** Shows an overview of a package including all public symbols grouped by kind (classes, functions, interfaces, etc.).

**Data Required:**

- Package build ID (from project index)
- Catalog entries (list of all symbols with metadata)
- Package description

### 2. Symbol Page (`SymbolPage.tsx`)

**URL Pattern:** `/{language}/{package-name}/{symbol-path}`

**Example:** `/javascript/langchain-core/runnables/RunnableConfig`

**Purpose:** Shows detailed documentation for a single symbol including signature, parameters, return types, members, and inherited members.

**Data Required:**

- Package build ID
- Package info and routing map
- Individual symbol data
- Member symbols (for classes/interfaces)
- Inherited members (for classes that extend other classes)
- Cross-project type URL map (for linking types to other packages)

### 3. Subpage Page (`SubpagePage.tsx`)

**URL Pattern:** `/{language}/{package-name}/{subpage-slug}`

**Example:** `/javascript/langchain-core/concepts`

**Purpose:** Renders curated markdown content for guides, concepts, or tutorials associated with a package.

**Data Required:**

- Package build ID
- Subpage content (markdown)
- Package info (for navigation)

---

## Data Architecture

### Storage

All IR (Intermediate Representation) data is stored in **Vercel Blob Storage** and accessed via the `@vercel/blob` SDK.

### Data Hierarchy

```txt
ir/
├── index-{project}-{language}.json    # Project package index (pointers to builds)
├── {buildId}/
│   ├── manifest.json                  # Build metadata
│   ├── {packageId}/
│   │   ├── package.json               # Package metadata
│   │   ├── routing.json               # URL routing map (~100KB)
│   │   ├── symbols.json               # All symbols (~5-15MB) - AVOIDED
│   │   ├── catalog/
│   │   │   ├── 0a.json ... 0f.json    # Sharded catalog (public symbols)
│   │   ├── lookup/
│   │   │   ├── 0a.json ... 0f.json    # Sharded lookup index
│   │   └── symbols/
│   │       └── {symbolId}.json        # Individual symbol files (~1-10KB each)
```

### Key Data Structures

| File | Size | Purpose |
| ---- | ---- | ------- |
| `index-{project}-{language}.json` | ~5KB | Maps package names to build IDs |
| `routing.json` | ~100KB | Maps symbol paths to URL slugs |
| `catalog/*.json` | ~50KB each | Sharded list of public symbols |
| `symbols/{id}.json` | ~1-10KB | Individual symbol with full details |
| `symbols.json` | 5-15MB | **Legacy** - all symbols in one file |

### Caching Layers

1. **Next.js Data Cache (`unstable_cache`)** - Persists across serverless invocations
2. **In-Memory Cache** - Per-request deduplication within a single invocation
3. **Vercel Edge Cache** - CDN caching for static assets

---

## Data Loading Flow

### Layout Loading (Every Request)

```txt
ReferenceLayout
    └── loadNavigationData()
        └── loadSidebarPackages(language) × 4 languages
            └── loadSidebarPackagesForProject(language, projectId)
                ├── getProjectPackageIndex()      # ~5KB per project
                ├── getPackageInfoV2()            # ~2KB per package
                └── getRoutingMapData()           # ~100KB per package (JS only)
```

**Optimization:** All package data is fetched in parallel using `Promise.all`.

### Symbol Page Loading

```txt
SymbolPage
    ├── getPackageBuildId()                      # Cached
    ├── Promise.all([
    │   ├── getPackageInfo()                     # ~2KB
    │   └── getRoutingMapData()                  # ~100KB, cached
    │ ])
    ├── getTypeUrlMap()                          # Started early, runs in parallel
    ├── findSymbolOptimized()
    │   └── getIndividualSymbolData()            # ~5KB per symbol
    ├── memberSymbols (parallel fetch)           # ~5KB × N members
    └── resolveInheritedMembers()                # For classes with extends
```

### Cross-Project Type Linking

To enable linking types like `BaseMessage` to their documentation in other packages:

```txt
fetchCrossProjectPackagesData(language)
    └── For each enabled project:
        └── For each package:
            ├── getRoutingMapData()              # ~100KB
            └── Extract type symbols → typeUrlMap
```

**Result:** A map of `symbolName → URL` for ~5,000 types across all packages.

**Caching:** Cached for 1 hour via `unstable_cache` with tag `cross-project-packages`.

---

## Performance Bottlenecks

### 1. Cold Start Overhead (Unavoidable)

**Impact:** 5-8 seconds on first request to a new serverless instance

**Cause:**

- Node.js runtime initialization
- JavaScript bundle parsing/compilation
- React Server Components initialization

**Mitigation:** Pre-warming cron jobs (see below)

### 2. Navigation Data Loading

**Impact:** 200-600ms on cold cache

**Cause:** Layout loads sidebar data for ALL 4 languages and ALL packages (~60 packages total)

**Mitigation:**

- Parallel fetching with `Promise.all`
- Data shared between layout and sidebar (no duplicate fetching)
- `unstable_cache` for cross-invocation persistence

### 3. Symbol Lookup Fallbacks

**Impact:** 100-500ms when symbol not found in routing map

**Cause:** Sharded lookup index requires fetching the correct shard based on symbol hash

**Mitigation:**

- Direct routing map lookup first (O(1))
- Fallback to sharded lookup only when needed

### 4. Inherited Member Resolution

**Impact:** 50-200ms for classes with deep inheritance

**Cause:** Must resolve base class symbols across potentially different packages

**Mitigation:**

- Use routing map instead of full lookup index
- Parallel fetching of base class symbols

---

## Optimizations Implemented

### 1. Parallel Data Fetching

All independent data fetches use `Promise.all`:

```typescript
const [pkgInfo, routingMap] = await Promise.all([
  getPackageInfo(buildId, packageId),
  getRoutingMapData(buildId, packageId),
]);
```

### 2. Early Promise Start

TypeUrlMap fetch starts early and runs in parallel with symbol loading:

```typescript
// Start early
typeUrlMapPromise = getTypeUrlMap(language, ...);

// ... do other work ...

// Await when needed
const typeUrlMap = await typeUrlMapPromise;
```

### 3. Pre-Computed Type URL Map

Instead of iterating over 20k+ symbols on every render, typeUrlMap is pre-computed during cache population:

```typescript
// In fetchCrossProjectPackagesData (cached)
for (const entry of routingMap.slugs) {
  typeUrlMapObj[entry.title] = `/${language}/${pkgSlug}/${urlPath}`;
}
```

### 4. Avoid Large Files

- Use individual symbol files (`symbols/{id}.json`) instead of `symbols.json`
- Use sharded catalog instead of full symbol list
- Use routing map (~100KB) instead of lookup index (~500KB+)

### 5. Request-Level Deduplication

In-memory cache prevents duplicate fetches within the same request:

```typescript
const crossProjectPackageCache = new Map<string, Map<string, CrossProjectPackage>>();
```

### 6. Layout Data Sharing

Navigation data is loaded once at the layout level and passed to both header and sidebar.

### 7. Pre-Warming

Cron jobs hit `/api/prewarm` every 15 minutes to keep caches warm:

```json
{
  "crons": [
    { "path": "/api/prewarm?language=python", "schedule": "*/15 * * * *" },
    { "path": "/api/prewarm?language=javascript", "schedule": "*/15 * * * *" }
  ]
}
```

### 8. Defensive Error Handling

Per-package try-catch prevents one malformed package from crashing the entire load:

```typescript
allPackages.map(async (pkg) => {
  try {
    // ... process package
  } catch (err) {
    console.error(`Error processing ${pkg.packageId}:`, err);
    return []; // Skip this package
  }
});
```

### 9. Suspense Streaming for Inherited Members

The slowest part of SymbolPage is resolving inherited members (cross-package lookups). This is now deferred using React Suspense:

```typescript
// In SymbolPage.tsx
export async function SymbolPage({ ... }) {
  // Fast: Main symbol content renders immediately
  const symbol = toDisplaySymbol(irSymbol, memberSymbols, undefined);
  
  return (
    <div>
      {/* Fast content renders immediately */}
      <SymbolHeader symbol={symbol} />
      <SignatureBlock ... />
      <MembersSection ... />
      
      {/* Inherited members stream in when ready */}
      <Suspense fallback={<InheritedMembersSkeleton />}>
        <AsyncInheritedMembers
          buildId={buildId}
          packageId={packageId}
          baseClassNames={baseClassNames}
          ownMemberNames={ownMemberNames}
          ...
        />
      </Suspense>
    </div>
  );
}
```

**Benefits:**

- Time to first paint reduced from ~500ms to ~100ms
- Users see main content immediately
- Inherited members load progressively
- Skeleton provides visual feedback during load

**Files:**

- `components/reference/SymbolPage.tsx` - Uses Suspense for inherited members
- `components/reference/skeletons.tsx` - Skeleton components for loading states

---

## Future Improvements

### 1. Edge Runtime for Layout

Move `loadNavigationData` to Edge Runtime for faster cold starts.

**What is Edge Runtime?**

Edge Runtime runs JavaScript at Vercel's edge locations (CDN nodes worldwide) instead of in a full Node.js serverless function.

| Aspect | Node.js Runtime | Edge Runtime |
| ------ | --------------- | ------------ |
| Cold start | **5-8 seconds** | **~50ms** |
| Memory | 4GB max | 128MB max |
| Execution time | 60s max | 30s max |
| Node.js APIs | Full access | Limited (no `fs`, `child_process`) |
| Bundle size | No limit | 4MB max |

**Implementation:**

```typescript
// app/(ref)/layout.tsx
export const runtime = 'edge'; // Add this line

export default async function ReferenceLayout({ children }) {
  const navData = await loadNavigationData();
  // ...
}
```

**Compatibility Check:**

| API Used | Edge Compatible? |
| -------- | ---------------- |
| `fetch()` | ✅ Yes |
| `@vercel/blob` | ✅ Yes |
| `unstable_cache` | ⚠️ Needs testing |
| Node.js-specific APIs | ❌ Not used |

**Potential Issues:**

1. **`unstable_cache` behavior** - May work differently on Edge; needs testing
2. **Bundle size** - Layout + dependencies must be under 4MB
3. **Memory limits** - Loading 60+ packages' data might hit 128MB limit
4. **Error handling** - Edge has stricter timeout/memory limits

**Benefits:**

- Cold starts drop from 5-8s to ~50ms
- Global distribution - Data served from nearest edge location
- Lower latency - No need to route to specific region

**Recommendation:**

1. Test locally with `runtime = 'edge'` to catch obvious issues
2. Measure bundle size to ensure it's under 4MB
3. Consider hybrid approach - Keep page components on Node.js, only move layout to Edge

### 2. Static Navigation Data

Pre-compute navigation data at build time and serve as static JSON:

- Eliminates runtime fetching for sidebar
- Requires rebuild to update navigation

### 3. Lazy Load Type Links

Don't block initial render on cross-project type URL map:

- Render page first
- Load type links client-side
- Hydrate links after load

### 4. Streaming/Suspense

Use React Suspense to stream page content:

- Show skeleton immediately
- Stream symbol data as it loads
- Improves perceived performance

### 5. Partial Pre-Rendering (PPR)

When Next.js PPR is stable:

- Pre-render static shell at build time
- Stream dynamic content at request time

### 6. Reduce Package Count

Consider lazy-loading non-core packages:

- Only load langchain-core, langgraph initially
- Load other packages on navigation

### 7. Vercel KV for Hot Data

Cache frequently-accessed data in Vercel KV:

- Sub-millisecond reads
- Better for small, hot data

---

## Monitoring

### Current Metrics (from logs analysis)

| Metric | Target | Actual |
| ------ | ------ | ------ |
| P50 Latency | <50ms | **7ms** ✅ |
| P90 Latency | <200ms | **13ms** ✅ |
| P99 Latency | <1s | **429ms** ✅ |
| Cold Start | <10s | 5-8s ⚠️ |
| Error Rate | 0% | **0%** ✅ |

### How to Analyze Logs

1. Download logs from Vercel Dashboard → Logs → Export
2. Analyze with:

```bash
# Duration distribution
cat logs.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
durations = [e['durationMs'] for e in data if isinstance(e.get('durationMs'), int)]
print(f'P50: {sorted(durations)[len(durations)//2]}ms')
print(f'P99: {sorted(durations)[int(len(durations)*0.99)]}ms')
"
```

### Adding Instrumentation (Temporarily)

If debugging is needed, add timing:

```typescript
const start = performance.now();
// ... operation
console.log(`[DEBUG] Operation took ${performance.now() - start}ms`);
```

**Remember to remove before deploying to production.**

---

## Related Documentation

- [Architecture Overview](./architecture.md) - System design and components
- [Data Loading](./data-loading.md) - Detailed data fetching patterns
