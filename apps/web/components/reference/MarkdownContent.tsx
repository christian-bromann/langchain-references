// oxlint-disable no-console
/**
 * Markdown Content Component
 *
 * Renders markdown content with syntax-highlighted code blocks using Shiki.
 * Styled to match Mintlify's documentation design.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import rehypeSlug from "rehype-slug";
import { createHighlighter, type Highlighter } from "shiki";
import rehypeStringify from "rehype-stringify";
import { MarkdownWrapper } from "./MarkdownWrapper";
import { convertAdmonitions, postProcessAdmonitions } from "@langchain/markdown-utils";

// Cached highlighter instance - created once, reused across all calls
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Get or create the singleton Shiki highlighter with only the languages we need.
 * This is much faster than loading all 200+ languages.
 */
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: ["typescript", "javascript", "python", "java", "go", "bash", "json", "yaml", "text"],
    });
  }
  return highlighterPromise;
}

interface MarkdownContentProps {
  children: string;
  className?: string;
  /** Use compact styling for inline/small contexts */
  compact?: boolean;
  /** Classes to add directly to all <p> tags in the rendered markdown */
  paragraphClassName?: string;
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
 * Process MkDocs Material syntax in markdown content.
 * Converts admonitions to styled HTML and handles other MkDocs-specific syntax.
 *
 * Note: Uses local dedentContent for Python docstring handling,
 * and shared convertAdmonitions from @langchain/markdown-utils.
 */
function processMkDocsContent(content: string): string {
  if (!content) return content;

  // First, dedent the content to handle docstring indentation
  // This prevents markdown from treating indented content as code blocks
  let processed = dedentContent(content);

  // Convert MkDocs admonitions to styled HTML
  processed = convertAdmonitions(processed);

  // Clean up multiple blank lines
  processed = processed.replace(/\n{3,}/g, "\n\n");

  return processed.trim();
}

/**
 * Check if content has fenced code blocks that need syntax highlighting.
 * This allows us to skip the expensive Shiki processor for plain text.
 */
function hasCodeBlocks(content: string): boolean {
  // Match fenced code blocks: ``` or ~~~
  return /^(```|~~~)/m.test(content);
}

/**
 * Process markdown to HTML with Shiki syntax highlighting.
 * Optimized to skip Shiki when no code blocks are present.
 */
async function processMarkdown(content: string, paragraphClassName?: string): Promise<string> {
  // Process MkDocs syntax (convert admonitions, dedent, etc.)
  const processedContent = processMkDocsContent(content);

  // Optimization: Skip expensive Shiki processing when there are no code blocks
  const needsShiki = hasCodeBlocks(processedContent);

  let result;
  if (needsShiki) {
    // Get our cached highlighter with only the languages we need
    const highlighter = await getHighlighter();

    // Full pipeline with syntax highlighting
    result = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeSlug) // Add IDs to headings for anchor links
      .use(rehypeShikiFromHighlighter, highlighter, {
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(processedContent);
  } else {
    // Fast path: No code blocks, skip Shiki entirely
    result = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeSlug) // Add IDs to headings for anchor links
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(processedContent);
  }

  // Post-process to catch any admonitions that ended up in <p> tags
  let html = postProcessAdmonitions(String(result));

  // Add classes to paragraph tags if specified
  if (paragraphClassName) {
    html = html.replace(/<p>/g, `<p class="${paragraphClassName}">`);
    html = html.replace(/<p class="([^"]*)">/g, (match, existingClasses) => {
      // Don't double-add if already has our classes
      if (existingClasses.includes(paragraphClassName)) return match;
      return `<p class="${existingClasses} ${paragraphClassName}">`;
    });
  }

  return html;
}

// Track markdown processing stats for performance analysis
let markdownCallCount = 0;
let markdownTotalTime = 0;

/**
 * Renders markdown content with syntax highlighting for code blocks.
 * Uses Mintlify-inspired styling with the same Shiki themes as CodeBlock.
 *
 * This is an async server component.
 */
export async function MarkdownContent({
  children,
  className = "",
  compact = false,
  paragraphClassName,
}: MarkdownContentProps) {
  const start = Date.now();
  const html = await processMarkdown(children, paragraphClassName);
  const elapsed = Date.now() - start;

  markdownCallCount++;
  markdownTotalTime += elapsed;

  // Log every 50 calls to show progress without flooding
  if (markdownCallCount % 50 === 0) {
    console.log(
      `[MarkdownContent] ${markdownCallCount} calls, total: ${markdownTotalTime}ms, avg: ${(markdownTotalTime / markdownCallCount).toFixed(1)}ms`,
    );
  }

  return (
    <MarkdownWrapper html={html} rawContent={children} className={className} compact={compact} />
  );
}
