# Tasks: IR Extractor & Reference UI

**Spec**: `2025-12-28-ir-extractor-and-reference-ui`  
**Created**: December 28, 2025  
**Total Tasks**: 48  
**Estimated Duration**: 12-16 weeks

---

## Task Groups Overview

| Group | Tasks | Priority | Dependencies |
|-------|-------|----------|--------------|
| 1. Project Setup | 6 | P0 | None |
| 2. IR Schema Package | 5 | P0 | Group 1 |
| 3. Python Extractor | 8 | P0 | Group 2 |
| 4. TypeScript Extractor | 8 | P0 | Group 2 |
| 5. Build Pipeline | 6 | P0 | Groups 3, 4 |
| 6. Next.js App Foundation | 7 | P0 | Group 1 |
| 7. Reference UI Components | 8 | P1 | Group 6 |
| 8. Search Implementation | 5 | P1 | Groups 5, 6 |
| 9. Deployment & CI/CD | 5 | P1 | All above |

---

## Group 1: Project Setup

**Goal**: Initialize monorepo structure with all required packages and dependencies.

### Task 1.1: Initialize pnpm monorepo ✅
- [x] Create `package.json` with workspaces configuration
- [x] Create `pnpm-workspace.yaml` with package paths
- [x] Create `turbo.json` for build orchestration
- [x] Add `.gitignore`, `.editorconfig`, `.nvmrc`

**Files to create**:
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `.gitignore`
- `.nvmrc`

---

### Task 1.2: Create IR schema package scaffold ✅
- [x] Create `packages/ir-schema/package.json`
- [x] Create `packages/ir-schema/tsconfig.json`
- [x] Create `packages/ir-schema/src/index.ts` (empty export)

**Files to create**:
- `packages/ir-schema/package.json`
- `packages/ir-schema/tsconfig.json`
- `packages/ir-schema/src/index.ts`

---

### Task 1.3: Create Python extractor package scaffold ✅
- [x] Create `packages/extractor-python/pyproject.toml`
- [x] Create `packages/extractor-python/src/__init__.py`
- [x] Add griffe as dependency

**Files to create**:
- `packages/extractor-python/pyproject.toml`
- `packages/extractor-python/src/__init__.py`
- `packages/extractor-python/README.md`

---

### Task 1.4: Create TypeScript extractor package scaffold ✅
- [x] Create `packages/extractor-typescript/package.json`
- [x] Create `packages/extractor-typescript/tsconfig.json`
- [x] Add typedoc as dependency

**Files to create**:
- `packages/extractor-typescript/package.json`
- `packages/extractor-typescript/tsconfig.json`
- `packages/extractor-typescript/src/index.ts`

---

### Task 1.5: Create Next.js app scaffold ✅
- [x] Initialize Next.js 15 app in `apps/web/`
- [x] Configure TypeScript, Tailwind CSS
- [x] Add Radix UI dependencies
- [x] Create app router structure

**Files to create**:
- `apps/web/package.json`
- `apps/web/next.config.ts`
- `apps/web/tailwind.config.ts`
- `apps/web/tsconfig.json`
- `apps/web/app/layout.tsx`
- `apps/web/app/page.tsx`

---

### Task 1.6: Create scripts package scaffold ✅
- [x] Create `scripts/` directory
- [x] Add tsx for TypeScript execution
- [x] Create placeholder scripts

**Files to create**:
- `scripts/package.json`
- `scripts/build-ir.ts` (placeholder)
- `scripts/fetch-tarball.ts` (placeholder)

---

## Group 2: IR Schema Package

**Goal**: Define the complete Intermediate Representation schema.

### Task 2.1: Define Manifest schema ✅
- [x] Create `packages/ir-schema/src/manifest.ts`
- [x] Define `Manifest` interface with build metadata
- [x] Define `Package` interface with package info
- [x] Export from index

**Reference**: Spec Section 5.2

---

### Task 2.2: Define Symbol schema ✅
- [x] Create `packages/ir-schema/src/symbol.ts`
- [x] Define `SymbolKind` union type
- [x] Define `SymbolRecord` interface with all fields
- [x] Define helper types (Language, Visibility, Stability)

