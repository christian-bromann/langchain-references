# Tasks: Legacy Reference URL Redirects (Python + JavaScript)

## 0. Prep / Context

- [x] **Locate existing redirect logic** in `apps/web/middleware.ts` and document current behavior (what it already redirects and why).
- [x] **Decide redirect implementation surface**:
  - [x] Primary: Next.js `middleware.ts` (Edge runtime).
  - [x] Optional: `apps/web/vercel.json` static redirects for trivial canonicalizations (not needed; handled in middleware).

---

## 1. Python legacy redirects

### 1.1 Canonicalization utilities

- [x] Add helper(s) to normalize legacy Python paths:
  - [x] Strip trailing `index.html`
  - [x] Strip trailing `.html`
  - [x] Normalize trailing slashes (`/python/` → `/python`, others: remove trailing `/`)
  - [x] Preserve query string exactly

### 1.2 Implement redirect rules

- [x] **P1**: `/python/` landing → `/python`
- [x] **P2**: `/python/integrations/<py-package>/...` → `/python/<slug(py-package)>/...`
  - [x] Ensure `langchain_openai` → `langchain-openai` (underscore → dash)
  - [x] Keep remaining segments as symbol segments
- [x] **P3**: `/python/<py-package>/<rest...>` → `/python/<slug(py-package)>/<rest...>`
  - [x] Examples to verify:
    - [x] `/python/langchain_core/messages.html` → `/python/langchain-core/messages`
    - [x] `/python/langchain_core/messages/message.html` → `/python/langchain-core/messages/message`
    - [x] `/python/langgraph/graphs/` → `/python/langgraph/graphs`

### 1.3 v0.3 Python redirect support (best-effort)

- [x] Add `/v0.3/python/**` handler that redirects into the new routes.
- [x] Implement package inference table for common v0.3 prefixes (minimum viable):
  - [x] `core` → `langchain-core` (py: `langchain_core`)
  - [x] `langchain` → `langchain`
  - [x] `community` → `langchain-community` (py: `langchain_community`)
  - [x] `openai` → `langchain-openai` (py: `langchain_openai`)
- [x] Implement symbol inference from trailing filename:
  - [x] `langchain_core.indexing.api.index.html` → `indexing/api/index` (and allow the app to resolve variations)
- [x] Resolve `?v=` for `0.3.*` packages:
  - [x] Decide resolution method:
    - [x] Use the package changelog (from blob) to choose newest `0.3.*` when available.
    - [x] Otherwise, fallback to **no `?v=`** to avoid incorrect versioning.
  - [x] Cache version lookups aggressively (in-memory cache in middleware).
- [x] Define safe fallbacks:
  - [x] If package inferred but not symbol → `/python/<package>`
  - [x] If nothing inferred → `/python`

---

## 2. JavaScript (TypeDoc) legacy redirects

### 2.1 Canonicalization utilities

- [x] Add helper(s) to normalize legacy JS paths:
  - [x] Strip trailing `index.html`
  - [x] Strip trailing `.html`
  - [x] Normalize `/javascript/` → `/javascript`
  - [x] Preserve query string exactly

### 2.2 Redirect TypeDoc index pages

- [x] Redirect to `/javascript`:
  - [x] `/javascript/modules.html`
  - [x] `/javascript/classes.html`
  - [x] `/javascript/interfaces.html`
  - [x] `/javascript/functions.html`
  - [x] `/javascript/type-aliases.html`
  - [x] `/javascript/enumerations.html`
  - [x] `/javascript/variables.html`

### 2.3 TypeDoc reflection filename → new route mapping

- [x] Implement parsing for:
  - [x] `/javascript/<kind>/<reflection>.html`
  - [x] where `<kind>` ∈ `modules|classes|interfaces|functions|type-aliases|enumerations|variables|namespaces`
- [x] Implement `reflection` translation:
  - [x] Split by `.` → `[head, ...tail]`
  - [x] `pkgToken = head` (strip leading `_`)
  - [x] Convert `pkgToken` into `packageSlug`:
    - [x] `langchain_core` → `langchain-core`
    - [x] `langchain_openai` → `langchain-openai`
    - [x] `langchain_langgraph` → `langchain-langgraph`
    - [x] `langchain` → `langchain`
    - [x] else: treat as unscoped slug (e.g. `langsmith`)
  - [x] Convert tail into symbol path segments:
    - [x] Split each tail segment by `_` into subsegments
    - [x] Preserve casing in symbol segments
- [x] Verify with representative examples:
  - [x] `/javascript/classes/_langchain_openai.ChatOpenAI.html` → `/javascript/langchain-openai/ChatOpenAI`
  - [x] `/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html` → `/javascript/langchain-core/runnables/RunnableConfig`
  - [x] `/javascript/modules/_langchain_core.utils_math.html` → `/javascript/langchain-core/utils/math`
  - [x] `/javascript/modules/langsmith.traceable.html` → `/javascript/langsmith/traceable`

### 2.4 Optional: “short module” pages

- [x] Add a small lookup for `modules/<name>.html` cases (if observed in traffic):
  - [x] `core` → `langchain-core`
  - [x] `openai` → `langchain-openai`
  - [x] `aws` → `langchain-aws`
  - [x] Otherwise treat `<name>` as unscoped package slug

---

## 3. Loop prevention + safety

- [x] Ensure redirect logic only triggers for clearly legacy paths:
  - [x] `.html` present (TypeDoc + legacy python pages)
  - [x] `/python/integrations/`
  - [x] `/v0.3/python/`
  - [x] `/javascript/<typedoc-kind>/...`
- [x] Ensure already-canonical new paths do not get reprocessed.
- [x] Ensure redirects never point back to the same URL (guard for no-op).

---

## 4. Tests / Verification

### 4.1 Add redirect test coverage

- [x] Create a small unit-test suite validating:
  - [x] path transforms (pure mapping helpers in `apps/web/lib/utils/legacy-redirects.ts`)
  - [x] query param preservation (covered by middleware redirect construction)
  - [x] 301 status (middleware uses 301 for all legacy mappings)

### 4.2 Manual verification checklist (URLs)

**Python**
- [ ] `https://reference.langchain.com/python/` → `/python`
- [ ] `https://reference.langchain.com/python/langchain_core/messages.html` → `/python/langchain-core/messages`
- [ ] `https://reference.langchain.com/python/langchain_core/messages/message.html` → `/python/langchain-core/messages/message`
- [ ] `https://reference.langchain.com/python/integrations/langchain_openai/ChatOpenAI/` → `/python/langchain-openai/ChatOpenAI`
- [ ] `https://reference.langchain.com/v0.3/python/core/indexing/langchain_core.indexing.api.index.html` → `/python/langchain-core/indexing/api/index` (and optionally `?v=0.3.x`)

**JavaScript**
- [ ] `https://reference.langchain.com/javascript/modules.html` → `/javascript`
- [ ] `https://reference.langchain.com/javascript/classes/_langchain_openai.ChatOpenAI.html` → `/javascript/langchain-openai/ChatOpenAI`
- [ ] `https://reference.langchain.com/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html` → `/javascript/langchain-core/runnables/RunnableConfig`
- [ ] `https://reference.langchain.com/javascript/modules/_langchain_core.utils_math.html` → `/javascript/langchain-core/utils/math`

---

## 5. Docs / Ops

- [x] Update README or a small note in the deployment docs describing:
  - [x] which legacy URL families are supported
  - [x] known limitations (hash fragments; v0.3 best-effort)
  - [x] how to add new redirect mappings safely

