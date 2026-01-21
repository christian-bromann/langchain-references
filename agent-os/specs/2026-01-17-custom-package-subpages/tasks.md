# Tasks: Custom Package Subpages

**Spec ID**: `2026-01-17-custom-package-subpages`  
**Created**: January 17, 2026
**Status**: ✅ Completed

---

## Overview

This task list implements curated subpages for packages, allowing domain-specific navigation (e.g., "Agents", "Middleware", "Models") with markdown content and symbol cards.

---

## Phase 1: Configuration Schema ✅

### Task 1.1: Update JSON Schema

**File**: `configs/config-schema.json`

- [x] Add `subpages` property to package schema
- [x] Define `SubpageConfig` object with `slug`, `title`, `source` properties
- [x] Add validation: `slug` pattern `^[a-z][a-z0-9-]*$`
- [x] Add description noting array order determines navigation order

**Acceptance**: Schema validates subpages configuration correctly

### Task 1.2: Add Subpages to LangChain Python Config

**File**: `configs/langchain-python.json`

- [x] Add `subpages` array to `langchain` package (6 subpages: agents, middleware, models, messages, tools, embeddings)
- [x] Add `subpages` array to `langchain_core` package (15 subpages)
- [x] Add `subpages` array to `langchain_classic` package (14 subpages)
- [x] Use GitHub raw URLs from `langchain-ai/docs` repo

**Acceptance**: Config passes schema validation

### Task 1.3: Add Subpages to LangGraph Python Config

**File**: `configs/langgraph-python.json`

- [x] Add `subpages` array to `langgraph` package (15 subpages including prebuilt agents)

**Acceptance**: Config passes schema validation

### Task 1.4: Add Subpages to LangSmith Python Config

**File**: `configs/langsmith-python.json`

- [x] Add `subpages` array to `langsmith` package (15 subpages for SDK and deployment)

**Acceptance**: Config passes schema validation

### Task 1.5: Add Subpages to Integrations Python Config

**File**: `configs/integrations-python.json`

- [x] Add `subpages` to `langchain_openai` package (8 subpages)
- [x] Add `subpages` to `langchain_anthropic` package (3 subpages)
- [x] Add `subpages` to `langchain_google_genai` package (3 subpages)
- [x] Add `subpages` to `langchain_ibm` package (6 subpages)

**Acceptance**: Config passes schema validation

---

## Phase 2: Build Pipeline - Subpage Processor ✅

### Task 2.1: Create Subpage Processor Module

**File**: `packages/build-pipeline/src/subpage-processor.ts`

- [x] Create `SubpageConfig` interface matching schema
- [x] Create `ParsedSubpage` interface with `slug`, `title`, `markdownContent`, `symbolRefs`
- [x] Implement `parseSubpageMarkdown(content: string)` function:
  - Split content at first `:::` line
  - Extract markdown content (before `:::`)
  - Extract qualified names from `:::` lines (ignore indented options)
- [x] Export functions for use in build pipeline

**Acceptance**: Unit tests pass for parsing various markdown formats

### Task 2.2: Add Markdown Fetching Logic

**File**: `packages/build-pipeline/src/subpage-processor.ts`

- [x] Implement `fetchSubpageContent(source: string)` function:
  - If URL (starts with `http`): fetch from GitHub raw
  - If relative path: read from cloned repo directory
- [x] Add error handling for failed fetches (log warning, return null)
- [x] Add caching for fetched content during build

**Acceptance**: Can fetch from both URLs and local paths

### Task 2.3: Integrate Subpage Processing into Build Pipeline

**File**: `packages/build-pipeline/src/commands/build-ir.ts`

- [x] Import subpage processor functions
- [x] After package extraction, check for `subpages` in config
- [x] For each subpage:
  - Fetch markdown content
  - Parse to extract `markdownContent` and `symbolRefs`
  - Store parsed subpage data
- [x] Include subpage metadata in manifest output

**Acceptance**: Build produces subpage data for configured packages

### Task 2.4: Update IR Schema for Subpages

**File**: `packages/ir-schema/src/manifest.ts`

- [x] Add `subpages` field to `PackageInfo` interface:
  ```typescript
  subpages?: { slug: string; title: string; }[]
  ```
- [x] Export updated types

**Acceptance**: Types compile without errors

### Task 2.5: Create Subpage Output Files

**File**: `packages/build-pipeline/src/commands/build-ir.ts`

- [x] Create `subpages/` directory in package output folder
- [x] Write `{slug}.json` file for each subpage containing:
  - `slug`, `title`, `markdownContent`, `symbolRefs`
- [x] Update manifest with subpage metadata (slug, title only)

**Acceptance**: IR output contains `subpages/` folder with JSON files

---

## Phase 3: Web Application - Sidebar Navigation ✅

### Task 3.1: Update Sidebar Types

**File**: `apps/web/components/layout/SidebarLoader.tsx`

- [x] Update `SidebarPackage` interface to include optional `subpages`:
  ```typescript
  subpages?: { slug: string; title: string; path: string; }[]
  ```

**Acceptance**: Types compile without errors

