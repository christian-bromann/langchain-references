/**
 * Section and metadata extraction from markdown files
 */

import matter from "gray-matter";
import type { Section, PageMetadata } from "./types.js";

/**
 * Slugify a heading title to create an anchor.
 *
 * @param title - The heading title
 * @returns The slugified anchor (without #)
 */
export function slugifyHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Remove consecutive hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Extract sections (headings) from markdown content.
 *
 * @param content - The raw markdown content (without frontmatter)
 * @returns Array of sections
 */
export function extractSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match ATX-style headings: # Heading, ## Heading, etc.
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      sections.push({
        title,
        anchor: slugifyHeading(title),
        level,
        startLine: i + 1, // 1-indexed
      });
    }
  }

  return sections;
}

/**
 * Parse markdown file and extract metadata.
 *
 * @param content - The raw file content
 * @param filePath - The file path (for URL generation)
 * @returns Page metadata
 */
export function parsePageMetadata(content: string, filePath: string): PageMetadata {
  // Parse frontmatter
  const { data: frontmatter, content: markdownContent } = matter(content);

  // Extract sections from the content
  const sections = extractSections(markdownContent);

  // Get title from frontmatter or first heading
  let title = frontmatter.title as string | undefined;
  if (!title && sections.length > 0) {
    title = sections[0].title;
  }
  title = title || "Untitled";

  // Get description from frontmatter
  const description = frontmatter.description as string | undefined;

  // Convert file path to URL path
  const urlPath = filePathToUrlPath(filePath);

  return {
    title,
    description,
    urlPath,
    sections,
  };
}

/**
 * Convert a file path to a URL path.
 *
 * Handles Mintlify routing for LangChain docs where:
 * - File: oss/langchain/agents.mdx -> URL: /oss/python/langchain/agents (Python) or /oss/javascript/langchain/agents (JS)
 * - File: oss/langgraph/overview.mdx -> URL: /oss/python/langgraph/overview (Python) or /oss/javascript/langgraph/overview (JS)
 * - File: oss/deepagents/backends.mdx -> URL: /oss/python/deepagents/backends (Python) or /oss/javascript/deepagents/backends (JS)
 * - File: oss/python/integrations/... -> URL: /oss/python/integrations/... (already has language)
 *
 * @param filePath - The file path
 * @param language - Optional language context ("python" or "javascript") for correct URL routing
 * @returns The URL path
 */
export function filePathToUrlPath(filePath: string, language?: "python" | "javascript"): string {
  let urlPath = filePath;

  // Remove src/ prefix if present
  urlPath = urlPath.replace(/^src\//, "");

  // Remove file extension
  urlPath = urlPath.replace(/\.(md|mdx)$/, "");

  // Remove index from the end
  urlPath = urlPath.replace(/\/index$/, "");

  // Handle Mintlify routing for LangChain docs:
  // oss/langchain/*, oss/langgraph/*, and oss/deepagents/* get language prefix inserted after /oss/
  // The language prefix is /python/ or /javascript/ depending on the import context
  // Skip if the path already has a language prefix (e.g., oss/python/integrations/...)
  if (urlPath.match(/^oss\/(langchain|langgraph|deepagents)(\/|$)/)) {
    const langPrefix = language === "javascript" ? "javascript" : "python";
    urlPath = urlPath.replace(/^oss\//, `oss/${langPrefix}/`);
  }

  // Ensure leading slash
  if (!urlPath.startsWith("/")) {
    urlPath = "/" + urlPath;
  }

  return urlPath;
}

/**
 * Find the section that contains a given line number.
 *
 * @param sections - The sections in the page
 * @param lineNumber - The line number to find
 * @returns The containing section or undefined
 */
export function findContainingSection(
  sections: Section[],
  lineNumber: number,
): Section | undefined {
  // Find the last section that starts before this line
  let containingSection: Section | undefined;

  for (const section of sections) {
    if (section.startLine <= lineNumber) {
      containingSection = section;
    } else {
      break;
    }
  }

  return containingSection;
}
