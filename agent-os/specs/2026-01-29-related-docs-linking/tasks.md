# Task Breakdown: Related Docs Linking

## Overview

Total Tasks: 24

This feature adds a "Related Documentation" section to Symbol pages that displays links to docs.langchain.com pages where the symbol is imported in code examples.

## Task List

### Package Layer

#### Task Group 1: Related Docs Scanner Package

**Dependencies:** None

- [x] 1.0 Complete related-docs-scanner package
  - [x] 1.1 Write 4-6 focused tests for import parsing
    - Test Python simple import parsing (`from pkg import Symbol`)
    - Test Python multi-line import parsing
    - Test JavaScript named import parsing (`import { Symbol } from "pkg"`)
    - Test JavaScript type import parsing
    - Test aliased import handling (extract original name, not alias)
    - Test code block extraction from markdown
  - [x] 1.2 Initialize package structure
    - Create `packages/related-docs-scanner/` directory
    - Create `package.json` with dependencies: `simple-git`, `fast-glob`
    - Create `tsconfig.json` extending base config
    - Create `src/index.ts` with public exports
  - [x] 1.3 Implement docs repository cloning
    - Create `src/clone.ts` with `cloneDocsRepo()` function
    - Support shallow clone (`--depth 1`) for speed
    - Return commit SHA for tracking
    - Handle existing directory (pull updates)
  - [x] 1.4 Implement code block extraction
    - Create `src/extract-blocks.ts`
    - Parse markdown/MDX files for fenced code blocks
    - Filter by language (python, py, javascript, typescript, js, ts, jsx, tsx)
    - Return array of code block contents
  - [x] 1.5 Implement Python import parser
    - Create `src/parsers/python.ts`
    - Parse `from package import Symbol` patterns
    - Parse `from package.module import Symbol` patterns
    - Handle multi-line imports with parentheses
    - Handle aliased imports (`as Alias`) - extract original symbol name
    - Ignore relative imports (`.utils`)
  - [x] 1.6 Implement JavaScript/TypeScript import parser
    - Create `src/parsers/javascript.ts`
    - Parse named imports `import { Symbol } from "pkg"`
    - Parse default imports `import Symbol from "pkg"`
    - Parse type imports `import type { Symbol }`
    - Handle renamed imports - extract original symbol name
    - Handle namespace imports `import * as name`
  - [x] 1.7 Implement section anchor extraction
    - Create `src/extract-sections.ts`
    - Parse MDX frontmatter for page title and description
    - Extract heading hierarchy for section anchors
    - Map code blocks to their containing section
  - [x] 1.8 Implement main scanner function
    - Create `src/scanner.ts` with `scanDocsForImports()`
    - Glob all `.md` and `.mdx` files in docs src directory
    - Process each file: extract blocks → parse imports → map to sections
    - Return `SymbolMatch[]` with symbol name, package, file path, section anchor
  - [x] 1.9 Ensure package tests pass
    - Run ONLY the 4-6 tests written in 1.1
    - Verify import parsing accuracy

**Acceptance Criteria:**

- The 4-6 tests written in 1.1 pass
- Package successfully parses Python and JavaScript imports
- Multi-line and aliased imports handled correctly
- Section anchors extracted for deep linking

### Build Pipeline Layer

#### Task Group 2: Build Pipeline Integration

**Dependencies:** Task Group 1

- [x] 2.0 Complete build pipeline integration
  - [x] 2.1 Write 3-5 focused tests for build integration
    - Test related docs map generation from matches
    - Test 20-link limit enforcement per symbol
    - Test JSON output structure
    - Test graceful handling when docs repo unavailable
  - [x] 2.2 Add CLI flag for docs repo path
    - Modify `packages/build-pipeline/src/commands/build-ir.ts`
    - Add `--docs-repo <path>` option
    - Add `--scan-related-docs` boolean flag
  - [x] 2.3 Implement related docs map builder
    - Create `packages/build-pipeline/src/related-docs-builder.ts`
    - Group matches by symbol qualified name
    - Limit to 20 entries per symbol (store total count)
    - Extract page titles and descriptions from frontmatter
    - Resolve doc paths: `src/docs/tutorials/rag.mdx` → `/docs/tutorials/rag`
  - [x] 2.4 Implement blob upload for related docs
    - Extend upload logic to include `related-docs.json`
    - Store at `ir/packages/{packageId}/{buildId}/related-docs.json`
    - Include metadata: packageId, generatedAt, docsRepoSha
  - [x] 2.5 Update GitHub Actions workflow
    - Add docs repo clone step before package builds
    - Use GitHub Actions cache for docs repo
    - Pass `--docs-repo` flag to build command
  - [x] 2.6 Ensure build pipeline tests pass
    - Run ONLY the 3-5 tests written in 2.1
    - Verify related-docs.json structure is correct

**Acceptance Criteria:**

- The 3-5 tests written in 2.1 pass
- Related docs JSON generated correctly
- 20-link limit enforced per symbol
- Build completes successfully with docs scanning

### Data Loading Layer

#### Task Group 3: Loader Functions

**Dependencies:** Task Group 2

