# Spec Requirements: Related Docs Linking

## Initial Description

We are trying to create a lot of references (in form of links) from our docs https://github.com/langchain-ai/docs to the reference page when we mention symbols. Now we want to do the same the other way around and essentially have a section on each Symbol page, called e.g. "Related Docs:" (maybe there is a better name for this?) that links to a page in our docs that uses the symbol in one of the examples on there.

Let's implement this feature. After we parse out all symbols from the latest project version, we run a check against the docs content and see if we can find it being imported in one of the docs pages, and if so, generate a link to the page and section.

Identify what is the best approach here:

- either clone the docs repo and do a text search to find if the symbol is imported somewhere
- use the GitHub API directly to search in the docs repository

The section should show up to 5 related links for the symbol.

## Requirements Discussion

### First Round Questions

**Q1:** I assume we should only match **import statements** (e.g., `from langchain_anthropic import ChatAnthropic`) rather than all text mentions of a symbol name. Is that correct, or should we also include type annotations and inline code references?
**Answer:** Yes, for now only focus on imports from code examples.

**Q2:** I'm thinking we should display these in a dedicated section called **"Related Documentation"** or **"Used In Docs"** placed after the main symbol content but before the Version History. Does that placement work, or would you prefer it in the Table of Contents sidebar?
**Answer:** Yes, put this after the main symbol docs and add it to the TOC (Table of Contents sidebar).

**Q3:** I assume the links should open **docs.langchain.com in a new tab** (external link behavior). Is that correct, or should we keep users in the same tab?
**Answer:** Yes, open in a new tab.

**Q4:** For symbols that appear in many docs (e.g., `ChatOpenAI` might be in 50+ pages), I'm planning to show the **5 most relevant** docs. Should we also show a "+X more" count, or would you prefer a "View all" link that expands the list?
**Answer:** Allow expanding the list to 20 max and make a note that more are found but not displayed. Don't blow up the symbol JSON files with hundreds of links.

**Q5:** I'm assuming we should run this scan **during the IR build pipeline** (not at runtime) and store results in blob storage. This means docs links update when we rebuild IR. Is that acceptable, or do you need more real-time updates?
**Answer:** Yes, if we change pages, we usually place a redirect, so this should be fine.

**Q6:** When a doc page has multiple sections, should we link to:

- Just the page (e.g., `/docs/tutorials/chatbot`)
- The specific section where the import appears (e.g., `/docs/tutorials/chatbot#setup`)
  **Answer:** If possible, link to the section with the example.

**Q7:** Is there anything you explicitly want to **exclude** from this feature?
**Answer:** No restrictions.

### Existing Code to Reference

**Similar Features Identified:**

- No similar existing features identified for direct reuse

**Architecture Decision:**

- Create a new package in `packages/` for the related docs scanning logic
- Import this package in the build pipeline
- Keep the logic separate and modular

### Follow-up Questions

No follow-up questions needed - requirements are clear.

## Visual Assets

### Files Provided:

No visual assets provided.

### Visual Insights:

N/A

## Requirements Summary

### Functional Requirements

- Scan the LangChain docs repository (github.com/langchain-ai/docs) for symbol imports
- Match only import statements from code examples in MDX/MD files
- Support both Python and JavaScript/TypeScript import patterns
- Generate a mapping of symbols → doc pages with section anchors
- Store up to 20 related doc links per symbol in blob storage
- Display "Related Documentation" section on Symbol pages
- Show 5 links by default with expand option to show up to 20
- Show "+X more found" note when more than 20 docs reference the symbol
- Links open docs.langchain.com in a new tab
- Deep link to specific sections where imports appear (if possible)
- Add "Related Documentation" entry to the Table of Contents sidebar

### Reusability Opportunities

- Create new `packages/related-docs-scanner/` package for scanning logic
- Reuse existing blob storage patterns from `packages/build-pipeline/`
- Follow existing component patterns in `apps/web/components/reference/`
- Model data fetching after existing loader patterns in `apps/web/lib/ir/loader.ts`

### Scope Boundaries

**In Scope:**

- New package for docs repository scanning
- Python import pattern matching
- JavaScript/TypeScript import pattern matching
- Section anchor extraction from MDX files
- Build pipeline integration
- Blob storage for related-docs.json per package
- UI component for displaying related docs
- TOC integration for the new section

**Out of Scope:**

- Type annotation matching (imports only)
- Inline code reference matching
- Real-time/dynamic scanning
- Manual curation of related docs
- Matching symbols mentioned in prose text

### Technical Considerations

- Clone docs repository during build (shallow clone for speed)
- Use ripgrep or similar for fast text searching
- Parse MDX frontmatter for page titles and descriptions
- Extract section headings for anchor links
- Store data in `ir/packages/{packageId}/{buildId}/related-docs.json`
- Limit to 20 links per symbol to manage storage size
- Build pipeline should handle missing docs repo gracefully
