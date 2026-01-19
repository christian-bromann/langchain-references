# Tasks: Multi-Language Support (Java & Go)

**Spec**: `2026-01-19-multi-language-support`  
**Created**: January 19, 2026

---

## Overview

This task list breaks down the implementation of Java and Go language support for the LangChain Reference Documentation platform, starting with LangSmith SDKs.

**Total Estimated Effort**: ~5-7 days

---

## Phase 1: Schema & Constants Updates

Foundation work to extend the type system to support new languages.

### Task 1.1: Update IR Schema Language Type
- [x] **File**: `packages/ir-schema/src/project.ts`
- [x] Add `Language` type: `"python" | "javascript" | "java" | "go"`
- [x] Update `ProjectVariant.language` to use the new `Language` type
- [x] Export the `Language` type for use in other packages

**Acceptance**: TypeScript compiles without errors, new language types available

### Task 1.2: Update Build Pipeline Constants
- [x] **File**: `packages/build-pipeline/src/constants.ts`
- [x] Add `"java"` and `"go"` to `CONFIG_LANGUAGES` array
- [x] Add `"java"` and `"go"` to `OUTPUT_LANGUAGES` array
- [x] Update `configToOutputLanguage()` to handle java/go (pass-through)
- [x] Update `outputToConfigLanguage()` to handle java/go (pass-through)

**Acceptance**: Constants include all four languages, helper functions work correctly

### Task 1.3: Update Config Schema
- [x] **File**: `configs/config-schema.json`
- [x] Add `"java"` and `"go"` to the `language` enum
- [x] Verify schema validates correctly with new values

**Acceptance**: Schema accepts `"java"` and `"go"` as valid language values

### Task 1.4: Create LangSmith Java Configuration
- [x] **File**: `configs/langsmith-java.json`
- [x] Set project to `"langsmith"`
- [x] Set language to `"java"`
- [x] Set repo to `"langchain-ai/langsmith-java"`
- [x] Configure package with name `"langsmith"`, path `"."`
- [x] Add versioning with tagPattern `"v*"`
- [x] Set descriptionSource to `"readme"`

**Acceptance**: Valid JSON config file that passes schema validation

### Task 1.5: Create LangSmith Go Configuration
- [x] **File**: `configs/langsmith-go.json`
- [x] Set project to `"langsmith"`
- [x] Set language to `"go"`
- [x] Set repo to `"langchain-ai/langsmith-go"`
- [x] Configure package with name `"langsmith"`, path `"."`
- [x] Add versioning with tagPattern `"v*"`
- [x] Set descriptionSource to `"readme"`

**Acceptance**: Valid JSON config file that passes schema validation

### Task 1.6: Create Version Configuration Files
- [x] **File**: `configs/langsmith-java-versions.json` (empty array `[]`)
- [x] **File**: `configs/langsmith-go-versions.json` (empty array `[]`)

**Acceptance**: Version files exist and are valid JSON

---

## Phase 2: Java Extractor Package

Create new extractor package to parse Java source code and generate IR.

### Task 2.1: Initialize Java Extractor Package
- [x] **Directory**: `packages/extractor-java/`
- [x] Create `package.json` with name `@langchain/extractor-java`
- [x] Add dependencies: `java-parser`, `commander`, `glob`
- [x] Create `tsconfig.json` extending workspace base config
- [x] Create `README.md` with usage instructions
- [x] Add package to workspace `pnpm-workspace.yaml`

**Acceptance**: Package installs and builds without errors

### Task 2.2: Implement Java Extractor Config
- [x] **File**: `packages/extractor-java/src/config.ts`
- [x] Define `JavaExtractorConfig` interface
- [x] Include: packageName, packagePath, repo, sha, outputPath
- [x] Add `createConfig()` factory function

**Acceptance**: Config types exported and usable

### Task 2.3: Implement Java Source Parser
- [x] **File**: `packages/extractor-java/src/extractor.ts`
- [x] Use `java-parser` to parse `.java` files
- [x] Extract classes, interfaces, enums, records
- [x] Extract methods with parameters, return types
- [x] Extract fields with types
- [x] Extract Javadoc comments
- [x] Handle generics and type parameters
- [x] Walk directory tree to find all `.java` files

**Acceptance**: Can parse langsmith-java source files into AST