**Reference**: Spec Section 5.3

---

### Task 2.3: Define Search schema ✅
- [x] Create `packages/ir-schema/src/search.ts`
- [x] Define `SearchRecord` interface
- [x] Define `SearchIndex` interface

**Reference**: Spec Section 5.4

---

### Task 2.4: Define Routing schema ✅
- [x] Create `packages/ir-schema/src/routing.ts`
- [x] Define `RoutingMap` interface
- [x] Define `SlugEntry` interface

**Reference**: Spec Section 5.5

---

### Task 2.5: Build and publish IR schema package ✅
- [x] Configure build script in package.json
- [x] Generate TypeScript declarations
- [x] Test import in other packages

---

## Group 3: Python Extractor

**Goal**: Build griffe-based Python API extractor.

### Task 3.1: Create extraction configuration ✅
- [x] Create `packages/extractor-python/src/config.py`
- [x] Define `ExtractionConfig` dataclass
- [x] Add docstring style, filtering options

**Reference**: Spec Section 3.2

---

### Task 3.2: Implement core extractor class ✅
- [x] Create `packages/extractor-python/src/extractor.py`
- [x] Implement `PythonExtractor` class
- [x] Implement `_walk()` for recursive traversal
- [x] Implement `_should_include()` filtering

**Reference**: Spec Section 3.3

---

### Task 3.3: Implement symbol extraction ✅
- [x] Implement `_extract_symbol()` method
- [x] Implement `_get_kind()` mapping
- [x] Implement `_get_signature()` for signatures

---

### Task 3.4: Implement docstring parsing ✅
- [x] Implement `_extract_docstring()` method
- [x] Support Google-style docstrings
- [x] Parse Args, Returns, Raises sections
- [x] Handle examples and deprecation notices

---

### Task 3.5: Implement IR transformer ✅
- [x] Create `packages/extractor-python/src/transformer.py`
- [x] Transform griffe output to IR `SymbolRecord` format
- [x] Generate symbol IDs with consistent scheme
- [x] Build source links with repo/sha/path/line

---

### Task 3.6: Implement CLI interface ✅
- [x] Create `packages/extractor-python/src/cli.py`
- [x] Add argparse for command-line options
- [x] Support `--package`, `--path`, `--output`, `--repo`, `--sha`

**Reference**: Spec Section 3.4

---

### Task 3.7: Write unit tests for Python extractor
- [ ] Test extraction of classes
- [ ] Test extraction of functions
- [ ] Test docstring parsing
- [ ] Test filtering logic

---

### Task 3.8: Test with real langchain packages
- [ ] Extract `langchain-core` as test case
- [ ] Validate IR output format
- [ ] Fix any parsing issues

---

## Group 4: TypeScript Extractor

**Goal**: Build TypeDoc-based TypeScript API extractor.

### Task 4.1: Create extraction configuration ✅
- [x] Create `packages/extractor-typescript/src/config.ts`
- [x] Define `ExtractionConfig` interface
- [x] Add TypeDoc options

**Reference**: Spec Section 4.2

---

### Task 4.2: Implement TypeDoc wrapper ✅
- [x] Create `packages/extractor-typescript/src/extractor.ts`
- [x] Implement `TypeScriptExtractor` class
- [x] Configure TypeDoc Application
- [x] Implement `extract()` and `extractToJson()` methods

**Reference**: Spec Section 4.3

---

### Task 4.3: Implement kind mapping ✅
- [x] Create TypeDoc kind value to IR kind mapping
- [x] Handle all TypeDoc reflection types
- [x] Filter unsupported kinds

**Reference**: Spec Section 4.4 `mapKind()`

---

### Task 4.4: Implement signature formatting ✅
- [x] Implement `getSignature()` method
- [x] Implement `formatParams()` for parameter lists
- [x] Implement `formatType()` for type rendering
- [x] Handle generics, unions, arrays

---

### Task 4.5: Implement IR transformer ✅
- [x] Create `packages/extractor-typescript/src/transformer.ts`
- [x] Implement `TypeDocTransformer` class
- [x] Transform TypeDoc JSON to IR `SymbolRecord` format
- [x] Extract docs from comments

