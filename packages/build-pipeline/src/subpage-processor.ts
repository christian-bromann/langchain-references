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
 * Parse a subpage markdown file into markdown content and symbol references.
 *
 * The file is split at the first ::: directive:
 * - Everything before the first ::: line becomes `markdownContent`
 * - Lines starting with ::: have their qualified names extracted into `symbolRefs`
 * - Indented option blocks following ::: are ignored
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
          symbolRefs.push(qualifiedName);
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
  repoDir?: string
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
          `[subpage-processor] Failed to fetch ${source}: ${response.status} ${response.statusText}`
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
      console.warn(
        `[subpage-processor] Cannot read relative path ${source} without repoDir`
      );
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
  repoDir?: string
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
  repoDir?: string
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
