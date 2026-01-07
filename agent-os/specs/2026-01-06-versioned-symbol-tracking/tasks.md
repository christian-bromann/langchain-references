# Tasks: Versioned Symbol Tracking System

**Spec**: `2026-01-06-versioned-symbol-tracking`  
**Created**: January 6, 2026  
**Estimated Duration**: 17 days

---

## Task Overview

| Phase | Description | Tasks | Priority |
|-------|-------------|-------|----------|
| 1 | Schema & Types | 1.1 - 1.4 | P0 |
| 2 | Version Discovery | 2.1 - 2.4 | P0 |
| 3 | Diff Computation | 3.1 - 3.5 | P0 |
| 4 | Build Pipeline & Workflows | 4.1 - 4.10 | P0/P1/P2 |
| 5 | UI Components | 5.1 - 5.6 | P0 |
| 6 | Integration & Polish | 6.1 - 6.7 | P0/P1 |

**Total**: 36 tasks across 6 phases

---

### Key Performance Optimizations

#### 1. Incremental Builds (Build Time)
When a new release is made, the build pipeline:
1. Downloads existing `changelog.json` from deployed storage
2. Compares discovered versions against existing history
3. **Only extracts and diffs new versions** (not all historical versions)
4. Merges new deltas into existing changelog

**Impact**: ~90% faster for typical new releases

#### 2. Parallel Version Extraction (Build Time)
When extracting multiple historical versions:
1. Extract up to 4 versions in parallel (configurable)
2. Process in batches to manage memory/API limits

**Impact**: ~4x faster for full builds

#### 3. Lazy Changelog Loading (UI Performance)
When viewing a symbol page:
1. Version badge ("Since v0.2.0") loads immediately from `versionInfo`
2. **Changelog is NOT fetched on page load**
3. Changelog only fetched when user expands "Version History" panel

**Impact**: Faster initial page load (skip ~500KB fetch until needed)

---

## Phase 1: Schema & Types

### Task 1.1: Create Versioning Types Module
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `packages/ir-schema/src/versioning.ts`

Create the core versioning type definitions:

- [x] Create `packages/ir-schema/src/versioning.ts`
- [x] Define `PackageVersionIndex` interface
- [x] Define `VersionInfo` interface
- [x] Define `VersionStats` interface
- [x] Define `ReleaseReference` interface
- [x] Define `PackageChangelog` interface
- [x] Define `VersionDelta` interface
- [x] Define `AddedSymbol`, `RemovedSymbol`, `ModifiedSymbol`, `DeprecatedSymbol` interfaces
- [x] Define `ReplacementInfo` interface

**Acceptance**: Types compile without errors and are well-documented with JSDoc.

---

### Task 1.2: Create Snapshot Types
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `packages/ir-schema/src/versioning.ts`

Define compact snapshot types for historical symbol views:

- [x] Define `SymbolSnapshot` interface (qualifiedName, kind, signature, members, params, etc.)
- [x] Define `MemberSnapshot` interface (name, kind, signature, optional, readonly, static, visibility)
- [x] Define `ParamSnapshot` interface (name, type, required, default)
- [x] Define `TypeParamSnapshot` interface (name, constraint, default)

**Acceptance**: Snapshot types contain only essential display data, not full documentation.

---

### Task 1.3: Create Change Record Types
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `packages/ir-schema/src/versioning.ts`

Define granular change tracking types:

- [x] Define `SymbolChangeType` union type (signature-changed, extends-changed, etc.)
- [x] Define `MemberChangeType` union type (member-added, member-type-changed, etc.)
- [x] Define `ParamChangeType` union type (param-added, param-type-changed, etc.)
- [x] Define combined `ChangeType` union
- [x] Define `ChangeRecord` interface with `type`, `description`, `breaking`, `memberName`
- [x] Define `ChangeValue` interface with typed before/after fields

**Acceptance**: All change types from spec are represented.

---

