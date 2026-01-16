# Multi-Project Reference Documentation Support

## Summary

Extend the reference documentation platform to support multiple LangChain ecosystem projects:

| Project   | Python | JavaScript | Status      |
| --------- | ------ | ---------- | ----------- |
| LangChain | ✅     | ✅         | Implemented |
| LangGraph | ⏳     | ⏳         | To be added |
| DeepAgent | ⏳     | ⏳         | To be added |

## Key Deliverables

1. **Project Navigation Tabs** - Header tabs for switching between projects
2. **Project-Aware Routing** - URL structure: `/{lang}/{project}/{...slug}`
3. **Configuration System** - Separate config files per project/language
4. **Updated Build Pipeline** - Support for building all projects
5. **Project-Scoped Search** - Search results filtered by current project

## Repositories

### LangGraph

- Python: [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- JavaScript: [langchain-ai/langgraphjs](https://github.com/langchain-ai/langgraphjs)

### DeepAgent

- Python: [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents)
- JavaScript: [langchain-ai/deepagentsjs](https://github.com/langchain-ai/deepagentsjs)

## Timeline Estimate

- **Phase 1**: Foundation (2 days) - Types, registry, configs
- **Phase 2**: Routing (2 days) - New route structure, middleware
- **Phase 3**: UI Components (2 days) - Header tabs, sidebar updates
- **Phase 4**: Build Pipeline (2 days) - Multi-project builds
- **Phase 5**: Testing & Polish (2 days) - Tests, documentation

**Total: ~10 working days**

## UI Reference

The project tabs should match the Mintlify design pattern:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Docs by LangChain    [Search... ⌘K]    Ask AI  GitHub    │
├─────────────────────────────────────────────────────────────┤
│ LangChain  │  LangGraph  │  Deep Agents                     │
│ ─────────                                                   │
└─────────────────────────────────────────────────────────────┘
```

The active project tab shows an underline indicator and bold text.
