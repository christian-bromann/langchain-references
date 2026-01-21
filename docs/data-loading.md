# Data Loading Patterns

This document details how data is loaded in the LangChain References application, including the data structures, caching strategies, and optimization techniques.

## Data Sources

All reference data is stored in Vercel Blob Storage under the `ir/` prefix.

### Project Package Index

**Path:** `ir/index-{project}-{language}.json`

**Example:** `ir/index-langchain-python.json`

**Size:** ~5KB

**Structure:**

```json
{
  "project": "langchain",
  "language": "python",
  "updatedAt": "2024-01-15T12:00:00Z",
  "packages": {
    "langchain_core": {
      "packageId": "pkg_py_langchain_core",
      "buildId": "build_abc123",
      "displayName": "langchain-core",
      "publishedName": "langchain_core",
      "ecosystem": "python",
      "version": "0.3.0"
    }
  }
}
```

**Usage:** Entry point for finding package build IDs.

---

### Routing Map

**Path:** `ir/{buildId}/{packageId}/routing.json`

**Size:** ~100KB per package

**Structure:**

```json
{
  "slugs": {
    "messages/BaseMessage": {
      "title": "BaseMessage",
      "kind": "class",
      "refId": "sym_abc123"
    },
    "runnables/RunnableConfig": {
      "title": "RunnableConfig",
      "kind": "interface",
      "refId": "sym_def456"
    }
  }
}
```

**Usage:**

- Map URL paths to symbol IDs
- Build navigation items for sidebar
- Build type URL map for cross-linking

---

### Individual Symbol Files

**Path:** `ir/{buildId}/{packageId}/symbols/{symbolId}.json`

**Size:** ~1-10KB per symbol

**Structure:**

```json
{
  "id": "sym_abc123",
  "name": "BaseMessage",
  "kind": "class",
  "qualifiedName": "langchain_core.messages.BaseMessage",
  "signature": "class BaseMessage(Serializable)",
  "docs": {
    "summary": "Base class for all message types.",
    "description": "..."
  },
  "members": [
    { "name": "content", "kind": "property", "refId": "sym_xyz789" }
  ],
  "relations": {
    "extends": [{ "name": "Serializable", "qualifiedName": "..." }]
  }
}
```

**Usage:** Full symbol data for rendering documentation.

---

### Sharded Catalog

**Path:** `ir/{buildId}/{packageId}/catalog/{shard}.json`

**Shards:** `0a.json`, `0b.json`, ..., `0f.json` (16 shards)

**Size:** ~50KB per shard

**Structure:**

```json
{
  "symbols": [
    {
      "id": "sym_abc123",
      "name": "BaseMessage",
      "kind": "class",
      "qualifiedName": "langchain_core.messages.BaseMessage",
      "docs": { "summary": "..." }
    }
  ]
}
```

**Usage:** List all public symbols for package overview page.

---

## Data Loading Functions

### `getProjectPackageIndex(project, language)`

Fetches the project package index to find build IDs.

```typescript
const index = await getProjectPackageIndex("langchain", "python");
// Returns: { packages: { langchain_core: { buildId: "...", ... } } }
```

**Caching:** In-memory per-request cache.

---

### `getRoutingMapData(buildId, packageId)`

Fetches the routing map for a package.

```typescript
const routingMap = await getRoutingMapData(buildId, packageId);
// Returns: { slugs: { "path/Symbol": { title, kind, refId } } }
```

**Caching:** `unstable_cache` with 1-hour TTL.

---

### `getIndividualSymbolData(buildId, symbolId, packageId)`

Fetches a single symbol's full data.

```typescript
const symbol = await getIndividualSymbolData(buildId, "sym_abc123", packageId);
// Returns: { id, name, kind, qualifiedName, docs, members, ... }
```

**Caching:** `unstable_cache` with 24-hour TTL.

---

### `getCrossProjectPackages(language)`

Fetches cross-project data for type linking.

```typescript
const packages = await getCrossProjectPackages("python");
// Returns: Map<packageName, { slug, language, knownSymbols }>
```

**Caching:** `unstable_cache` with 1-hour TTL, plus in-memory deduplication.

---

### `getTypeUrlMap(language, excludePackage?, localSymbols?)`

Gets a pre-computed map of type names to URLs.

```typescript
const typeUrlMap = await getTypeUrlMap("python", "langchain_core", localSymbols);
// Returns: Map<"BaseMessage", "/python/langchain-core/messages/BaseMessage">
```

**Optimization:** Map is pre-computed during `getCrossProjectPackages` cache population.

---

## Caching Strategy

### Three-Layer Cache

```txt
Request
    │
    ▼
┌─────────────────────────────────────┐
│  Layer 1: In-Memory (per-request)   │
│  • crossProjectPackageCache         │
│  • routingMapCache                  │
│  • projectPackageIndexCache         │
│  Lifetime: Single request           │
└─────────────────────────────────────┘
    │ miss
    ▼
┌─────────────────────────────────────┐
│  Layer 2: unstable_cache            │
│  • getCachedRoutingMap              │
│  • getCachedCrossProjectPackages    │
│  • getCachedIndividualSymbol        │
│  Lifetime: 1-24 hours               │
└─────────────────────────────────────┘
    │ miss
    ▼
┌─────────────────────────────────────┐
│  Layer 3: Vercel Blob Storage       │
│  • ir/{buildId}/{packageId}/*.json  │
│  Lifetime: Permanent until rebuild  │
└─────────────────────────────────────┘
```

