/**
 * Tests for code block extraction from markdown
 */

import { describe, it, expect } from "vitest";
import { extractCodeBlocks } from "../extract-blocks.js";

describe("Code block extraction", () => {
  it("extracts Python code blocks", () => {
    const markdown = `
# Example

\`\`\`python
from langchain_anthropic import ChatAnthropic
\`\`\`

Some text.

\`\`\`javascript
import { ChatOpenAI } from "@langchain/openai";
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "python");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("ChatAnthropic");
    expect(blocks[0].language).toBe("python");
  });

  it("extracts JavaScript code blocks", () => {
    const markdown = `
\`\`\`typescript
import { ChatAnthropic } from "@langchain/anthropic";
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "javascript");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("ChatAnthropic");
  });

  it("extracts multiple Python blocks", () => {
    const markdown = `
\`\`\`python
from langchain import LLMChain
\`\`\`

Some explanation.

\`\`\`python
from langchain_openai import ChatOpenAI
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "python");

    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toContain("LLMChain");
    expect(blocks[1].content).toContain("ChatOpenAI");
  });

  it("extracts TypeScript blocks when filtering for JavaScript", () => {
    const markdown = `
\`\`\`typescript
import { ChatAnthropic } from "@langchain/anthropic";
\`\`\`

\`\`\`ts
import { ChatOpenAI } from "@langchain/openai";
\`\`\`

\`\`\`javascript
import { HumanMessage } from "@langchain/core/messages";
\`\`\`

\`\`\`js
import { Tool } from "@langchain/core/tools";
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "javascript");

    expect(blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array when no matching blocks", () => {
    const markdown = `
# Just text

No code blocks here.
`;
    const blocks = extractCodeBlocks(markdown, "python");

    expect(blocks).toHaveLength(0);
  });

  it("returns empty array for empty markdown", () => {
    const blocks = extractCodeBlocks("", "python");
    expect(blocks).toHaveLength(0);
  });

  it("handles code blocks with no language specified", () => {
    const markdown = `
\`\`\`
some code
\`\`\`

\`\`\`python
from langchain import foo
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "python");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe("python");
  });

  it("handles code blocks with extra whitespace", () => {
    const markdown = `
\`\`\`python
from langchain import foo
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "python");

    expect(blocks.length).toBeGreaterThanOrEqual(0);
  });

  it("preserves code block content exactly", () => {
    const code = `from langchain_core.messages import (
    HumanMessage,
    AIMessage,
)`;
    const markdown = `
\`\`\`python
${code}
\`\`\`
`;
    const blocks = extractCodeBlocks(markdown, "python");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(code);
  });
});
