/**
 * Subpage Processor
 *
 * Parses markdown files for curated subpages, extracting:
 * - Markdown content (before first ::: directive)
 * - Symbol references (qualified names from ::: directives)
 */
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Configuration for a subpage as defined in package config.
 */
export interface SubpageConfig {
  /** URL slug for the subpage (e.g., "agents", "middleware") */
  slug: string;

  /** Display title for navigation and page header */
  title: string;

  /**
   * Source of the markdown content:
   * - Absolute URL: fetched from GitHub raw content
   * - Relative path: resolved relative to repo root in cloned directory
   */
  source: string;
}

/**
 * Parsed subpage data after processing markdown.
 */
export interface ParsedSubpage {
  /** Subpage slug from config */
  slug: string;

  /** Display title from config */
  title: string;

  /** Markdown content before first ::: directive (render as-is) */
  markdownContent: string;

  /** Qualified names extracted from ::: directives */
  symbolRefs: string[];
}

/**
 * Cache for fetched subpage content during a build.
 */
const fetchCache = new Map<string, string | null>();

/**
 * Parse the `members` list from a YAML-like options block.
 *
 * Handles the MkDocs mkdocstrings format where members are listed as:
 *   options:
 *     members:
 *       - MemberA
 *       - MemberB
 *
 * This function distinguishes between:
 * - Symbol/class names (e.g., "AIMessage", "HumanMessage") - start with uppercase
 * - Method/filter names (e.g., "__init__", "run") - start with lowercase or underscore
 *
 * Only returns members that look like symbol names (start with uppercase letter).
 * Method names are ignored as they're typically used as filters, not as symbols to expand.
 *
 * @param lines - All lines of the content
 * @param startIndex - Index of the line after the ::: directive
 * @returns Array of member names that are symbol references, or empty array if none found
 */
function parseMembersFromOptions(lines: string[], startIndex: number): string[] {
  const allMembers: string[] = [];
  let inMembersList = false;
  let membersIndent = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Stop if we hit another ::: directive or non-indented content
    if (trimmed.startsWith(":::") || (trimmed && !line.startsWith(" ") && !line.startsWith("\t"))) {
      break;
    }

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    // Check for start of members: list
    if (trimmed === "members:" || trimmed.startsWith("members:")) {
      inMembersList = true;
      // Calculate the indentation of the members: line to track the list
      membersIndent = line.length - line.trimStart().length;
      continue;
    }

    // If we're in the members list, parse list items
    if (inMembersList) {
      const currentIndent = line.length - line.trimStart().length;

      // Check if this is a list item (starts with -)
      if (trimmed.startsWith("- ")) {
        const memberName = trimmed.slice(2).trim();
        if (memberName && !memberName.startsWith("#")) {
          allMembers.push(memberName);
        }
      }
      // If we hit something at the same or lower indent level that's not a list item, we're done with members
      else if (currentIndent <= membersIndent && !trimmed.startsWith("-")) {
        inMembersList = false;
      }
    }
  }

  // Filter to only include symbol-like members (start with uppercase letter)
  // Method names like __init__, run, stop are filters, not symbols to expand
  const symbolMembers = allMembers.filter((m) => /^[A-Z]/.test(m));

  // Only return if we found symbol-like members
  // If all members are method names (lowercase), return empty to use the directive's qualified name
  return symbolMembers;
}

/**
 * Parse a subpage markdown file into markdown content and symbol references.
 *
 * The file is split at the first ::: directive:
 * - Everything before the first ::: line becomes `markdownContent`
 * - Lines starting with ::: have their qualified names extracted into `symbolRefs`
 * - If a ::: directive has an options block with `members:`, those members are
 *   resolved to fully qualified names (module.member) instead of the module itself
 * - Indented option blocks following ::: are otherwise ignored
 *
 * @param content - Raw markdown content
 * @returns Object with markdownContent and symbolRefs
 */
