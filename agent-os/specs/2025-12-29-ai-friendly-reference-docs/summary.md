# Summary: AI-Friendly Reference Documentation

**Spec ID**: `2025-12-29-ai-friendly-reference-docs`  
**Created**: December 29, 2025

## One-Line Summary

Make API reference documentation AI-friendly by serving markdown for programmatic access, adding copy-as-markdown functionality, and implementing MCP server integration.

## Key Features

1. **Content Negotiation** - Automatically serve markdown for LLM/agent requests, HTML for browsers
2. **Copy Page Button** - Mintlify-style button to copy page content as markdown
3. **Context Menu** - Dropdown with AI actions (ChatGPT, Claude, MCP, llms.txt)
4. **MCP Server** - Model Context Protocol endpoint for IDE integration
5. **llms.txt** - Standard index file for LLM crawlers

## Technical Approach

- Detect request type via Accept headers and User-Agent patterns
- Generate optimized markdown from symbol data
- Radix UI dropdown for context menu
- MCP JSON-RPC endpoint at `/mcp`
- Static `llms.txt` and `llms-full.txt` routes

## Dependencies

- Radix UI Dropdown Menu
- Existing IR symbol data
- Next.js API routes

## Estimated Effort

- **Small tasks**: 3 (icons, basic routes)
- **Medium tasks**: 4 (copy button, context menu, content negotiation, llms.txt)
- **Large tasks**: 1 (MCP server)

**Total**: ~2-3 days of development

## Success Metrics

- LLM crawlers receive markdown instead of HTML
- Copy button works on all symbol pages
- MCP server responds to basic queries
- llms.txt accessible at site root