### Task 3.2: Load Subpages from Manifest

**File**: `apps/web/components/layout/SidebarLoader.tsx`

- [x] In `loadSidebarPackagesForProject`, extract subpages from manifest
- [x] Build subpage paths: `/${language}/${packageSlug}/${subpage.slug}`
- [x] Include subpages in `SidebarPackage` return object

**Acceptance**: Sidebar data includes subpages for configured packages

### Task 3.3: Render Subpages in Sidebar

**File**: `apps/web/components/layout/Sidebar.tsx`

- [x] Update `PackageSection` component to render subpages
- [x] Add "Overview" link as first item (links to package page)
- [x] Render subpage links below Overview
- [x] Style subpage items consistently with existing nav items
- [x] Highlight active subpage based on current path

**Acceptance**: Sidebar shows subpages for LangChain package

---

## Phase 4: Web Application - Subpage Routes ✅

### Task 4.1: Create Subpage Data Loader

**File**: `apps/web/lib/ir/loader.ts`

- [x] Add `getSubpageData(buildId: string, packageId: string, slug: string)` function
- [x] Fetch `subpages/{slug}.json` from IR output
- [x] Return `ParsedSubpage` data or null if not found

**Acceptance**: Can load subpage data for valid slugs

### Task 4.2: Update Route Handler for Subpages

**File**: `apps/web/app/(ref)/python/[...slug]/page.tsx`

- [x] Detect subpage URLs (2-segment slug like `langchain/middleware`)
- [x] Check if second segment is a known subpage (not a symbol)
- [x] If subpage: render `SubpagePage` component
- [x] If symbol: continue with existing `SymbolPage` logic

**Acceptance**: `/python/langchain/middleware` renders subpage, `/python/langchain/SummarizationMiddleware` renders symbol

### Task 4.3: Same for JavaScript Route

**File**: `apps/web/app/(ref)/javascript/[...slug]/page.tsx`

- [x] Apply same subpage detection logic as Python route
- [x] Share subpage detection helper function between routes

**Acceptance**: JavaScript routes handle subpages correctly

---

## Phase 5: Web Application - Subpage Component ✅

### Task 5.1: Create SubpagePage Component

**File**: `apps/web/components/reference/SubpagePage.tsx`

- [x] Create component accepting `language`, `packageName`, `subpageSlug` props
- [x] Load subpage data using loader function
- [x] Handle not found case (return 404)
- [x] Define component structure with markdown section and symbol cards section

**Acceptance**: Component renders without errors

### Task 5.2: Render Markdown Content

**File**: `apps/web/components/reference/SubpagePage.tsx`

- [x] Use existing `MarkdownContent` component to render `markdownContent`
- [x] Ensure MkDocs admonitions (`!!! note`) render as styled callouts
- [x] Ensure tables render correctly

**Acceptance**: Markdown content displays correctly with styling

### Task 5.3: Resolve Symbol References

**File**: `apps/web/components/reference/SubpagePage.tsx`

- [x] Load package catalog entries
- [x] For each `symbolRef` in subpage data:
  - Try exact qualified name match
  - Try suffix match
  - Try name match (last segment)
- [x] Filter to successfully resolved symbols
- [x] Log warning for unresolved symbols

**Acceptance**: Symbols resolve correctly for test subpage

### Task 5.4: Group and Render Symbol Cards

**File**: `apps/web/components/reference/SubpagePage.tsx`

- [x] Group resolved symbols by kind (classes, functions, types, etc.)
- [x] Reuse `SymbolSection` component from `PackagePage.tsx`
- [x] Reuse `SymbolCard` component for individual symbols
- [x] Ensure cards link to full symbol pages

**Acceptance**: Symbol cards display correctly grouped by kind

### Task 5.5: Add Subpage Table of Contents

**File**: `apps/web/components/reference/SubpagePage.tsx`

- [x] Reuse `PackageTableOfContents` component
- [x] Generate TOC sections from symbol kind groups
- [x] Exclude empty sections from TOC

**Acceptance**: TOC shows Classes, Functions, Types sections

### Task 5.6: Add Breadcrumb Navigation

**File**: `apps/web/components/reference/SubpagePage.tsx`

- [x] Add breadcrumb: Language > Package > Subpage Title
- [x] Link package segment to package overview page

**Acceptance**: Breadcrumb displays correctly

---

## Phase 6: Testing - Snapshot Tests for Markdown Parsing ✅

### Task 6.1: Create Test Fixtures Directory

**Directory**: `packages/build-pipeline/src/__tests__/fixtures/subpages/`

- [x] Create `simple.md` - basic markdown with `:::` directives
- [x] Create `with-tables.md` - markdown tables followed by `:::` directives
- [x] Create `with-admonitions.md` - MkDocs `!!! note` admonitions
- [x] Create `complex.md` - full example like actual `middleware.md`
- [x] Create `options-ignored.md` - `:::` with indented options blocks
- [x] Create `no-directives.md` - markdown only, no `:::` (edge case)
- [x] Create `only-directives.md` - no markdown, only `:::` (edge case)
- [x] Create `empty.md` - empty file (edge case)
- [x] Create `nested-options.md` - deeply nested YAML options to ignore

