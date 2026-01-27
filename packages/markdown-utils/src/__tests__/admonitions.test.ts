import { describe, it, expect } from "vitest";
import {
  parseAdmonitionLine,
  convertAdmonitions,
  postProcessAdmonitions,
  processMkDocsContent,
  ADMONITION_START_MARKER,
  ADMONITION_END_MARKER,
} from "../admonitions";

describe("parseAdmonitionLine", () => {
  describe("valid admonition lines", () => {
    it("should parse !!! note", () => {
      const result = parseAdmonitionLine("!!! note");
      expect(result).toEqual({ type: "note" });
    });

    it('should parse !!! note "Title"', () => {
      const result = parseAdmonitionLine('!!! note "Custom Title"');
      expect(result).toEqual({ type: "note", title: "Custom Title" });
    });

    it("should parse ??? collapsible", () => {
      const result = parseAdmonitionLine("??? warning");
      expect(result).toEqual({ type: "warning" });
    });

    it('should parse ???+ expanded "Title"', () => {
      const result = parseAdmonitionLine('???+ example "Example Title"');
      expect(result).toEqual({ type: "example", title: "Example Title" });
    });

    it("should handle hyphenated types", () => {
      const result = parseAdmonitionLine('!!! version-added "v1.0"');
      expect(result).toEqual({ type: "version-added", title: "v1.0" });
    });

    it("should handle smart quotes", () => {
      const result = parseAdmonitionLine('!!! note "Smart Quotes"');
      expect(result).toEqual({ type: "note", title: "Smart Quotes" });
    });

    it("should handle inline content without quotes", () => {
      const result = parseAdmonitionLine("!!! warning This is inline content");
      expect(result).toEqual({
        type: "warning",
        inlineContent: "This is inline content",
      });
    });

    it("should handle indented admonition lines", () => {
      const result = parseAdmonitionLine('    !!! note "Title"');
      expect(result).toEqual({ type: "note", title: "Title" });
    });
  });

  describe("invalid lines", () => {
    it("should return null for non-admonition lines", () => {
      expect(parseAdmonitionLine("Just regular text")).toBeNull();
      expect(parseAdmonitionLine("")).toBeNull();
      expect(parseAdmonitionLine("!! note")).toBeNull();
      expect(parseAdmonitionLine("!!! ")).toBeNull();
    });
  });
});

describe("convertAdmonitions", () => {
  it("should return empty content as-is", () => {
    expect(convertAdmonitions("")).toBe("");
    expect(convertAdmonitions(null as unknown as string)).toBe(null);
  });

  it("should not modify content without admonitions", () => {
    const input = "Just some regular text\nwith multiple lines.";
    expect(convertAdmonitions(input)).toBe(input);
  });

  it("should convert simple admonition to markers", () => {
    const input = `!!! note "Important"
    This is the content.`;

    const result = convertAdmonitions(input);
    expect(result).toContain(ADMONITION_START_MARKER);
    expect(result).toContain(ADMONITION_END_MARKER);
    expect(result).toContain("This is the content.");
  });

  it("should handle admonitions with code blocks", () => {
    const input = `???+ example "Code Example"

    \`\`\`python
    print("hello")
    \`\`\``;

    const result = convertAdmonitions(input);
    expect(result).toContain(ADMONITION_START_MARKER);
    expect(result).toContain('print("hello")');
    expect(result).toContain(ADMONITION_END_MARKER);
  });

  it("should handle nested admonitions", () => {
    const input = `!!! note "Outer"
    Outer content.

    !!! tip "Inner"
        Inner content.`;

    const result = convertAdmonitions(input);
    // Should have two sets of markers
    const startCount = (result.match(new RegExp(ADMONITION_START_MARKER, "g")) || []).length;
    const endCount = (result.match(new RegExp(ADMONITION_END_MARKER, "g")) || []).length;
    expect(startCount).toBe(2);
    expect(endCount).toBe(2);
  });

  it("should skip empty admonitions", () => {
    const input = `!!! note "Empty"

Regular text after.`;

    const result = convertAdmonitions(input);
    // Should not contain markers for empty admonition
    expect(result).not.toContain(ADMONITION_START_MARKER);
    expect(result).toContain("Regular text after.");
  });

  it("should handle multiple admonitions", () => {
    const input = `!!! note "First"
    Content 1.

!!! warning "Second"
    Content 2.`;

    const result = convertAdmonitions(input);
    const startCount = (result.match(new RegExp(ADMONITION_START_MARKER, "g")) || []).length;
    expect(startCount).toBe(2);
    expect(result).toContain("Content 1.");
    expect(result).toContain("Content 2.");
  });
});