### Task 1.4: Extend SymbolRecord and Export Types
**Priority**: P0  
**Estimated**: 1 hour  
**Files**: `packages/ir-schema/src/symbol.ts`, `packages/ir-schema/src/index.ts`

- [x] Add `SymbolVersionInfo` interface to `symbol.ts` (since, deprecation, modifiedIn)
- [x] Add optional `versionInfo?: SymbolVersionInfo` field to `SymbolRecord`
- [x] Export all versioning types from `packages/ir-schema/src/index.ts`
- [x] Build package to verify compilation

**Acceptance**: `@langchain/ir-schema` exports all new versioning types.

---

## Phase 2: Version Discovery

### Task 2.1: Create Version Discovery Module
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `scripts/lib/version-discovery.ts`

Implement version discovery utilities:

- [x] Create `scripts/lib/version-discovery.ts`
- [x] Implement `parseVersionFromTag(tagName, pattern)` function
- [x] Implement `filterToMinorVersions(versions)` function
- [x] Implement `discoverVersions(repo, tagPattern, options)` main function
- [x] Add support for tag patterns: `@scope/pkg@*`, `pkg-v*`, `v*`
- [x] Implement `maxVersions` limit
- [x] Implement `alwaysInclude` version pinning
- [x] Implement `minVersion` filtering

**Acceptance**: Can discover versions from `@langchain/core@*` tag pattern.

---

### Task 2.2: Implement Git Tag Fetching
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `scripts/lib/version-discovery.ts`

Add GitHub API integration for tag fetching:

- [x] Implement `fetchGitTags(repo, pattern)` function
- [x] Use GitHub REST API `/repos/{owner}/{repo}/git/refs/tags`
- [x] Handle pagination for repos with many tags
- [x] Parse tag SHA and date from API response
- [x] Add rate limit handling
- [x] Add error handling for missing repos/tags

**Acceptance**: Can fetch all tags for `langchain-ai/langchainjs`.

---

### Task 2.3: Add Semver Utilities
**Priority**: P0  
**Estimated**: 1 hour  
**File**: `scripts/lib/version-discovery.ts`

- [x] Add `semver` package dependency
- [x] Implement version sorting (newest first)
- [x] Implement version comparison for filtering
- [x] Add validation for parsed version strings

**Acceptance**: Versions sort correctly: `0.3.0 > 0.2.15 > 0.2.1 > 0.1.0`.

---

### Task 2.4: Update Configuration Schema
**Priority**: P0  
**Estimated**: 1 hour  
**Files**: `configs/config-schema.json`, `configs/langchain-typescript.json`

Add versioning configuration block:

- [x] Add `versioning` object definition to JSON schema
- [x] Add `tagPattern` (required string)
- [x] Add `maxVersions` (optional integer, default 10)
- [x] Add `alwaysInclude` (optional string array)
- [x] Add `minVersion` (optional string)
- [x] Add `enabled` (optional boolean, default true)
- [x] Update one config file as example (`langchain-typescript.json`)

**Acceptance**: Schema validates versioning config; example config passes validation.

---

## Phase 3: Diff Computation

### Task 3.1: Create Minimal IR Extraction Mode
**Priority**: P0  
**Estimated**: 4 hours  
**Files**: `packages/extractor-typescript/src/extractor.ts`

Add lightweight extraction for historical versions:

- [x] Add `MinimalExtractionOptions` interface (skipDocs, skipExamples, publicOnly)
- [x] Modify extractor to support minimal mode
- [x] Skip JSDoc/description parsing in minimal mode
- [x] Skip example collection in minimal mode
- [x] Output only signatures and structure
- [x] Verify output is significantly smaller than full IR

**Acceptance**: Minimal extraction produces <20% of full IR size.

---

### Task 3.2: Implement Snapshot Generation
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `scripts/lib/snapshot.ts`

Create snapshot generation utilities:

