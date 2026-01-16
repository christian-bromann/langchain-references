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
 * Dedent content that may have inconsistent indentation from docstrings.
 *
 * Python docstrings often have the first line with no indent but subsequent
 * lines indented. This causes markdown parsers to treat indented content as
 * code blocks (4+ spaces = preformatted code in markdown).
 */
function dedentContent(content: string): string {
  if (!content) return content;

  const lines = content.split('\n');
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
    return dedentedLines.join('\n');
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
    return content;
  }

  // Remove common indentation from all lines
  const dedentedLines = lines.map(line => {
    if (line.trim()) {
      return line.slice(minIndent);
    }
    return line;
  });

  return dedentedLines.join('\n');
}

/**
 * Inline SVG icons for admonitions (Mintlify style, filled icons)
 * Using inline SVGs since this is a server component that generates HTML strings.
 */
const ADMONITION_ICON_SVGS = {
  // Note icon - filled circle with "i" (Mintlify style)
  note: '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7 1.3C10.14 1.3 12.7 3.86 12.7 7C12.7 10.14 10.14 12.7 7 12.7C5.48908 12.6974 4.0408 12.096 2.97241 11.0276C1.90403 9.9592 1.30264 8.51092 1.3 7C1.3 3.86 3.86 1.3 7 1.3ZM7 0C3.14 0 0 3.14 0 7C0 10.86 3.14 14 7 14C10.86 14 14 10.86 14 7C14 3.14 10.86 0 7 0ZM8 3H6V8H8V3ZM8 9H6V11H8V9Z"/></svg>',
  // Info icon - circle with "i" (detailed Mintlify style)
  info: '<svg viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M8 0C3.58125 0 0 3.58125 0 8C0 12.4187 3.58125 16 8 16C12.4187 16 16 12.4187 16 8C16 3.58125 12.4187 0 8 0ZM8 14.5C4.41563 14.5 1.5 11.5841 1.5 8C1.5 4.41594 4.41563 1.5 8 1.5C11.5844 1.5 14.5 4.41594 14.5 8C14.5 11.5841 11.5844 14.5 8 14.5ZM9.25 10.5H8.75V7.75C8.75 7.3375 8.41563 7 8 7H7C6.5875 7 6.25 7.3375 6.25 7.75C6.25 8.1625 6.5875 8.5 7 8.5H7.25V10.5H6.75C6.3375 10.5 6 10.8375 6 11.25C6 11.6625 6.3375 12 6.75 12H9.25C9.66406 12 10 11.6641 10 11.25C10 10.8359 9.66563 10.5 9.25 10.5ZM8 6C8.55219 6 9 5.55219 9 5C9 4.44781 8.55219 4 8 4C7.44781 4 7 4.44687 7 5C7 5.55313 7.44687 6 8 6Z"/></svg>',
  // Tip icon - lightbulb (Mintlify style)
  tip: '<svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3.12794 12.4232C3.12794 12.5954 3.1776 12.7634 3.27244 12.907L3.74114 13.6095C3.88471 13.8248 4.21067 14 4.46964 14H6.15606C6.41415 14 6.74017 13.825 6.88373 13.6095L7.3508 12.9073C7.43114 12.7859 7.49705 12.569 7.49705 12.4232L7.50055 11.3513H3.12521L3.12794 12.4232ZM5.31288 0C2.52414 0.00875889 0.5 2.26889 0.5 4.78826C0.5 6.00188 0.949566 7.10829 1.69119 7.95492C2.14321 8.47011 2.84901 9.54727 3.11919 10.4557C3.12005 10.4625 3.12175 10.4698 3.12261 10.4771H7.50342C7.50427 10.4698 7.50598 10.463 7.50684 10.4557C7.77688 9.54727 8.48281 8.47011 8.93484 7.95492C9.67728 7.13181 10.1258 6.02703 10.1258 4.78826C10.1258 2.15486 7.9709 0.000106649 5.31288 0ZM7.94902 7.11267C7.52078 7.60079 6.99082 8.37878 6.6077 9.18794H4.02051C3.63739 8.37878 3.10743 7.60079 2.67947 7.11294C2.11997 6.47551 1.8126 5.63599 1.8126 4.78826C1.8126 3.09829 3.12794 1.31944 5.28827 1.3126C7.2435 1.3126 8.81315 2.88226 8.81315 4.78826C8.81315 5.63599 8.50688 6.47551 7.94902 7.11267ZM4.87534 2.18767C3.66939 2.18767 2.68767 3.16939 2.68767 4.37534C2.68767 4.61719 2.88336 4.81288 3.12521 4.81288C3.36705 4.81288 3.56274 4.61599 3.56274 4.37534C3.56274 3.6515 4.1515 3.06274 4.87534 3.06274C5.11719 3.06274 5.31288 2.86727 5.31288 2.62548C5.31288 2.38369 5.11599 2.18767 4.87534 2.18767Z"/></svg>',
  // Warning icon - triangle (Mintlify style, stroke-based)
  warning: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
  // Danger icon - hexagon with exclamation (Mintlify style)
  danger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" height="14" width="14" fill="currentColor"><path d="M17.1 292c-12.9-22.3-12.9-49.7 0-72L105.4 67.1c12.9-22.3 36.6-36 62.4-36l176.6 0c25.7 0 49.5 13.7 62.4 36L494.9 220c12.9 22.3 12.9 49.7 0 72L406.6 444.9c-12.9 22.3-36.6 36-62.4 36l-176.6 0c-25.7 0-49.5-13.7-62.4-36L17.1 292zm41.6-48c-4.3 7.4-4.3 16.6 0 24l88.3 152.9c4.3 7.4 12.2 12 20.8 12l176.6 0c8.6 0 16.5-4.6 20.8-12L453.4 268c4.3-7.4 4.3-16.6 0-24L365.1 91.1c-4.3-7.4-12.2-12-20.8-12l-176.6 0c-8.6 0-16.5 4.6-20.8 12L58.6 244zM256 128c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>',
  // Check icon - checkmark (Mintlify style)
  check: '<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="14" height="14"><path d="M438.6 105.4C451.1 117.9 451.1 138.1 438.6 150.6L182.6 406.6C170.1 419.1 149.9 419.1 137.4 406.6L9.372 278.6C-3.124 266.1-3.124 245.9 9.372 233.4C21.87 220.9 42.13 220.9 54.63 233.4L159.1 338.7L393.4 105.4C405.9 92.88 426.1 92.88 438.6 105.4H438.6z"/></svg>',
  // File text icon (for examples)
  fileText: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  // Sparkles icon (for version-added)
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>',
  // Refresh CW icon (for version-changed)
  refreshCw: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  // Pin icon (for default/custom)
  pin: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
} as const;

