# Specification: Legacy Reference URL Redirects (Python + JavaScript)

**Spec ID**: `2026-01-13-reference-docs-redirects`  
**Created**: January 13, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current (Legacy) URL Schemas](#2-current-legacy-url-schemas)
3. [Target (New) URL Schema](#3-target-new-url-schema)
4. [Redirect Strategy](#4-redirect-strategy)
5. [Redirect Rules (Python)](#5-redirect-rules-python)
6. [Redirect Rules (JavaScript / TypeDoc)](#6-redirect-rules-javascript--typedoc)
7. [Edge Cases & Safety](#7-edge-cases--safety)
8. [Implementation Plan](#8-implementation-plan)
9. [Acceptance Criteria](#9-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

When we replace the current `reference.langchain.com` reference documentation, **all existing deep links** under:

- Python: `https://reference.langchain.com/python/`
- JavaScript: `https://reference.langchain.com/javascript/`

must **301 redirect** to the equivalent pages in the new reference site, preserving user intent as accurately as possible.

### 1.2 Problem Statement

The existing reference sites use **different URL schemas**:

- Python is a docs-site style hierarchy with a mix of directory paths and `.html` pages.
- JavaScript is **TypeDoc** output with `*.html` files and TypeDoc “reflection name” encodings (e.g. `_langchain_openai.ChatOpenAI.html`).

If we simply swap the site/app without redirects, users will hit 404s from:

- search engines
- old bookmarks
- GitHub READMEs and changelogs
- third-party blog posts

### 1.3 Scope

**In scope**

- Redirect the current Python and JavaScript reference URL schemas into the new canonical routes.
- Support all LangChain ecosystem projects exposed by the legacy sites (LangChain, LangGraph, LangSmith, Deep Agents, integrations packages).
- Preserve query params; best-effort support for fragment anchors.

**Out of scope**

- Perfect, per-anchor mapping for TypeDoc fragments (hashes are not available server-side).
- Re-hosting the legacy sites “as-is” under the new domain (this spec is about redirecting into the new docs).

---

## 2. Current (Legacy) URL Schemas

This section describes the URL shapes we must support/redirect.

### 2.1 Python legacy URLs

Observed patterns:

- **Landing**:
  - `https://reference.langchain.com/python/`

- **Package roots** (often folder-like):
  - `https://reference.langchain.com/python/langchain/`
  - `https://reference.langchain.com/python/langchain_core/`
  - `https://reference.langchain.com/python/langgraph/`
  - `https://reference.langchain.com/python/langsmith/`

- **Module pages using `.html`**:
  - `https://reference.langchain.com/python/langchain_core/messages.html`
  - `https://reference.langchain.com/python/langchain_core/messages/message.html`

- **Section pages without `.html`** (often trailing `/` or not):
  - `https://reference.langchain.com/python/langgraph/graphs/`
  - `https://reference.langchain.com/python/langchain/agents`

- **Integrations namespace**:
  - `https://reference.langchain.com/python/integrations/`
  - `https://reference.langchain.com/python/integrations/langchain_openai/`
  - `https://reference.langchain.com/python/integrations/langchain_openai/ChatOpenAI/`

- **Old versions** (v0.3 Python):
  - `https://reference.langchain.com/v0.3/python/`
  - `https://reference.langchain.com/v0.3/python/core/indexing/langchain_core.indexing.api.index.html`

Source examples: see the live sites at:

- `https://reference.langchain.com/python/`
- `https://reference.langchain.com/v0.3/python/`

### 2.2 JavaScript legacy URLs (TypeDoc)

Observed patterns:

- **Landing**:
  - `https://reference.langchain.com/javascript/`

- **Index pages**:
  - `https://reference.langchain.com/javascript/modules.html`
  - `https://reference.langchain.com/javascript/classes.html`

- **Module pages (TypeDoc reflections)**:
  - `https://reference.langchain.com/javascript/modules/_langchain_openai.html`
  - `https://reference.langchain.com/javascript/modules/_langchain_core.utils_math.html`
  - `https://reference.langchain.com/javascript/modules/_langchain_langgraph.channels.html`
  - `https://reference.langchain.com/javascript/modules/langsmith.traceable.html`

- **Class pages**:
  - `https://reference.langchain.com/javascript/classes/_langchain_openai.ChatOpenAI.html`

- **Interface pages**:
  - `https://reference.langchain.com/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html`

Source examples: see the live site at `https://reference.langchain.com/javascript/`.

---

## 3. Target (New) URL Schema

The new reference UI routes are:

```
/python/<package-slug>[/<symbol-path...>]
/javascript/<package-slug>[/<symbol-path...>]
```

Where:

- `package-slug` is a normalized slug:
  - Python: `langchain_core` → `langchain-core`
  - JS: `@langchain/core` → `langchain-core`
- symbol path is represented as URL path segments; the app joins segments with dots for lookup, and supports variations (`.` ↔ `/` ↔ `_`) during symbol resolution.

---

## 4. Redirect Strategy

### 4.1 High-level approach

Implement redirects at the edge (preferred):

1. **Canonicalization**: normalize legacy URLs (strip `index.html`, remove `.html`, normalize trailing slashes).
2. **Schema translation**: map legacy Python/TypeDoc identifiers into:
   - new `package-slug`
   - new symbol path segments
3. **Fallback**:
   - If symbol-level mapping is ambiguous, redirect to the **package overview**.
   - If package cannot be inferred, redirect to the language landing page (`/python` or `/javascript`).

### 4.2 Status codes

- **301** for stable, deterministic mappings.
- **302** only if a mapping requires runtime lookup and may change (avoid if possible).

### 4.3 Query params and fragments

- **Query params**: must be preserved verbatim.
- **Fragments (`#...`)**: best-effort only (not available to edge logic). If we can infer common patterns from the URL path itself, map those into new-style anchors, otherwise drop.

---

## 5. Redirect Rules (Python)

### 5.1 Canonicalization

Normalize incoming Python legacy paths:

- Strip a trailing `index.html`
- Strip a trailing `.html`
- Remove trailing `/` (except for `/python/` itself, which may redirect to `/python`)

### 5.2 Core path mapping

#### Rule P1: `/python/` landing

```
/python[/]  ->  /python
```

#### Rule P2: `/python/integrations/...` → package-based route

Map:

```
/python/integrations/<py-package>/...  ->  /python/<slug(py-package)>/...
```

Examples:

- `/python/integrations/langchain_openai/` → `/python/langchain-openai`
- `/python/integrations/langchain_openai/ChatOpenAI/` → `/python/langchain-openai/ChatOpenAI`

Notes:

- This is best-effort; if the integration page path includes deeper module structure, we forward it as symbol path segments.

#### Rule P3: direct package/module pages

Map:

```
/python/<py-package>/<rest...>  ->  /python/<slug(py-package)>/<rest...>
```

Where `slug(py-package)` converts `_` → `-` and lowercases.

Examples:

- `/python/langchain_core/messages.html` → `/python/langchain-core/messages`
- `/python/langchain_core/messages/message.html` → `/python/langchain-core/messages/message`
- `/python/langgraph/graphs/` → `/python/langgraph/graphs`

#### Rule P4: legacy versioned path `/v0.3/python/...`

We need a best-effort mapping for the v0.3 tree:

```
/v0.3/python/<legacy-path>  ->  /python/<package>/<symbol> ?v=<resolved-0.3.x>
```

**Resolution strategy** (runtime lookup, but deterministic):

- Infer `package` from the legacy path prefix:
  - `.../core/...` → `langchain-core` (Python: `langchain_core`)
  - `.../langchain/...` → `langchain`
  - `.../community/...` → `langchain-community` (Python: `langchain_community`)
  - `.../openai/...` → `langchain-openai` (Python: `langchain_openai`)
  - etc. (maintain a lookup table for known v0.3 sections)
- Infer `symbol` by converting the final `*.html` filename into a dot-path:
  - Example: `langchain_core.indexing.api.index.html` → `indexing/api/index` → lookup variations (`indexing.api.index`, `indexing/api/index`, `indexing_api_index`)
- Resolve `v`:
  - Find the newest tracked version whose semver prefix is `0.3.*` for that package.
  - Use that exact version string for `?v=`.

If any step fails, fallback to:

```
/python/<package>    (if package inferred)
/python              (otherwise)
```

---

## 6. Redirect Rules (JavaScript / TypeDoc)

### 6.1 Canonicalization

Normalize incoming JS legacy paths:

- `/javascript/` → `/javascript`
- strip `index.html`
- strip trailing `.html` from TypeDoc pages

### 6.2 Index pages

Map TypeDoc index pages to the new landing:

```
/javascript/modules.html         -> /javascript
/javascript/classes.html         -> /javascript
/javascript/interfaces.html      -> /javascript
/javascript/functions.html       -> /javascript
/javascript/type-aliases.html    -> /javascript
/javascript/enumerations.html    -> /javascript
/javascript/variables.html       -> /javascript
```

### 6.3 TypeDoc reflection → new route mapping

TypeDoc pages encode a “reflection” into the filename. Examples:

- `_langchain_openai.ChatOpenAI`
- `_langchain_core.utils_math`
- `langsmith.traceable`

We translate this into:

```
/javascript/<package-slug>/<symbol-path...>
```

#### 6.3.1 Parse algorithm

Given a legacy path:

```
/javascript/<kind>/<reflection>.html
```

Where `<kind>` is one of:
`modules`, `classes`, `interfaces`, `functions`, `type-aliases`, `enumerations`, `variables`, `namespaces`

And `<reflection>` is a dot-separated string.

Algorithm:

1. Split reflection by `.` → `[head, ...tail]`
2. Determine package token:
   - `pkgToken = head` with leading `_` stripped
3. Convert `pkgToken` to new `packageSlug`:
   - if `pkgToken` starts with `langchain_`: it represents `@langchain/<rest>`
     - `langchain_openai` → `langchain-openai`
     - `langchain_core` → `langchain-core`
     - `langchain_langgraph` → `langchain-langgraph` (represents `@langchain/langgraph`)
   - else if `pkgToken` is `langchain`: `langchain`
   - else: use `pkgToken` as an unscoped package slug (e.g. `langsmith`)
4. Convert the remaining tail segments into URL path segments:
   - For each tail segment, split by `_` into subsegments (module path convention)
   - Keep original casing (symbols are case-sensitive)
5. Output new path:
   - If tail is empty: `/javascript/<packageSlug>`
   - Else: `/javascript/<packageSlug>/<tailSegments...>`

#### 6.3.2 Examples

- `/javascript/classes/_langchain_openai.ChatOpenAI.html`
  - package: `langchain_openai` → `langchain-openai`
  - symbol: `ChatOpenAI`
  - new: `/javascript/langchain-openai/ChatOpenAI`

- `/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html`
  - package: `langchain_core` → `langchain-core`
  - symbol path: `runnables/RunnableConfig`
  - new: `/javascript/langchain-core/runnables/RunnableConfig`

- `/javascript/modules/_langchain_core.utils_math.html`
  - package: `langchain_core` → `langchain-core`
  - module path: `utils/math`
  - new: `/javascript/langchain-core/utils/math`

- `/javascript/modules/langsmith.traceable.html`
  - package: `langsmith` → `langsmith`
  - symbol: `traceable`
  - new: `/javascript/langsmith/traceable`

### 6.4 Legacy “short module” pages (optional)

Some TypeDoc builds also expose `modules/<name>.html` without the `_langchain_*` prefix (e.g. `modules/core.html`).

Add a small lookup table for these:

```
core    -> langchain-core
openai  -> langchain-openai
aws     -> langchain-aws
...
```

Fallback if unknown: treat `<name>` as an unscoped package slug.

---

## 7. Edge Cases & Safety

### 7.1 Avoid redirect loops

- Ensure redirects only run for legacy paths (presence of `.html`, `/integrations/`, `/v0.3/`, or TypeDoc kind segments).
- Do not re-run translation on already-canonical new routes.

### 7.2 Preserve case where needed

- Package slugs should be lowercased.
- Symbol segments should preserve their original casing.

### 7.3 Unknown symbols / missing pages

If a symbol path doesn’t resolve in the new IR:

- Do **not** bounce in loops trying multiple redirects.
- Redirect once to the package landing page as a safe fallback:
  - `/python/<package>`
  - `/javascript/<package>`

### 7.4 Performance

- Prefer pure string/regex transforms for 301s.
- Only use runtime lookups for the v0.3 → `?v=` resolution path; cache aggressively.

---

## 8. Implementation Plan

### 8.1 Where to implement

We should implement in **edge middleware** (Next.js middleware or Vercel edge config) so:

- old domain → new app can redirect without rendering pages
- redirects are fast and SEO-friendly

Recommended implementation points:

1. Extend `apps/web/middleware.ts` to include:
   - Python legacy rules (P1–P4)
   - JavaScript TypeDoc rules (JS1–JS4)
2. (Optional) Add static redirects in `apps/web/vercel.json` for the simplest canonicalizations (`index.html` stripping).

### 8.2 Testing plan

- Create a small table of representative legacy URLs (10–20 each for Python/JS).
- For each, verify:
  - status code is 301
  - redirect Location matches expected canonical target
  - query params preserved
  - no loops

---

## 9. Acceptance Criteria

### 9.1 Functional requirements

| ID  | Requirement                                                                       | Priority |
| --- | --------------------------------------------------------------------------------- | -------- |
| R1  | Python legacy URLs under `/python/**` redirect to new `/python/**`                | P0       |
| R2  | JS TypeDoc URLs under `/javascript/**` redirect to new `/javascript/**`           | P0       |
| R3  | `/python/integrations/**` maps to package-based paths                             | P0       |
| R4  | `.html` suffixes are canonicalized (removed)                                      | P0       |
| R5  | `/v0.3/python/**` redirects to new pages with a resolved `?v=` (or safe fallback) | P1       |
| R6  | Query params preserved across redirects                                           | P0       |
| R7  | Redirects do not create loops                                                     | P0       |

### 9.2 Quality requirements

| ID  | Requirement                                | Target                  |
| --- | ------------------------------------------ | ----------------------- |
| Q1  | Redirect latency                           | < 50ms at edge          |
| Q2  | No 404 regressions for sampled legacy URLs | 100% pass               |
| Q3  | SEO-friendly status codes                  | 301 for stable mappings |

---

_End of Specification_
