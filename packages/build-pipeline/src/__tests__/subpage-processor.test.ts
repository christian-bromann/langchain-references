/**
 * Subpage Processor Tests
 *
 * Snapshot tests for markdown parsing to ensure consistent extraction
 * of markdown content and symbol references.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSubpageMarkdown } from "../subpage-processor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "subpages");

/**
 * Helper to load fixture file
 */
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("parseSubpageMarkdown", () => {
  describe("basic parsing", () => {
    it("parses simple.md correctly", () => {
      const content = loadFixture("simple.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
    });

    it("parses with-tables.md correctly, preserving tables", () => {
      const content = loadFixture("with-tables.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // Verify table is preserved in markdown content (check for table structure, not exact formatting)
      expect(result.markdownContent).toContain("| CLASS");
      expect(result.markdownContent).toContain("| `ClassA`");
    });

    it("parses with-admonitions.md correctly, preserving MkDocs syntax", () => {
      const content = loadFixture("with-admonitions.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // Verify admonitions are preserved
      expect(result.markdownContent).toContain('!!! note "Reference docs"');
      expect(result.markdownContent).toContain("!!! warning");
    });
  });

  describe("options handling", () => {
    it("ignores options blocks in options-ignored.md", () => {
      const content = loadFixture("options-ignored.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // Should extract only qualified names, not options
      expect(result.symbolRefs).toEqual([
        "langchain.agents.middleware.SummarizationMiddleware",
        "langchain.agents.middleware.HumanInTheLoopMiddleware",
        "langchain.agents.middleware.SimpleDecorator",
      ]);
      // Options should not appear in symbol refs
      expect(result.symbolRefs).not.toContain("options:");
      expect(result.symbolRefs).not.toContain("docstring_options:");
    });

    it("ignores deeply nested options in nested-options.md", () => {
      const content = loadFixture("nested-options.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // Should only extract the three symbol names
      expect(result.symbolRefs).toEqual([
        "langchain.agents.Agent",
        "langchain.agents.AgentExecutor",
        "langchain.agents.SimpleAgent",
      ]);
    });
  });

  describe("edge cases", () => {
    it("handles no-directives.md - full content as markdown", () => {
      const content = loadFixture("no-directives.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // No directives means empty symbolRefs
      expect(result.symbolRefs).toEqual([]);
      // All content should be markdown
      expect(result.markdownContent).toContain("# No Directives");
      expect(result.markdownContent).toContain("- Item 1");
    });

    it("handles only-directives.md - no markdown content", () => {
      const content = loadFixture("only-directives.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // No markdown content
      expect(result.markdownContent).toBe("");
      // All lines are directives
      expect(result.symbolRefs).toEqual([
        "package.Symbol1",
        "package.Symbol2",
        "package.Symbol3",
        "package.module.nested.Symbol4",
      ]);
    });

    it("handles empty.md - empty result", () => {
      const content = loadFixture("empty.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      expect(result.markdownContent).toBe("");
      expect(result.symbolRefs).toEqual([]);
    });
  });

  describe("complex real-world example", () => {
    it("parses complex.md correctly", () => {
      const content = loadFixture("complex.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // Verify tables are in markdown content (check for table structure, not exact formatting)
      expect(result.markdownContent).toContain("| CLASS");
      expect(result.markdownContent).toContain("| DECORATOR");
      expect(result.markdownContent).toContain("| TYPE");
      // Verify all symbols are extracted
      expect(result.symbolRefs).toContain("langchain.agents.middleware.SummarizationMiddleware");
      expect(result.symbolRefs).toContain("langchain.agents.middleware.HumanInTheLoopMiddleware");
      expect(result.symbolRefs).toContain("langchain.agents.middleware.ModelCallLimitMiddleware");
      expect(result.symbolRefs).toContain("langchain.agents.middleware.before_agent");
      expect(result.symbolRefs).toContain("langchain.agents.middleware.before_model");
      expect(result.symbolRefs).toContain("langchain.agents.middleware.AgentState");
      expect(result.symbolRefs).toContain("langchain.agents.middleware.ModelRequest");
    });
  });

  describe("members list parsing", () => {
    it("extracts fully qualified names from members list", () => {
      const content = loadFixture("with-members.md");
      const result = parseSubpageMarkdown(content);
      expect(result).toMatchSnapshot();
      // Should extract individual member names, not the module
      expect(result.symbolRefs).toEqual([
        "langchain.messages.AIMessage",
        "langchain.messages.AIMessageChunk",
        "langchain.messages.HumanMessage",
        "langchain.messages.SystemMessage",
        "langchain.messages.AnyMessage",
        "langchain.messages.ToolMessage",
        "langchain.messages.ToolCall",
      ]);
      // The module itself should NOT be in the refs
      expect(result.symbolRefs).not.toContain("langchain.messages");
    });

    it("handles inline members list with module without members", () => {
      const content = `::: package.module
    options:
      summary: true

::: package.other.Symbol`;
      const result = parseSubpageMarkdown(content);
      // Module without members: uses module name
      // Direct symbol: uses the symbol name
      expect(result.symbolRefs).toEqual(["package.module", "package.other.Symbol"]);
    });

    it("handles mixed directives with and without members", () => {
      const content = `::: package.messages
    options:
      members:
        - Message1
        - Message2

::: package.tools.ToolClass
    options:
      show_source: true

::: package.utils.helper_func`;
      const result = parseSubpageMarkdown(content);
      expect(result.symbolRefs).toEqual([
        "package.messages.Message1",
        "package.messages.Message2",
        "package.tools.ToolClass",
        "package.utils.helper_func",
      ]);
    });
  });

  describe("qualified name extraction", () => {
    it("extracts simple qualified names", () => {
      const content = `::: package.module.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.symbolRefs).toEqual(["package.module.Symbol"]);
    });

    it("handles trailing whitespace", () => {
      const content = `::: package.Symbol   \n::: another.Symbol  `;
      const result = parseSubpageMarkdown(content);
      expect(result.symbolRefs).toEqual(["package.Symbol", "another.Symbol"]);
    });

    it("handles multiple consecutive directives", () => {
      const content = `::: a.b.C
::: d.e.F
::: g.h.I
::: j.k.L`;
      const result = parseSubpageMarkdown(content);
      expect(result.symbolRefs).toEqual(["a.b.C", "d.e.F", "g.h.I", "j.k.L"]);
    });

    it("ignores empty directives", () => {
      const content = `:::
::: package.Symbol
:::   `;
      const result = parseSubpageMarkdown(content);
      expect(result.symbolRefs).toEqual(["package.Symbol"]);
    });

    it("ignores comment-style directives", () => {
      const content = `::: # This is a comment
::: package.Symbol
::: #another-comment`;
      const result = parseSubpageMarkdown(content);
      expect(result.symbolRefs).toEqual(["package.Symbol"]);
    });
  });

  describe("markdown content splitting", () => {
    it("splits at first ::: directive", () => {
      const content = `# Title

Some content.

::: first.Symbol
::: second.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toBe("# Title\n\nSome content.");
      expect(result.symbolRefs).toEqual(["first.Symbol", "second.Symbol"]);
    });

    it("does not include markdown after first directive", () => {
      const content = `# Header

Intro text.

::: symbol.One

Some text that shouldn't be included.

::: symbol.Two`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toBe("# Header\n\nIntro text.");
      // The text between directives is ignored
      expect(result.symbolRefs).toEqual(["symbol.One", "symbol.Two"]);
    });

    it("trims trailing whitespace from markdown content", () => {
      const content = `# Title

Content with trailing spaces.   


::: symbol.Name`;
      const result = parseSubpageMarkdown(content);
      // Trailing whitespace/newlines should be trimmed
      expect(result.markdownContent.endsWith("spaces.")).toBe(true);
    });
  });

  describe("include processing", () => {
    it("replaces langchain-classic-warning.md include with admonition", () => {
      const content = `--8<-- "langchain-classic-warning.md"

::: package.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toContain('!!! danger "langchain-classic documentation"');
      expect(result.markdownContent).toContain("langchain-classic");
      expect(result.symbolRefs).toEqual(["package.Symbol"]);
    });

    it("replaces wip.md include with admonition", () => {
      const content = `--8<-- "wip.md"

::: package.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toContain('!!! warning "Work in progress"');
      expect(result.symbolRefs).toEqual(["package.Symbol"]);
    });

    it("handles multiple includes", () => {
      const content = `--8<-- "langchain-classic-warning.md"

--8<-- "wip.md"

::: package.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toContain('!!! danger "langchain-classic documentation"');
      expect(result.markdownContent).toContain('!!! warning "Work in progress"');
      expect(result.symbolRefs).toEqual(["package.Symbol"]);
    });

    it("handles single-quoted includes", () => {
      const content = `--8<-- 'wip.md'

::: package.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toContain('!!! warning "Work in progress"');
    });

    it("removes unknown includes silently", () => {
      const content = `--8<-- "unknown-file.md"

Some text.

::: package.Symbol`;
      const result = parseSubpageMarkdown(content);
      // Unknown include should be removed
      expect(result.markdownContent).not.toContain("--8<--");
      expect(result.markdownContent).toContain("Some text.");
      expect(result.symbolRefs).toEqual(["package.Symbol"]);
    });

    it("preserves HTML comments (they are invisible in output)", () => {
      const content = `--8<-- "wip.md"

<!-- This is a comment -->

::: package.Symbol`;
      const result = parseSubpageMarkdown(content);
      expect(result.markdownContent).toContain("<!-- This is a comment -->");
    });
  });
});