/**
 * Admonition type to icon mapping
 * Colors are handled via CSS using data-callout-type attribute
 */
const ADMONITION_ICONS: Record<string, string> = {
  note: ADMONITION_ICON_SVGS.note,
  tip: ADMONITION_ICON_SVGS.tip,
  warning: ADMONITION_ICON_SVGS.warning,
  danger: ADMONITION_ICON_SVGS.danger,
  example: ADMONITION_ICON_SVGS.fileText,
  info: ADMONITION_ICON_SVGS.info,
  check: ADMONITION_ICON_SVGS.check,
  'version-added': ADMONITION_ICON_SVGS.sparkles,
  'version-changed': ADMONITION_ICON_SVGS.refreshCw,
  'version-deprecated': ADMONITION_ICON_SVGS.warning,
};

const DEFAULT_ADMONITION_ICON = ADMONITION_ICON_SVGS.pin;

/**
 * Parse an admonition line and extract type, optional title, and inline content.
 * Returns null if the line is not an admonition.
 *
 * Handles syntax like:
 * - !!! note "Title"
 * - !!! warning
 * - ??? collapsible "Title"
 * - ???+ collapsible-open "Title"
 * - !!! warning Inline content without quotes (non-standard but common)
 */
function parseAdmonitionLine(line: string): { type: string; title?: string; inlineContent?: string } | null {
  const trimmed = line.trim();

  // Check if line starts with admonition marker
  if (!trimmed.startsWith('!!!') && !trimmed.startsWith('???')) {
    return null;
  }

  // Extract marker (!!!, ???, ???+)
  let markerEnd = 3;
  if (trimmed[3] === '+') {
    markerEnd = 4;
  }

  const rest = trimmed.slice(markerEnd).trim();
  if (!rest) return null;

  // Extract type (first word - alphanumeric and hyphens)
  const typeMatch = rest.match(/^([\w-]+)/);
  if (!typeMatch) return null;

  const type = typeMatch[1];
  const afterType = rest.slice(type.length).trim();

  // Extract optional title or inline content
  if (afterType) {
    // Try to match quoted title first (any quote style)
    const firstChar = afterType[0];
    // Quote characters: " ' " " ' ' `
    const quoteChars = '"\'\u201C\u201D\u2018\u2019`';

    if (quoteChars.includes(firstChar)) {
      // Also allow same quote or any closing quote
      const lastChar = afterType[afterType.length - 1];
      if (quoteChars.includes(lastChar)) {
        // Extract content between quotes as title
        const title = afterType.slice(1, -1);
        return { type, title };
      }
    }

    // If no quotes, this is inline content (non-standard but common in docstrings)
    // Use the type as the title, and the rest as inline content
    return { type, inlineContent: afterType };
  }

  return { type };
}

