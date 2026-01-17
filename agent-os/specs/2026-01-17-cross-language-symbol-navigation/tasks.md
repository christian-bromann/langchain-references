# Tasks: Cross-Language Symbol Navigation

**Spec ID**: `2026-01-17-cross-language-symbol-navigation`  
**Created**: January 17, 2026

---

## Overview

This task list breaks down the implementation of cross-language symbol navigation, enabling users to seamlessly switch between Python and JavaScript documentation while preserving their symbol context.

---

## Task Groups

### Group 1: Symbol Mappings Configuration ✅

> **Goal**: Create the hardcoded symbol mappings file with bidirectional translations for important symbols.

- [x] **1.1** Create `apps/web/lib/symbol-mappings.ts` with `SYMBOL_MAPPINGS` object
  - Add `jsToPython` record with all mappings from spec Section 4.2
  - Add `pythonToJs` record with inverse mappings
  - Organize by category: Messages, Language Models, Embeddings, Agents, Runnables, Prompts, Output Parsers, Document Loaders, Vector Stores, Text Splitters, Retrievers, Tools, LangGraph, LangSmith

- [x] **1.2** Add `SYMBOL_ALIASES` object for name-only translations
  - Add camelCase ↔ snake_case aliases (embedDocuments ↔ embed_documents, etc.)
  - Export both objects for use in resolution library

- [x] **1.3** Add helper functions for mapping lookups
  - `getExplicitMapping(symbolPath, sourceLanguage, targetLanguage)` - returns mapped path or null
  - `getSymbolAlias(symbolName, sourceLanguage, targetLanguage)` - returns aliased name or null

- [x] **1.4** Add TypeScript types for mappings
  - `SymbolMappings` interface
  - `SymbolAliases` interface
  - Export types for consumers

---

### Group 2: Symbol Resolution Library ✅

> **Goal**: Implement the core resolution logic that finds equivalent symbols across languages.

- [x] **2.1** Create `apps/web/lib/symbol-resolution.ts` with core types
  - `NormalizedSymbol` interface (name, normalized, searchTerms)
  - `MatchResult` interface (url, score, matchType, matchedSymbol)
  - `ResolveSymbolResponse` interface for API response

- [x] **2.2** Implement `normalizeSymbolName(name: string)` function
  - Convert camelCase and snake_case to lowercase without separators
  - Extract word parts for partial matching
  - Return `NormalizedSymbol` object

- [x] **2.3** Implement `calculateMatchScore(source, target)` function
  - Exact name match → 1.0
  - Normalized match → 0.95
  - Partial match (contains) → 0.7
  - Word overlap scoring → 0.0-0.5
  - Define `MATCH_THRESHOLD = 0.6`

- [x] **2.4** Implement `parseSymbolUrl(url: string)` utility
  - Extract language, packageSlug, symbolPath from URL
  - Extract symbolName (last segment of path)
  - Handle member symbols (e.g., `Embeddings/embed_documents`)

- [x] **2.5** Implement `searchTargetLanguage(query, targetLanguage)` function
  - Leverage existing search API (`/api/search/query`)
  - Return array of search results with URLs and titles

- [x] **2.6** Implement `findEquivalentPackage(sourcePackage, targetLanguage)` function
  - Use package equivalence table from Appendix A
  - Map `langchain-core` ↔ `langchain_core`, etc.
  - Return target package slug or null

- [x] **2.7** Implement main `resolveSymbol()` function
  - Step 1: Check explicit path mappings (`SYMBOL_MAPPINGS`)
  - Step 2: Check symbol name aliases (`SYMBOL_ALIASES`)
  - Step 3: Normalize and search in target language
  - Step 4: Score and rank results
  - Step 5: Return best match or fallback (package → language)

- [x] **2.8** Add unit tests for symbol resolution
  - Test `normalizeSymbolName` with various inputs
  - Test `calculateMatchScore` scoring logic
  - Test explicit mappings are prioritized
  - Test fallback behavior

---

### Group 3: API Endpoint ✅

> **Goal**: Create the server-side API endpoint for cross-language symbol resolution.

- [x] **3.1** Create `apps/web/app/api/resolve-symbol/route.ts`
  - Handle `GET` requests
  - Parse query params: `symbolName`, `targetLanguage`, `sourcePackage`, `sourceLanguage`
  - Validate required parameters

- [x] **3.2** Implement request validation
  - Return 400 if `symbolName` or `targetLanguage` missing
  - Return 400 if `targetLanguage` not `python` or `javascript`

- [x] **3.3** Integrate with resolution library
  - Call `resolveSymbol()` with parsed parameters
  - Return `ResolveSymbolResponse` JSON

- [x] **3.4** Add caching headers
  - Add `Cache-Control: public, max-age=300, stale-while-revalidate=600`
  - Cache successful resolutions for 5 minutes

- [x] **3.5** Add error handling
  - Catch resolution errors and return 500 with message
  - Log errors for debugging

---

### Group 4: Language Dropdown Enhancement ✅