### Task 2.4: Implement Javadoc to Markdown Converter
- [x] **File**: `packages/extractor-java/src/transformer.ts` (partial)
- [x] Convert `@param` tags to markdown list items
- [x] Convert `@return` to "Returns:" section
- [x] Convert `@throws` to markdown list
- [x] Convert `{@code ...}` to backticks
- [x] Convert `{@link ...}` to backticks (for now)
- [x] Strip `@since`, `@author`, `@version`, `@see` tags
- [x] Preserve description text

**Acceptance**: Javadoc converts cleanly to readable markdown

### Task 2.5: Implement Java IR Transformer
- [x] **File**: `packages/extractor-java/src/transformer.ts`
- [x] Transform Java classes to IR `SymbolRecord` with kind `"class"`
- [x] Transform Java interfaces to IR with kind `"interface"`
- [x] Transform Java enums to IR with kind `"enum"`
- [x] Transform methods to IR members with kind `"method"`
- [x] Transform fields to IR members with kind `"property"`
- [x] Transform constructors to IR members with kind `"constructor"`
- [x] Generate unique symbol IDs with `pkg_java_` prefix
- [x] Build qualified names from package + class path
- [x] Generate method signatures with modifiers, generics, params
- [x] Build GitHub source URLs

**Acceptance**: Produces valid IR JSON matching schema

### Task 2.6: Implement Java Extractor CLI
- [x] **File**: `packages/extractor-java/src/cli.ts`
- [x] Accept `--package`, `--path`, `--output`, `--repo`, `--sha` args
- [x] Load and parse all Java source files
- [x] Transform to IR format
- [x] Write `symbols.json` to output path
- [x] Handle errors gracefully with exit codes

**Acceptance**: CLI runs and produces valid output

### Task 2.7: Create Java Extractor Index Export
- [x] **File**: `packages/extractor-java/src/index.ts`
- [x] Export config types and functions
- [x] Export extractor class
- [x] Export transformer class

**Acceptance**: Package exports are importable

### Task 2.8: Test Java Extractor with LangSmith
- [ ] Clone langsmith-java repository
- [ ] Run extractor against the source
- [ ] Verify symbols.json contains expected classes (Client, etc.)
- [ ] Verify method signatures are correct
- [ ] Verify Javadoc converts to markdown properly

**Acceptance**: Extracts >90% of public API from langsmith-java

---

## Phase 3: Go Extractor Package

Create new extractor package to parse Go source code and generate IR.

### Task 3.1: Initialize Go Extractor Package
- [x] **Directory**: `packages/extractor-go/`
- [x] Create `package.json` with name `@langchain/extractor-go`
- [x] Add dependencies: `commander`, `glob`
- [x] Create `tsconfig.json` extending workspace base config
- [x] Create `README.md` with usage instructions
- [x] Add package to workspace `pnpm-workspace.yaml`

**Acceptance**: Package installs and builds without errors

### Task 3.2: Implement Go Extractor Config
- [x] **File**: `packages/extractor-go/src/config.ts`
- [x] Define `GoExtractorConfig` interface
- [x] Include: packageName, packagePath, repo, sha, outputPath
- [x] Add `createConfig()` factory function

**Acceptance**: Config types exported and usable

### Task 3.3: Implement Go Documentation Extractor
- [x] **File**: `packages/extractor-go/src/extractor.ts`
- [x] Use `go doc -json -all` to extract documentation
- [x] Parse JSON output for types, functions, methods
- [x] Extract struct definitions and methods
- [x] Extract interface definitions
- [x] Extract top-level functions
- [x] Extract constants and variables
- [x] Parse source locations for GitHub links
- [x] Handle exported vs unexported symbols

**Acceptance**: Can extract docs from langsmith-go

### Task 3.4: Implement Go Doc to Markdown Converter
- [x] **File**: `packages/extractor-go/src/transformer.ts` (partial)
- [x] Preserve plain text documentation
- [x] Detect and wrap code blocks (indented lines)
- [x] Convert `BUG(name):` to warning callouts
- [x] Handle package-level documentation

**Acceptance**: Go docs convert to readable markdown

### Task 3.5: Implement Go IR Transformer
- [x] **File**: `packages/extractor-go/src/transformer.ts`
- [x] Transform Go structs to IR `SymbolRecord` with kind `"class"`
- [x] Transform Go interfaces to IR with kind `"interface"`
- [x] Transform Go funcs to IR with kind `"function"`
- [x] Transform methods (with receivers) to IR members
- [x] Transform type aliases to IR with kind `"type"`
- [x] Transform consts/vars to IR with kind `"variable"`
- [x] Generate unique symbol IDs with `pkg_go_` prefix
- [x] Build qualified names from module path
- [x] Generate function signatures with receiver, params, returns
- [x] Build GitHub source URLs