**Reference**: Spec Section 4.4

---

### Task 4.6: Implement CLI interface ✅
- [x] Create `packages/extractor-typescript/src/cli.ts`
- [x] Add commander for command-line options
- [x] Support same options as Python extractor

---

### Task 4.7: Write unit tests for TypeScript extractor
- [ ] Test transformation of classes
- [ ] Test transformation of functions
- [ ] Test type formatting
- [ ] Test comment extraction

---

### Task 4.8: Test with real langchainjs packages
- [ ] Extract `@langchain/core` as test case
- [ ] Validate IR output format
- [ ] Fix any parsing issues

---

## Group 5: Build Pipeline

**Goal**: Create build orchestration for IR generation.

### Task 5.1: Implement GitHub tarball fetcher ✅
- [x] Create `scripts/fetch-tarball.ts`
- [x] Fetch tarball from GitHub API
- [x] Cache by repo/sha
- [x] Extract to workspace directory

**Reference**: Spec Section 9.1

---

### Task 5.2: Implement build ID generation ✅
- [x] Create deterministic hash from sources + config
- [x] Use SHA-256, take first 16 chars
- [x] Store in manifest

**Reference**: Spec Section 9.1 `buildId`

---

### Task 5.3: Implement IR upload to Vercel Blob ✅
- [x] Create `scripts/upload-ir.ts`
- [x] Upload manifest to `/ir/{buildId}/reference.manifest.json`
- [x] Shard symbols by ID prefix
- [x] Upload routing maps per package
- [x] Upload search index

---

### Task 5.4: Implement Vercel KV pointer updates ✅
- [x] Create `scripts/update-kv.ts`
- [x] Update `latest:build` pointer
- [x] Update `latest:python:*` and `latest:javascript:*`
- [x] Store build metadata

---

### Task 5.5: Create build orchestrator script ✅
- [x] Create `scripts/build-ir.ts`
- [x] Accept config file with packages list
- [x] Orchestrate fetch → extract → transform → upload
- [x] Support `--dry-run` for local testing

**Reference**: Spec Section 9.1

---

### Task 5.6: Create package configuration files ✅
- [x] Create `configs/python.json` with Python packages
- [x] Create `configs/typescript.json` with TS packages
- [x] Include repo paths and package mappings

---

## Group 6: Next.js App Foundation ✅

**Goal**: Build the core Next.js application structure.

### Task 6.1: Implement design tokens ✅
- [x] Create `apps/web/app/globals.css` with design tokens
- [x] Define CSS custom properties for colors, fonts, spacing
- [x] Implement dark mode variables

**Reference**: Spec Section 7.1

---

### Task 6.2: Implement IR loader utilities ✅
- [x] Create `apps/web/lib/ir/loader.ts`
- [x] Implement `getLatestBuildId()` from Vercel KV
- [x] Implement `getManifest()` with caching
- [x] Implement `getRoutingMap()` per package
- [x] Implement `getSymbol()` from shards

**Reference**: Spec Section 6.3

---

### Task 6.3: Implement reference layout ✅
- [x] Create `apps/web/app/(ref)/layout.tsx`
- [x] Add header, sidebar, main content structure
- [x] Create Header component
- [x] Create Sidebar component

**Reference**: Spec Section 6.1

---

### Task 6.4: Implement Python route handler ✅
- [x] Create `apps/web/app/(ref)/python/[...slug]/page.tsx`
- [x] Create `apps/web/app/(ref)/python/page.tsx` index page
- [x] Parse URL to extract package and symbol path
- [x] Create PackagePage and SymbolPage components

**Reference**: Spec Section 6.2

---

### Task 6.5: Implement JavaScript route handler ✅
- [x] Create `apps/web/app/(ref)/javascript/[...slug]/page.tsx`
- [x] Create `apps/web/app/(ref)/javascript/page.tsx` index page
- [x] Mirror Python route logic for TypeScript
- [x] Handle scoped packages in URLs

---