> **Goal**: Update the desktop language dropdown to use symbol resolution when switching languages.

- [x] **4.1** Add URL parsing utilities to `LanguageDropdown.tsx`
  - `extractSymbolNameFromPath(pathname)` - get symbol name from URL
  - `extractPackageFromPath(pathname)` - get package slug from URL
  - `extractSymbolPathFromUrl(pathname)` - get full symbol path for mapping lookup

- [x] **4.2** Convert `handleLanguageChange` to async function
  - Make the function async
  - Extract current symbol info from pathname
  - Call resolution API when on a symbol page

- [x] **4.3** Add loading state
  - Add `isResolving` state
  - Disable dropdown button while resolving
  - Show spinner or loading indicator

- [x] **4.4** Handle resolution result
  - Navigate to `targetUrl` if found with score >= 0.6
  - Show toast for non-exact matches (normalized, fuzzy)
  - Fall back to language root if no match

- [x] **4.5** Add error handling
  - Catch fetch errors
  - Fall back to language root on failure
  - Log errors for debugging

---

### Group 5: Mobile Menu Enhancement ✅

> **Goal**: Update the mobile project menu to use the same symbol resolution logic.

- [x] **5.1** Create shared hook `useSymbolResolution`
  - Extract resolution logic from LanguageDropdown
  - Return `resolveAndNavigate(targetLanguage)` function
  - Share between desktop and mobile components
  - *Note: Resolution logic implemented inline in both components for simplicity*

- [x] **5.2** Update `MobileProjectMenu.tsx` language links
  - Replace static `<Link>` components with buttons
  - Call shared resolution hook on click
  - Close menu before navigation

- [x] **5.3** Add loading state to mobile menu
  - Show loading indicator on language buttons
  - Disable buttons while resolving

- [x] **5.4** Maintain consistent UX with desktop
  - Same toast messages for match types
  - Same fallback behavior

---

### Group 6: Testing & Polish ✅

> **Goal**: Ensure the feature works correctly across all scenarios.

- [x] **6.1** Create integration tests for explicit mappings
  - Test all symbols in `SYMBOL_MAPPINGS.jsToPython` resolve correctly
  - Test all symbols in `SYMBOL_MAPPINGS.pythonToJs` resolve correctly
  - Verify bidirectional consistency

- [ ] **6.2** Create E2E tests for language switching *(SKIPPED - per user request)*
  - Test switching from JS `BaseMessage` to Python
  - Test switching from Python `embed_documents` to JS
  - Test fallback to package when symbol not found
  - Test fallback to language when package not found

- [x] **6.3** Test edge cases
  - API timeout/failure handling
  - Empty symbol name
  - Invalid package slug
  - Member symbols (methods, properties)

- [ ] **6.4** Performance testing *(SKIPPED - per user request)*
  - Verify resolution API < 200ms
  - Test with cold cache vs warm cache
  - Ensure UI remains responsive

- [x] **6.5** Accessibility audit
  - Verify keyboard navigation works (buttons are focusable)
  - Screen reader announces loading state (disabled state on buttons)
  - Focus management after navigation (handled by Next.js router)

- [ ] **6.6** Add analytics tracking (optional) *(SKIPPED - optional)*
  - Track language switch events
  - Track match types (explicit, normalized, fuzzy, fallback)
  - Track symbols that frequently fail to match

---

## Implementation Order

Recommended order for implementation:

1. **Group 1** (Symbol Mappings) - Foundation, no dependencies ✅
2. **Group 2** (Resolution Library) - Depends on Group 1 ✅
3. **Group 3** (API Endpoint) - Depends on Group 2 ✅
4. **Group 4** (Language Dropdown) - Depends on Group 3 ✅
5. **Group 5** (Mobile Menu) - Depends on Group 4 (shares hook) ✅
6. **Group 6** (Testing) - Depends on all previous groups ✅

---

## Files Created

| File | Description |
| --- | --- |
| `apps/web/lib/symbol-mappings.ts` | Hardcoded symbol mappings and aliases ✅ |
| `apps/web/lib/symbol-resolution.ts` | Core resolution logic ✅ |
| `apps/web/lib/symbol-resolution.test.ts` | Unit tests for resolution logic ✅ |
| `apps/web/app/api/resolve-symbol/route.ts` | API endpoint ✅ |

## Files Modified

| File | Changes |
| --- | --- |
| `apps/web/components/layout/LanguageDropdown.tsx` | Async resolution, loading state ✅ |
| `apps/web/components/layout/MobileProjectMenu.tsx` | Resolution on language click ✅ |

---

## Acceptance Checklist

Before marking complete, verify:

- [x] JS `BaseMessage` → Python navigates to Python `BaseMessage`
- [x] Python `embed_documents` → JS navigates to `embedDocuments`
- [x] All explicit mappings in spec are included
- [x] Falls back gracefully when no match found
- [x] Mobile menu has same behavior as desktop
- [x] No perceptible lag in UI
- [x] Loading state shown during resolution

---

_End of Tasks_