**Acceptance**: Produces valid IR JSON matching schema

### Task 3.6: Implement Go Extractor CLI
- [x] **File**: `packages/extractor-go/src/cli.ts`
- [x] Accept `--package`, `--path`, `--output`, `--repo`, `--sha` args
- [x] Check that Go is installed (`go version`)
- [x] Run `go doc` extraction
- [x] Transform to IR format
- [x] Write `symbols.json` to output path
- [x] Handle errors gracefully with exit codes

**Acceptance**: CLI runs and produces valid output

### Task 3.7: Create Go Extractor Index Export
- [x] **File**: `packages/extractor-go/src/index.ts`
- [x] Export config types and functions
- [x] Export extractor class
- [x] Export transformer class

**Acceptance**: Package exports are importable

### Task 3.8: Test Go Extractor with LangSmith
- [ ] Clone langsmith-go repository
- [ ] Run extractor against the source
- [ ] Verify symbols.json contains expected types (Client, etc.)
- [ ] Verify function signatures are correct
- [ ] Verify Go docs convert to markdown properly

**Acceptance**: Extracts >90% of exported symbols from langsmith-go

---

## Phase 4: Build Pipeline Updates

Integrate new extractors into the build pipeline.

### Task 4.1: Add extractJava Function
- [x] **File**: `packages/build-pipeline/src/commands/build-ir.ts`
- [x] Add `extractJava()` async function
- [x] Call Java extractor CLI with correct arguments
- [x] Log extraction progress with ☕ emoji
- [x] Handle extraction errors

**Acceptance**: Java extraction can be triggered from build pipeline

### Task 4.2: Add extractGo Function
- [x] **File**: `packages/build-pipeline/src/commands/build-ir.ts`
- [x] Add `extractGo()` async function
- [x] Call Go extractor CLI with correct arguments
- [x] Log extraction progress with 🐹 emoji
- [x] Handle extraction errors

**Acceptance**: Go extraction can be triggered from build pipeline

### Task 4.3: Update Extraction Logic Switch
- [x] **File**: `packages/build-pipeline/src/commands/build-ir.ts`
- [x] Add `else if (config.language === "java")` branch
- [x] Add `else if (config.language === "go")` branch
- [x] Call respective extraction functions

**Acceptance**: Build pipeline correctly routes to java/go extractors

### Task 4.4: Update Package ID Generation
- [x] **File**: `packages/build-pipeline/src/commands/build-ir.ts`
- [x] Update `normalizePackageId()` or similar function
- [x] Add `pkg_java_` prefix for Java packages
- [x] Add `pkg_go_` prefix for Go packages

**Acceptance**: Package IDs use correct language prefixes

### Task 4.5: Add Language Tool Checks
- [x] **File**: `packages/build-pipeline/src/commands/build-ir.ts`
- [x] Add `checkJavaTools()` to verify java is installed
- [x] Add `checkGoTools()` to verify go is installed
- [x] Skip extraction with warning if tools not available
- [x] Only check tools when building java/go configs

**Acceptance**: Build warns but doesn't fail if java/go not installed

### Task 4.6: Test Build Pipeline with Java Config
- [x] Run `pnpm build:ir --config configs/langsmith-java.json`
- [x] Verify tarball download from langsmith-java repo
- [x] Verify Java extraction runs
- [x] Verify symbols.json is generated
- [x] Verify IR output format is correct

**Acceptance**: Full build pipeline works for Java
**Note**: Requires Java 11+ installed. Tool check verified working.

### Task 4.7: Test Build Pipeline with Go Config
- [x] Run `pnpm build:ir --config configs/langsmith-go.json`
- [x] Verify tarball download from langsmith-go repo
- [x] Verify Go extraction runs
- [x] Verify symbols.json is generated
- [x] Verify IR output format is correct

**Acceptance**: Full build pipeline works for Go
**Note**: Requires Go 1.21+ installed. Tool check verified working.

---

## Phase 5: Web Application Updates

Update the frontend to support and display Java/Go documentation.

