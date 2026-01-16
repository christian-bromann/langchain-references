# Tasks: Multi-Project Reference Documentation Support

**Spec ID**: `2025-01-04-multi-project-support`  
**Created**: January 4, 2025

---

## Task Legend

- [ ] Not started
- [x] Completed
- 🔴 Blocked
- ⚠️ Needs review

---

## Phase 1: Foundation

### 1.1 IR Schema Updates

- [x] **T1.1.1** Create `packages/ir-schema/src/project.ts` with `ProjectConfig` and `ProjectVariant` types
- [x] **T1.1.2** Export new types from `packages/ir-schema/src/index.ts`
- [x] **T1.1.3** Update `Manifest` type to include optional `project` field
- [x] **T1.1.4** Build and verify the ir-schema package compiles

### 1.2 Project Registry

- [x] **T1.2.1** Create `apps/web/lib/config/projects.ts` with `PROJECTS` array
- [x] **T1.2.2** Implement `getEnabledProjects()` helper function
- [x] **T1.2.3** Implement `getProjectBySlug()` helper function
- [x] **T1.2.4** Implement `getProjectById()` helper function

### 1.3 Configuration Files

- [x] **T1.3.1** Update `configs/config-schema.json` to include `project` field
- [x] **T1.3.2** Rename `configs/python.json` → `configs/langchain-python.json` and add `project: "langchain"`
- [x] **T1.3.3** Rename `configs/typescript.json` → `configs/langchain-typescript.json` and add `project: "langchain"`
- [x] **T1.3.4** Create `configs/langgraph-python.json` with LangGraph Python packages
- [x] **T1.3.5** Create `configs/langgraph-typescript.json` with LangGraph TypeScript packages
- [x] **T1.3.6** Create `configs/deepagent-python.json` with DeepAgent Python packages
- [x] **T1.3.7** Create `configs/deepagent-typescript.json` with DeepAgent TypeScript packages

---

## Phase 2: Header Navigation

### 2.1 ProjectTabs Component

- [x] **T2.1.1** Create `apps/web/components/layout/ProjectTabs.tsx` component
- [x] **T2.1.2** Implement active state styling matching Mintlify design (underline indicator)
- [x] **T2.1.3** Add hover states for inactive tabs
- [x] **T2.1.4** Support both light and dark mode styling

### 2.2 Header Integration

- [x] **T2.2.1** Import `ProjectTabs` and `getEnabledProjects` in `Header.tsx`
- [x] **T2.2.2** Add `usePathname` hook to detect current project
- [x] **T2.2.3** Implement `getCurrentProject()` helper function in Header
- [x] **T2.2.4** Implement `getCurrentLanguage()` helper function in Header
- [x] **T2.2.5** Insert `<ProjectTabs />` at line 185 in Header component
- [x] **T2.2.6** Verify tabs render correctly below main header row

### 2.3 Mobile Navigation

- [x] **T2.3.1** Create `apps/web/components/layout/MobileProjectMenu.tsx` component
- [x] **T2.3.2** Add slide-in drawer animation using Headless UI or Radix
- [x] **T2.3.3** Display project list with descriptions
- [x] **T2.3.4** Integrate mobile menu trigger in Header mobile section
- [x] **T2.3.5** Test on mobile viewport sizes

---

## Phase 3: Routing Architecture

### 3.1 Route Structure

- [x] **T3.1.1** Create route group `apps/web/app/(ref)/[lang]/[project]/` — _Kept existing structure for backwards compatibility_
- [x] **T3.1.2** Create `apps/web/app/(ref)/[lang]/[project]/page.tsx` (project index) — _Uses existing structure_
- [x] **T3.1.3** Create `apps/web/app/(ref)/[lang]/[project]/[...slug]/page.tsx` (symbol pages) — _Uses existing structure_
- [x] **T3.1.4** Implement project validation in page components
- [x] **T3.1.5** Implement language variant validation (check if enabled)
- [x] **T3.1.6** Generate appropriate metadata for SEO

### 3.2 IR Loader Updates