- [x] Create `scripts/lib/snapshot.ts`
- [x] Implement `createSnapshot(symbol): SymbolSnapshot`
- [x] Handle class/interface members → `MemberSnapshot[]`
- [x] Handle function parameters → `ParamSnapshot[]`
- [x] Handle type parameters → `TypeParamSnapshot[]`
- [x] Include source path and line for GitHub links

**Acceptance**: Can create compact snapshot from any symbol type.

---

### Task 3.3: Implement Change Detection
**Priority**: P0  
**Estimated**: 4 hours  
**File**: `scripts/lib/diff-engine.ts`

Create the core diff computation engine:

- [x] Create `scripts/lib/diff-engine.ts`
- [x] Implement `detectChanges(olderSymbol, newerSymbol): ChangeRecord[]`
- [x] Detect signature changes
- [x] Detect extends/implements changes
- [x] Detect return type changes
- [x] Detect type parameter changes

**Acceptance**: Detects all symbol-level change types.

---

### Task 3.4: Implement Member Change Detection
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `scripts/lib/diff-engine.ts`

Add member-level change detection for classes/interfaces:

- [x] Implement `detectMemberChanges(olderMembers, newerMembers): ChangeRecord[]`
- [x] Detect member-added
- [x] Detect member-removed
- [x] Detect member-type-changed
- [x] Detect member-optionality-changed
- [x] Detect member-visibility-changed
- [x] Detect member-readonly-changed
- [x] Detect member-static-changed
- [x] Mark breaking changes appropriately

**Acceptance**: Detects `temperature?: number` optionality change correctly.

---

### Task 3.5: Implement Parameter Change Detection
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `scripts/lib/diff-engine.ts`

Add parameter-level change detection for functions:

- [x] Implement `detectParamChanges(olderParams, newerParams): ChangeRecord[]`
- [x] Detect param-added
- [x] Detect param-removed
- [x] Detect param-type-changed
- [x] Detect param-optionality-changed
- [x] Detect param-default-changed
- [x] Mark breaking changes (removing required params, etc.)

**Acceptance**: Detects function signature changes correctly.

---

## Phase 4: Build Pipeline

### Task 4.1: Implement Deployed Changelog Fetching
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `scripts/lib/changelog-fetcher.ts`

Fetch existing changelogs from deployed storage for incremental builds:

- [x] Create `scripts/lib/changelog-fetcher.ts`
- [x] Implement `fetchDeployedChangelog(project, language, packageId)`
- [x] Fetch `changelog.json` from blob storage URL
- [x] Fetch `versions.json` from blob storage URL
- [x] Return null gracefully if not found (first build)
- [x] Handle network errors with retry logic
- [x] Log fetch status for debugging

**Acceptance**: Can download existing changelog from production blob storage.

---

### Task 4.2: Implement Version Delta Computation
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `scripts/lib/changelog-generator.ts`

Create changelog generation logic:

- [x] Create `scripts/lib/changelog-generator.ts`
- [x] Implement `computeVersionDelta(olderIR, newerIR, versions): VersionDelta`
- [x] Find added symbols (in newer, not in older)
- [x] Find removed symbols (in older, not in newer)
- [x] Find modified symbols (in both, with changes)
- [x] Find deprecated symbols (newly deprecated)
- [x] Create before/after snapshots for modified symbols

**Acceptance**: Produces valid `VersionDelta` matching spec schema.

---

### Task 4.3: Implement Parallel Version Extraction
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `scripts/lib/changelog-generator.ts`

Extract multiple historical versions in parallel for faster builds:

- [x] Implement `extractVersionsParallel(repo, versions, options)`
- [x] Add configurable concurrency limit (default: 4)
- [x] Process versions in batches to limit memory/API pressure
- [x] Return `Map<version, MinimalIR>` for all versions
- [x] Add progress logging for each extraction
- [x] Handle partial failures gracefully

**Acceptance**: Full build of 10 versions completes ~4x faster than sequential.

---

