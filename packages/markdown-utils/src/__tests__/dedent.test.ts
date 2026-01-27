import { describe, it, expect } from "vitest";
import { dedentContent, dedentPrecedingContent, normalizeFencedCodeBlocks } from "../dedent";

describe("dedentContent", () => {
  describe("basic dedentation", () => {
    it("should return empty string for empty input", () => {
      expect(dedentContent("")).toBe("");
    });

    it("should return null/undefined as-is", () => {
      expect(dedentContent(null as unknown as string)).toBe(null);
      expect(dedentContent(undefined as unknown as string)).toBe(undefined);
    });

    it("should trim single-line content", () => {
      expect(dedentContent("  hello  ")).toBe("hello");
    });

    it("should remove common indentation from all lines", () => {
      const input = `    line 1
    line 2
    line 3`;
      const expected = `line 1
line 2
line 3`;
      expect(dedentContent(input)).toBe(expected);
    });

    it("should preserve relative indentation", () => {
      const input = `    line 1
        indented line 2
    line 3`;
      const expected = `line 1
    indented line 2
line 3`;
      expect(dedentContent(input)).toBe(expected);
    });
  });

  describe("Python docstring patterns", () => {
    it("should handle docstrings where first line has no indent but subsequent lines do", () => {
      const input = `Summary line.
    More content here.
    And more.`;
      const expected = `Summary line.
More content here.
And more.`;
      expect(dedentContent(input)).toBe(expected);
    });

    it("should preserve empty lines", () => {
      const input = `Summary line.

    More content.`;
      const expected = `Summary line.

More content.`;
      expect(dedentContent(input)).toBe(expected);
    });
  });

  describe("normalize parameter", () => {
    it("should normalize fenced code blocks by default", () => {
      const input = `Some text.
    \`\`\`python
    code here
    \`\`\``;
      const result = dedentContent(input);
      // Code block should be at column 0
      expect(result).toContain("```python\n");
      expect(result).not.toContain("    ```python");
    });

    it("should NOT normalize fenced code blocks when normalize=false", () => {
      const input = `    Some text.
        \`\`\`python
        code here
        \`\`\``;
      const result = dedentContent(input, false);
      // Code block should preserve relative indent
      expect(result).toContain("    ```python");
    });
  });
});

describe("normalizeFencedCodeBlocks", () => {
  it("should return empty string for empty input", () => {
    expect(normalizeFencedCodeBlocks("")).toBe("");
  });

  it("should not modify content without code blocks", () => {
    const input = "Just some text\nwithout code blocks.";
    expect(normalizeFencedCodeBlocks(input)).toBe(input);
  });

  it("should not modify already un-indented code blocks", () => {
    const input = `\`\`\`python
print("hello")
\`\`\``;
    expect(normalizeFencedCodeBlocks(input)).toBe(input);
  });

  it("should move indented code blocks to column 0", () => {
    const input = `Some text
    \`\`\`python
    print("hello")
    \`\`\``;
    const expected = `Some text
\`\`\`python
print("hello")
\`\`\``;
    expect(normalizeFencedCodeBlocks(input)).toBe(expected);
  });

  it("should handle tilde-style code blocks", () => {
    const input = `Some text
    ~~~bash
    echo "hello"
    ~~~`;
    const expected = `Some text
~~~bash
echo "hello"
~~~`;
    expect(normalizeFencedCodeBlocks(input)).toBe(expected);
  });

  it("should dedent preceding content with same indentation", () => {
    const input = `Header:
    Some explanation text.
    More explanation.
    \`\`\`python
    code here
    \`\`\``;
    const result = normalizeFencedCodeBlocks(input);
    // Both explanation text and code block should be dedented
    expect(result).toContain("Some explanation text.");
    expect(result).toContain("```python");
    expect(result).not.toContain("    Some explanation");
  });

  it("should handle multiple code blocks", () => {
    const input = `Text 1
    \`\`\`python
    code 1
    \`\`\`
Text 2
    \`\`\`bash
    code 2
    \`\`\``;
    const result = normalizeFencedCodeBlocks(input);
    expect(result.match(/```python/g)).toHaveLength(1);
    expect(result.match(/```bash/g)).toHaveLength(1);
    expect(result).not.toContain("    ```");
  });

  it("should preserve content inside code blocks correctly", () => {
    const input = `    \`\`\`python
    def hello():
        print("indented")
    \`\`\``;
    const result = normalizeFencedCodeBlocks(input);
    expect(result).toContain("def hello():");
    expect(result).toContain('    print("indented")');
  });
});

describe("dedentPrecedingContent", () => {
  it("should return original lines when indent is 0", () => {
    const lines = ["line 1", "line 2"];
    expect(dedentPrecedingContent(lines, 0)).toEqual(lines);
  });

  it("should dedent lines with matching indentation", () => {
    const lines = ["    line 1", "    line 2"];
    const expected = ["line 1", "line 2"];
    expect(dedentPrecedingContent(lines, 4)).toEqual(expected);
  });

  it("should stop dedenting at lines with less indentation", () => {
    const lines = ["header", "    content 1", "    content 2"];
    const result = dedentPrecedingContent(lines, 4);
    expect(result).toEqual(["header", "content 1", "content 2"]);
  });

  it("should preserve empty lines", () => {
    const lines = ["    line 1", "", "    line 2"];
    const result = dedentPrecedingContent(lines, 4);
    expect(result).toEqual(["line 1", "", "line 2"]);
  });
});

describe("integration: dedentContent with admonitions", () => {
  it("should preserve admonition indentation structure when normalize=false", () => {
    const input = `    ???+ example "Title"

        \`\`\`python
        code here
        \`\`\``;

    // First dedent without normalizing (as processMkDocsContent does)
    const result = dedentContent(input, false);

    // The admonition should be at column 0
    expect(result).toMatch(/^\?\?\?\+ example/m);
    // The code block should still be indented relative to admonition
    expect(result).toContain("    ```python");
  });
});
