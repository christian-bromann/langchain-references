/**
 * Tests for related docs builder
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { buildRelatedDocs } from "../related-docs-builder.js";

describe("Related Docs Builder", () => {
  let tempDir: string;
  let mockDocsDir: string;
  let mockConfigsDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "related-docs-test-"));
    mockDocsDir = path.join(tempDir, "docs-repo", "docs");
    mockConfigsDir = path.join(tempDir, "configs");
    await fs.mkdir(mockDocsDir, { recursive: true });
    await fs.mkdir(mockConfigsDir, { recursive: true });

    // Initialize a mock git repo
    const gitDir = path.join(tempDir, "docs-repo", ".git");
    await fs.mkdir(gitDir, { recursive: true });
    await fs.writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main");
    await fs.mkdir(path.join(gitDir, "refs", "heads"), { recursive: true });
    await fs.writeFile(
      path.join(gitDir, "refs", "heads", "main"),
      "abc123def456789012345678901234567890abcd",
    );

    // Create mock config files with package names
    const pythonConfig = {
      project: "test",
      language: "python",
      packages: [
        { name: "langchain_anthropic" },
        { name: "langchain_core" },
        { name: "langchain_openai" },
      ],
    };
    const typescriptConfig = {
      project: "test",
      language: "typescript",
      packages: [
        { name: "@langchain/openai" },
        { name: "@langchain/core" },
        { name: "@langchain/anthropic" },
      ],
    };
    await fs.writeFile(
      path.join(mockConfigsDir, "test-python.json"),
      JSON.stringify(pythonConfig, null, 2),
    );
    await fs.writeFile(
      path.join(mockConfigsDir, "test-typescript.json"),
      JSON.stringify(typescriptConfig, null, 2),
    );
  });

  afterEach(async () => {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("generates related docs map from sample markdown files", async () => {
    // Create sample markdown file with Python imports
    const sampleMd = `---
title: Getting Started
description: Learn how to get started with LangChain
---

# Getting Started

## Installation

Install the package:

\`\`\`bash
pip install langchain-anthropic
\`\`\`

## Basic Usage

\`\`\`python
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic()
response = model.invoke("Hello!")
\`\`\`
`;

    await fs.writeFile(path.join(mockDocsDir, "getting-started.md"), sampleMd);

    const outputDir = path.join(tempDir, "output");
    const result = await buildRelatedDocs({
      docsRepoPath: path.join(tempDir, "docs-repo"),
      packageId: "pkg_py_langchain_anthropic",
      outputDir,
      language: "python",
      configsDir: mockConfigsDir,
    });

    expect(result.outputPath).toContain("related-docs.json");
    expect(result.symbolCount).toBeGreaterThanOrEqual(1);

    // Verify the output file exists
    const outputContent = await fs.readFile(result.outputPath, "utf-8");
    const relatedDocs = JSON.parse(outputContent);

    expect(relatedDocs.packageId).toBe("pkg_py_langchain_anthropic");
    expect(relatedDocs.symbols.ChatAnthropic).toBeDefined();
    expect(relatedDocs.symbols.ChatAnthropic.entries.length).toBeGreaterThanOrEqual(1);
  });

  it("enforces 20-link limit per symbol", async () => {
    // Create 25 markdown files all importing the same symbol
    for (let i = 0; i < 25; i++) {
      const mdContent = `---
title: Tutorial ${i}
---

# Tutorial ${i}

\`\`\`python
from langchain_core.messages import HumanMessage

msg = HumanMessage(content="Hello ${i}")
\`\`\`
`;
      await fs.writeFile(path.join(mockDocsDir, `tutorial-${i}.md`), mdContent);
    }

    const outputDir = path.join(tempDir, "output");
    const result = await buildRelatedDocs({
      docsRepoPath: path.join(tempDir, "docs-repo"),
      packageId: "pkg_py_langchain_core",
      outputDir,
      language: "python",
      configsDir: mockConfigsDir,
    });

    const outputContent = await fs.readFile(result.outputPath, "utf-8");
    const relatedDocs = JSON.parse(outputContent);

    // Should have HumanMessage symbol
    expect(relatedDocs.symbols.HumanMessage).toBeDefined();
    // Should be limited to 20 entries
    expect(relatedDocs.symbols.HumanMessage.entries.length).toBeLessThanOrEqual(20);
    // But totalCount should reflect the actual number
    expect(relatedDocs.symbols.HumanMessage.totalCount).toBe(25);
  });

  it("generates valid JSON output structure", async () => {
    const sampleMd = `---
title: Test Page
---

\`\`\`typescript
import { ChatOpenAI } from "@langchain/openai";
\`\`\`
`;

    await fs.writeFile(path.join(mockDocsDir, "test.md"), sampleMd);

    const outputDir = path.join(tempDir, "output");
    const result = await buildRelatedDocs({
      docsRepoPath: path.join(tempDir, "docs-repo"),
      packageId: "pkg_js_langchain_openai",
      outputDir,
      language: "javascript",
      configsDir: mockConfigsDir,
    });

    const outputContent = await fs.readFile(result.outputPath, "utf-8");
    const relatedDocs = JSON.parse(outputContent);

    // Verify JSON structure
    expect(relatedDocs).toHaveProperty("packageId");
    expect(relatedDocs).toHaveProperty("generatedAt");
    expect(relatedDocs).toHaveProperty("docsRepoSha");
    expect(relatedDocs).toHaveProperty("symbols");
    expect(typeof relatedDocs.generatedAt).toBe("string");
  });

  it("handles empty docs directory gracefully", async () => {
    const outputDir = path.join(tempDir, "output");
    const result = await buildRelatedDocs({
      docsRepoPath: path.join(tempDir, "docs-repo"),
      packageId: "pkg_py_langchain_core",
      outputDir,
      language: "python",
      configsDir: mockConfigsDir,
    });

    expect(result.symbolCount).toBe(0);
    expect(result.entryCount).toBe(0);

    // Should still create a valid JSON file
    const outputContent = await fs.readFile(result.outputPath, "utf-8");
    const relatedDocs = JSON.parse(outputContent);
    expect(relatedDocs.symbols).toEqual({});
  });
});
