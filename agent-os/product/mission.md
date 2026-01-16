# LangChain Reference Docs — Mission

## Vision

Build a **unified API reference documentation platform** that serves Python and JavaScript/TypeScript documentation within a single, cohesive interface that matches the LangChain Mintlify design system.

## Problem Statement

Today, LangChain's API reference documentation exists as "two sites under one domain":

- **Python**: MkDocs Material + mkdocstrings/griffe → `dist/python`
- **JavaScript/TypeScript**: TypeDoc → `dist/javascript`

This creates several challenges:

1. **Inconsistent UX**: Different navigation, search, and styling between languages
2. **Fragmented search**: Users cannot search across both ecosystems simultaneously
3. **Design drift**: Each generator has its own styling that diverges from the main Mintlify docs
4. **Build complexity**: Two entirely different build pipelines with different requirements
5. **Scalability limits**: Can't easily support versioned docs, multiple repos, or per-sha builds

## Solution

Create a single platform UI with:

- **Unified chrome**: One shared header, navigation, and search experience
- **Mintlify parity**: Match the Aspen theme, brand colors, and layout patterns from the main docs
- **Language-agnostic IR**: Extract APIs into a normalized Intermediate Representation, then render with one design system
- **Version-first URLs**: Users browse by `{package}@{version}`, not repo SHAs
- **Immutable builds**: Support building docs from any repo at any SHA for reproducibility

## Target Users

### Primary: LangChain Developers

- **~10,000 daily active users** browsing API references
- Need quick access to class/function signatures, parameters, and examples
- Frequently switch between Python and JavaScript implementations
- Often need to check specific package versions for compatibility

### Secondary: Integration Authors

- Third-party developers building LangChain integrations
- Need to understand base class contracts and extension points
- Reference the standard interfaces they need to implement

## Success Metrics

| Metric                        | Target                        |
| ----------------------------- | ----------------------------- |
| Cross-language search queries | 20% of total searches         |
| Time to find API information  | <10 seconds average           |
| Design consistency score      | 95%+ match with Mintlify docs |
| Build time per package        | <2 minutes                    |
| Cache hit rate                | >90% for repeat builds        |

## Core Principles

1. **One Interface, All Languages**: Users shouldn't have to context-switch when moving between Python and TypeScript docs
2. **Package-Version First**: URLs and navigation reflect how users think (npm/PyPI packages), not internal repo structures
3. **Mintlify Parity**: The reference docs should feel like a natural extension of docs.langchain.com
4. **Immutable & Reproducible**: Any build can be recreated from `{repo}@{sha}` inputs
5. **Static-First**: Serve pre-rendered HTML for performance; use ISR for scale

## Scope

### In Scope

- Python packages: `langchain`, `langchain-core`, `langgraph`, `langsmith`, and all partner integrations
- JavaScript packages: `@langchain/core`, `@langchain/langgraph`, `langchain`, and all providers
- Unified search across both ecosystems
- Version selector for major releases
- Source links to GitHub at exact SHAs

### Out of Scope (v1)

- Inline code examples/tutorials (these stay in main Mintlify docs)
- API playground / interactive testing
- Community-contributed content
- Localization / i18n
