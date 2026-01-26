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
 * Known include files and their replacement admonitions.
 * These replace the MkDocs --8<-- "filename.md" include syntax.
 */
const INCLUDE_REPLACEMENTS: Record<string, string> = {
  "langchain-classic-warning.md": `!!! danger "langchain-classic documentation"

    These docs cover the \`langchain-classic\` package. This package will be maintained for security vulnerabilities [until December 2026](https://docs.langchain.com/oss/python/release-policy). Users are encouraged to migrate to the [\`langchain\`](https://pypi.org/project/langchain/) package for the latest features and improvements. [See docs for \`langchain\`](https://reference.langchain.com/python/langchain/langchain)`,

  "wip.md": `!!! warning "Work in progress"

    This page is a work in progress, and we appreciate your patience as we continue to expand and improve the content.`,
};

/**
 * Transform relative image URLs in markdown to absolute URLs.
 *
 * Handles both markdown syntax: ![alt](image.png)
 * And HTML syntax: <img src="image.png" />
 *
 * @param content - Markdown content with potential relative image paths
 * @param baseUrl - The base URL to prepend to relative paths (should end with /)
 * @returns Content with absolute image URLs
 */
export function transformRelativeImageUrlsWithBase(content: string, baseUrl: string): string {
  if (!content || !baseUrl) return content;

  // Ensure baseUrl ends with /
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  // Helper to resolve a relative path against the base URL
  const resolveUrl = (relativePath: string): string => {
    // Already absolute URL - return as-is
    if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
      return relativePath;
    }
    // Data URLs - return as-is
    if (relativePath.startsWith("data:")) {
      return relativePath;
    }
    // Anchor links - return as-is
    if (relativePath.startsWith("#")) {
      return relativePath;
    }
    // Remove leading ./ if present
    const cleanPath = relativePath.replace(/^\.\//, "");
    return `${normalizedBaseUrl}${cleanPath}`;
  };

  let result = content;

  // Transform markdown image syntax: ![alt](path)
  // Match ![any text](path) where path doesn't start with http
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imagePath) => {
    const trimmedPath = imagePath.trim();
    // Only transform if it looks like a relative path to an image
    if (
      !trimmedPath.startsWith("http") &&
      !trimmedPath.startsWith("data:") &&
      !trimmedPath.startsWith("#") &&
      /\.(png|jpg|jpeg|gif|svg|webp|avif)(\?.*)?$/i.test(trimmedPath)
    ) {
      return `![${alt}](${resolveUrl(trimmedPath)})`;
    }
    return match;
  });

  // Transform HTML img src attributes: <img src="path" /> or <img src='path' />
  result = result.replace(
    /<img\s+([^>]*?)src=(["'])([^"']+)\2([^>]*?)\/?>/gi,
    (match, before, quote, src, after) => {
      const trimmedSrc = src.trim();
      // Only transform if it looks like a relative path to an image
      if (
        !trimmedSrc.startsWith("http") &&
        !trimmedSrc.startsWith("data:") &&
        !trimmedSrc.startsWith("#") &&
        /\.(png|jpg|jpeg|gif|svg|webp|avif)(\?.*)?$/i.test(trimmedSrc)
      ) {
        return `<img ${before}src=${quote}${resolveUrl(trimmedSrc)}${quote}${after}/>`;
      }
      return match;
    },
  );

  return result;
}

/**
 * Transform relative file and directory links in markdown to absolute GitHub URLs.
 *
 * Handles markdown link syntax: [text](relative/path/to/file.ext) or [text](./directory)
 *
 * For example, transforms:
 *   [BadRequestException](langsmith-java-core/src/main/kotlin/.../BadRequestException.kt)
 * to:
 *   [BadRequestException](https://github.com/owner/repo/blob/ref/langsmith-java-core/src/main/kotlin/.../BadRequestException.kt)
 *
 * And directory links like:
 *   [Examples](./examples/list_runs)
 * to:
 *   [Examples](https://github.com/owner/repo/tree/ref/examples/list_runs)
 *
 * @param content - Markdown content with potential relative file/directory links
 * @param repoInfo - Repository information (owner, name, ref, packagePath)
 * @returns Content with absolute GitHub URLs for relative links
 */
export function transformRelativeLinksToGitHub(
  content: string,
  repoInfo: { owner: string; name: string; ref: string; packagePath?: string },
): string {
  if (!content || !repoInfo) return content;

  const { owner, name, ref, packagePath } = repoInfo;

  // Base URL parts for building GitHub links
  const repoBase = `https://github.com/${owner}/${name}`;
  const pathPrefix = packagePath && packagePath !== "." ? `${packagePath}/` : "";

  // File extensions that indicate a file (not a directory)
  // This is a broad list to catch most file types
  const fileExtensions = [
    // Source code
    "java", "kt", "kts", "scala", "groovy", "go", "rs", "py", "pyx", "pxd",
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rb", "php", "swift", "m", "mm",
    "c", "cpp", "cc", "cxx", "h", "hpp", "hxx", "cs", "fs", "vb",
    // Config/data
    "json", "yaml", "yml", "toml", "xml", "gradle", "properties", "ini", "cfg",
    // Documentation
    "md", "mdx", "rst", "txt", "adoc",
    // Other
    "html", "css", "scss", "sass", "less", "sql", "sh", "bash", "zsh", "ps1",
    "dockerfile", "makefile", "mod", "sum",
  ];

  // Patterns that should NOT be transformed (external/special links)
  const skipPatterns = [
    /^https?:\/\//i,      // Already absolute URLs
    /^#/,                  // Anchor links
    /^[a-z]+:/i,          // Protocol links (mailto:, tel:, etc.)
    /^\//,                // Absolute paths (likely to another site section)
  ];

  // Match markdown links: [text](path)
  // But NOT image links: ![text](path)
  // Capture group 1: link text, group 2: path
  const linkPattern = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;

  return content.replace(linkPattern, (match, linkText, linkPath) => {
    const trimmedPath = linkPath.trim();

    // Check if this link should be skipped
    for (const pattern of skipPatterns) {
      if (pattern.test(trimmedPath)) {
        return match;
      }
    }

    // Remove leading ./ if present
    const cleanPath = trimmedPath.replace(/^\.\//, "");

    // Skip empty paths
    if (!cleanPath) {
      return match;
    }

    // Determine if this is a file or directory
    // Check if the path has a file extension
    const lastSegment = cleanPath.split("/").pop() || "";
    const hasExtension = fileExtensions.some((ext) =>
      lastSegment.toLowerCase().endsWith(`.${ext}`),
    );

    // Use /blob/ for files, /tree/ for directories
    const urlType = hasExtension ? "blob" : "tree";
    const absoluteUrl = `${repoBase}/${urlType}/${ref}/${pathPrefix}${cleanPath}`;

    return `[${linkText}](${absoluteUrl})`;
  });
}

/**
 * Transform relative image URLs in markdown to absolute raw GitHub URLs.
 * Derives the base URL from the source URL of the markdown file.
 *
 * @param content - Markdown content with potential relative image paths
 * @param sourceUrl - The source URL of the markdown file (used to derive base path)
 * @returns Content with absolute image URLs
 */
function transformRelativeImageUrls(content: string, sourceUrl: string): string {
  if (!content || !sourceUrl) return content;

  // Only process raw.githubusercontent.com URLs
  if (!sourceUrl.includes("raw.githubusercontent.com")) {
    return content;
  }

  // Extract the base directory from the source URL
  // e.g., https://raw.githubusercontent.com/org/repo/branch/path/to/file.md
  //    -> https://raw.githubusercontent.com/org/repo/branch/path/to/
  const lastSlashIndex = sourceUrl.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return content;
  }
  const baseUrl = sourceUrl.slice(0, lastSlashIndex + 1);

  return transformRelativeImageUrlsWithBase(content, baseUrl);
}

/**
 * Process MkDocs include syntax (--8<-- "filename.md") and replace with content.
 *
 * @param content - Raw markdown content with potential includes
 * @returns Content with includes replaced
 */
function processIncludes(content: string): string {
  // Match --8<-- "filename.md" or --8<-- 'filename.md' patterns
  const includePattern = /--8<--\s*["']([^"']+)["']/g;

  return content.replace(includePattern, (match, filename) => {
    const replacement = INCLUDE_REPLACEMENTS[filename];
    if (replacement) {
      return replacement;
    }
    // If we don't have a replacement, remove the include line
    // (it would just show as raw text otherwise)
    console.warn(`[subpage-processor] Unknown include file: ${filename}`);
    return "";
  });
}

/**
 * Strip YAML frontmatter from markdown content.
 *
 * Frontmatter is content between --- delimiters at the very start of the file:
 * ---
 * title: My Page
 * ---
 *
 * @param content - Raw markdown content
 * @returns Content with frontmatter removed
 */
function stripFrontmatter(content: string): string {
  // Check if content starts with ---
  if (!content.startsWith("---")) {
    return content;
  }

  // Find the closing ---
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    // No closing delimiter found, return as-is
    return content;
  }

  // Return everything after the closing --- and its newline
  const afterFrontmatter = content.slice(endIndex + 4);
  // Trim leading newlines but preserve the rest
  return afterFrontmatter.replace(/^\n+/, "");
}

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

    // Stop if we hit another ::: directive
    if (trimmed.startsWith(":::")) {
      break;
    }

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    // Stop if we hit content that doesn't look like YAML options
    // Options are either "key: value" or "- item" list items
    if (!trimmed.includes(":") && !trimmed.startsWith("-")) {
      break;
    }

    // Check for start of members: list
    if (trimmed === "members:" || trimmed.startsWith("members:")) {
      inMembersList = true;
      // Calculate the indentation of the members: line to track the list
      membersIndent = line.length - line.trimStart().length;

      // Check for inline members on the same line: "members: - A - B - C"
      const afterMembers = trimmed.slice(8).trim(); // "members:".length === 8
      if (afterMembers) {
        // Parse inline members separated by " - "
        const inlineMembers = afterMembers
          .split(/\s+-\s+/)
          .map((m) => m.replace(/^-\s*/, "").trim())
          .filter((m) => m && !m.startsWith("#"));
        allMembers.push(...inlineMembers);
      }
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
  // Process includes first (--8<-- "filename.md" syntax)
  const processedContent = processIncludes(content);

  // Strip YAML frontmatter (content between --- delimiters at the start)
  const contentWithoutFrontmatter = stripFrontmatter(processedContent);

  const lines = contentWithoutFrontmatter.split("\n");
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

  // Transform relative image URLs to absolute GitHub raw URLs
  // This ensures images render correctly when displayed on the reference site
  const contentWithAbsoluteUrls = transformRelativeImageUrls(content, config.source);
  const { markdownContent, symbolRefs } = parseSubpageMarkdown(contentWithAbsoluteUrls);

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
