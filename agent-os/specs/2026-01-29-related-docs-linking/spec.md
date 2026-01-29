# Specification: Related Docs Linking

**Spec ID**: `2026-01-29-related-docs-linking`  
**Created**: January 29, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Target State](#3-target-state)
4. [Approach Analysis](#4-approach-analysis)
5. [Data Model](#5-data-model)
6. [Implementation Design](#6-implementation-design)
7. [UI/UX Design](#7-uiux-design)
8. [Build Pipeline Integration](#8-build-pipeline-integration)
9. [Edge Cases & Safety](#9-edge-cases--safety)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Add a "Related Docs" section to each Symbol page that displays links to documentation pages (from docs.langchain.com) that use or reference the symbol in their examples. This creates bidirectional navigation between:

- **docs.langchain.com** → **reference.langchain.com** (already being implemented - linking symbols in docs to reference pages)
- **reference.langchain.com** → **docs.langchain.com** (this feature - showing which docs pages use a symbol)

### 1.2 Problem Statement

Currently, users viewing a symbol's API reference have no easy way to discover practical usage examples in the documentation. The docs contain rich examples showing how symbols are used in real-world scenarios, but this context is not surfaced on the reference pages.

### 1.3 Scope

**In scope:**

- Build pipeline step to scan the LangChain docs repository for symbol imports
- Generate a mapping of symbols → doc pages during IR build
- Display up to 5 related doc links on each Symbol page
- Support for Python and JavaScript/TypeScript imports

**Out of scope:**

- Real-time/dynamic scanning (all data is pre-computed during build)
- Deep content analysis (we only check imports, not type annotations or references)
- Custom link text (links use the doc page title)
- Manual curation of related docs (fully automated based on imports)

### 1.4 Example Scenario

When viewing `/python/langchain-anthropic/chat_models/ChatAnthropic`:

```
Related Docs:
• Chat models quickstart
• Tool calling guide
• Structured outputs tutorial
• Multi-modal inputs
• Streaming responses
```

Each link navigates to the corresponding page on docs.langchain.com.

---

## 2. Current State

### 2.1 Symbol Page Structure

The `SymbolPage` component (`apps/web/components/reference/SymbolPage.tsx`) renders detailed documentation for each symbol. It currently displays:

- Breadcrumb navigation
- Symbol kind badge (class, function, etc.)
- Version information
- Signature block
- Description and documentation
- Members (for classes/modules)
- Inherited members
- Source link
- Version history

### 2.2 IR Build Pipeline

The build pipeline (`packages/build-pipeline/`) generates IR (Intermediate Representation) data for all packages:

1. **Extraction**: Language-specific extractors parse source code
2. **Transformation**: Raw AST is converted to IR format
3. **Upload**: IR files are uploaded to Vercel Blob storage
4. **Indexing**: Project package indexes are updated

### 2.3 LangChain Docs Repository

The documentation lives in `github.com/langchain-ai/docs`:

- Source files in `/src` directory (MDX format)
- Examples contain Python and JavaScript code blocks
- Import statements reference LangChain symbols

Example import patterns in docs:

**Python:**

```python
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
```

**JavaScript/TypeScript:**

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { StateGraph, END } from "@langchain/langgraph";
```

---

## 3. Target State

### 3.1 New "Related Docs" Section

Each Symbol page will display a new section after the main content:

```
┌─────────────────────────────────────────────────────────────┐
│                        Related Docs                         │
│                                                             │
│  📄 Chat models quickstart                                  │
│     How to use chat models with various providers           │
│                                                             │
│  📄 Tool calling guide                                      │
│     Enable LLMs to call external tools and functions        │
│                                                             │
│  📄 Structured outputs tutorial                             │
│     Get structured data from model responses                │
│                                                             │
│  + 12 more docs use this symbol                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Build IR       │────▶│  Scan Docs Repo  │────▶│  Generate Map   │
│  (packages)     │     │  (for imports)   │     │  symbol → docs  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Symbol Page    │◀────│  Fetch Related   │◀────│  Upload to Blob │
│  (UI render)    │     │  (per symbol)    │     │  (JSON files)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

---

## 4. Approach Analysis

### 4.1 Option A: Clone Docs Repository (Text Search)

**Approach:** Clone the docs repository during build and search for imports using file system operations.

**Pros:**

- Full access to all files and content
- Fast local text search (grep/ripgrep)
- Can extract additional context (surrounding code, section titles)
- Works offline once cloned
- Can cache results efficiently

**Cons:**

- Requires cloning ~500MB repository
- Adds build time (clone + search)
- Need to handle authentication for private repos (if any)

**Implementation:**

```typescript
// During IR build:
await git.clone("https://github.com/langchain-ai/docs.git", "docs-repo");
const matches = await ripgrep("from langchain_anthropic import ChatAnthropic", "docs-repo/src");
```

### 4.2 Option B: GitHub Search API

**Approach:** Use GitHub's Code Search API to find files containing symbol imports.

**Pros:**

- No local storage needed
- Always up-to-date with latest docs
- Simpler implementation

**Cons:**

- Rate limits (30 requests/minute for authenticated users)
- Limited to 100 results per search
- Cannot search for complex patterns (regex limitations)
- API response is limited (no file content, just matches)
- Network latency for each search
- Would need many API calls (one per symbol × thousands of symbols)

**Implementation:**

```typescript
// GitHub Search API:
const response = await octokit.rest.search.code({
  q: "from langchain_anthropic import ChatAnthropic repo:langchain-ai/docs",
});
```

### 4.3 Recommendation: Clone Repository (Option A)

**Rationale:**

1. **Scale:** We have thousands of symbols. GitHub's rate limits (30 req/min) would make the build take hours.

2. **Accuracy:** Local search allows complex regex patterns to accurately match import statements, reducing false positives.

3. **Performance:** Once cloned, searching is extremely fast with ripgrep (~2-3 seconds for full scan).

4. **Reliability:** No dependency on external API availability during builds.

5. **Context:** We can extract not just the file path but also section titles, surrounding content for better link quality.

**Build Time Impact:**

- Clone: ~30-60 seconds (shallow clone with depth=1)
- Search: ~2-5 seconds per language
- Total: ~1-2 minutes added to build

This is acceptable given builds already take 10-20 minutes.

---

## 5. Data Model

### 5.1 Related Docs Entry

```typescript
/**
 * A single related documentation page entry.
 */
interface RelatedDocEntry {
  /** URL path within docs.langchain.com (e.g., "/docs/tutorials/chatbot") */
  path: string;

  /** Page title extracted from frontmatter or first heading */
  title: string;

  /** Optional page description/summary */
  description?: string;

  /** Source file path in the docs repo (for debugging) */
  sourceFile: string;

  /** How the symbol is used (import, type annotation, etc.) */
  usageType: "import" | "type" | "reference";
}
```

### 5.2 Symbol to Docs Mapping

```typescript
/**
 * Mapping of symbol qualified names to related docs.
 * Stored per-package at: ir/packages/{packageId}/{buildId}/related-docs.json
 */
interface RelatedDocsMap {
  /** Package this mapping belongs to */
  packageId: string;

  /** When this mapping was generated */
  generatedAt: string;

  /** Docs repository commit SHA used for scanning */
  docsRepoSha: string;

  /** Map of symbol qualified names to their related docs */
  symbols: Record<string, RelatedDocEntry[]>;
}
```

### 5.3 Storage Location

Related docs data will be stored alongside other package IR data:

```
ir/packages/{packageId}/{buildId}/
├── package.json
├── symbols.json
├── routing.json
├── catalog.json
├── changelog/
└── related-docs.json  ← NEW
```

---

## 6. Implementation Design

### 6.1 New Build Pipeline Module

**File:** `packages/build-pipeline/src/related-docs-scanner.ts`

````typescript
import { simpleGit } from "simple-git";
import { glob } from "fast-glob";
import { readFile } from "fs/promises";

interface ScanOptions {
  docsRepoUrl: string;
  workDir: string;
  language: "python" | "javascript";
}

interface SymbolMatch {
  symbolName: string;
  packageName: string;
  filePath: string;
  usageType: "import" | "type" | "reference";
}

/**
 * Clone the docs repository (shallow clone for speed).
 */
export async function cloneDocsRepo(repoUrl: string, targetDir: string): Promise<string> {
  const git = simpleGit();
  await git.clone(repoUrl, targetDir, ["--depth", "1"]);

  // Get the commit SHA for tracking
  const sha = await simpleGit(targetDir).revparse(["HEAD"]);
  return sha.trim();
}

/**
 * Scan docs files for symbol imports.
 */
export async function scanForImports(
  docsDir: string,
  language: "python" | "javascript",
): Promise<SymbolMatch[]> {
  const matches: SymbolMatch[] = [];

  // Find all MDX/MD files
  const files = await glob("**/*.{md,mdx}", { cwd: docsDir });

  // Import patterns by language
  const patterns =
    language === "python"
      ? [
          // from package import Symbol, Symbol2
          /from\s+([\w_]+)\s+import\s+([^#\n]+)/g,
          // from package.module import Symbol
          /from\s+([\w_.]+)\s+import\s+([^#\n]+)/g,
        ]
      : [
          // import { Symbol } from "package"
          /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([^"']+)["']/g,
          // import Symbol from "package"
          /import\s+(\w+)\s+from\s+["']([^"']+)["']/g,
        ];

  for (const file of files) {
    const content = await readFile(`${docsDir}/${file}`, "utf-8");

    // Extract code blocks
    const codeBlocks = extractCodeBlocks(content, language);

    for (const block of codeBlocks) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(block)) !== null) {
          const parsed = parseImportMatch(match, language);
          if (parsed) {
            matches.push({
              ...parsed,
              filePath: file,
              usageType: "import",
            });
          }
        }
      }
    }
  }

  return matches;
}

/**
 * Extract code blocks for a specific language from markdown.
 */
function extractCodeBlocks(content: string, language: "python" | "javascript"): string[] {
  const blocks: string[] = [];
  const langPatterns =
    language === "python"
      ? ["python", "py"]
      : ["javascript", "typescript", "js", "ts", "jsx", "tsx"];

  // Match fenced code blocks: ```lang ... ```
  const regex = new RegExp(`\`\`\`(?:${langPatterns.join("|")})\\n([\\s\\S]*?)\`\`\``, "g");

  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
}
````

### 6.2 Integration with Build Pipeline

**Modified:** `packages/build-pipeline/src/commands/build-ir.ts`

```typescript
// Add after package IR generation:
if (options.scanRelatedDocs) {
  console.log("📚 Scanning docs repository for related documentation...");

  const docsDir = path.join(workDir, "docs-repo");
  const docsRepoUrl = "https://github.com/langchain-ai/docs.git";

  // Clone docs repo (if not already cached)
  let docsRepoSha: string;
  if (!(await exists(docsDir))) {
    docsRepoSha = await cloneDocsRepo(docsRepoUrl, docsDir);
  } else {
    // Pull latest changes
    docsRepoSha = await pullDocsRepo(docsDir);
  }

  // Scan for imports
  const language = config.language === "typescript" ? "javascript" : config.language;
  const matches = await scanForImports(path.join(docsDir, "src"), language);

  // Build symbol → docs mapping
  const relatedDocsMap = buildRelatedDocsMap(matches, packageConfig);

  // Upload to blob storage
  await uploadRelatedDocs(packageId, buildId, relatedDocsMap);
}
```

### 6.3 Loader Function

**Modified:** `apps/web/lib/ir/loader.ts`

```typescript
/**
 * Related docs entry for display in SymbolPage.
 */
export interface RelatedDocEntry {
  path: string;
  title: string;
  description?: string;
}

/**
 * Cache for related docs data.
 */
const relatedDocsCache = new Map<string, Map<string, RelatedDocEntry[]>>();

/**
 * Fetch related docs for a package from blob storage.
 */
async function fetchRelatedDocs(
  buildId: string,
  packageId: string,
): Promise<Map<string, RelatedDocEntry[]> | null> {
  const cacheKey = `${buildId}:${packageId}`;

  if (relatedDocsCache.has(cacheKey)) {
    return relatedDocsCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/packages/${packageId}/${buildId}/related-docs.json`;
  const data = await fetchBlobJson<RelatedDocsMap>(path);

  if (!data) return null;

  // Convert to Map for efficient lookups
  const symbolMap = new Map<string, RelatedDocEntry[]>();
  for (const [qualifiedName, entries] of Object.entries(data.symbols)) {
    symbolMap.set(qualifiedName, entries);
  }

  relatedDocsCache.set(cacheKey, symbolMap);
  return symbolMap;
}

/**
 * Get related docs for a specific symbol.
 * Returns up to `limit` entries, sorted by relevance.
 */
export async function getRelatedDocs(
  buildId: string,
  packageId: string,
  qualifiedName: string,
  limit: number = 5,
): Promise<RelatedDocEntry[]> {
  const docsMap = await fetchRelatedDocs(buildId, packageId);

  if (!docsMap) return [];

  const entries = docsMap.get(qualifiedName) || [];

  // Sort by title for consistent ordering
  // Future: Could sort by relevance score
  return entries.slice(0, limit);
}
```

### 6.4 Symbol Page Integration

**Modified:** `apps/web/components/reference/SymbolPage.tsx`

```tsx
// Add import
import { getRelatedDocs, type RelatedDocEntry } from "@/lib/ir/loader";

// In SymbolPage component:
export async function SymbolPage({ ... }: SymbolPageProps) {
  // ... existing code ...

  // Fetch related docs
  const relatedDocs = buildId
    ? await getRelatedDocs(buildId, packageId, symbol.qualifiedName, 5)
    : [];

  // ... rest of component ...

  return (
    <>
      {/* ... existing content ... */}

      {/* Related Docs Section */}
      {relatedDocs.length > 0 && (
        <RelatedDocsSection docs={relatedDocs} />
      )}

      {/* Version History (moved after Related Docs) */}
      <VersionHistory ... />
    </>
  );
}
```

---

## 7. UI/UX Design

### 7.1 Related Docs Section Component

**New file:** `apps/web/components/reference/RelatedDocsSection.tsx`

```tsx
import Link from "next/link";
import { FileText, ExternalLink } from "lucide-react";
import type { RelatedDocEntry } from "@/lib/ir/loader";

interface RelatedDocsSectionProps {
  docs: RelatedDocEntry[];
  /** Total count if more than displayed */
  totalCount?: number;
}

export function RelatedDocsSection({ docs, totalCount }: RelatedDocsSectionProps) {
  if (docs.length === 0) return null;

  const docsBaseUrl = "https://docs.langchain.com";

  return (
    <section className="pt-6 border-t border-border">
      <h2 className="text-lg font-heading font-semibold text-foreground mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5" />
        Related Documentation
      </h2>

      <div className="space-y-3">
        {docs.map((doc) => (
          <a
            key={doc.path}
            href={`${docsBaseUrl}${doc.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-background-secondary hover:border-primary/50 hover:bg-background transition-colors"
          >
            <FileText className="h-4 w-4 text-foreground-muted mt-0.5 shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {doc.title}
                </span>
                <ExternalLink className="h-3 w-3 text-foreground-muted" />
              </div>

              {doc.description && (
                <p className="text-sm text-foreground-secondary mt-1 line-clamp-2">
                  {doc.description}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>

      {totalCount && totalCount > docs.length && (
        <p className="text-sm text-foreground-muted mt-3">
          + {totalCount - docs.length} more docs use this symbol
        </p>
      )}
    </section>
  );
}
```

### 7.2 Visual Design

**Desktop Layout:**

```
┌────────────────────────────────────────────────────────────────┐
│ ────────────────────────────────────────────────────────────── │
│                                                                │
│  📄 Related Documentation                                      │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 📄 Chat models quickstart                          ↗    │ │
│  │    How to use chat models with various providers        │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 📄 Tool calling guide                              ↗    │ │
│  │    Enable LLMs to call external tools and functions     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  + 8 more docs use this symbol                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 7.3 Styling Tokens

- Section title: `text-lg font-heading font-semibold`
- Card border: `border-border` → `border-primary/50` on hover
- Card background: `bg-background-secondary` → `bg-background` on hover
- Icon color: `text-foreground-muted`
- Title: `text-foreground` → `text-primary` on hover
- Description: `text-sm text-foreground-secondary`

---

## 8. Build Pipeline Integration

### 8.1 Workflow Changes

**Modified:** `.github/workflows/build-ir.yml`

Add a new job step after package builds to scan the docs repository:

```yaml
build:
  steps:
    # ... existing steps ...

    - name: Clone docs repository
      run: |
        git clone --depth 1 https://github.com/langchain-ai/docs.git docs-repo

    - name: Build and Upload IR for ${{ matrix.package }}
      run: |
        npx tsx packages/build-pipeline/src/commands/build-ir.ts \
          --config ./configs/${{ matrix.config }} \
          --package "${{ matrix.package }}" \
          --docs-repo ./docs-repo \
          $FLAGS
```

### 8.2 CLI Flag

Add `--docs-repo` flag to `build-ir.ts`:

```typescript
program.option("--docs-repo <path>", "Path to cloned docs repository for related docs scanning");
```

### 8.3 Caching Strategy

To avoid re-cloning the docs repo for every package build:

1. Clone once in a setup job
2. Use GitHub Actions cache for subsequent runs
3. Pull updates only if cache is older than 1 hour

```yaml
- name: Cache docs repository
  uses: actions/cache@v4
  with:
    path: docs-repo
    key: docs-repo-${{ github.run_id }}
    restore-keys: |
      docs-repo-
```

---

## 9. Edge Cases & Safety

### 9.1 No Related Docs Found

If a symbol has no related docs, the section is simply not rendered:

```tsx
{
  relatedDocs.length > 0 && <RelatedDocsSection docs={relatedDocs} />;
}
```

### 9.2 Import Parsing Edge Cases

**Python edge cases:**

```python
# Multi-line imports
from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
)

# Aliased imports
from langchain_anthropic import ChatAnthropic as Anthropic

# Relative imports (should be ignored - internal docs imports)
from .utils import helper
```

**JavaScript edge cases:**

```typescript
// Renamed imports
import { ChatAnthropic as Anthropic } from "@langchain/anthropic";

// Default exports
import ChatOpenAI from "@langchain/openai";

// Type-only imports (should still match)
import type { BaseMessage } from "@langchain/core/messages";
```

### 9.3 Doc Path Resolution

Doc paths need to be resolved from source file paths:

```
Source: src/docs/tutorials/chatbot.mdx
URL:    /docs/tutorials/chatbot

Source: src/docs/how_to/streaming.md
URL:    /docs/how_to/streaming
```

The transformation:

1. Remove `src/` prefix
2. Remove file extension (`.md`, `.mdx`)
3. Keep the path structure

### 9.4 Rate Limiting / Performance

- Docs repo clone: One-time operation, cached between builds
- Scanning: Uses ripgrep for speed (~2-5 seconds for full repo)
- Storage: Related docs JSON is typically <100KB per package
- Fetch: Single JSON fetch per package, cached in memory

### 9.5 Stale Data

Related docs mappings are regenerated with each build. If a doc page is removed:

- The link will 404 until the next build
- This is acceptable given daily builds
- Future: Could add link validation step

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

| ID  | Requirement                                           | Priority |
| --- | ----------------------------------------------------- | -------- |
| R1  | Build pipeline clones docs repo and scans for imports | P0       |
| R2  | Related docs mapping is generated per package         | P0       |
| R3  | Related docs JSON is uploaded to blob storage         | P0       |
| R4  | SymbolPage fetches and displays related docs          | P0       |
| R5  | Up to 5 related docs are shown per symbol             | P0       |
| R6  | Links open docs.langchain.com in a new tab            | P0       |
| R7  | Section is hidden when no related docs exist          | P0       |
| R8  | Python imports are correctly parsed                   | P0       |
| R9  | JavaScript/TypeScript imports are correctly parsed    | P0       |
| R10 | Multi-line and aliased imports are handled            | P1       |
| R11 | Doc page titles and descriptions are extracted        | P1       |
| R12 | Total count is shown when more than 5 docs exist      | P2       |

### 10.2 Quality Requirements

| ID  | Requirement                      | Target       |
| --- | -------------------------------- | ------------ |
| Q1  | Docs repo clone time             | < 60 seconds |
| Q2  | Import scanning time (full repo) | < 10 seconds |
| Q3  | Related docs JSON fetch time     | < 100ms      |
| Q4  | Import parsing accuracy          | > 95%        |
| Q5  | Build time increase              | < 2 minutes  |

### 10.3 Test Cases

| Test                     | Input                                      | Expected Output           |
| ------------------------ | ------------------------------------------ | ------------------------- |
| Python import basic      | `from langchain_core import ChatAnthropic` | Match ChatAnthropic       |
| Python import multi-line | `from pkg import (\n  Sym1,\n  Sym2\n)`    | Match Sym1, Sym2          |
| Python import aliased    | `from pkg import Sym as Alias`             | Match Sym (not Alias)     |
| JS import named          | `import { Sym } from "pkg"`                | Match Sym                 |
| JS import default        | `import Sym from "pkg"`                    | Match Sym                 |
| JS import type           | `import type { Sym } from "pkg"`           | Match Sym                 |
| JS import renamed        | `import { Sym as Alias } from "pkg"`       | Match Sym (not Alias)     |
| No matches               | Symbol not imported anywhere               | Empty array               |
| Many matches             | Symbol imported in 20 docs                 | Return 5, show "+15 more" |
| Doc path resolution      | `src/docs/tutorials/rag.mdx`               | `/docs/tutorials/rag`     |

---

## Appendix A: Import Patterns Reference

### Python Import Patterns

```python
# Pattern 1: Simple import
from langchain_core.messages import HumanMessage

# Pattern 2: Multiple imports
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# Pattern 3: Multi-line imports
from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
)

# Pattern 4: Aliased import
from langchain_anthropic import ChatAnthropic as AnthropicChat

# Pattern 5: Submodule import
from langchain_core.language_models.chat_models import BaseChatModel
```

### JavaScript/TypeScript Import Patterns

```typescript
// Pattern 1: Named import
import { ChatAnthropic } from "@langchain/anthropic";

// Pattern 2: Multiple named imports
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

// Pattern 3: Default import
import ChatOpenAI from "@langchain/openai";

// Pattern 4: Mixed imports
import ChatOpenAI, { OpenAIEmbeddings } from "@langchain/openai";

// Pattern 5: Aliased import
import { ChatAnthropic as Anthropic } from "@langchain/anthropic";

// Pattern 6: Type import
import type { BaseMessage } from "@langchain/core/messages";

// Pattern 7: Namespace import (rare, but possible)
import * as messages from "@langchain/core/messages";
```

---

## Appendix B: File Size Estimates

| File                    | Size Estimate | Notes                        |
| ----------------------- | ------------- | ---------------------------- |
| related-docs.json       | 50-200KB      | Depends on symbol count      |
| Docs repo (shallow)     | ~100MB        | Full clone would be ~500MB   |
| Search results (memory) | ~10MB         | All matches before filtering |

---

## Appendix C: Future Enhancements

1. **Relevance Scoring**: Rank related docs by:
   - How prominently the symbol is used (import only vs. main example)
   - Doc page popularity/views
   - Recency of the doc update

2. **Bidirectional Links**: Show backlinks on docs pages too:
   - "API Reference: ChatAnthropic"

3. **Usage Context**: Show code snippets from the docs:
   - "See how ChatAnthropic is used in this example..."

4. **Search Integration**: Include related docs in search results:
   - "Docs mentioning ChatAnthropic..."

5. **Link Validation**: Verify doc links are valid before display:
   - Skip broken/moved pages

---

_End of Specification_
