/**
 * Tests for section and metadata extraction from markdown files
 */

import { describe, it, expect } from "vitest";
import {
  slugifyHeading,
  extractSections,
  parsePageMetadata,
  filePathToUrlPath,
  findContainingSection,
} from "../extract-sections.js";

describe("slugifyHeading", () => {
  it("converts spaces to hyphens", () => {
    expect(slugifyHeading("Hello World")).toBe("hello-world");
  });

  it("lowercases text", () => {
    expect(slugifyHeading("Getting Started")).toBe("getting-started");
  });

  it("removes special characters", () => {
    expect(slugifyHeading("What's New?")).toBe("whats-new");
  });

  it("handles multiple spaces", () => {
    expect(slugifyHeading("Hello   World")).toBe("hello-world");
  });

  it("removes leading/trailing hyphens", () => {
    expect(slugifyHeading(" Hello ")).toBe("hello");
  });
});

describe("extractSections", () => {
  it("extracts ATX-style headings", () => {
    const content = `
# Main Title
Some text
## Section One
More text
### Subsection
`;
    const sections = extractSections(content);

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe("Main Title");
    expect(sections[0].level).toBe(1);
    expect(sections[1].title).toBe("Section One");
    expect(sections[1].level).toBe(2);
    expect(sections[2].title).toBe("Subsection");
    expect(sections[2].level).toBe(3);
  });

  it("generates correct anchors", () => {
    const content = `
## Getting Started
## API Reference
`;
    const sections = extractSections(content);

    expect(sections[0].anchor).toBe("getting-started");
    expect(sections[1].anchor).toBe("api-reference");
  });

  it("tracks line numbers", () => {
    const content = `Line 1
# Title
Line 3`;
    const sections = extractSections(content);

    expect(sections[0].startLine).toBe(2);
  });

  it("returns empty array for content without headings", () => {
    const sections = extractSections("Just some text.");
    expect(sections).toHaveLength(0);
  });
});

describe("filePathToUrlPath", () => {
  describe("basic transformations", () => {
    it("removes .md extension", () => {
      expect(filePathToUrlPath("docs/guide.md")).toBe("/docs/guide");
    });

    it("removes .mdx extension", () => {
      expect(filePathToUrlPath("docs/guide.mdx")).toBe("/docs/guide");
    });

    it("removes src/ prefix", () => {
      expect(filePathToUrlPath("src/docs/guide.md")).toBe("/docs/guide");
    });

    it("removes /index from the end", () => {
      expect(filePathToUrlPath("docs/guide/index.md")).toBe("/docs/guide");
    });

    it("adds leading slash", () => {
      expect(filePathToUrlPath("docs/guide.md")).toBe("/docs/guide");
    });

    it("preserves leading slash if present", () => {
      expect(filePathToUrlPath("/docs/guide.md")).toBe("/docs/guide");
    });
  });

  describe("Python language routing (default)", () => {
    it("adds /python/ prefix for oss/langchain paths", () => {
      expect(filePathToUrlPath("oss/langchain/agents.mdx")).toBe("/oss/python/langchain/agents");
    });

    it("adds /python/ prefix for oss/langgraph paths", () => {
      expect(filePathToUrlPath("oss/langgraph/overview.mdx")).toBe(
        "/oss/python/langgraph/overview",
      );
    });

    it("adds /python/ prefix for oss/deepagents paths", () => {
      expect(filePathToUrlPath("oss/deepagents/middleware.mdx")).toBe(
        "/oss/python/deepagents/middleware",
      );
    });

    it("adds /python/ prefix when language is explicitly python", () => {
      expect(filePathToUrlPath("oss/langchain/agents.mdx", "python")).toBe(
        "/oss/python/langchain/agents",
      );
    });
  });

  describe("JavaScript language routing", () => {
    it("adds /javascript/ prefix for oss/langchain paths", () => {
      expect(filePathToUrlPath("oss/langchain/agents.mdx", "javascript")).toBe(
        "/oss/javascript/langchain/agents",
      );
    });

    it("adds /javascript/ prefix for oss/langgraph paths", () => {
      expect(filePathToUrlPath("oss/langgraph/overview.mdx", "javascript")).toBe(
        "/oss/javascript/langgraph/overview",
      );
    });

    it("adds /javascript/ prefix for oss/deepagents paths", () => {
      expect(filePathToUrlPath("oss/deepagents/middleware.mdx", "javascript")).toBe(
        "/oss/javascript/deepagents/middleware",
      );
    });

    it("handles nested deepagents paths", () => {
      expect(filePathToUrlPath("oss/deepagents/backends/openai.mdx", "javascript")).toBe(
        "/oss/javascript/deepagents/backends/openai",
      );
    });
  });

  describe("paths that already have language prefix", () => {
    it("does not double-prefix oss/python/integrations paths", () => {
      expect(filePathToUrlPath("oss/python/integrations/openai.mdx")).toBe(
        "/oss/python/integrations/openai",
      );
    });

    it("does not double-prefix oss/javascript paths", () => {
      expect(filePathToUrlPath("oss/javascript/integrations/openai.mdx")).toBe(
        "/oss/javascript/integrations/openai",
      );
    });
  });

  describe("paths without language routing", () => {
    it("does not add prefix for non-oss paths", () => {
      expect(filePathToUrlPath("docs/tutorials/chatbot.mdx")).toBe("/docs/tutorials/chatbot");
    });

    it("does not add prefix for other oss paths", () => {
      expect(filePathToUrlPath("oss/other/guide.mdx")).toBe("/oss/other/guide");
    });
  });

  describe("edge cases", () => {
    it("handles oss/langchain root path", () => {
      expect(filePathToUrlPath("oss/langchain.mdx")).toBe("/oss/python/langchain");
    });

    it("handles oss/langgraph root path", () => {
      expect(filePathToUrlPath("oss/langgraph.mdx")).toBe("/oss/python/langgraph");
    });

    it("handles oss/deepagents root path", () => {
      expect(filePathToUrlPath("oss/deepagents.mdx")).toBe("/oss/python/deepagents");
    });

    it("handles deeply nested paths", () => {
      expect(filePathToUrlPath("oss/langchain/modules/agents/tools/custom.mdx", "javascript")).toBe(
        "/oss/javascript/langchain/modules/agents/tools/custom",
      );
    });
  });
});