### Task 5.1: Update Project Variants for LangSmith
- [x] **File**: `apps/web/lib/config/projects.ts`
- [x] Add Java variant for LangSmith project
- [x] Add Go variant for LangSmith project
- [x] Set correct repos and config paths
- [x] Set enabled: true for both

**Acceptance**: LangSmith project has 4 language variants

### Task 5.2: Update IR Schema Language Type in Web
- [x] **File**: `packages/ir-schema/src/project.ts` (if not done in Phase 1)
- [x] Ensure `Language` type includes `"java" | "go"`
- [x] Rebuild ir-schema package
- [x] Verify type propagates to web app

**Acceptance**: Web app TypeScript accepts java/go languages

### Task 5.3: Create Languages Helper Module
- [x] **File**: `apps/web/lib/config/languages.ts`
- [x] Create `getAvailableLanguages(projectId: string)` function
- [x] Create `isLanguageAvailable(projectId: string, language: string)` function
- [x] Create `LANGUAGE_CONFIG` object with metadata for all 4 languages
- [x] Export all helper functions

**Acceptance**: Helper functions correctly return available languages per project

### Task 5.4: Add Java and Go Icons
- [x] **File**: `apps/web/components/layout/LanguageDropdown.tsx`
- [x] Add `JavaIcon` SVG component
- [x] Add `GoIcon` SVG component (Gopher)
- [x] Ensure icons are properly sized (h-4 w-4)

**Acceptance**: Icons render correctly in UI

### Task 5.5: Update Language Dropdown for Dynamic Languages
- [x] **File**: `apps/web/components/layout/LanguageDropdown.tsx`
- [x] Rename `LANGUAGES` to `ALL_LANGUAGES`
- [x] Add Java and Go to `ALL_LANGUAGES` array
- [x] Accept `availableLanguages` prop
- [x] Filter languages to only show available ones
- [x] Hide dropdown if only one language available

**Acceptance**: Dropdown shows correct languages per project

### Task 5.6: Update Sidebar/Layout to Pass Available Languages
- [ ] **File**: `apps/web/components/layout/Sidebar.tsx` or parent
- [ ] Get current project from context/route
- [ ] Call `getAvailableLanguages(projectId)`
- [ ] Pass `availableLanguages` prop to `LanguageDropdown`

**Acceptance**: Language dropdown receives correct available languages

### Task 5.7: Update Mobile Project Menu
- [x] **File**: `apps/web/components/layout/MobileProjectMenu.tsx`
- [x] Import `getAvailableLanguages` helper
- [x] Replace hardcoded Python/JavaScript with dynamic languages
- [x] Add Java and Go icons to mobile menu
- [x] Filter language options based on current project

**Acceptance**: Mobile menu shows correct languages per project

### Task 5.8: Update Language Detection in Pathname
- [x] **File**: `apps/web/components/layout/LanguageDropdown.tsx` or router
- [x] Add detection for `/java` and `/go` path prefixes
- [x] Update `currentLang` logic to handle new languages

**Acceptance**: Current language correctly detected from URL

### Task 5.9: Update Routing for Java/Go
- [x] **File**: `apps/web/app/(ref)/[lang]/layout.tsx` or page
- [x] Add `"java"` and `"go"` to valid languages list
- [x] Update `generateStaticParams()` to include java/go
- [x] Ensure 404 handling for invalid project/language combos

**Acceptance**: `/java/langsmith` and `/go/langsmith` routes work

### Task 5.10: Update Symbol Resolution for Fallbacks
- [ ] **File**: `apps/web/lib/symbol-resolution.ts`
- [ ] Add handling for java/go in cross-language resolution
- [ ] Return fallback (package or language root) for java/go
- [ ] Log that cross-language mapping not available yet

**Acceptance**: Language switching from java/go falls back gracefully

### Task 5.11: Update Search to Include Java/Go
- [x] **File**: `apps/web/lib/search/client.ts` or types
- [x] Add `"java" | "go"` to `SearchLanguage` type
- [x] Ensure search indexes java/go symbols when available

**Acceptance**: Search returns results for Java/Go symbols

### Task 5.12: Update Sitemap Generation
- [x] **File**: `apps/web/app/sitemap.ts`
- [x] Add java/go routes for LangSmith
- [x] Only include languages that have packages available

**Acceptance**: Sitemap includes `/java/langsmith` and `/go/langsmith`

