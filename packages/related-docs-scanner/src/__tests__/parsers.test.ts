/**
 * Tests for import parsers
 */

import { describe, it, expect } from "vitest";
import { parsePythonImports } from "../parsers/python.js";
import { parseJavaScriptImports } from "../parsers/javascript.js";
import { extractCodeBlocks } from "../extract-blocks.js";

describe("Python import parser", () => {
  it("parses simple imports", () => {
    const code = `from langchain_anthropic import ChatAnthropic`;
    const imports = parsePythonImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].packageName).toBe("langchain_anthropic");
    expect(imports[0].symbols).toEqual(["ChatAnthropic"]);
  });

  it("parses multiple imports on one line", () => {
    const code = `from langchain_core.messages import HumanMessage, AIMessage, SystemMessage`;
    const imports = parsePythonImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].packageName).toBe("langchain_core.messages");
    expect(imports[0].symbols).toEqual(["HumanMessage", "AIMessage", "SystemMessage"]);
  });

  it("parses multi-line imports with parentheses", () => {
    const code = `from langchain_core.messages import (
    HumanMessage,
    AIMessage,
    SystemMessage,
)`;
    const imports = parsePythonImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].symbols).toContain("HumanMessage");
    expect(imports[0].symbols).toContain("AIMessage");
    expect(imports[0].symbols).toContain("SystemMessage");
  });

  it("extracts original name from aliased imports", () => {
    const code = `from langchain_anthropic import ChatAnthropic as Anthropic`;
    const imports = parsePythonImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].symbols).toEqual(["ChatAnthropic"]);
  });

  it("ignores relative imports", () => {
    const code = `from .utils import helper
from langchain_core import BaseMessage`;
    const imports = parsePythonImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].packageName).toBe("langchain_core");
  });
});

describe("JavaScript import parser", () => {
  it("parses named imports", () => {
    const code = `import { ChatAnthropic } from "@langchain/anthropic";`;
    const imports = parseJavaScriptImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].packageName).toBe("@langchain/anthropic");
    expect(imports[0].namedImports).toEqual(["ChatAnthropic"]);
  });

  it("parses multiple named imports", () => {
    const code = `import { HumanMessage, AIMessage } from "@langchain/core/messages";`;
    const imports = parseJavaScriptImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toEqual(["HumanMessage", "AIMessage"]);
  });

  it("parses default imports", () => {
    const code = `import ChatOpenAI from "@langchain/openai";`;
    const imports = parseJavaScriptImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].defaultImport).toBe("ChatOpenAI");
  });

  it("parses type imports", () => {
    const code = `import type { BaseMessage } from "@langchain/core/messages";`;
    const imports = parseJavaScriptImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].isTypeImport).toBe(true);
    expect(imports[0].namedImports).toEqual(["BaseMessage"]);
  });

  it("extracts original name from renamed imports", () => {
    const code = `import { ChatAnthropic as Anthropic } from "@langchain/anthropic";`;
    const imports = parseJavaScriptImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].namedImports).toEqual(["ChatAnthropic"]);
  });

  it("ignores relative imports", () => {
    const code = `import { helper } from "./utils";
import { ChatAnthropic } from "@langchain/anthropic";`;
    const imports = parseJavaScriptImports(code);

    expect(imports).toHaveLength(1);
    expect(imports[0].packageName).toBe("@langchain/anthropic");
  });
});

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
});
