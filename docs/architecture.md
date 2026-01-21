# Architecture Overview

This document describes the architecture of the LangChain References web application.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Vercel Edge                                │
│  ┌──────────────┐                                                   │
│  │  Middleware  │ ← Package name rewrites, redirects                │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Vercel Serverless Functions                     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Reference Layout                             │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │                loadNavigationData()                       │  │ │
│  │  │  • Loads sidebar packages for all 4 languages             │  │ │
│  │  │  • Shared between Header and Sidebar                      │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  │                           │                                     │ │
│  │    ┌──────────────────────┼──────────────────────┐              │ │
│  │    ▼                      ▼                      ▼              │ │
│  │ ┌──────────┐      ┌──────────────┐      ┌────────────────┐      │ │
│  │ │PackagePage│      │ SymbolPage   │      │  SubpagePage   │      │ │
│  │ └──────────┘      └──────────────┘      └────────────────┘      │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Data Layer (loader.ts)                        │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │  unstable_cache    │  │  In-Memory Cache   │                     │
│  │  (cross-invocation)│  │  (per-request)     │                     │
│  └────────────────────┘  └────────────────────┘                     │
│                                    │                                 │
│                                    ▼                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      fetchBlobJson()                            │ │
│  │  • Retry logic (3 attempts)                                     │ │
│  │  • Concurrency limiting (10 concurrent)                         │ │
│  │  • Error handling                                               │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Vercel Blob Storage                           │
│                                                                      │
│  ir/                                                                 │
│  ├── index-langchain-python.json                                    │
│  ├── index-langchain-javascript.json                                │
│  ├── index-langgraph-python.json                                    │
│  └── {buildId}/                                                      │
│      └── {packageId}/                                                │
│          ├── package.json                                            │
│          ├── routing.json                                            │
│          ├── catalog/*.json                                          │
│          └── symbols/*.json                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
apps/web/
├── app/
│   ├── (ref)/                      # Reference documentation routes
│   │   ├── layout.tsx              # Shared layout with sidebar
│   │   ├── python/[...slug]/       # Python pages
│   │   ├── javascript/[...slug]/   # JavaScript pages
│   │   ├── java/[...slug]/         # Java pages
│   │   └── go/[...slug]/           # Go pages
│   └── api/
│       ├── prewarm/                # Cache pre-warming endpoint
│       ├── search/                 # Search API
│       └── resolve-symbol/         # Symbol resolution API
├── components/
│   ├── layout/
│   │   ├── SidebarLoader.tsx       # Loads sidebar navigation data
│   │   ├── Sidebar.tsx             # Client-side sidebar component
│   │   └── Header.tsx              # Header with navigation
│   └── reference/
│       ├── SymbolPage.tsx          # Symbol documentation page
│       ├── PackagePage.tsx         # Package overview page
│       └── SubpagePage.tsx         # Curated content page
└── lib/
    ├── ir/
    │   ├── loader.ts               # Data loading functions
    │   └── types.ts                # TypeScript types
    ├── config/
    │   ├── projects.ts             # Project configuration
    │   └── languages.ts            # Language configuration
    └── utils/
        └── url.ts                  # URL parsing utilities
```

## Key Components

### Page Components

| Component     | File                                   | Purpose                           |
| ------------- | -------------------------------------- | --------------------------------- |
| `PackagePage` | `components/reference/PackagePage.tsx` | Package overview with symbol list |
| `SymbolPage`  | `components/reference/SymbolPage.tsx`  | Individual symbol documentation   |
| `SubpagePage` | `components/reference/SubpagePage.tsx` | Curated markdown content          |

### Data Loading

| Function                  | File                | Purpose                                  |
| ------------------------- | ------------------- | ---------------------------------------- |
| `loadNavigationData`      | `SidebarLoader.tsx` | Loads sidebar packages for all languages |
| `getPackageBuildId`       | `loader.ts`         | Gets build ID for a package              |
| `getRoutingMapData`       | `loader.ts`         | Gets URL routing map                     |
| `getIndividualSymbolData` | `loader.ts`         | Gets single symbol data                  |
| `getCrossProjectPackages` | `loader.ts`         | Gets type linking data                   |

### Caching

| Cache                      | Scope            | TTL              | Purpose                                |
| -------------------------- | ---------------- | ---------------- | -------------------------------------- |
| `unstable_cache`           | Cross-invocation | 1-24 hours       | Persists data between serverless calls |
| `crossProjectPackageCache` | Per-invocation   | Request lifetime | Deduplicates within request            |
| `routingMapCache`          | Per-invocation   | Request lifetime | Avoids re-fetching routing maps        |

## Data Flow

### 1. Request Handling

```
User Request → Middleware → Layout → Page Component → Data Layer → Blob Storage
```

### 2. URL Parsing

URLs like `/javascript/langchain-core/runnables/RunnableConfig` are parsed into:

```typescript
{
  language: "javascript",
  packageName: "langchain-core",
  packageId: "pkg_js_langchain_core",
  symbolPath: ["runnables", "RunnableConfig"],
  fullPath: "runnables/RunnableConfig"
}
```

### 3. Page Type Detection

```typescript
if (symbolPath.length === 0) {
  return <PackagePage />;       // /javascript/langchain-core
}

if (await isSubpage(...)) {
  return <SubpagePage />;       // /javascript/langchain-core/concepts
}

return <SymbolPage />;          // /javascript/langchain-core/runnables/RunnableConfig
```

## Projects and Languages

### Supported Projects

| Project     | Description         | Languages          |
| ----------- | ------------------- | ------------------ |
| `langchain` | LangChain framework | Python, JavaScript |
| `langgraph` | Graph-based agents  | Python, JavaScript |
| `deepagent` | DeepAgent framework | Python             |

### Supported Languages

| Language   | URL Prefix     | Package Format                         |
| ---------- | -------------- | -------------------------------------- |
| Python     | `/python/`     | `langchain_core`                       |
| JavaScript | `/javascript/` | `@langchain/core`                      |
| Java       | `/java/`       | `io.langchain.langsmith`               |
| Go         | `/go/`         | `github.com/langchain-ai/langsmith-go` |

## Configuration

### Project Configuration (`lib/config/projects.ts`)

```typescript
export const PROJECTS = [
  {
    id: "langchain",
    name: "LangChain",
    enabled: true,
    variants: [
      { language: "python", enabled: true },
      { language: "javascript", enabled: true },
    ],
  },
  // ...
];
```

### Environment Variables

| Variable                | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token                       |
| `USE_LOCAL_IR`          | Use local `ir-output/` directory (development) |

## Build Pipeline

The IR data is generated by the build pipeline (`packages/build-pipeline/`):

```
Source Code → Extractors → IR Schema → Sharding → Blob Upload
```

See [packages/build-pipeline/README.md](../packages/build-pipeline/README.md) for details.