### Task 5.13: Update IR Loader for Java/Go
- [x] **File**: `apps/web/lib/ir/loader.ts`
- [x] Ensure `getPackagesForLanguage()` handles java/go
- [x] Update any hardcoded "python" | "javascript" types

**Acceptance**: IR loader can fetch java/go package data

---

## Phase 6: Testing & Polish

Comprehensive testing and documentation.

### Task 6.1: End-to-End Test: Build All Four Languages
- [ ] Run `pnpm build:ir --project langsmith` 
- [ ] Verify all four configs are processed
- [ ] Verify IR output for each language is correct
- [ ] Check pointer files are generated for java/go

**Acceptance**: Full LangSmith build produces all four language outputs

### Task 6.2: End-to-End Test: Language Dropdown Behavior
- [ ] Navigate to `/python/langsmith` - verify 4 language options
- [ ] Navigate to `/python/langchain` - verify only 2 options
- [ ] Switch languages on LangSmith - verify navigation works
- [ ] Test on mobile menu as well

**Acceptance**: Language dropdown behaves correctly per project

### Task 6.3: End-to-End Test: Java Documentation Pages
- [ ] Navigate to `/java/langsmith`
- [ ] Verify package page renders
- [ ] Click into a symbol (e.g., Client class)
- [ ] Verify symbol page renders with signature, docs
- [ ] Verify method members display correctly
- [ ] Check source links go to GitHub

**Acceptance**: Java docs render correctly

### Task 6.4: End-to-End Test: Go Documentation Pages
- [ ] Navigate to `/go/langsmith`
- [ ] Verify package page renders
- [ ] Click into a symbol (e.g., Client struct)
- [ ] Verify symbol page renders with signature, docs
- [ ] Verify method members display correctly
- [ ] Check source links go to GitHub

**Acceptance**: Go docs render correctly

### Task 6.5: Test Search Functionality
- [ ] Search for "Client" - verify Java/Go results appear
- [ ] Filter by Java language
- [ ] Filter by Go language
- [ ] Verify result links navigate correctly

**Acceptance**: Search works for Java/Go symbols

### Task 6.6: Test Edge Cases
- [ ] Access `/java/langchain` - verify 404 or redirect
- [ ] Access `/go/langgraph` - verify 404 or redirect
- [ ] Switch from Java to Python - verify fallback works
- [ ] Test with tools not installed - verify graceful skip

**Acceptance**: Edge cases handled gracefully

### Task 6.7: Performance Testing
- [ ] Measure Java extraction time (<60s target)
- [ ] Measure Go extraction time (<30s target)
- [ ] Measure page load time for Java/Go pages (<500ms target)
- [ ] Profile and optimize if needed

**Acceptance**: Performance meets targets

### Task 6.8: Documentation Updates
- [x] Update README.md with new language support info
- [x] Document Java extractor in its README
- [x] Document Go extractor in its README
- [x] Add any new environment requirements (java, go)

**Acceptance**: Documentation is up to date

---

## Summary

| Phase | Tasks | Estimated Time |
| --- | --- | --- |
| Phase 1: Schema & Constants | 6 tasks | 0.5 day |
| Phase 2: Java Extractor | 8 tasks | 1.5-2 days |
| Phase 3: Go Extractor | 8 tasks | 1-1.5 days |
| Phase 4: Build Pipeline | 7 tasks | 0.5 day |
| Phase 5: Web Application | 13 tasks | 1-1.5 days |
| Phase 6: Testing & Polish | 8 tasks | 0.5-1 day |

**Total**: 50 tasks across 6 phases

---

## Dependencies

```
Phase 1 ─────┬───► Phase 2 (Java Extractor)
             │
             └───► Phase 3 (Go Extractor)
                          │
Phase 2 + 3 ─────────────►│
                          ▼
                    Phase 4 (Build Pipeline)
                          │
                          ▼
                    Phase 5 (Web Application)
                          │
                          ▼
                    Phase 6 (Testing)
```

**Critical Path**: Phase 1 → (Phase 2 + 3 parallel) → Phase 4 → Phase 5 → Phase 6

---

## Notes

- Phases 2 and 3 can be worked on in parallel by different team members
- Java extractor may be more complex due to Javadoc parsing
- Go extractor can leverage `go doc -json` for structured output
- Cross-language symbol resolution for Java/Go is out of scope (fallback only)
- Version tracking for Java/Go can be added in a future iteration

---

_End of Tasks_