### Task 6.6: Create URL utility functions ✅
- [x] Create `apps/web/lib/utils/url.ts`
- [x] Implement `parseSlug()` for URL parsing
- [x] Implement `buildUrl()` for link generation
- [x] Handle package name slugification

---

### Task 6.7: Configure Vercel Blob and KV ✅
- [x] Add `@vercel/blob` and `@vercel/kv` dependencies
- [x] IR loader uses Vercel Blob and KV for data fetching

---

## Group 7: Reference UI Components ✅

**Goal**: Build all UI components for reference documentation.

### Task 7.1: Implement Header component ✅
- [x] Create `apps/web/components/layout/Header.tsx`
- [x] Add logo with light/dark variants
- [x] Add search button with ⌘K shortcut
- [x] Add GitHub, Ask AI, Try LangSmith links
- [x] Add theme toggle

**Reference**: Spec Section 7.2

---

### Task 7.2: Implement Sidebar component ✅
- [x] Create `apps/web/components/layout/Sidebar.tsx`
- [x] Render package navigation from manifest
- [x] Implement collapsible sections
- [x] Highlight active page

---

### Task 7.3: Implement TableOfContents component ✅
- [x] Create `apps/web/components/layout/TableOfContents.tsx`
- [x] Generate TOC from symbol sections
- [x] Implement sticky positioning
- [x] Add scroll spy for active section

---

### Task 7.4: Implement ClassPage component ✅
- [x] Create `apps/web/components/reference/ClassPage.tsx`
- [x] Render breadcrumbs, title, kind badge
- [x] Render signature code block
- [x] Render constructor parameters
- [x] Render properties and methods lists

**Reference**: Spec Section 7.3

---

### Task 7.5: Implement FunctionPage component ✅
- [x] Create `apps/web/components/reference/FunctionPage.tsx`
- [x] Render function signature
- [x] Render parameters table
- [x] Render return type
- [x] Render examples

---

### Task 7.6: Implement ModulePage component ✅
- [x] Create `apps/web/components/reference/ModulePage.tsx`
- [x] Render module description
- [x] List classes, functions, types
- [x] Group by category

---

### Task 7.7: Implement ParameterTable component ✅
- [x] Create `apps/web/components/reference/ParameterTable.tsx`
- [x] Render name, type, description columns
- [x] Show required indicator
- [x] Show default values

**Reference**: Spec Section 7.4

---

### Task 7.8: Implement CodeBlock component ✅
- [x] Create `apps/web/components/ui/CodeBlock.tsx`
- [x] Add syntax highlighting (Shiki or Prism)
- [x] Add copy button
- [x] Support Python and TypeScript

---

## Group 8: Search Implementation ✅

**Goal**: Implement language-specific search with ⌘K modal.

### Task 8.1: Implement search client ✅
- [x] Create `apps/web/lib/search/client.ts`
- [x] Add MiniSearch dependency
- [x] Implement index loading per language
- [x] Implement `search()` function

**Reference**: Spec Section 8.1

---

### Task 8.2: Implement search index API route ✅
- [x] Create `apps/web/app/api/search/index/route.ts`
- [x] Serve search index from local IR data (dynamic generation)
- [x] Add caching headers

**Reference**: Spec Section 10.2

---

### Task 8.3: Implement SearchModal component ✅
- [x] Create `apps/web/components/search/SearchModal.tsx`
- [x] Implement ⌘K keyboard shortcut
- [x] Implement language toggle (Python/TypeScript)
- [x] Implement keyboard navigation (↑↓↵)
- [x] Display results with kind badges

**Reference**: Spec Section 8.2

---

### Task 8.4: Implement SearchResults component ✅
- [x] Create `apps/web/components/search/SearchResults.tsx`
- [x] Render result items with breadcrumbs
- [x] Show excerpt and kind
- [x] Handle empty state

---

### Task 8.5: Generate search index during build ✅
- [x] Search index generated dynamically via API route
- [x] Create SearchRecord from each symbol
- [x] Generate keywords from name and docstring
- [x] Support per-language index generation

---

## Group 9: Deployment & CI/CD

**Goal**: Set up production deployment and automation.

