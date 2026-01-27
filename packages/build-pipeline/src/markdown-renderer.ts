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

  // Process MkDocs content (handles dedenting, admonitions, and code block normalization)
  const processedContent = processMkDocsContent(content);

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
