# Spec: IR Extractor & Reference UI

## Summary

Build a complete API reference documentation system consisting of:

1. **Extractors**: Parse Python and TypeScript source code into a normalized Intermediate Representation (IR)
2. **Reference UI**: A Next.js application matching the Mintlify Aspen theme design
3. **Multi-project support**: Onboard LangChain, LangGraph, and LangSmith documentation (phased)

---

## Decisions Made

### 1. Extraction Strategy

| Decision | Choice |
|----------|--------|
| **Python parsing** | Static parsing only (griffe) — no runtime imports initially |
| **Python docstring style** | **Google-style** (per `mkdocs.yml` line 282: `docstring_style: google`) |
| **TypeScript parsing** | TypeDoc without `node_modules` initially |

### 2. Package Scope (v1)

**Python Packages** (from [langchain-ai/langchain](https://github.com/langchain-ai/langchain)):
- `langchain`
- `langchain-core`
- `langchain-text-splitters`
- `langchain-mcp-adapters`
- `langchain-tests`
- `langchain-classic`

**TypeScript Packages** (from [langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs) per [reference.langchain.com/javascript](https://reference.langchain.com/javascript/index.html)):
- `@langchain/anthropic`
- `@langchain/aws`
- `@langchain/classic`
- `@langchain/community`
- `@langchain/core`
- `@langchain/deepseek`
- `@langchain/google-genai`
- `@langchain/google-vertexai`
- `@langchain/google-vertexai-web`
- `@langchain/groq`

### 3. Version Strategy

| Decision | Choice |
|----------|--------|
| **Initial scope** | `latest` only (current main branch) |
| **Future support** | Architecture should support all minor/major versions easily |

### 4. URL Structure

**Pattern**: Language-first (Option A)

```
/python/langchain/classes/ChatOpenAI/
/python/langchain-core/functions/init_chat_model/
/javascript/@langchain/core/classes/BaseMessage/
```

**Domain**: Separate domain — `reference.langchain.com`
- Python: `reference.langchain.com/python/...`
- JavaScript: `reference.langchain.com/javascript/...`

### 5. UI Design

| Decision | Choice |
|----------|--------|
| **Layout** | Dedicated API reference layout (method signatures in left column, details in right) |
| **Theme** | Match Mintlify Aspen theme (light/dark modes) |
| **Responsive** | Mobile-first with hamburger menu (see `assets/docs-responsive.png`) |

### 6. Search

| Decision | Choice |
|----------|--------|
| **Scope** | Language-specific only (no cross-language search) |
| **Implementation** | FlexSearch or MiniSearch (client-side) |

### 7. Build & Deploy

| Decision | Choice |
|----------|--------|
| **Trigger** | Manual trigger with version selection |
| **Future** | Add automated triggers for releases |

### 8. LangSmith

| Decision | Choice |
|----------|--------|
| **Scope** | Deferred — not in v1 |

---

## Target Repositories

### Phase 1: Core (LangChain)
| Language | Repository | Status |
|----------|------------|--------|
| Python | [langchain-ai/langchain](https://github.com/langchain-ai/langchain) | v1 |
| TypeScript | [langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs) | v1 |

### Phase 2: LangGraph
| Language | Repository | Status |
|----------|------------|--------|
| Python | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Future |
| TypeScript | [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs) | Future |

### Phase 3: LangSmith
| Source | Status |
|--------|--------|
| [docs.langchain.com/langsmith](https://docs.langchain.com/langsmith/home) | Future |

---

## Visual Assets

| File | Description |
|------|-------------|
| `assets/docs-light-mode.png` | Mintlify light theme reference |
| `assets/docs-dark-mode.png` | Mintlify dark theme reference |
| `assets/docs-responsive.png` | Mobile responsive design reference |

---

## Key Design Observations (from screenshots)

### Light Mode (`docs-light-mode.png`)
- **Background**: Cream/off-white (`#FAF9F6` or similar)
- **Accent border**: Golden/amber left edge
- **Primary color**: Teal (`#2F6868`)
- **Header**: LangChain Docs logo, product dropdown, search (⌘K), Ask AI, GitHub, "Try LangSmith" CTA
- **Left nav**: Collapsible sections with icons, active item highlighted in teal
- **Content**: Clean typography, code blocks with copy buttons
- **Right TOC**: "On this page" with anchor links

### Dark Mode (`docs-dark-mode.png`)
- **Background**: Dark gray/charcoal
- **Accent border**: Same golden/amber left edge
- **Text**: Light gray/white
- **Code blocks**: Dark background with syntax highlighting

### Responsive (`docs-responsive.png`)
- **Width**: 400px mobile viewport
- **Header**: Simplified with hamburger menu (☰), search icon, overflow menu
- **Navigation**: Hidden in drawer
- **Content**: Full-width, optimized typography
- **Chat widget**: Floating LangChain assistant button

---

## Status

- [x] Requirements gathering complete
- [x] Architecture decisions documented
- [x] Visual assets reviewed (3 files)
- [ ] Implementation not started

---

## Next Steps

Run `/write-spec` to generate the detailed specification document.