export function parseSubpageMarkdown(content: string): {
  markdownContent: string;
  symbolRefs: string[];
} {
  const lines = content.split("\n");
  const markdownLines: string[] = [];
  const symbolRefs: string[] = [];
  let foundFirstDirective = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this is a ::: directive line
    if (trimmed.startsWith(":::")) {
      foundFirstDirective = true;

      // Extract the qualified name (everything after ::: and before any space)
      const afterDirective = trimmed.slice(3).trim();
      if (afterDirective) {
        // Take only the first token (the qualified name)
        const qualifiedName = afterDirective.split(/\s+/)[0];
        if (qualifiedName && !qualifiedName.startsWith("#")) {
          // Check if this directive has a members list in its options
          const members = parseMembersFromOptions(lines, i + 1);

          if (members.length > 0) {
            // If members are specified, add fully qualified member names instead of the module
            for (const member of members) {
              symbolRefs.push(`${qualifiedName}.${member}`);
            }
          } else {
            // No members specified, use the qualified name as-is (original behavior)
            symbolRefs.push(qualifiedName);
          }
        }
      }
      continue;
    }

    // If we haven't found the first directive, this is markdown content
    if (!foundFirstDirective) {
      markdownLines.push(line);
    }
    // After finding directives, skip indented lines (options) and empty lines
    // Non-indented, non-directive lines after the first directive are ignored
  }

  // Trim trailing whitespace from markdown content
  let markdownContent = markdownLines.join("\n").trimEnd();

  return {
    markdownContent,
    symbolRefs,
  };
}

/**
 * Fetch subpage content from a URL or local file path.
 *
 * @param source - URL or relative file path
 * @param repoDir - Directory of the cloned repository (for relative paths)
 * @returns Content string or null if fetch failed
 */
export async function fetchSubpageContent(
  source: string,
  repoDir?: string,
): Promise<string | null> {
  // Check cache first
  const cacheKey = `${source}:${repoDir ?? ""}`;
  if (fetchCache.has(cacheKey)) {
    return fetchCache.get(cacheKey) ?? null;
  }

  try {
    let content: string;

    if (source.startsWith("http://") || source.startsWith("https://")) {
      // Fetch from URL
      const response = await fetch(source);
      if (!response.ok) {
        console.warn(
          `[subpage-processor] Failed to fetch ${source}: ${response.status} ${response.statusText}`,
        );
        fetchCache.set(cacheKey, null);
        return null;
      }
      content = await response.text();
    } else if (repoDir) {
      // Read from local file (relative to repo directory)
      const filePath = path.resolve(repoDir, source);
      content = await fs.readFile(filePath, "utf-8");
    } else {
      console.warn(`[subpage-processor] Cannot read relative path ${source} without repoDir`);
      fetchCache.set(cacheKey, null);
      return null;
    }

    fetchCache.set(cacheKey, content);
    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[subpage-processor] Failed to load ${source}: ${message}`);
    fetchCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Process a subpage configuration into parsed subpage data.
 *
 * @param config - Subpage configuration from package config
 * @param repoDir - Directory of the cloned repository (for relative paths)
 * @returns ParsedSubpage or null if processing failed
 */
export async function processSubpage(
  config: SubpageConfig,
  repoDir?: string,
): Promise<ParsedSubpage | null> {
  const content = await fetchSubpageContent(config.source, repoDir);
  if (content === null) {
    return null;
  }

  const { markdownContent, symbolRefs } = parseSubpageMarkdown(content);

  return {
    slug: config.slug,
    title: config.title,
    markdownContent,
    symbolRefs,
  };
}

/**
 * Process all subpages for a package.
 *
 * @param subpages - Array of subpage configurations
 * @param repoDir - Directory of the cloned repository (for relative paths)
 * @returns Array of successfully parsed subpages
 */
export async function processSubpages(
  subpages: SubpageConfig[],
  repoDir?: string,
): Promise<ParsedSubpage[]> {
  const results: ParsedSubpage[] = [];

  for (const config of subpages) {
    const parsed = await processSubpage(config, repoDir);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

/**
 * Clear the fetch cache. Useful between builds.
 */
export function clearFetchCache(): void {
  fetchCache.clear();
}