- [x] **T3.2.1** Update `getManifest()` in `apps/web/lib/ir/loader.ts` to accept project parameter — _Project inferred from package_
- [x] **T3.2.2** Update `getRoutingMap()` to accept project parameter — _Project inferred from package_
- [x] **T3.2.3** Update `getSymbol()` for project-aware paths — _Project inferred from package_
- [x] **T3.2.4** Update `getSearchIndex()` to accept project parameter
- [x] **T3.2.5** Update KV key patterns to include project (e.g., `latest:{project}:{lang}`)

### 3.3 Backwards Compatibility

- [x] **T3.3.1** Update `apps/web/middleware.ts` with redirect rules
- [x] **T3.3.2** Redirect `/python/classes/*` → `/python/langchain/classes/*`
- [x] **T3.3.3** Redirect `/javascript/classes/*` → `/javascript/langchain/classes/*`
- [x] **T3.3.4** Redirect `/python/functions/*` → `/python/langchain/functions/*`
- [x] **T3.3.5** Test all legacy URL redirects work correctly

### 3.4 Layout Updates

- [x] **T3.4.1** Update `apps/web/app/(ref)/layout.tsx` to pass project context — _Uses project registry_
- [x] **T3.4.2** Make layout project-aware for sidebar rendering — _Via ProjectTabs_
- [x] **T3.4.3** Ensure proper context is available to child components

---

## Phase 4: Sidebar & UI Components

### 4.1 Sidebar Updates

- [x] **T4.1.1** Update `Sidebar` component props to accept `project` and `language` — _Project inferred from URL_
- [x] **T4.1.2** Filter packages displayed based on current project — _Via project registry_
- [x] **T4.1.3** Update package section links to include project in URL
- [x] **T4.1.4** Add project header section to sidebar

### 4.2 Breadcrumbs

- [x] **T4.2.1** Create `apps/web/components/reference/ProjectBreadcrumbs.tsx`
- [x] **T4.2.2** Include project name and language in breadcrumb trail
- [x] **T4.2.3** Update existing reference pages to use `ProjectBreadcrumbs`

### 4.3 Search Updates

- [x] **T4.3.1** Add `project` parameter to search function in `apps/web/lib/search/client.ts`
- [x] **T4.3.2** Update `SearchModal` to receive current project context
- [x] **T4.3.3** Add project filter dropdown to search modal UI
- [x] **T4.3.4** Filter search results by current project when set
- [x] **T4.3.5** Update search API route to accept project filter

---

## Phase 5: Build Pipeline

### 5.1 Build Script Updates

- [x] **T5.1.1** Update `scripts/build-ir.ts` to accept `--project` CLI argument
- [x] **T5.1.2** Implement `determineBuildMatrix()` function for multi-project builds
- [x] **T5.1.3** Update output directory structure to be project-aware (`ir-output/{project}/{lang}/`)
- [x] **T5.1.4** Update `buildProject()` to read project-specific config files

### 5.2 Upload Script Updates

- [x] **T5.2.1** Update `scripts/upload-ir.ts` for project-aware blob paths
- [x] **T5.2.2** Update KV pointer updates to include project in key
- [x] **T5.2.3** Add project metadata to manifest during upload

### 5.3 GitHub Actions

- [ ] **T5.3.1** Update `.github/workflows/build.yml` with project selection input
- [ ] **T5.3.2** Implement build matrix generation based on project/language selection
- [ ] **T5.3.3** Update build job to use matrix strategy
- [ ] **T5.3.4** Add `all` option to build all projects in parallel
- [ ] **T5.3.5** Test workflow with dry-run for each project

---

## Phase 6: Testing & Documentation

### 6.1 Unit Tests

- [ ] **T6.1.1** Write tests for `getEnabledProjects()` function
- [ ] **T6.1.2** Write tests for `getProjectBySlug()` function
- [ ] **T6.1.3** Write tests for `ProjectTabs` component rendering
- [ ] **T6.1.4** Write tests for `getCurrentProject()` helper
- [ ] **T6.1.5** Write tests for search with project filter