/**
 * Convert MkDocs admonition blocks to markdown headings with styled headers.
 *
 * We use styled headers instead of HTML wrappers so that content inside
 * (like tables) gets properly processed by the markdown parser.
 */
function convertAdmonitions(content: string): string {
  if (!content) return content;

  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const parsed = parseAdmonitionLine(line);

    if (parsed) {
      const { type, title, inlineContent } = parsed;

      // Collect admonition content (indented lines)
      const contentLines: string[] = [];

      // If there's inline content on the same line, add it first
      if (inlineContent) {
        contentLines.push(inlineContent);
      }

      i++;

      while (i < lines.length) {
        const contentLine = lines[i];
        // Check if line is indented (part of admonition) or empty
        if (contentLine.match(/^[\t ]{4}/) || contentLine.trim() === '') {
          // Remove the 4-space indent
          contentLines.push(contentLine.replace(/^[\t ]{4}/, ''));
          i++;
        } else {
          break;
        }
      }

      // Get icon for this admonition type
      const icon = ADMONITION_ICONS[type.toLowerCase()] || DEFAULT_ADMONITION_ICON;
      const displayTitle = title || type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const admonitionContent = contentLines.join('\n').trim();

      // Skip empty admonitions (content was likely stripped, e.g., code examples extracted separately)
      if (!admonitionContent) {
        continue;
      }

      // Generate Mintlify-style callout container
      // The content stays as markdown for proper parsing but we wrap with styled container
      result.push('');
      result.push(`<div class="callout" data-callout-type="${type.toLowerCase()}">`);
      result.push(`<div class="callout-icon">${icon}</div>`);
      result.push(`<div class="callout-content">`);
      result.push(`<div class="callout-title">${displayTitle}</div>`);
      result.push('');
      result.push(admonitionContent);
      result.push('');
      result.push(`</div>`);
      result.push(`</div>`);
      result.push('');
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * Process MkDocs Material syntax in markdown content.
 * Converts admonitions to styled HTML and handles other MkDocs-specific syntax.
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
 * Post-process HTML to convert any remaining admonition syntax that wasn't caught.
 * This handles edge cases where admonitions were wrapped in <p> tags before processing.
 */
function postProcessAdmonitions(html: string): string {
  // Match admonitions that ended up wrapped in <p> tags
  // Pattern: <p>!!! type "title"\ncontent...</p> or <p>!!! type content...</p>
  // The content might contain <code> tags, newlines, or other HTML
  // Quote chars: " ' " " ' ' (using unicode escapes for smart quotes)
  //
  // Use a function to handle the complex matching since we need to handle:
  // 1. Quoted title followed by optional content on subsequent lines
  // 2. Unquoted inline content (possibly multi-line)

  return html.replace(
    /<p>([!?]{3}\+?)\s+([\w-]+)([\s\S]*?)<\/p>/g,
    (match, marker, type, rest) => {
      const icon = ADMONITION_ICONS[type.toLowerCase()] || DEFAULT_ADMONITION_ICON;

      // Try to extract quoted title from the beginning of rest
      const trimmedRest = rest.trim();
      const quoteMatch = trimmedRest.match(/^["'\u201C\u201D\u2018\u2019](.*?)["'\u201C\u201D\u2018\u2019](.*)$/s);

      let displayTitle: string;
      let content: string;

      if (quoteMatch) {
        // Quoted title found
        displayTitle = quoteMatch[1];
        content = quoteMatch[2].trim();
      } else if (trimmedRest) {
        // No quoted title, treat everything as content
        displayTitle = type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        content = trimmedRest;
      } else {
        // Empty admonition - remove entirely
        return '';
      }

      // Skip if no content after extracting title
      if (!content) {
        return '';
      }

      // Render Mintlify-style callout container
      return `<div class="callout" data-callout-type="${type.toLowerCase()}"><div class="callout-icon">${icon}</div><div class="callout-content"><div class="callout-title">${displayTitle}</div><p>${content}</p></div></div>`;
    }
  );
}

/**
 * Process markdown to HTML with Shiki syntax highlighting.
 */
async function processMarkdown(content: string): Promise<string> {
  // Process MkDocs syntax (convert admonitions, dedent, etc.)
  const processedContent = processMkDocsContent(content);

  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm) // Enable GFM tables, strikethrough, autolinks, etc.
    .use(remarkRehype, { allowDangerousHtml: true }) // Allow HTML from admonitions
    .use(rehypeShiki, {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    })
    .use(rehypeStringify, { allowDangerousHtml: true }) // Preserve HTML in output
    .process(processedContent);

  // Post-process to catch any admonitions that ended up in <p> tags
  return postProcessAdmonitions(String(result));
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
