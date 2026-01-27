/**
 * HTML manipulation utilities
 */

/**
 * Strips anchor tags from HTML, keeping their text content.
 * This is necessary when embedding HTML inside a Link component,
 * as nested <a> tags are invalid HTML and cause hydration mismatches.
 *
 * @param html - The HTML string to process
 * @returns The HTML with anchor tags removed but text preserved
 */
export function stripAnchors(html: string): string {
  // Replace <a ...>content</a> with just content
  // This regex handles:
  // - Self-closing anchors (rare but possible)
  // - Anchors with any attributes
  // - Nested content within anchors
  return html.replace(/<a\s[^>]*>([\s\S]*?)<\/a>/gi, "$1");
}