### Task 4.4: Implement Incremental Build Logic
**Priority**: P0  
**Estimated**: 4 hours  
**File**: `scripts/lib/changelog-generator.ts`

Implement efficient incremental changelog updates:

- [x] Implement `incrementalBuild(project, language, packageId, config)`
- [x] Call `fetchDeployedChangelog()` to get existing data
- [x] Compare discovered versions vs existing changelog
- [x] If no new versions → return existing (skip extraction)
- [x] If new versions found → extract only those versions (using parallel extraction)
- [x] Use most recent existing version as diff base
- [x] Merge new deltas into existing changelog history
- [x] Update versions.json with new entries
- [x] Implement `fullChangelogBuild()` for first-time builds (using parallel extraction)

**Acceptance**: Incremental build only extracts/diffs new versions.

---

### Task 4.5: Update Build Script with Versioning Flags
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `scripts/build-ir.ts`

Integrate versioned extraction into build pipeline:

- [x] Add `--with-versions` flag (default incremental mode)
- [x] Add `--full` flag to force full rebuild
- [x] Call version discovery for packages with versioning config
- [x] Call `incrementalBuild()` by default
- [x] Call `fullChangelogBuild()` when `--full` is passed
- [x] Use parallel extraction for both modes
- [x] Output changelog.json and versions.json to correct paths
- [x] Log efficiency stats (versions skipped, time saved, parallel speedup)

**Acceptance**: 
- `pnpm build:ir --with-versions` does incremental build
- `pnpm build:ir --with-versions --full` does full rebuild with parallel extraction

---

### Task 4.6: Implement Latest IR Annotation
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `scripts/lib/changelog-generator.ts`

Add version info to latest symbols:

- [x] Implement `annotateLatestIR(symbols, changelog): void`
- [x] Compute `since` version for each symbol from changelog
- [x] Add `deprecation` info (since, message, replacement)
- [x] Add `modifiedIn` version list
- [x] Apply annotations to latest IR before output

**Acceptance**: Latest symbols include accurate `versionInfo`.

---

### Task 4.7: Update Upload Scripts
**Priority**: P0  
**Estimated**: 2 hours  
**Files**: `scripts/upload-ir.ts`, `scripts/update-kv.ts`

Handle versioned file uploads:

- [ ] Add versioned file paths (`changelog.json`, `versions.json`)
- [ ] Upload changelogs to blob storage
- [ ] Update KV with changelog URLs
- [ ] Ensure uploaded changelogs are fetchable for next incremental build

**Acceptance**: Changelogs accessible via production URLs and fetchable by build script.

---

### Task 4.8: Update GitHub Workflow for Versioning
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `.github/workflows/build-ir.yml`

Add versioning support to the build workflow:

- [x] Add `with_versions` boolean input (default: true)
- [x] Add `full_rebuild` boolean input (default: false)
- [x] Pass `--with-versions` flag to build script when enabled
- [x] Pass `--full` flag when full_rebuild is true
- [x] Add `BLOB_BASE_URL` to environment for changelog fetching
- [x] Update build step to use new flags
- [x] Update artifact upload to include `changelog.json` and `versions.json`

**Acceptance**: 
- Manual dispatch shows versioning options
- Incremental build is default behavior
- Full rebuild option available for recovery scenarios

---

### Task 4.9: Add Workflow Triggers for Extractor Changes
**Priority**: P1  
**Estimated**: 1 hour  
**File**: `.github/workflows/build-ir.yml`

Ensure IR is rebuilt when extraction logic changes:

- [x] Add `packages/extractor-*/**` to push paths trigger
- [x] Add `packages/ir-schema/**` to push paths trigger
- [x] Verify workflow runs on relevant code changes

**Acceptance**: Pushing changes to extractor or schema triggers IR rebuild.

---

### Task 4.10: Add Upstream Release Trigger (Optional)
**Priority**: P2  
**Estimated**: 2 hours  
**Files**: `.github/workflows/build-ir.yml`, `.github/workflows/watch-releases.yml` (new)