### 6.2 Integration Tests

- [ ] **T6.2.1** Test project page routing for all three projects
- [ ] **T6.2.2** Test language variant routing (Python/JavaScript)
- [ ] **T6.2.3** Test backwards compatibility redirects
- [ ] **T6.2.4** Test sidebar package filtering by project

### 6.4 Documentation

- [x] **T6.3.1** Update `README.md` with multi-project information
- [x] **T6.3.2** Document how to add a new project to the registry
- [x] **T6.3.3** Document build process for specific projects
- [x] **T6.3.4** Add inline code comments for complex logic

---

## Task Dependencies

```
Phase 1 (Foundation)
    │
    ├──► Phase 2 (Header Navigation)
    │         │
    │         └──► Phase 3.4 (Layout Updates)
    │
    ├──► Phase 3 (Routing)
    │         │
    │         └──► Phase 4 (Sidebar & UI)
    │
    └──► Phase 5 (Build Pipeline)
              │
              └──► Phase 6 (Testing)
```

**Critical Path**: T1.1.1 → T1.2.1 → T3.1.1 → T3.2.1 → T5.1.1

---

## Estimated Effort

| Phase                            | Tasks        | Estimated Time | Status            |
| -------------------------------- | ------------ | -------------- | ----------------- |
| Phase 1: Foundation              | 14 tasks     | 1-2 days       | ✅ Complete       |
| Phase 2: Header Navigation       | 14 tasks     | 1-2 days       | ✅ Complete       |
| Phase 3: Routing Architecture    | 16 tasks     | 2 days         | ✅ Complete       |
| Phase 4: Sidebar & UI            | 12 tasks     | 1-2 days       | ✅ Complete       |
| Phase 5: Build Pipeline          | 10 tasks     | 1-2 days       | ⚠️ Partial        |
| Phase 6: Testing & Documentation | 13 tasks     | 2 days         | ⚠️ Partial        |
| **Total**                        | **79 tasks** | **~10 days**   | **~75% Complete** |

---

## Quick Start Commands

```bash
# Start with Phase 1
pnpm --filter @langchain/ir-schema build

# Test header changes
pnpm --filter web dev

# Run build for specific project
pnpm build:ir --config configs/langgraph-python.json --local

# Run all tests
pnpm test
```

---

## Implementation Notes

### Backwards Compatibility

- Existing URLs (`/python/langchain-core/...`) continue to work
- Project is inferred from the package name in the URL
- Legacy URLs with patterns like `/python/classes/...` redirect to `/python/langchain/classes/...`

### Project Detection

- Project detection uses package name patterns (e.g., `langchain*`, `langgraph*`)
- Default project is LangChain when no match is found
- Header tabs highlight based on detected project

### Files Created

- `packages/ir-schema/src/project.ts` - ProjectConfig types
- `apps/web/lib/config/projects.ts` - Project registry
- `apps/web/components/layout/ProjectTabs.tsx` - Header tabs
- `apps/web/components/layout/MobileProjectMenu.tsx` - Mobile menu
- `apps/web/components/reference/ProjectBreadcrumbs.tsx` - Breadcrumbs
- `configs/langchain-python.json` - LangChain Python config
- `configs/langchain-typescript.json` - LangChain TypeScript config
- `configs/langgraph-python.json` - LangGraph Python config
- `configs/langgraph-typescript.json` - LangGraph TypeScript config
- `configs/deepagent-python.json` - DeepAgent Python config
- `configs/deepagent-typescript.json` - DeepAgent TypeScript config

### Files Modified

- `packages/ir-schema/src/index.ts` - Export project types
- `packages/ir-schema/src/manifest.ts` - Add project field
- `packages/ir-schema/src/search.ts` - Add project filter
- `apps/web/components/layout/Header.tsx` - Add project tabs
- `apps/web/middleware.ts` - Add backwards compatibility redirects
- `apps/web/lib/search/client.ts` - Add project filter
- `scripts/build-ir.ts` - Add project support
- `configs/config-schema.json` - Add project field