- [x] 3.0 Complete data loading layer
  - [x] 3.1 Write 2-4 focused tests for loader functions
    - Test fetching related docs from blob storage
    - Test caching behavior
    - Test empty result handling
    - Test limit parameter
  - [x] 3.2 Define TypeScript interfaces
    - Add `RelatedDocEntry` interface to `apps/web/lib/ir/types.ts`
    - Add `RelatedDocsMap` interface
    - Include: path, title, description, sectionAnchor, totalCount
  - [x] 3.3 Implement related docs fetcher
    - Add `fetchRelatedDocs()` to `apps/web/lib/ir/loader.ts`
    - Fetch from `ir/packages/{packageId}/{buildId}/related-docs.json`
    - Cache results in memory (per build/package)
    - Handle 404 gracefully (return empty map)
  - [x] 3.4 Implement symbol-level getter
    - Add `getRelatedDocs()` function
    - Accept buildId, packageId, qualifiedName, limit parameters
    - Default limit: 5, expandable to 20
    - Return sorted array of `RelatedDocEntry`
  - [x] 3.5 Ensure loader tests pass
    - Run ONLY the 2-4 tests written in 3.1

**Acceptance Criteria:**

- The 2-4 tests written in 3.1 pass
- Related docs fetched and cached correctly
- Empty results handled gracefully

### Frontend Components

#### Task Group 4: UI Components

**Dependencies:** Task Group 3

- [x] 4.0 Complete UI components
  - [x] 4.1 Write 3-5 focused tests for UI components
    - Test RelatedDocsSection renders docs list
    - Test expand/collapse functionality
    - Test external link behavior (target="\_blank")
    - Test hidden when no docs
    - Test "+X more found" display
  - [x] 4.2 Create RelatedDocsSection component
    - Create `apps/web/components/reference/RelatedDocsSection.tsx`
    - Props: `docs: RelatedDocEntry[]`, `totalCount?: number`
    - Display doc cards with title, description, external link icon
    - Links open docs.langchain.com in new tab
    - Follow existing card styling patterns
  - [x] 4.3 Implement expand/collapse functionality
    - Show 5 docs by default
    - "Show more" button to expand to 20
    - "Show less" button to collapse back to 5
    - Display "+X more found (not shown)" when totalCount > 20
  - [x] 4.4 Integrate into SymbolPage
    - Modify `apps/web/components/reference/SymbolPage.tsx`
    - Fetch related docs using `getRelatedDocs()`
    - Render RelatedDocsSection after main content, before Version History
    - Only render if relatedDocs.length > 0
  - [x] 4.5 Add to Table of Contents
    - Modify `apps/web/components/reference/SymbolPage.tsx`
    - Add "Related Documentation" entry when docs exist
    - Link to `#related-docs` section anchor
  - [x] 4.6 Apply styling following design system
    - Use existing card border/background patterns
    - FileText icon for doc entries
    - ExternalLink icon indicator
    - Hover states matching existing member cards
  - [x] 4.7 Ensure UI component tests pass
    - Run ONLY the 3-5 tests written in 4.1

**Acceptance Criteria:**

- The 3-5 tests written in 4.1 pass
- Related docs section renders correctly
- Expand/collapse works smoothly
- TOC includes Related Documentation entry
- Links open in new tab

### Testing

#### Task Group 5: Integration Testing & Gap Analysis

**Dependencies:** Task Groups 1-4

- [x] 5.0 Review existing tests and fill critical gaps
  - [x] 5.1 Review tests from Task Groups 1-4
    - Review the 4-6 tests from Task Group 1 (import parsing)
    - Review the 3-5 tests from Task Group 2 (build pipeline)
    - Review the 2-4 tests from Task Group 3 (loader)
    - Review the 3-5 tests from Task Group 4 (UI components)
    - Total existing tests: approximately 12-20 tests
  - [x] 5.2 Analyze test coverage gaps
    - Identify critical end-to-end workflows lacking coverage
    - Focus on: build → upload → fetch → render flow
    - Prioritize integration over additional unit tests
  - [x] 5.3 Write up to 5 additional integration tests
    - E2E test: Symbol page with related docs renders correctly
    - E2E test: Symbol page without related docs hides section
    - Integration test: Full scan of sample docs directory
    - Integration test: Build pipeline produces valid JSON
  - [x] 5.4 Run feature-specific tests only
    - Run all tests from Task Groups 1-4 plus new tests
    - Expected total: approximately 15-25 tests
    - Verify all critical workflows pass

**Acceptance Criteria:**

- All feature-specific tests pass (approximately 15-25 tests total)
- End-to-end workflow from build to render is covered
- No more than 5 additional tests added

## Execution Order

Recommended implementation sequence:

1. **Package Layer** (Task Group 1) - Create the scanner package with import parsing
2. **Build Pipeline Layer** (Task Group 2) - Integrate scanning into build process
3. **Data Loading Layer** (Task Group 3) - Add loader functions for fetching data
4. **Frontend Components** (Task Group 4) - Build UI components and integrate
5. **Integration Testing** (Task Group 5) - Fill test gaps and verify end-to-end

## Files to Create/Modify

### New Files:

- `packages/related-docs-scanner/package.json`
- `packages/related-docs-scanner/tsconfig.json`
- `packages/related-docs-scanner/src/index.ts`
- `packages/related-docs-scanner/src/clone.ts`
- `packages/related-docs-scanner/src/scanner.ts`
- `packages/related-docs-scanner/src/extract-blocks.ts`
- `packages/related-docs-scanner/src/extract-sections.ts`
- `packages/related-docs-scanner/src/parsers/python.ts`
- `packages/related-docs-scanner/src/parsers/javascript.ts`
- `packages/build-pipeline/src/related-docs-builder.ts`
- `apps/web/components/reference/RelatedDocsSection.tsx`

### Modified Files:

- `packages/build-pipeline/src/commands/build-ir.ts`
- `packages/build-pipeline/src/upload.ts`
- `.github/workflows/build-ir.yml`
- `apps/web/lib/ir/types.ts`
- `apps/web/lib/ir/loader.ts`
- `apps/web/components/reference/SymbolPage.tsx`
- `apps/web/components/reference/TableOfContents.tsx`
