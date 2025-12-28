# LangChain Reference Docs — Roadmap

## Overview

A phased development plan to build a unified API reference documentation platform.

---

## Phase 1: Foundation (Weeks 1-3)

### Goal
Ship a Mintlify-matching "Reference UI" that can render existing TypeDoc and griffe outputs with a unified shell.

### Deliverables

| Task | Priority | Description |
|------|----------|-------------|
| **Project scaffold** | P0 | Initialize Next.js App Router project with TypeScript |
| **Design tokens** | P0 | Extract and implement Mintlify Aspen theme (colors, fonts, spacing) |
| **Layout components** | P0 | Build shared chrome: header, left nav, right TOC, breadcrumbs |
| **Routing structure** | P0 | Implement `/python/[...slug]` and `/javascript/[...slug]` routes |
| **IR schema v0.1** | P1 | Define TypeScript types for manifest, symbols, and search records |
| **Static hosting** | P1 | Deploy to Vercel with basic CDN caching |

### Exit Criteria
- ✅ Landing page matching Mintlify design
- ✅ Basic navigation between Python and JavaScript sections
- ✅ Vercel deployment pipeline working

---

## Phase 2: JavaScript Extraction (Weeks 4-6)

### Goal
Replace TypeDoc HTML generation with TypeDoc JSON → IR extraction → custom rendering.

### Deliverables

| Task | Priority | Description |
|------|----------|-------------|
| **TypeDoc JSON extractor** | P0 | Build script to generate JSON from langchainjs packages |
| **IR transformer (TS)** | P0 | Convert TypeDoc reflection tree → Reference IR format |
| **Symbol pages** | P0 | Render class, function, interface, type pages from IR |
| **Package landing pages** | P1 | Create index pages for each npm package |
| **Source links** | P1 | Link to GitHub at exact SHA for each symbol |
| **Tarball fetcher** | P2 | Download repos by SHA from GitHub tarball API |

### Exit Criteria
- ✅ All `@langchain/*` packages rendering from IR
- ✅ URL structure: `/javascript/{package}/{version}/classes/{ClassName}/`
- ✅ Symbol signatures, parameters, and JSDoc descriptions displayed

---

## Phase 3: Python Extraction (Weeks 7-9)

### Goal
Replace MkDocs with griffe-based static extraction → IR → custom rendering.

### Deliverables

| Task | Priority | Description |
|------|----------|-------------|
| **Griffe extractor** | P0 | Parse Python packages without runtime imports |
| **IR transformer (Py)** | P0 | Convert griffe output → Reference IR format |
| **Python symbol pages** | P0 | Render module, class, function pages from IR |
| **Docstring parsing** | P1 | Support Google-style and NumPy-style docstrings |
| **Type annotations** | P1 | Display Python type hints with proper formatting |
| **Cross-references** | P2 | Link between related symbols within the same package |

### Exit Criteria
- ✅ Core packages (`langchain`, `langchain-core`, `langgraph`) rendering
- ✅ URL structure: `/python/{package}/{version}/classes/{ClassName}/`
- ✅ Docstrings rendered with examples and parameter tables

---

## Phase 4: Unified Search (Weeks 10-11)

### Goal
Implement cross-language search that works across both Python and JavaScript APIs.

### Deliverables

| Task | Priority | Description |
|------|----------|-------------|
| **Search index builder** | P0 | Generate JSON index from IR during build |
| **Client-side search** | P0 | Implement Cmd+K modal with FlexSearch/MiniSearch |
| **Result ranking** | P1 | Weight by symbol kind, popularity, and recency |
| **Keyboard navigation** | P1 | Arrow keys, Enter to select, Esc to close |
| **Search analytics** | P2 | Track popular queries for optimization |

### Exit Criteria
- ✅ Unified search across Python and JavaScript
- ✅ Results show package, language, and symbol kind
- ✅ Sub-200ms search response time

---

## Phase 5: Version Support (Weeks 12-14)

### Goal
Support multiple versions per package with version-first URLs and a version selector.

### Deliverables

| Task | Priority | Description |
|------|----------|-------------|
| **Version resolver** | P0 | Map `{package}@{version}` → `{buildId}` via KV |
| **Version selector UI** | P0 | Dropdown in header to switch versions |
| **Latest aliases** | P1 | `/python/langchain/latest/` redirects to current version |
| **Build API** | P1 | Endpoint to trigger builds for specific package versions |
| **Compatibility redirects** | P2 | Map old TypeDoc URLs to new structure |

### Exit Criteria
- ✅ Users can view docs for any published version
- ✅ Version appears in URLs: `/python/langchain/1.0.0/`
- ✅ Old bookmark URLs still work via redirects

---

## Phase 6: Production Hardening (Weeks 15-16)

### Goal
Optimize for 10k DAU with proper caching, monitoring, and reliability.

### Deliverables

| Task | Priority | Description |
|------|----------|-------------|
| **CDN caching** | P0 | Configure immutable caching for versioned pages |
| **Error boundaries** | P0 | Graceful fallbacks for missing symbols/packages |
| **Monitoring** | P1 | Vercel Analytics + custom dashboards |
| **Performance audit** | P1 | Lighthouse scores, Core Web Vitals optimization |
| **Documentation** | P2 | Internal docs for build system and contribution |

### Exit Criteria
- ✅ 99.9% uptime over 30 days
- ✅ p95 page load <1.5 seconds
- ✅ All Lighthouse scores >90

---

## Future Considerations (Post-v1)

| Feature | Description |
|---------|-------------|
| **Integration docs** | Auto-generate docs for all 100+ partner packages |
| **API playground** | Interactive testing of endpoints |
| **Diff viewer** | Compare API changes between versions |
| **AI-powered search** | Semantic search with embeddings |
| **Changelogs** | Auto-generated per-package changelogs from IR diffs |

---

## Timeline Summary

```
Week 1-3:   ████████ Foundation
Week 4-6:   ████████ JavaScript Extraction  
Week 7-9:   ████████ Python Extraction
Week 10-11: █████ Unified Search
Week 12-14: ████████ Version Support
Week 15-16: █████ Production Hardening
```

**Total estimated duration: 16 weeks**