Support triggering builds when upstream repos release:

- [x] Add `repository_dispatch` trigger with `upstream-release` event type
- [x] Document how to trigger via API/webhook
- [ ] (Optional) Create watch-releases workflow to poll for new releases
- [ ] (Optional) Send Slack/email notification on new releases

**Acceptance**: Can trigger build via `repository_dispatch` API call.

---

## Phase 5: UI Components

### Task 5.1: Create Version Badge Component
**Priority**: P0  
**Estimated**: 1 hour  
**File**: `apps/web/components/reference/VersionBadge.tsx`

- [x] Create `VersionBadge.tsx` component
- [x] Accept `since` prop (version string)
- [x] Style with emerald colors for light/dark modes
- [x] Display "Since v{version}" text

**Acceptance**: Badge renders correctly in both themes.

---

### Task 5.2: Create Deprecation Banner Component
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `apps/web/components/reference/DeprecationBanner.tsx`

- [x] Create `DeprecationBanner.tsx` component
- [x] Accept `since`, `message`, `replacement`, `replacementHref` props
- [x] Style with amber warning colors
- [x] Show deprecation message
- [x] Link to replacement symbol if provided

**Acceptance**: Banner renders with replacement link.

---

### Task 5.3: Create Signature Diff Component
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `apps/web/components/reference/SignatureDiff.tsx`

- [ ] Create `SignatureDiff.tsx` component
- [ ] Accept `before` and `after` signature strings
- [ ] Compute line-by-line diff
- [ ] Style removed lines (red)
- [ ] Style added lines (green)
- [ ] Add syntax highlighting

**Acceptance**: Diff shows `- maxTokens: number` / `+ maxTokens: number | "auto"`.

---

### Task 5.4: Create Snapshot Viewer Component
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `apps/web/components/reference/SnapshotViewer.tsx`

- [ ] Create `SnapshotViewer.tsx` component
- [ ] Accept `snapshot`, `repoUrl`, `sha` props
- [ ] Render interface from snapshot members
- [ ] Generate GitHub source link at specific SHA
- [ ] No additional fetch required (client-side only)

**Acceptance**: Shows full interface from stored snapshot data.

---

### Task 5.5: Create Version History Panel with Lazy Loading
**Priority**: P0  
**Estimated**: 5 hours  
**Files**: `apps/web/components/reference/VersionHistory.tsx`, `apps/web/components/reference/VersionHistoryEntry.tsx`

Implement version history panel with **dynamic/lazy changelog loading**:

- [x] Create `VersionHistory.tsx` component
- [x] Accept `qualifiedName`, `packageId`, `project`, `language`, `versionInfo` props
- [x] **Lazy load**: Only fetch changelog when panel is expanded (not on page load)
- [x] Use `useEffect` to trigger fetch on expand
- [x] Show loading spinner while fetching
- [x] Handle fetch errors gracefully
- [x] Filter changelog to relevant entries for this symbol (once loaded)
- [x] Make panel expandable/collapsible
- [x] Show change count indicator from `versionInfo.modifiedIn` (no fetch needed)
- [x] Create `VersionHistoryEntry.tsx` for individual entries
- [x] Show version badge and date
- [x] Show change descriptions with `memberName` highlighted
- [x] Include inline signature diff
- [x] Add expandable snapshot viewer
- [x] Show "Introduced" badge for first version

**Acceptance**: 
- Panel does NOT fetch changelog on initial page load
- Changelog is fetched only when user expands the panel
- Loading state shown during fetch
- Panel matches ASCII mockup from spec

---

### Task 5.6: Create Change Description Component
**Priority**: P0  
**Estimated**: 1 hour  
**File**: `apps/web/components/reference/ChangeDescription.tsx`

- [ ] Create `ChangeDescription.tsx` component
- [ ] Highlight `memberName` in primary color
- [ ] Show change description text
- [ ] Show "Breaking" badge for breaking changes

