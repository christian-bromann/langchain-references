/**
 * Code block extraction from markdown files
 */

import type { CodeBlock } from "./types.js";

/**
 * Language patterns for Python code blocks
 */
const PYTHON_LANGUAGES = ["python", "py"];

/**
 * Language patterns for JavaScript/TypeScript code blocks
 */
const JAVASCRIPT_LANGUAGES = ["javascript", "typescript", "js", "ts", "jsx", "tsx"];

/**
 * Extract fenced code blocks from markdown content.
 *
 * @param content - The markdown content
 * @param filterLanguage - Optional language filter ("python" or "javascript")
 * @returns Array of extracted code blocks
 */
export function extractCodeBlocks(
  content: string,
  filterLanguage?: "python" | "javascript",
): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  // Match fenced code blocks: ```lang\n...\n```
  // Captures: language tag, content, and tracks line numbers
  const lines = content.split("\n");
  let inCodeBlock = false;
  let currentLanguage = "";
  let currentContent: string[] = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inCodeBlock) {
      // Check for opening fence
      const openMatch = line.match(/^```(\w+)?/);
      if (openMatch) {
        inCodeBlock = true;
        currentLanguage = openMatch[1]?.toLowerCase() || "";
        currentContent = [];
        startLine = i + 1; // 1-indexed
      }
    } else {
      // Check for closing fence
      if (line.match(/^```\s*$/)) {
        // Apply language filter
        const isPython = PYTHON_LANGUAGES.includes(currentLanguage);
        const isJavaScript = JAVASCRIPT_LANGUAGES.includes(currentLanguage);

        let include = true;
        if (filterLanguage === "python" && !isPython) {
          include = false;
        } else if (filterLanguage === "javascript" && !isJavaScript) {
          include = false;
        }

        if (include && currentContent.length > 0) {
          blocks.push({
            content: currentContent.join("\n"),
            language: currentLanguage,
            startLine,
          });
        }

        inCodeBlock = false;
        currentLanguage = "";
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
  }

  return blocks;
}

/**
 * Check if a language tag represents Python code.
 */
export function isPythonLanguage(lang: string): boolean {
  return PYTHON_LANGUAGES.includes(lang.toLowerCase());
}

/**
 * Check if a language tag represents JavaScript/TypeScript code.
 */
export function isJavaScriptLanguage(lang: string): boolean {
  return JAVASCRIPT_LANGUAGES.includes(lang.toLowerCase());
}