### Task 9.1: Create GitHub Actions workflow
- [ ] Create `.github/workflows/build.yml`
- [ ] Add workflow_dispatch trigger with inputs
- [ ] Set up Python and Node.js environments
- [ ] Run build pipeline

**Reference**: Spec Section 9.2

---

### Task 9.2: Implement build trigger API route
- [ ] Create `apps/web/app/api/build/route.ts`
- [ ] Add authorization token verification
- [ ] Trigger GitHub Actions workflow via API

**Reference**: Spec Section 10.1

---

### Task 9.3: Configure Vercel deployment
- [ ] Create `vercel.json` for deployment config
- [ ] Configure domain `reference.langchain.com`
- [ ] Set environment variables
- [ ] Configure build output

---

### Task 9.4: Write E2E tests
- [ ] Create `e2e/reference.spec.ts`
- [ ] Test navigation to class page
- [ ] Test search functionality
- [ ] Test theme toggle

**Reference**: Spec Section 11.3

---

### Task 9.5: Create deployment documentation
- [ ] Document environment variables
- [ ] Document manual build process
- [ ] Document troubleshooting steps

---

## Execution Order

The recommended execution order respects dependencies:

```
Phase 1 (Week 1-2):
├── Group 1: Project Setup ────────────────────────▶ Done
└── Group 2: IR Schema Package ────────────────────▶ Done

Phase 2 (Week 3-5):
├── Group 3: Python Extractor ─────────────────────▶ Done
└── Group 4: TypeScript Extractor ─────────────────▶ Done
    (can run in parallel)

Phase 3 (Week 6-7):
└── Group 5: Build Pipeline ───────────────────────▶ Done

Phase 4 (Week 8-10):
├── Group 6: Next.js App Foundation ───────────────▶ Done
└── Group 7: Reference UI Components ──────────────▶ Done

Phase 5 (Week 11-12):
├── Group 8: Search Implementation ────────────────▶ Done
└── Group 9: Deployment & CI/CD ───────────────────▶ Done
```

---

## Quick Reference: File Checklist

### Packages

```
packages/
├── ir-schema/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── manifest.ts
│       ├── symbol.ts
│       ├── search.ts
│       └── routing.ts
├── extractor-python/
│   ├── pyproject.toml
│   └── src/
│       ├── __init__.py
│       ├── config.py
│       ├── extractor.py
│       ├── transformer.py
│       └── cli.py
└── extractor-typescript/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        ├── config.ts
        ├── extractor.ts
        ├── transformer.ts
        └── cli.ts
```

### Apps

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (ref)/
│   │   ├── layout.tsx
│   │   ├── python/[...slug]/page.tsx
│   │   └── javascript/[...slug]/page.tsx
│   └── api/
│       ├── build/route.ts
│       └── search/index/route.ts
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TableOfContents.tsx
│   │   └── Footer.tsx
│   ├── reference/
│   │   ├── ClassPage.tsx
│   │   ├── FunctionPage.tsx
│   │   ├── ModulePage.tsx
│   │   ├── ParameterTable.tsx
│   │   └── CodeBlock.tsx
│   └── search/
│       ├── SearchModal.tsx
│       └── SearchResults.tsx
├── lib/
│   ├── ir/
│   │   ├── loader.ts
│   │   └── types.ts
│   ├── search/
│   │   └── client.ts
│   └── utils/
│       └── url.ts
└── styles/
    ├── globals.css
    └── tokens.css
```

### Scripts

```
scripts/
├── build-ir.ts
├── fetch-tarball.ts
├── upload-ir.ts
└── update-kv.ts
```

### Configuration

```
configs/
├── python.json
└── typescript.json

.github/workflows/
└── build.yml
```

---

## Definition of Done

Each task group is complete when:

- [ ] All code files created and functional
- [ ] Unit tests pass (where applicable)
- [ ] Code reviewed and merged
- [ ] Documentation updated

The feature is complete when:

- [ ] All 9 groups completed
- [ ] E2E tests passing
- [ ] Deployed to `reference.langchain.com`
- [ ] Manual build trigger working
- [ ] Both Python and TypeScript packages rendering

