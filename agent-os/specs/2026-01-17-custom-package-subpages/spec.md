# Specification: Custom Package Subpages (Curated Topic Pages)

**Spec ID**: `2026-01-17-custom-package-subpages`  
**Created**: January 17, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Target State](#3-target-state)
4. [Configuration Schema](#4-configuration-schema)
5. [Markdown Format](#5-markdown-format)
6. [Symbol Resolution](#6-symbol-resolution)
7. [UI/UX Design](#7-uiux-design)
8. [Implementation Plan](#8-implementation-plan)
9. [Edge Cases & Safety](#9-edge-cases--safety)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Allow package maintainers to define **curated subpages** that group related symbols by topic or domain (e.g., "Agents", "Middleware", "Models", "Tools"). These subpages provide a human-curated navigation experience similar to the original MkDocs-based Python reference documentation.

### 1.2 Problem Statement

The current reference documentation auto-generates package pages that list all symbols grouped by kind (classes, functions, interfaces, types). While this is comprehensive, it doesn't provide domain-specific organization that helps users discover related functionality.

The original MkDocs-based Python reference docs solved this with:

- Custom navigation pages (e.g., `langchain/middleware.md`, `langchain/agents.md`)
- Each page contained a curated list of related symbols with descriptions
- Symbols were referenced using `:::` directives that pulled in their documentation

### 1.3 Scope

**In scope:**

- Define a `subpages` property in package configuration (`configs/*-python.json`, `configs/*-typescript.json`)
- Support markdown files hosted locally (in repo) or fetched from GitHub raw URLs
- Parse markdown files into two parts:
  - **Markdown content** (before first `:::`) - render as-is
  - **Symbol references** (from `:::` directives) - extract qualified names
- Resolve qualified names to symbols in the IR catalog
- Display curated subpages in the sidebar navigation
- Render subpages with: markdown content + symbol cards

**Out of scope:**

- Parsing MkDocs options (all indented content after `:::` is ignored)
- Full MkDocs/mkdocstrings compatibility (e.g., Material theme features)
- Version-specific subpages (subpages apply to all versions initially)
- Embedding full symbol documentation inline (subpages link to symbol pages)
- Mixing markdown content with `:::` sections (markdown must come first)

---

## 2. Current State

### 2.1 Current Package Configuration

Packages are configured in JSON files under `configs/`. Example from `configs/langchain-python.json`:

```json
{
  "$schema": "./config-schema.json",
  "project": "langchain",
  "language": "python",
  "repo": "langchain-ai/langchain",
  "packages": [
    {
      "name": "langchain",
      "path": "libs/langchain_v1",
      "displayName": "LangChain",
      "versioning": {
        "tagPattern": "langchain==*",
        "maxVersions": 10
      },
      "descriptionSource": "readme"
    }
  ]
}
```

### 2.2 Current Sidebar Structure

The sidebar displays:

- Language dropdown
- Project title
- List of packages
  - For JavaScript: expandable sub-modules
  - For Python: package names only (no sub-module listing)

### 2.3 Current Package Pages

Package pages (`/python/{package}`, `/javascript/{package}`) show:

- Package description (from README)
- Symbols grouped by kind: Classes, Functions, Modules, Interfaces, Types

---

## 3. Target State

### 3.1 Enhanced Package Configuration

Add a `subpages` property to package configuration:

```json
{
  "name": "langchain",
  "path": "libs/langchain_v1",
  "displayName": "LangChain",
  "versioning": {
    "tagPattern": "langchain==*",
    "maxVersions": 10
  },
  "descriptionSource": "readme",
  "subpages": [
    {
      "slug": "agents",
      "title": "Agents",
      "source": "docs/langchain/agents.md"
    },
    {
      "slug": "middleware",
      "title": "Middleware",
      "source": "docs/langchain/middleware.md"
    },
    {
      "slug": "models",
      "title": "Models",
      "source": "docs/langchain/models.md"
    }
  ]
}
```

### 3.2 Enhanced Sidebar Navigation

For packages with subpages, the sidebar shows:

```
LangChain (package header - clickable)
├── Overview (auto-generated, links to /python/langchain)
├── Agents (links to /python/langchain/agents)
├── Middleware (links to /python/langchain/middleware)
├── Models (links to /python/langchain/models)
├── Messages (links to /python/langchain/messages)
├── Tools (links to /python/langchain/tools)
└── Embeddings (links to /python/langchain/embeddings)
```

### 3.3 Subpage Routes

New routes for subpages:

```
/python/{package}/{subpage-slug}
/javascript/{package}/{subpage-slug}
```

Example:

- `/python/langchain/agents`
- `/python/langchain/middleware`

### 3.4 Subpage Content

Each subpage displays two parts:

1. **Markdown content** (from source file, before first `:::`)
   - Rendered as-is (admonitions, tables, headers, text)
   - Provides context, descriptions, and quick-reference tables
2. **Symbol cards** (from resolved `:::` references)
   - Grouped by kind (Classes, Functions, Types, etc.)
   - Each card links to the full symbol documentation page

**Important**: Symbol cards link to individual symbol pages (`/python/langchain/SummarizationMiddleware`). Full symbol documentation is NOT embedded inline on subpages.

---

## 4. Configuration Schema

### 4.1 Subpage Configuration Type

```typescript
interface SubpageConfig {
  /** URL slug for the subpage (e.g., "agents", "middleware") */
  slug: string;

  /** Display title for navigation and page header */
  title: string;

  /**
   * Source of the markdown content:
   * - Relative path: resolved relative to package path in the repo
   * - Absolute URL: fetched from GitHub raw content
   */
  source: string;
}
```

**Note**: Display order is determined by array position in the JSON config (first item = first in navigation).

### 4.2 Updated Package Configuration Type

```typescript
interface PackageConfig {
  name: string;
  path: string;
  displayName?: string;
  entryPoints?: string[];
  versioning?: VersioningConfig;
  descriptionSource?: string;

  /** Optional curated subpages for domain-specific navigation */
  subpages?: SubpageConfig[];
}
```

### 4.3 Schema Update (`configs/config-schema.json`)

Add to the package properties:

```json
{
  "subpages": {
    "type": "array",
    "description": "Curated subpages for domain-specific symbol grouping. Order in array determines navigation order.",
    "items": {
      "type": "object",
      "required": ["slug", "title", "source"],
      "properties": {
        "slug": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$",
          "description": "URL-safe slug for the subpage"
        },
        "title": {
          "type": "string",
          "description": "Display title for the subpage"
        },
        "source": {
          "type": "string",
          "description": "Path to markdown file (relative to package) or GitHub raw URL"
        }
      }
    }
  }
}
```

---

## 5. Markdown Format

Based on analysis of the existing MkDocs reference documentation at `/docs/reference/python/docs/langchain/`.

### 5.1 File Structure

Each subpage markdown file has **two distinct parts**:

```
┌─────────────────────────────────────┐
│  MARKDOWN CONTENT                   │  ← Render as-is
│  (admonitions, tables, text, etc.)  │
├─────────────────────────────────────┤
│  ::: first.symbol.reference         │  ← First ::: marks the boundary
│  ::: second.symbol.reference        │
│  ::: third.symbol.reference         │  ← Extract qualified names only
│  ...                                 │
└─────────────────────────────────────┘
```

**Key assumption**: Once the first `:::` directive is encountered, only `:::` directives follow (no more markdown content). The `:::` section is always at the bottom.

### 5.2 Full Page Example

Complete example based on actual `middleware.md`:

```markdown
!!! note "Reference docs"

    This page contains **reference documentation** for Middleware.
    See [the docs](https://docs.langchain.com) for tutorials.

## Middleware classes

LangChain provides prebuilt middleware for common agent use cases:

| CLASS                              | DESCRIPTION                                  |
| ---------------------------------- | -------------------------------------------- |
| [`SummarizationMiddleware`](#...)  | Automatically summarize conversation history |
| [`HumanInTheLoopMiddleware`](#...) | Pause execution for human approval           |

## Decorators

Create custom middleware using these decorators:

| DECORATOR               | DESCRIPTION                         |
| ----------------------- | ----------------------------------- |
| [`@before_agent`](#...) | Execute logic before agent starts   |
| [`@after_agent`](#...)  | Execute logic after agent completes |

::: langchain.agents.middleware.SummarizationMiddleware
options:
merge_init_into_class: true

::: langchain.agents.middleware.HumanInTheLoopMiddleware

::: langchain.agents.middleware.before_agent
::: langchain.agents.middleware.after_agent
```

### 5.3 Parsing Algorithm

1. **Read file line by line**
2. **Find first `:::` line** (line starts with `:::` at column 0)
3. **Split file at that point**:
   - Everything **before** first `:::` → `markdownContent` (render as-is)
   - Everything **from** first `:::` onward → symbol references section
4. **Extract qualified names** from lines starting with `:::` (ignore indented option blocks)

### 5.4 Parsed Output

```typescript
interface ParsedSubpage {
  /** Subpage slug from config */
  slug: string;

  /** Display title from config */
  title: string;

  /** Markdown content before first ::: directive (render as-is) */
  markdownContent: string;

  /** Qualified names extracted from ::: directives */
  symbolRefs: string[];
}
```

**Example output** for the `middleware.md` above:

```json
{
  "slug": "middleware",
  "title": "Middleware",
  "markdownContent": "!!! note \"Reference docs\"...\n\n## Middleware classes\n\n| CLASS | DESCRIPTION |\n...",
  "symbolRefs": [
    "langchain.agents.middleware.SummarizationMiddleware",
    "langchain.agents.middleware.HumanInTheLoopMiddleware",
    "langchain.agents.middleware.before_agent",
    "langchain.agents.middleware.after_agent"
  ]
}
```

---

## 6. Symbol Resolution

### 6.1 Resolution Strategy

When rendering a subpage at runtime:

1. **Load subpage config** (slug, title, list of qualified names from parsed markdown)
2. **For each qualified name**, look up in package catalog
3. **Filter to resolved symbols** (skip unresolved references with warning)
4. **Group by kind** (classes, functions, types, etc.)
5. **Render symbol cards** (reuse existing `SymbolCard` component)

### 6.2 Qualified Name Matching

For each extracted reference (e.g., `langchain.agents.middleware.SummarizationMiddleware`):

| Strategy     | Description                                      |
| ------------ | ------------------------------------------------ |
| Exact match  | Symbol's `qualifiedName === reference`           |
| Suffix match | Symbol's `qualifiedName` ends with the reference |
| Name match   | Symbol's `name` equals last segment of reference |

Try strategies in order; use first match found.

### 6.3 Grouping by Kind

Resolved symbols are grouped by kind for display (same as package pages):

```typescript
interface ResolvedSubpage {
  slug: string;
  title: string;
  /** Symbols grouped by kind */
  symbolsByKind: {
    classes: CatalogEntry[];
    functions: CatalogEntry[];
    types: CatalogEntry[];
    interfaces: CatalogEntry[];
    modules: CatalogEntry[];
  };
}
```

**Note**: We reuse the existing `SymbolCard` component and `CatalogEntry` type from package pages. Subpages are curated/filtered views of the same symbol catalog.

---

## 7. UI/UX Design

### 7.1 Sidebar Navigation

For packages with subpages:

```
┌─────────────────────────────┐
│ LangChain                   │  ← Package header (clickable → Overview)
├─────────────────────────────┤
│   Overview                  │  ← Auto-generated "all symbols" page
│   Agents                    │  ← Subpage from config
│   Middleware                │
│   Models                    │
│   Messages                  │
│   Tools                     │
│   Embeddings                │
└─────────────────────────────┘
```

### 7.2 Subpage Layout

Subpages have two sections:

1. **Markdown content** - rendered from the top part of the source file
2. **Symbol cards** - generated from resolved `:::` references

```
┌─────────────────────────────────────────────────────────────────┐
│ Middleware                                           [breadcrumb]│
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ MARKDOWN CONTENT (from source file)                         │ │
│ │                                                              │ │
│ │ !!! note "Reference docs"                                   │ │
│ │   Reference documentation for Middleware...                 │ │
│ │                                                              │ │
│ │ ## Middleware classes                                       │ │
│ │ | CLASS | DESCRIPTION |                                     │ │
│ │ | SummarizationMiddleware | Automatically summarize... |    │ │
│ │ | HumanInTheLoopMiddleware | Pause execution for... |       │ │
│ │                                                              │ │
│ │ ## Decorators                                               │ │
│ │ | DECORATOR | DESCRIPTION |                                 │ │
│ │ | @before_agent | Execute logic before... |                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ SYMBOL CARDS (from resolved ::: references)                     │
│                                                                  │
│ ## Classes                                                      │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ [CLASS] SummarizationMiddleware                      →    │   │
│ │ Automatically summarize conversation history when...      │   │
│ └───────────────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ [CLASS] HumanInTheLoopMiddleware                     →    │   │
│ │ Pause execution for human approval of tool calls          │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ## Functions                                                    │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ [FUNCTION] @before_agent                             →    │   │
│ │ Execute logic before agent execution starts               │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Symbol cards** (same as package pages):

- Kind badge (CLASS, FUNCTION, TYPE, etc.)
- Symbol name (with `@` prefix for decorators)
- Summary (first line of docstring)
- Signature (truncated if long)
- **Link to full symbol page** (e.g., `/python/langchain/SummarizationMiddleware`)

### 7.3 Table of Contents

The right-hand TOC for subpages shows sections (same as package pages):

```
ON THIS PAGE
├── Classes
├── Functions
├── Types
└── Interfaces
```

Symbol names are NOT listed in the TOC since they link to separate pages. The TOC provides section navigation within the subpage (jump to Classes section, Functions section, etc.).

---

## 8. Implementation Plan

### 8.1 Phase 1: Configuration Schema Update

1. Update `configs/config-schema.json` with `subpages` property
2. Add subpages configuration to a test package (e.g., `langchain` Python)
3. Validate schema with existing tooling

### 8.2 Phase 2: Build Pipeline Updates

**File**: `packages/build-pipeline/src/commands/build-ir.ts`

1. Parse `subpages` from package configuration
2. Fetch subpage markdown content:
   - For relative paths: read from cloned repo
   - For URLs: fetch from GitHub raw content
3. Parse markdown to extract symbol references
4. Include subpage metadata in manifest output

**New manifest fields:**

```typescript
interface PackageInfo {
  // ... existing fields
  /** Curated subpages (order preserved from config) */
  subpages?: {
    slug: string;
    title: string;
  }[];
}
```

### 8.3 Phase 3: Subpage Content Processing

**New file**: `packages/build-pipeline/src/subpage-processor.ts`

1. Parse markdown file
2. Extract `:::` directives
3. Build symbol reference list
4. Output processed subpage JSON

**Output format:**

```typescript
interface ProcessedSubpage {
  slug: string;
  title: string;
  intro?: string;
  sections: {
    title: string;
    content: string; // HTML from markdown tables
    symbolRefs: string[]; // Qualified names
  }[];
}
```

### 8.4 Phase 4: Web Application Updates

**Sidebar updates** (`apps/web/components/layout/`):

1. `SidebarLoader.tsx`: Load subpages from manifest
2. `Sidebar.tsx`: Render subpage items under packages

**New route** (`apps/web/app/(ref)/[lang]/[...slug]/`):

1. Detect subpage URLs (e.g., `/python/langchain/middleware`)
2. Load processed subpage data
3. Resolve symbol references from catalog
4. Render subpage with symbol cards

**New component** (`apps/web/components/reference/`):

1. `SubpagePage.tsx`: Render curated subpage content
2. **Reuse existing `SymbolSection` and `SymbolCard` components** from `PackagePage.tsx`
3. Subpages are essentially filtered views of the package catalog - no new symbol rendering needed

### 8.5 Phase 5: IR Output Structure

Subpage data stored in IR output:

```
ir-output/
  packages/
    pkg_py_langchain/
      subpages/
        agents.json
        middleware.json
        models.json
```

---

## 9. Edge Cases & Safety

### 9.1 Missing Symbols

If a `:::` reference cannot be resolved:

- Log a warning during build
- Skip the symbol in output (don't break the build)
- Optionally display a "Symbol not found" placeholder in UI

### 9.2 Invalid Markdown Sources

If a source file cannot be fetched:

- Log an error during build
- Skip the subpage (don't break the build)
- Ensure package still renders without the subpage

### 9.3 Circular References

Not applicable - subpages only reference symbols, not other subpages.

### 9.4 Version Compatibility

For now, subpages apply to all versions of a package. Future enhancement:

- Allow version-specific subpages
- Use `versionRange` property in config

### 9.5 Caching

- Cache fetched markdown files during build
- Subpage content is static per build (not dynamic)
- Consider cache invalidation on source file changes

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

| ID  | Requirement                                            | Priority |
| --- | ------------------------------------------------------ | -------- |
| R1  | `subpages` property accepted in package configuration  | P0       |
| R2  | Subpage markdown files parsed for `:::` directives     | P0       |
| R3  | Qualified names extracted (options blocks ignored)     | P0       |
| R4  | Symbols resolved from package catalog                  | P0       |
| R5  | Subpages displayed in sidebar navigation               | P0       |
| R6  | Subpage routes render symbol cards (like package page) | P0       |
| R7  | Symbol cards link to full symbol documentation pages   | P0       |
| R8  | Relative and URL-based sources supported               | P0       |
| R9  | Unresolved symbols skipped gracefully (with warning)   | P0       |
| R10 | Build pipeline processes subpages efficiently          | P1       |

### 10.2 Quality Requirements

| ID  | Requirement                           | Target  |
| --- | ------------------------------------- | ------- |
| Q1  | Subpage load time                     | < 200ms |
| Q2  | Symbol resolution accuracy            | > 95%   |
| Q3  | No broken links in sidebar navigation | 100%    |
| Q4  | Build time increase from subpages     | < 10%   |

---

## Appendix A: Complete Subpages Configuration

Source files are hosted at: `https://github.com/langchain-ai/docs/blob/main/reference/python/docs/`

Use raw URLs: `https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/{path}`

### A.1 LangChain Project (`configs/langchain-python.json`)

#### langchain package

```json
{
  "name": "langchain",
  "subpages": [
    {
      "slug": "agents",
      "title": "Agents",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/agents.md"
    },
    {
      "slug": "middleware",
      "title": "Middleware",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/middleware.md"
    },
    {
      "slug": "models",
      "title": "Models",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/models.md"
    },
    {
      "slug": "messages",
      "title": "Messages",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/messages.md"
    },
    {
      "slug": "tools",
      "title": "Tools",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/tools.md"
    },
    {
      "slug": "embeddings",
      "title": "Embeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/embeddings.md"
    }
  ]
}
```

#### langchain-core package

```json
{
  "name": "langchain_core",
  "subpages": [
    {
      "slug": "caches",
      "title": "Caches",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/caches.md"
    },
    {
      "slug": "callbacks",
      "title": "Callbacks",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/callbacks.md"
    },
    {
      "slug": "documents",
      "title": "Documents",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/documents.md"
    },
    {
      "slug": "document-loaders",
      "title": "Document loaders",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/document_loaders.md"
    },
    {
      "slug": "embeddings",
      "title": "Embeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/embeddings.md"
    },
    {
      "slug": "exceptions",
      "title": "Exceptions",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/exceptions.md"
    },
    {
      "slug": "language-models",
      "title": "Language models",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/language_models.md"
    },
    {
      "slug": "serialization",
      "title": "Serialization",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/load.md"
    },
    {
      "slug": "output-parsers",
      "title": "Output parsers",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/output_parsers.md"
    },
    {
      "slug": "prompts",
      "title": "Prompts",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/prompts.md"
    },
    {
      "slug": "rate-limiters",
      "title": "Rate limiters",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/rate_limiters.md"
    },
    {
      "slug": "retrievers",
      "title": "Retrievers",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/retrievers.md"
    },
    {
      "slug": "runnables",
      "title": "Runnables",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/runnables.md"
    },
    {
      "slug": "utils",
      "title": "Utilities",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/utils.md"
    },
    {
      "slug": "vectorstores",
      "title": "Vector stores",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_core/vectorstores.md"
    }
  ]
}
```

#### langchain-classic package

```json
{
  "name": "langchain_classic",
  "subpages": [
    {
      "slug": "agents",
      "title": "Agents",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/agents.md"
    },
    {
      "slug": "callbacks",
      "title": "Callbacks",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/callbacks.md"
    },
    {
      "slug": "chains",
      "title": "Chains",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/chains.md"
    },
    {
      "slug": "chat-models",
      "title": "Chat models",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/chat_models.md"
    },
    {
      "slug": "embeddings",
      "title": "Embeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/embeddings.md"
    },
    {
      "slug": "evaluation",
      "title": "Evaluation",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/evaluation.md"
    },
    {
      "slug": "globals",
      "title": "Globals",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/globals.md"
    },
    {
      "slug": "hub",
      "title": "Hub",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/hub.md"
    },
    {
      "slug": "memory",
      "title": "Memory",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/memory.md"
    },
    {
      "slug": "output-parsers",
      "title": "Output parsers",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/output_parsers.md"
    },
    {
      "slug": "retrievers",
      "title": "Retrievers",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/retrievers.md"
    },
    {
      "slug": "runnables",
      "title": "Runnables",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/runnables.md"
    },
    {
      "slug": "smith",
      "title": "LangSmith",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/smith.md"
    },
    {
      "slug": "storage",
      "title": "Storage",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain_classic/storage.md"
    }
  ]
}
```

### A.2 LangGraph Project (`configs/langgraph-python.json`)

```json
{
  "name": "langgraph",
  "subpages": [
    {
      "slug": "graphs",
      "title": "Graphs",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/graphs.md"
    },
    {
      "slug": "func",
      "title": "Functional API",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/func.md"
    },
    {
      "slug": "pregel",
      "title": "Pregel",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/pregel.md"
    },
    {
      "slug": "checkpoints",
      "title": "Checkpointing",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/checkpoints.md"
    },
    {
      "slug": "store",
      "title": "Storage",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/store.md"
    },
    {
      "slug": "cache",
      "title": "Caching",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/cache.md"
    },
    {
      "slug": "types",
      "title": "Types",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/types.md"
    },
    {
      "slug": "runtime",
      "title": "Runtime",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/runtime.md"
    },
    {
      "slug": "config",
      "title": "Config",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/config.md"
    },
    {
      "slug": "errors",
      "title": "Errors",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/errors.md"
    },
    {
      "slug": "constants",
      "title": "Constants",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/constants.md"
    },
    {
      "slug": "channels",
      "title": "Channels",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/channels.md"
    },
    {
      "slug": "agents",
      "title": "Agents (Prebuilt)",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/agents.md"
    },
    {
      "slug": "supervisor",
      "title": "Supervisor (Prebuilt)",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/supervisor.md"
    },
    {
      "slug": "swarm",
      "title": "Swarm (Prebuilt)",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langgraph/swarm.md"
    }
  ]
}
```

### A.3 LangSmith Project (`configs/langsmith-python.json`)

```json
{
  "name": "langsmith",
  "subpages": [
    {
      "slug": "client",
      "title": "Client",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/client.md"
    },
    {
      "slug": "async-client",
      "title": "AsyncClient",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/async_client.md"
    },
    {
      "slug": "run-helpers",
      "title": "Run Helpers",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/run_helpers.md"
    },
    {
      "slug": "run-trees",
      "title": "Run Trees",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/run_trees.md"
    },
    {
      "slug": "evaluation",
      "title": "Evaluation",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/evaluation.md"
    },
    {
      "slug": "schemas",
      "title": "Schemas",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/schemas.md"
    },
    {
      "slug": "utils",
      "title": "Utilities",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/utils.md"
    },
    {
      "slug": "wrappers",
      "title": "Wrappers",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/wrappers.md"
    },
    {
      "slug": "anonymizer",
      "title": "Anonymizer",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/anonymizer.md"
    },
    {
      "slug": "testing",
      "title": "Testing",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/testing.md"
    },
    {
      "slug": "expect",
      "title": "Expect API",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/expect.md"
    },
    {
      "slug": "middleware",
      "title": "Middleware",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/middleware.md"
    },
    {
      "slug": "pytest-plugin",
      "title": "Pytest Plugin",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/observability/sdk/pytest_plugin.md"
    },
    {
      "slug": "deployment-sdk",
      "title": "Deployment SDK",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/deployment/sdk.md"
    },
    {
      "slug": "remote-graph",
      "title": "RemoteGraph",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langsmith/deployment/remote_graph.md"
    }
  ]
}
```

### A.4 Integration Packages (`configs/integrations-python.json`)

Selected integration packages with subpages:

#### langchain-openai

```json
{
  "name": "langchain_openai",
  "subpages": [
    {
      "slug": "BaseChatOpenAI",
      "title": "BaseChatOpenAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/BaseChatOpenAI.md"
    },
    {
      "slug": "ChatOpenAI",
      "title": "ChatOpenAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/ChatOpenAI.md"
    },
    {
      "slug": "AzureChatOpenAI",
      "title": "AzureChatOpenAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/AzureChatOpenAI.md"
    },
    {
      "slug": "OpenAI",
      "title": "OpenAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/OpenAI.md"
    },
    {
      "slug": "AzureOpenAI",
      "title": "AzureOpenAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/AzureOpenAI.md"
    },
    {
      "slug": "OpenAIEmbeddings",
      "title": "OpenAIEmbeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/OpenAIEmbeddings.md"
    },
    {
      "slug": "AzureOpenAIEmbeddings",
      "title": "AzureOpenAIEmbeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/AzureOpenAIEmbeddings.md"
    },
    {
      "slug": "middleware",
      "title": "Middleware",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_openai/middleware.md"
    }
  ]
}
```

#### langchain-anthropic

```json
{
  "name": "langchain_anthropic",
  "subpages": [
    {
      "slug": "ChatAnthropic",
      "title": "ChatAnthropic",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_anthropic/ChatAnthropic.md"
    },
    {
      "slug": "middleware",
      "title": "Middleware",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_anthropic/middleware.md"
    },
    {
      "slug": "AnthropicLLM",
      "title": "AnthropicLLM",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_anthropic/AnthropicLLM.md"
    }
  ]
}
```

#### langchain-google-genai

```json
{
  "name": "langchain_google_genai",
  "subpages": [
    {
      "slug": "ChatGoogleGenerativeAI",
      "title": "ChatGoogleGenerativeAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_google_genai/ChatGoogleGenerativeAI.md"
    },
    {
      "slug": "GoogleGenerativeAI",
      "title": "GoogleGenerativeAI",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_google_genai/GoogleGenerativeAI.md"
    },
    {
      "slug": "GoogleGenerativeAIEmbeddings",
      "title": "GoogleGenerativeAIEmbeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_google_genai/GoogleGenerativeAIEmbeddings.md"
    }
  ]
}
```

#### langchain-ibm

```json
{
  "name": "langchain_ibm",
  "subpages": [
    {
      "slug": "ChatWatsonx",
      "title": "ChatWatsonx",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_ibm/ChatWatsonx.md"
    },
    {
      "slug": "WatsonxLLM",
      "title": "WatsonxLLM",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_ibm/WatsonxLLM.md"
    },
    {
      "slug": "WatsonxEmbeddings",
      "title": "WatsonxEmbeddings",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_ibm/WatsonxEmbeddings.md"
    },
    {
      "slug": "WatsonxRerank",
      "title": "WatsonxRerank",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_ibm/WatsonxRerank.md"
    },
    {
      "slug": "WatsonxToolkit",
      "title": "WatsonxToolkit",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_ibm/WatsonxToolkit.md"
    },
    {
      "slug": "WatsonxSQLDatabaseToolkit",
      "title": "WatsonxSQLDatabaseToolkit",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/integrations/langchain_ibm/WatsonxSQLDatabaseToolkit.md"
    }
  ]
}
```

---

_End of Specification_
