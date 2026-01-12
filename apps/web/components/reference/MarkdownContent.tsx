/**
 * Markdown Content Component
 *
 * Renders markdown content with syntax-highlighted code blocks using Shiki.
 * Styled to match Mintlify's documentation design.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import { MarkdownWrapper } from "./MarkdownWrapper";

interface MarkdownContentProps {
  children: string;
  className?: string;
  /** Use compact styling for inline/small contexts */
  compact?: boolean;
}

/**
 * Clean MkDocs Material admonition syntax from markdown content.
 * This is a frontend safety net for content that may contain admonitions.
 */
function cleanMkDocsContent(content: string): string {
  if (!content) return content;

  // Remove MkDocs admonition openers: ???+ example "Title", !!! note "Title", etc.
  let cleaned = content.replace(/^[?!]{3}\+?\s*\w+(?:\s+"[^"]*")?\s*$/gm, "");

  // Remove trailing closing markers for collapsible admonitions
  cleaned = cleaned.replace(/^[?!]{3}\s*$/gm, "");

  // Clean up multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Process markdown to HTML with Shiki syntax highlighting.
 */
async function processMarkdown(content: string): Promise<string> {
  // Clean MkDocs syntax before processing
  const cleanedContent = cleanMkDocsContent(content);

  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeShiki, {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    })
    .use(rehypeStringify)
    .process(cleanedContent);

  return String(result);
}

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
}: MarkdownContentProps) {
  const html = await processMarkdown(children);

  return (
    <MarkdownWrapper
      html={html}
      rawContent={children}
      className={className}
      compact={compact}
    />
  );
}