describe("postProcessAdmonitions", () => {
  it("should convert markers to callout HTML", () => {
    const metadata = JSON.stringify({
      type: "note",
      title: "Note Title",
      icon: "<svg>icon</svg>",
    });
    const encoded = Buffer.from(metadata).toString("base64");

    const input = `<p>Before</p>
${ADMONITION_START_MARKER}${encoded}-->
<p>Content inside</p>
${ADMONITION_END_MARKER}
<p>After</p>`;

    const result = postProcessAdmonitions(input);

    expect(result).toContain('<div class="callout"');
    expect(result).toContain('data-callout-type="note"');
    expect(result).toContain('<div class="callout-title">Note Title</div>');
    expect(result).toContain("Content inside");
    expect(result).not.toContain(ADMONITION_START_MARKER);
    expect(result).not.toContain(ADMONITION_END_MARKER);
  });

  it("should handle nested admonitions correctly", () => {
    const outerMeta = JSON.stringify({
      type: "note",
      title: "Outer",
      icon: "<svg>outer</svg>",
    });
    const innerMeta = JSON.stringify({
      type: "tip",
      title: "Inner",
      icon: "<svg>inner</svg>",
    });
    const outerEncoded = Buffer.from(outerMeta).toString("base64");
    const innerEncoded = Buffer.from(innerMeta).toString("base64");

    const input = `${ADMONITION_START_MARKER}${outerEncoded}-->
Outer content
${ADMONITION_START_MARKER}${innerEncoded}-->
Inner content
${ADMONITION_END_MARKER}
${ADMONITION_END_MARKER}`;

    const result = postProcessAdmonitions(input);

    expect(result).toContain('data-callout-type="note"');
    expect(result).toContain('data-callout-type="tip"');
    expect(result).toContain("Outer content");
    expect(result).toContain("Inner content");
  });

  it("should handle legacy p-wrapped admonitions", () => {
    const input = '<p>!!! note "Title"\nSome content here</p>';
    const result = postProcessAdmonitions(input);

    expect(result).toContain('<div class="callout"');
    expect(result).toContain('data-callout-type="note"');
  });
});

describe("processMkDocsContent", () => {
  it("should return empty content as-is", () => {
    expect(processMkDocsContent("")).toBe("");
    expect(processMkDocsContent(null as unknown as string)).toBe(null);
  });

  it("should handle simple text without admonitions", () => {
    const input = "Just some text.";
    expect(processMkDocsContent(input)).toBe("Just some text.");
  });

  it("should process indented docstring content with admonitions", () => {
    const input = `    ???+ example "Initialize a model"

        \`\`\`python
        from langchain import init_chat_model
        model = init_chat_model("gpt-4")
        \`\`\``;

    const result = processMkDocsContent(input);

    // Should contain admonition markers
    expect(result).toContain(ADMONITION_START_MARKER);
    expect(result).toContain(ADMONITION_END_MARKER);

    // Should contain the code content
    expect(result).toContain("from langchain import init_chat_model");
    expect(result).toContain('model = init_chat_model("gpt-4")');
  });

  it("should handle multiple admonitions in docstring", () => {
    const input = `    ???+ example "First Example"

        \`\`\`python
        code_1()
        \`\`\`

    ??? example "Second Example"

        \`\`\`python
        code_2()
        \`\`\``;

    const result = processMkDocsContent(input);

    // Should have two admonitions
    const startCount = (result.match(new RegExp(ADMONITION_START_MARKER, "g")) || []).length;
    expect(startCount).toBe(2);

    expect(result).toContain("code_1()");
    expect(result).toContain("code_2()");
  });

  it("should clean up multiple blank lines", () => {
    const input = `Text 1




Text 2`;
    const result = processMkDocsContent(input);
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("should normalize standalone code blocks", () => {
    const input = `Some text.

    \`\`\`python
    standalone_code()
    \`\`\``;

    const result = processMkDocsContent(input);

    // Code block should be at column 0
    expect(result).toMatch(/^```python/m);
    expect(result).toContain("standalone_code()");
  });
});

describe("integration: full pipeline snapshot", () => {
  it("should correctly process init_chat_model docstring example", () => {
    const input = `    ???+ example "Initialize a non-configurable model"

        \`\`\`python
        # pip install langchain langchain-openai

        from langchain.chat_models import init_chat_model

        o3_mini = init_chat_model("openai:o3-mini", temperature=0)
        o3_mini.invoke("what's your name")
        \`\`\`

    ??? example "Partially configurable model"

        \`\`\`python
        configurable_model = init_chat_model(temperature=0)
        configurable_model.invoke("what's your name", config={"configurable": {"model": "gpt-4o"}})
        \`\`\``;

    const result = processMkDocsContent(input);

    // Verify structure
    expect(result).toMatchSnapshot();

    // Verify key content is present
    expect(result).toContain("from langchain.chat_models import init_chat_model");
    expect(result).toContain("o3_mini = init_chat_model");
    expect(result).toContain("configurable_model = init_chat_model");

    // Verify admonition markers
    const startCount = (result.match(new RegExp(ADMONITION_START_MARKER, "g")) || []).length;
    expect(startCount).toBe(2);
  });

  it("should handle admonition with text and code", () => {
    // Simulate docstring-style input where everything is indented
    const input = `    !!! note "Setup Instructions"
        First, install the required packages:

        \`\`\`bash
        pip install langchain
        \`\`\`

        Then configure your API key.`;

    const result = processMkDocsContent(input);

    expect(result).toMatchSnapshot();
    expect(result).toContain(ADMONITION_START_MARKER);
    expect(result).toContain("First, install the required packages:");
    expect(result).toContain("pip install langchain");
    expect(result).toContain("Then configure your API key.");
  });
});
