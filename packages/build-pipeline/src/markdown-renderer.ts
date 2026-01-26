/**
 * Markdown Renderer for Build Pipeline
 *
 * Pre-renders markdown content to HTML at build time.
 * This eliminates expensive runtime Shiki processing.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import { processMkDocsContent, postProcessAdmonitions } from "@langchain/markdown-utils";

/**
 * Get or create the markdown processor with Shiki.
 * Caches the processor to avoid repeated Shiki initialization.
 */
async function getProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeShiki, {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    })
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/**
 * Simple processor without Shiki for content that doesn't need syntax highlighting.
 */
function getSimpleProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true });
}

/**
 * Check if content has code blocks that need syntax highlighting.
 */
function hasCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```/.test(content);
}

/**
 * Dedent content that may have inconsistent indentation from docstrings.
 *
 * Python docstrings often have the first line with no indent but subsequent
 * lines indented. This causes markdown parsers to treat indented content as
 * code blocks (4+ spaces = preformatted code in markdown).
 *
 * This function also handles docstrings with section headers (like "Setup:")
 * where the content after the header is further indented. We need to ensure
 * fenced code blocks start at column 0 to be recognized by the markdown parser.
 */
function dedentContent(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  if (lines.length <= 1) {
    return content.trim();
  }

  // Find the first non-empty line
  let firstLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      firstLineIdx = i;
      break;
    }
  }

  const firstLine = lines[firstLineIdx];
  const firstLineIndent = firstLine.length - firstLine.trimStart().length;

  // Find minimum indentation of subsequent non-empty lines
  let minIndent = Infinity;
  for (let i = firstLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim()) {
      const indent = line.length - line.trimStart().length;
      minIndent = Math.min(minIndent, indent);
    }
  }

  // If first line has no indent but subsequent lines do, dedent subsequent lines
  if (firstLineIndent === 0 && minIndent !== Infinity && minIndent > 0) {
    const dedentedLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i <= firstLineIdx) {
        dedentedLines.push(line);
      } else if (line.trim()) {
        // Remove the common indentation
        dedentedLines.push(line.length >= minIndent ? line.slice(minIndent) : line.trimStart());
      } else {
        dedentedLines.push(line);
      }
    }
    // After initial dedent, normalize fenced code blocks
    return normalizeFencedCodeBlocks(dedentedLines.join("\n"));
  }

  // Standard case: find common indent across all non-empty lines
  minIndent = Infinity;
  for (const line of lines) {
    if (line.trim()) {
      const indent = line.length - line.trimStart().length;
      minIndent = Math.min(minIndent, indent);
    }
  }

  if (minIndent === Infinity || minIndent === 0) {
    // Even with no common indent, we may have indented code blocks
    return normalizeFencedCodeBlocks(content);
  }

  // Remove common indentation from all lines
  const dedentedLines = lines.map((line) => {
    if (line.trim()) {
      return line.slice(minIndent);
    }
    return line;
  });

  return normalizeFencedCodeBlocks(dedentedLines.join("\n"));
}

/**
 * Normalize fenced code blocks to ensure they're properly recognized by markdown.
 *
 * Handles the case where fenced code blocks are indented (e.g., under section headers
 * in docstrings). If a fenced code block is indented, markdown treats it as an
 * indented code block and shows the ``` markers literally.
 *
 * This function:
 * 1. Detects indented fenced code blocks
 * 2. Removes the indentation from the fence markers and content
 * 3. Also dedents the paragraph text before the code block (which has the same indent)
 */
function normalizeFencedCodeBlocks(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const result: string[] = [];

  // Track sections: content between section headers gets special handling
  // A section header is a line ending with : that's followed by indented content
  let inFencedBlock = false;
  let fenceIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect fenced code block start (may be indented)
    if (!inFencedBlock && /^(`{3,}|~{3,})/.test(trimmed)) {
      inFencedBlock = true;
      fenceIndent = line.length - line.trimStart().length;

      // If the code block is indented, we need to also dedent preceding content
      // that has the same indentation level (it's part of the same "section")
      if (fenceIndent > 0) {
        // Look back and dedent any content with the same indentation
        const dedentedPreceding = dedentPrecedingContent(result, fenceIndent);
        result.length = 0;
        result.push(...dedentedPreceding);
      }

      // Output fence at column 0
      result.push(trimmed);
      continue;
    }

    // Detect fenced code block end
    if (inFencedBlock && /^(`{3,}|~{3,})$/.test(trimmed)) {
      inFencedBlock = false;
      // Output fence at column 0
      result.push(trimmed);
      continue;
    }

    // Inside fenced block: remove the fence's indentation from content
    if (inFencedBlock) {
      if (line.length >= fenceIndent) {
        result.push(line.slice(fenceIndent));
      } else {
        result.push(line.trimStart());
      }
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Dedent content preceding a code block that shares its indentation level.
 * This handles the case where both explanatory text and code blocks are
 * indented under a section header.
 */
function dedentPrecedingContent(lines: string[], indent: number): string[] {
  if (indent === 0) return lines;

  const result: string[] = [];

  // Process lines in reverse to find where the indented section starts
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      result.unshift(line);
      continue;
    }

    const lineIndent = line.length - line.trimStart().length;

    // Stop when we hit a section header or content with less indentation
    if (lineIndent < indent) {
      // This line and everything before it keeps original indentation
      result.unshift(...lines.slice(0, i + 1));
      break;
    }

    // This line is part of the indented section - dedent it
    if (lineIndent >= indent) {
      result.unshift(line.slice(indent));
    } else {
      result.unshift(line);
    }
  }

  return result;
}

/**
 * Render markdown content to HTML.
 *
 * Uses Shiki for syntax highlighting if code blocks are present,
 * otherwise uses a simpler/faster processor.
 *
 * Handles MkDocs admonition syntax (!!!, ???, ???+).
 *
 * @param content - Raw markdown content
 * @returns HTML string
 */
export async function renderMarkdown(content: string): Promise<string> {
  if (!content || !content.trim()) {
    return "";
  }

  // Dedent content and process MkDocs admonitions
  const dedented = dedentContent(content);
  const processedContent = processMkDocsContent(dedented);

  // Use simpler processor for content without code blocks
  const needsShiki = hasCodeBlocks(processedContent);

  try {
    let html: string;
    if (needsShiki) {
      const processor = await getProcessor();
      const result = await processor.process(processedContent);
      html = String(result);
    } else {
      const processor = getSimpleProcessor();
      const result = await processor.process(processedContent);
      html = String(result);
    }

    // Post-process to convert admonition markers to proper HTML
    return postProcessAdmonitions(html);
  } catch (error) {
    console.error("[markdown-renderer] Error rendering markdown:", error);
    // Fallback: return escaped content
    return `<p>${escapeHtml(content)}</p>`;
  }
}

/**
 * Render multiple markdown strings in parallel with concurrency limit.
 * Useful for batch processing symbol summaries.
 *
 * @param contents - Array of markdown strings
 * @param concurrency - Maximum concurrent renders (default: 10)
 * @returns Array of HTML strings (same order as input)
 */
export async function renderMarkdownBatch(contents: string[], concurrency = 10): Promise<string[]> {
  const results: string[] = Array.from({ length: contents.length });

  // Process in batches to control concurrency
  for (let i = 0; i < contents.length; i += concurrency) {
    const batch = contents.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((content) => renderMarkdown(content)));

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}

/**
 * Escape HTML entities.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