**Acceptance**: Renders `maxTokens  Type changed from 'number' to 'number | "auto"'`.

---

## Phase 6: Integration & Polish

### Task 6.1: Create Changelog API Endpoint
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `apps/web/app/api/changelog/[project]/[language]/[packageId]/route.ts`

Create API endpoint for lazy-loaded changelog fetching:

- [x] Create API route at `/api/changelog/[project]/[language]/[packageId]`
- [x] Fetch changelog from blob storage
- [x] Add cache headers for browser/CDN caching
- [x] Return 404 if changelog doesn't exist
- [x] Handle errors gracefully

**Acceptance**: `GET /api/changelog/langchain/javascript/pkg_js_langchain_core` returns changelog JSON.

---

### Task 6.2: Update IR Loader for Changelogs
**Priority**: P0  
**Estimated**: 2 hours  
**File**: `apps/web/lib/ir/loader.ts`

- [ ] Add `getChangelog(project, language, packageId): Promise<PackageChangelog | null>`
- [ ] Add `getVersionIndex(project, language, packageId): Promise<PackageVersionIndex | null>`
- [ ] Used by API endpoint (server-side)
- [ ] Handle missing changelog gracefully (older packages)

**Acceptance**: Changelog loads successfully for versioned packages.

---

### Task 6.3: Update Symbol Page
**Priority**: P0  
**Estimated**: 3 hours  
**File**: `apps/web/components/reference/SymbolPage.tsx`

Integrate version UI elements:

- [ ] Add `VersionBadge` next to symbol name (if `versionInfo.since` exists)
- [ ] Add `DeprecationBanner` below header (if `versionInfo.deprecation` exists)
- [ ] Add `VersionHistory` panel at bottom of page (lazy loading, no changelog prop)
- [ ] Pass `packageId`, `project`, `language` to VersionHistory for lazy fetch
- [ ] **Do NOT load changelog on server** - let client fetch on demand

**Acceptance**: Symbol page shows version badge, deprecation banner, and lazy-loaded history panel.

---

### Task 6.4: Verify Light/Dark Mode Styling
**Priority**: P1  
**Estimated**: 2 hours  
**Files**: All new components

- [ ] Test VersionBadge in light mode
- [ ] Test VersionBadge in dark mode
- [ ] Test DeprecationBanner in both modes
- [ ] Test SignatureDiff in both modes
- [ ] Test VersionHistory in both modes
- [ ] Verify color contrast meets accessibility standards

**Acceptance**: All components look good in both themes.

---

### Task 6.5: Performance Testing
**Priority**: P1  
**Estimated**: 2 hours

- [ ] Test parallel extraction speedup (target: 4x faster)
- [ ] Test changelog API response time (<500ms)
- [ ] Test diff computation time (<10 seconds per version pair)
- [ ] Test version history panel render time (<100ms after load)
- [ ] Verify changelog file sizes (<500 KB per package)
- [ ] Verify initial page load does NOT fetch changelog

**Acceptance**: All performance targets from spec are met.

---

### Task 6.6: End-to-End Testing
**Priority**: P0  
**Estimated**: 3 hours

- [ ] Build IR with versioning for `@langchain/core`
- [ ] Verify `versions.json` contains expected versions
- [ ] Verify `changelog.json` contains valid deltas
- [ ] Verify latest symbols have `versionInfo`
- [ ] Navigate to symbol page and verify badge appears
- [ ] Verify changelog is NOT fetched on page load (check network tab)
- [ ] Expand version history and verify changelog is fetched
- [ ] Verify changes display correctly after fetch
- [ ] Click "View full interface" and verify snapshot renders
- [ ] Click GitHub link and verify it goes to correct SHA

**Acceptance**: Full flow works from build to UI display with lazy loading.

---

### Task 6.7: Test Incremental Build Efficiency
**Priority**: P0  
**Estimated**: 2 hours