**Acceptance**: All fixture files created

### Task 6.2: Snapshot Tests for Markdown Splitting

**File**: `packages/build-pipeline/src/__tests__/subpage-processor.test.ts`

- [x] Test `simple.md` → snapshot of `markdownContent` and `symbolRefs`
- [x] Test `with-tables.md` → verify tables preserved in `markdownContent`
- [x] Test `with-admonitions.md` → verify admonitions preserved
- [x] Test `complex.md` → full middleware.md parsing
- [x] Test `options-ignored.md` → verify options not in output

**Acceptance**: Snapshots match expected output

### Task 6.3: Snapshot Tests for Edge Cases

**File**: `packages/build-pipeline/src/__tests__/subpage-processor.test.ts`

- [x] Test `no-directives.md` → `markdownContent` = full file, `symbolRefs` = []
- [x] Test `only-directives.md` → `markdownContent` = "", `symbolRefs` populated
- [x] Test `empty.md` → `markdownContent` = "", `symbolRefs` = []
- [x] Test `nested-options.md` → all nested YAML ignored, only qualified names extracted

**Acceptance**: Edge cases handled correctly

### Task 6.4: Snapshot Tests for Qualified Name Extraction

**File**: `packages/build-pipeline/src/__tests__/subpage-processor.test.ts`

- [x] Test extraction of simple qualified names: `::: package.module.Symbol`
- [x] Test extraction with trailing whitespace
- [x] Test extraction with inline comments (if any)
- [x] Test multiple consecutive `:::` lines
- [x] Test `:::` with various option block formats

**Acceptance**: All qualified names correctly extracted

### Task 6.5: Vitest Configuration

**File**: `packages/build-pipeline/vitest.config.ts`

- [x] Configure vitest for the build-pipeline package
- [x] Set up snapshot testing

**Acceptance**: Tests run with `pnpm test`

### Task 6.6: Update Package Scripts

**File**: `packages/build-pipeline/package.json`

- [x] Add script to run tests: `pnpm test`
- [x] Add script to update snapshots: `pnpm test:update`

**Acceptance**: Easy to run and update snapshots

---

## Phase 7: Documentation & Cleanup ✅

### Task 7.1: Update Contributing Guide

- [x] Document subpages configuration format
- [x] Document markdown file format requirements
- [x] Provide example configuration

### Task 7.2: Code Cleanup

- [x] Ensure consistent error handling
- [x] Add JSDoc comments to new functions

---

## Task Dependencies

```
Phase 1 (Config) ──┬──> Phase 2 (Build Pipeline)
                   │
                   └──> Phase 3 (Sidebar) ──┬──> Phase 4 (Routes)
                                            │
                                            └──> Phase 5 (Component)

Phase 2 + Phase 5 ──> Phase 6 (Testing)

Phase 6 ──> Phase 7 (Documentation)
```

---

## Priority Order

1. **P0 - Core Functionality** (Tasks 1.1, 1.2, 2.1-2.5, 3.1-3.3, 4.1-4.3, 5.1-5.4) ✅
2. **P1 - Testing & Polish** (Tasks 6.1-6.6, 5.5, 5.6) ✅
3. **P2 - Remaining Configs** (Tasks 1.3-1.5, 7.1-7.2) ✅

---

## Implementation Summary

All tasks have been completed. The implementation includes:

### Files Created

- `packages/build-pipeline/src/subpage-processor.ts` - Core parsing logic
- `apps/web/components/reference/SubpagePage.tsx` - Subpage display component
- `packages/build-pipeline/src/__tests__/subpage-processor.test.ts` - Snapshot tests
- `packages/build-pipeline/vitest.config.ts` - Test configuration
- 9 test fixture files in `packages/build-pipeline/src/__tests__/fixtures/subpages/`

### Files Modified

- `configs/config-schema.json` - Added `subpages` schema
- `configs/langchain-python.json` - Added subpages for langchain, langchain_core, langchain_classic
- `configs/langgraph-python.json` - Added subpages for langgraph
- `configs/langsmith-python.json` - Added subpages for langsmith
- `configs/integrations-python.json` - Added subpages for openai, anthropic, google_genai, ibm
- `packages/ir-schema/src/manifest.ts` - Added `PackageSubpage` interface
- `packages/build-pipeline/src/commands/build-ir.ts` - Integrated subpage processing
- `packages/build-pipeline/package.json` - Added vitest and test scripts
- `apps/web/lib/ir/loader.ts` - Added subpage data loading functions
- `apps/web/components/layout/Sidebar.tsx` - Added subpage rendering
- `apps/web/components/layout/SidebarLoader.tsx` - Added subpage loading
- `apps/web/app/(ref)/python/[...slug]/page.tsx` - Added subpage route handling
- `apps/web/app/(ref)/javascript/[...slug]/page.tsx` - Added subpage route handling
- `CONTRIBUTING.md` - Added subpages documentation

---

_End of Tasks_