### Cache Keys

| Function | Cache Key Pattern |
| -------- | ----------------- |
| `getCachedRoutingMap` | `routing-map:{buildId}:{packageId}` |
| `getCachedCrossProjectPackages` | `cross-project-packages:{language}` |
| `getCachedIndividualSymbol` | `individual-symbol:{buildId}:{symbolId}` |
| `getCachedSyntheticManifest` | `synthetic-manifest:all-packages` |

### Cache Invalidation

Caches are invalidated by:

1. **TTL expiration** - Automatic after configured duration
2. **Tag-based revalidation** - Using `revalidateTag()` (not currently used)
3. **New deployment** - Fresh serverless instances start with empty cache

---

## Loading Patterns

### Pattern 1: Parallel Sibling Fetches

When multiple independent pieces of data are needed:

```typescript
// ✅ Good: Parallel fetching
const [pkgInfo, routingMap] = await Promise.all([
  getPackageInfo(buildId, packageId),
  getRoutingMapData(buildId, packageId),
]);

// ❌ Bad: Sequential fetching
const pkgInfo = await getPackageInfo(buildId, packageId);
const routingMap = await getRoutingMapData(buildId, packageId);
```

### Pattern 2: Early Promise Start

Start async operations early, await when needed:

```typescript
// Start early (doesn't block)
const typeUrlMapPromise = getTypeUrlMap(language, ...);

// ... do other work that doesn't need typeUrlMap ...

// Await when actually needed
const typeUrlMap = await typeUrlMapPromise;
```

### Pattern 3: Batch Parallel with Error Isolation

Fetch multiple items in parallel, handle errors individually:

```typescript
const results = await Promise.all(
  packages.map(async (pkg) => {
    try {
      return await fetchPackageData(pkg);
    } catch (err) {
      console.error(`Error for ${pkg.id}:`, err);
      return null; // Don't fail the whole batch
    }
  }),
);
const validResults = results.filter(Boolean);
```

### Pattern 4: Waterfall with Caching

When data has dependencies, but inner calls are cached:

```typescript
// This looks like a waterfall...
const buildId = await getPackageBuildId(language, packageName);
const routingMap = await getRoutingMapData(buildId, packageId);
const symbol = await getIndividualSymbolData(buildId, symbolId, packageId);

// ...but getRoutingMapData and getIndividualSymbolData are cached,
// so subsequent requests are fast.
```

---

## Symbol Lookup Algorithm

### Step 1: Direct Routing Map Lookup (O(1))

```typescript
const entry = routingMap.slugs[symbolPath];
if (entry?.refId) {
  return getIndividualSymbolData(buildId, entry.refId, packageId);
}
```

### Step 2: Path Variations

Try common path transformations:

```typescript
const candidates = [
  symbolPath,
  symbolPath.replace(/\//g, "."),           // runnables/Config → runnables.Config
  `${packageName}.${symbolPath}`,           // Add package prefix
  symbolPath.split("/").slice(-1)[0],       // Just the symbol name
];
```

### Step 3: Sharded Lookup Index (Fallback)

If routing map doesn't have it, try sharded lookup:

```typescript
const shard = getShardForSymbol(symbolPath); // Hash-based shard selection
const lookupData = await fetchBlobJson(`lookup/${shard}.json`);
const symbolId = lookupData[symbolPath];
if (symbolId) {
  return getIndividualSymbolData(buildId, symbolId, packageId);
}
```

---

## Concurrency Control

### Blob Fetch Limiter

Limits concurrent blob fetches to prevent overwhelming the network:

```typescript
const BLOB_CONCURRENCY_LIMIT = 10;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

async function withBlobFetchLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (activeFetches >= BLOB_CONCURRENCY_LIMIT) {
    await new Promise((resolve) => fetchQueue.push(resolve));
  }
  activeFetches++;
  try {
    return await fn();
  } finally {
    activeFetches--;
    fetchQueue.shift()?.();
  }
}
```

### Retry Logic

Blob fetches retry on transient failures:

```typescript
async function fetchBlobJson<T>(path: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${BLOB_BASE_URL}/${path}`);
      if (response.ok) return response.json();
      if (response.status === 404) return null;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(100 * attempt); // Exponential backoff
    }
  }
  return null;
}
```

---

## Pre-Warming

### API Endpoint

`/api/prewarm` populates caches proactively:

```typescript
export async function GET(request: Request) {
  const languages = ["python", "javascript"];
  
  await Promise.all(
    languages.map(async (language) => {
      await getCrossProjectPackages(language);  // Populates cache
      await prewarmCorePackages(language);      // Pre-fetches routing maps
    })
  );
  
  return NextResponse.json({ success: true });
}
```

### Vercel Cron

Pre-warming runs every 15 minutes:

```json
{
  "crons": [
    { "path": "/api/prewarm?language=python", "schedule": "*/15 * * * *" },
    { "path": "/api/prewarm?language=javascript", "schedule": "*/15 * * * *" }
  ]
}
```
