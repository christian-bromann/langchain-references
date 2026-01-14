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
 * Inline SVG icons for admonitions (Lucide icon style, 16x16)
 * Using inline SVGs since this is a server component that generates HTML strings.
 */
const ADMONITION_ICONS = {
  // Info icon (circle with "i")
  info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  // Lightbulb icon
  lightbulb: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  // Alert triangle icon
  alertTriangle: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  // Shield alert icon
  shieldAlert: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  // File text icon
  fileText: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  // Sparkles icon
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>',
  // Refresh CW icon
  refreshCw: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  // Pin icon
  pin: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
} as const;

/**
 * Admonition type to styling configuration
 */
const ADMONITION_STYLES: Record<string, { icon: string; bgClass: string; borderClass: string; iconClass: string }> = {
  note: {
    icon: ADMONITION_ICONS.info,
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  tip: {
    icon: ADMONITION_ICONS.lightbulb,
    bgClass: 'bg-green-50 dark:bg-green-950/30',
    borderClass: 'border-green-200 dark:border-green-800',
    iconClass: 'text-green-600 dark:text-green-400',
  },
  warning: {
    icon: ADMONITION_ICONS.alertTriangle,
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  danger: {
    icon: ADMONITION_ICONS.shieldAlert,
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    borderClass: 'border-red-200 dark:border-red-800',
    iconClass: 'text-red-600 dark:text-red-400',
  },
  example: {
    icon: ADMONITION_ICONS.fileText,
    bgClass: 'bg-purple-50 dark:bg-purple-950/30',
    borderClass: 'border-purple-200 dark:border-purple-800',
    iconClass: 'text-purple-600 dark:text-purple-400',
  },
  info: {
    icon: ADMONITION_ICONS.info,
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  // Version-related admonitions (common in LangChain docs)
  'version-added': {
    icon: ADMONITION_ICONS.sparkles,
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  'version-changed': {
    icon: ADMONITION_ICONS.refreshCw,
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-200 dark:border-blue-800',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  'version-deprecated': {
    icon: ADMONITION_ICONS.alertTriangle,
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
};

const DEFAULT_ADMONITION_STYLE = {
  icon: ADMONITION_ICONS.pin,
  bgClass: 'bg-gray-50 dark:bg-gray-900/30',
  borderClass: 'border-gray-200 dark:border-gray-700',
  iconClass: 'text-gray-600 dark:text-gray-400',
};

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

      // Get styling for this admonition type
      const style = ADMONITION_STYLES[type.toLowerCase()] || DEFAULT_ADMONITION_STYLE;
      const displayTitle = title || type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const admonitionContent = contentLines.join('\n').trim();

      // Skip empty admonitions (content was likely stripped, e.g., code examples extracted separately)
      if (!admonitionContent) {
        continue;
      }

      // Generate a styled header followed by markdown content
      // The header is minimal HTML, content stays as markdown for proper parsing
      result.push('');
      result.push(`<div class="admonition-header flex items-center gap-2 mt-6 mb-2 font-semibold ${style.iconClass}">`);
      result.push(`<span class="shrink-0">${style.icon}</span>`);
      result.push(`<span>${displayTitle}</span>`);
      result.push(`</div>`);
      result.push('');

      // Add content as regular markdown (will be properly parsed)
      result.push(admonitionContent);
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
      const style = ADMONITION_STYLES[type.toLowerCase()] || DEFAULT_ADMONITION_STYLE;

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

      // Render the admonition header and content
      return `<div class="admonition-header flex items-center gap-2 mt-6 mb-2 font-semibold ${style.iconClass}"><span class="shrink-0">${style.icon}</span><span>${displayTitle}</span></div><p>${content}</p>`;
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