Test that incremental builds properly skip already-processed versions:

- [ ] Run full build for a package → upload changelog
- [ ] Run incremental build again (no new versions) → verify it skips extraction
- [ ] Simulate new version by adding to discovered versions
- [ ] Verify only the new version is extracted
- [ ] Verify new delta is prepended to existing history
- [ ] Verify existing history entries are preserved unchanged
- [ ] Time comparison: full build vs incremental (target: 90% faster)
- [ ] Time comparison: sequential vs parallel extraction (target: 4x faster)

**Acceptance**: 
- Incremental build with no new versions completes in <10 seconds
- Incremental build fetches existing changelog from deployed storage
- Only new versions trigger extraction and diffing
- Parallel extraction is 4x faster than sequential

---

## Definition of Done

- [ ] All P0 functional requirements implemented
- [ ] Schema types exported from `@langchain/ir-schema`
- [ ] Version discovery works for scoped npm tags (`@langchain/core@*`)
- [ ] Changelog generated and uploaded for at least one package
- [ ] "Since" badge displays correctly in light and dark modes
- [ ] Deprecation banner renders with replacement links
- [ ] Version history panel expands and shows changes
- [ ] Signature diffs render with syntax highlighting
- [ ] Build pipeline supports versioned extraction
- [ ] **Incremental builds** download existing changelog from blob storage
- [ ] **Incremental builds** only extract/diff new versions (not all historical)
- [ ] **Parallel extraction** extracts multiple versions concurrently (~4x speedup)
- [ ] **Lazy loading** - changelog NOT fetched on initial page load
- [ ] **Lazy loading** - changelog fetched only when user expands history panel
- [ ] Documentation updated with versioning configuration

---

## Dependencies

```
Phase 1 (Schema) ──┐
                   ├──► Phase 4 (Build Pipeline)
Phase 2 (Discovery)┘          │
         │                    ▼
         └──► Phase 3 (Diff) ─┘
                              │
Phase 5 (UI Components) ◄─────┘
         │
         ▼
Phase 6 (Integration)
```

**Critical Path**: 1 → 2 → 3 → 4 → 6 (Schema → Discovery → Diff → Build → Integration)

**Parallel Work**: Phase 5 (UI) can start after Phase 1 completes (types available for prop interfaces).

---

## Files Created/Modified Summary

### New Files (19)
```
packages/ir-schema/src/versioning.ts
scripts/lib/version-discovery.ts
scripts/lib/snapshot.ts
scripts/lib/diff-engine.ts
scripts/lib/changelog-generator.ts
scripts/lib/changelog-fetcher.ts              # Fetch deployed changelogs for incremental builds
apps/web/lib/ir/versioning.ts
apps/web/app/api/changelog/[project]/[language]/[packageId]/route.ts  # Changelog API for lazy loading
apps/web/components/reference/VersionBadge.tsx
apps/web/components/reference/DeprecationBanner.tsx
apps/web/components/reference/SignatureDiff.tsx
apps/web/components/reference/SnapshotViewer.tsx
apps/web/components/reference/VersionHistory.tsx       # With lazy loading
apps/web/components/reference/VersionHistoryEntry.tsx
apps/web/components/reference/ChangeDescription.tsx
apps/web/components/reference/MemberDiff.tsx
```

### Modified Files (10)
```
packages/ir-schema/src/symbol.ts
packages/ir-schema/src/index.ts
packages/extractor-typescript/src/extractor.ts
configs/config-schema.json
configs/langchain-typescript.json
scripts/build-ir.ts
scripts/upload-ir.ts
apps/web/lib/ir/loader.ts
apps/web/components/reference/SymbolPage.tsx
.github/workflows/build-ir.yml                # Add versioning flags & triggers
```

### New Workflow Files (Optional, P2)
```
.github/workflows/watch-releases.yml          # Monitor upstream for new releases
```

---

*End of Tasks*

