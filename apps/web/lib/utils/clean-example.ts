/**
 * Clean Example Code Utility
 *
 * Cleans example code content from MkDocs admonition syntax and HTML artifacts.
 * Used as a frontend safety net for already-extracted data that may contain
 * MkDocs Material syntax like `???+ example "Example"`.
 */
export function cleanExampleCode(code: string): string {
  if (!code) return code;

  // Remove MkDocs admonition openers: ???+ example "Example", !!! note "Note", etc.
  let cleaned = code.replace(/^[?!]{3}\+?\s*\w+(?:\s+"[^"]*")?\s*$/gm, "");

  // Remove HTML paragraph tags that wrap the admonition
  cleaned = cleaned.replace(/<p>[?!]{3}\+?\s*\w+(?:\s+"[^"]*")?<\/p>/g, "");

  // Handle code blocks wrapped in HTML <pre><code> tags
  const htmlCodePattern = /<pre><code>```(\w*)\n([\s\S]*?)```\s*<\/code><\/pre>/;
  const htmlMatch = cleaned.match(htmlCodePattern);
  if (htmlMatch) {
    return htmlMatch[2].trim();
  }

  // Handle regular fenced code blocks: ```python\ncode\n```
  const fencedPattern = /```\w*\n([\s\S]*?)```/;
  const fencedMatch = cleaned.match(fencedPattern);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  // Clean up any remaining HTML tags
  cleaned = cleaned.replace(/<\/?(?:p|pre|code)>/g, "");

  return cleaned.trim();
}