describe("parsePageMetadata", () => {
  it("extracts title from frontmatter", () => {
    const content = `---
title: My Page Title
---

# Heading
`;
    const metadata = parsePageMetadata(content, "docs/page.md");

    expect(metadata.title).toBe("My Page Title");
  });

  it("falls back to first heading if no frontmatter title", () => {
    const content = `# First Heading

Some text.
`;
    const metadata = parsePageMetadata(content, "docs/page.md");

    expect(metadata.title).toBe("First Heading");
  });

  it("extracts description from frontmatter", () => {
    const content = `---
title: My Page
description: This is a description.
---
`;
    const metadata = parsePageMetadata(content, "docs/page.md");

    expect(metadata.description).toBe("This is a description.");
  });

  it("generates correct URL path", () => {
    const content = `# Title`;
    const metadata = parsePageMetadata(content, "oss/langchain/agents.mdx");

    expect(metadata.urlPath).toBe("/oss/python/langchain/agents");
  });

  it("extracts sections", () => {
    const content = `---
title: Guide
---

## Introduction
Text

## Setup
More text
`;
    const metadata = parsePageMetadata(content, "docs/guide.md");

    expect(metadata.sections).toHaveLength(2);
    expect(metadata.sections[0].title).toBe("Introduction");
    expect(metadata.sections[1].title).toBe("Setup");
  });

  it("returns 'Untitled' when no title available", () => {
    const content = `Just some text without headings.`;
    const metadata = parsePageMetadata(content, "docs/page.md");

    expect(metadata.title).toBe("Untitled");
  });
});

describe("findContainingSection", () => {
  const sections = [
    { title: "Intro", anchor: "intro", level: 2, startLine: 5 },
    { title: "Setup", anchor: "setup", level: 2, startLine: 20 },
    { title: "Usage", anchor: "usage", level: 2, startLine: 50 },
  ];

  it("finds section containing a line", () => {
    const section = findContainingSection(sections, 25);
    expect(section?.anchor).toBe("setup");
  });

  it("returns first section for lines before any section", () => {
    const section = findContainingSection(sections, 3);
    expect(section).toBeUndefined();
  });

  it("returns last section for lines after last section", () => {
    const section = findContainingSection(sections, 100);
    expect(section?.anchor).toBe("usage");
  });

  it("returns section at exact start line", () => {
    const section = findContainingSection(sections, 20);
    expect(section?.anchor).toBe("setup");
  });

  it("returns undefined for empty sections array", () => {
    const section = findContainingSection([], 10);
    expect(section).toBeUndefined();
  });
});
