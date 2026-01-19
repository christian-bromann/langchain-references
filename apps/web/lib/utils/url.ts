/**
 * URL Utilities - URL parsing and building for reference docs
 */

import type { Language, SymbolLanguage } from "@langchain/ir-schema";
import type { SymbolKind } from "../ir/types";

/**
 * Extended language type that includes "javascript" as a URL segment alias for "typescript"
 * Also supports "java" and "go" for additional language SDKs.
 */
export type UrlLanguage = Language | SymbolLanguage;

/**
 * Parsed slug information
 */
export interface ParsedSlug {
  language: UrlLanguage;
  packageName: string;
  packageId: string;
  symbolPath: string[];
  fullPath: string;
}

/**
 * Slugify a package name for URLs
 * @example "@langchain/core" -> "langchain-core"
 * @example "langchain_core" -> "langchain-core"
 */
export function slugifyPackageName(packageName: string): string {
  return packageName
    .replace(/^@/, "") // Remove @ prefix
    .replace(/\//g, "-") // Replace / with -
    .replace(/_/g, "-") // Replace _ with -
    .toLowerCase();
}

/**
 * Convert a slug back to package name
 * @example "langchain-core" with language "javascript" -> "@langchain/core"
 * @example "langchain" with language "javascript" -> "langchain" (unscoped)
 * @example "langchain-core" with language "python" -> "langchain_core"
 *
 * Note: This is a best-effort reverse transformation. For scoped packages like
 * @langchain/core -> langchain-core, we can reverse it. For unscoped packages
 * like "langchain", we keep them as-is since we can't know if they were scoped.
 * The actual package name should be looked up from the manifest when available.
 */
export function unslugifyPackageName(slug: string, language: UrlLanguage): string {
  if (language === "javascript" || language === "typescript") {
    // JavaScript packages can be either:
    // 1. Scoped: @scope/name -> scope-name (slug) -> @scope/name (unslug)
    // 2. Unscoped: name -> name (slug stays the same)
    const parts = slug.split("-");

    // If it looks like a scoped package slug (has hyphen and first part is a known scope)
    // We use a heuristic: if the first part is "langchain" and there are more parts,
    // it was likely @langchain/something
    if (parts.length >= 2 && parts[0] === "langchain") {
      return `@${parts[0]}/${parts.slice(1).join("-")}`;
    }

    // Otherwise, treat as unscoped package
    return slug;
  } else if (language === "java" || language === "go") {
    // Java and Go packages use the slug as-is
    return slug;
  } else {
    // Python packages use snake_case
    return slug.replace(/-/g, "_");
  }
}

/**
 * Generate package ID from package name
 * @example "@langchain/core" -> "pkg_js_langchain_core"
 * @example "langchain_core" -> "pkg_py_langchain_core"
 */
export function packageNameToId(packageName: string, language: UrlLanguage): string {
  const ecosystemMap: Record<string, string> = {
    python: "py",
    javascript: "js",
    typescript: "js",
    java: "java",
    go: "go",
  };
  const ecosystem = ecosystemMap[language] || language;
  const normalized = packageName
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
  return `pkg_${ecosystem}_${normalized}`;
}

/**
 * Slugify a symbol path for URLs
 * @example "langchain_core.messages.BaseMessage" -> "messages/BaseMessage"
 * @example "ChatDeepSeekCallOptions" -> "ChatDeepSeekCallOptions"
 */
export function slugifySymbolPath(symbolPath: string, hasPackagePrefix = true): string {
  const parts = symbolPath.split(".");

  // If only one part, it's just the symbol name (no package prefix)
  if (parts.length === 1) {
    return parts[0];
  }

  // Skip the package name (first part) if it has a package prefix
  if (hasPackagePrefix) {
    return parts.slice(1).join("/");
  }

  return parts.join("/");
}

/**
 * Parse a URL slug into its components
 * @example ["python", "langchain-core", "messages", "BaseMessage"]
 */
export function parseSlug(slug: string[]): ParsedSlug | null {
  if (slug.length < 1) {
    return null;
  }

  // First segment is the package slug
  const packageSlug = slug[0];
  const symbolPath = slug.slice(1);

  // Determine language from the route (this should be passed from the page)
  // For now, we'll need to infer it
  const language: UrlLanguage = "python"; // Default, should be overridden

  return {
    language,
    packageName: unslugifyPackageName(packageSlug, language),
    packageId: "", // Will be resolved later
    symbolPath,
    fullPath: symbolPath.join("."),
  };
}

/**
 * Parse slug with explicit language
 */
export function parseSlugWithLanguage(slug: string[], language: UrlLanguage): ParsedSlug | null {
  if (slug.length < 1) {
    return null;
  }

  const packageSlug = slug[0];
  const symbolPath = slug.slice(1);
  const packageName = unslugifyPackageName(packageSlug, language);

  return {
    language,
    packageName,
    packageId: packageNameToId(packageName, language),
    symbolPath,
    fullPath: symbolPath.join("."),
  };
}

/**
 * Build a URL for a symbol
 */
export function buildSymbolUrl(
  language: UrlLanguage,
  packageName: string,
  symbolPath?: string,
): string {
  const langSegmentMap: Record<string, string> = {
    python: "python",
    javascript: "javascript",
    typescript: "javascript",
    java: "java",
    go: "go",
  };
  const langSegment = langSegmentMap[language] || language;
  const packageSlug = slugifyPackageName(packageName);

  if (!symbolPath) {
    return `/${langSegment}/${packageSlug}`;
  }

  // Check if the symbolPath starts with a package-like prefix
  // Python packages use underscores (langchain_core.something)
  // JS packages would rarely have the package name in the path
  const parts = symbolPath.split(".");
  const firstPart = parts[0];

  // Detect if the first part looks like a Python package name (contains underscore)
  // or matches the package name. If so, skip it.
  const normalizedPackage = packageName
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
  const normalizedFirst = firstPart.toLowerCase().replace(/-/g, "_");

  const hasPackagePrefix =
    normalizedFirst === normalizedPackage || (language === "python" && firstPart.includes("_"));

  const pathSegment = slugifySymbolPath(symbolPath, hasPackagePrefix);

  if (!pathSegment) {
    return `/${langSegment}/${packageSlug}`;
  }

  return `/${langSegment}/${packageSlug}/${pathSegment}`;
}

/**
 * Build a URL for a package
 */
export function buildPackageUrl(language: UrlLanguage, packageName: string): string {
  return buildSymbolUrl(language, packageName);
}

/**
 * Get breadcrumb items from a parsed slug
 */
export interface BreadcrumbItem {
  label: string;
  href: string;
}

export function getBreadcrumbs(parsed: ParsedSlug): BreadcrumbItem[] {
  const languageLabels: Record<string, string> = {
    python: "Python",
    javascript: "JavaScript",
    typescript: "JavaScript",
    java: "Java",
    go: "Go",
  };
  const langSegmentMap: Record<string, string> = {
    python: "python",
    javascript: "javascript",
    typescript: "javascript",
    java: "java",
    go: "go",
  };
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: languageLabels[parsed.language] || parsed.language,
      href: `/${langSegmentMap[parsed.language] || parsed.language}`,
    },
    {
      label: parsed.packageName,
      href: buildPackageUrl(parsed.language, parsed.packageName),
    },
  ];

  // Add symbol path segments
  let currentPath = "";
  for (let i = 0; i < parsed.symbolPath.length; i++) {
    const segment = parsed.symbolPath[i];
    currentPath = currentPath ? `${currentPath}.${segment}` : segment;

    breadcrumbs.push({
      label: segment,
      href: buildSymbolUrl(
        parsed.language,
        parsed.packageName,
        `${parsed.packageName}.${currentPath}`,
      ),
    });
  }

  return breadcrumbs;
}

/**
 * Get icon name for symbol kind
 */
export function getKindIcon(kind: SymbolKind): string {
  const iconMap: Record<string, string> = {
    module: "folder",
    class: "box",
    function: "code",
    method: "brackets",
    property: "circle-dot",
    attribute: "circle",
    variable: "variable",
    interface: "file-type",
    typeAlias: "type",
    enum: "list",
    namespace: "layers",
    constructor: "hammer",
    enumMember: "list-check",
    parameter: "variable",
  };

  return iconMap[kind] || "file";
}

/**
 * Get display label for symbol kind
 */
export function getKindLabel(kind: SymbolKind): string {
  const labelMap: Record<string, string> = {
    module: "Module",
    class: "Class",
    function: "Function",
    method: "Method",
    property: "Property",
    attribute: "Attribute",
    variable: "Variable",
    interface: "Interface",
    typeAlias: "Type",
    enum: "Enum",
    namespace: "Namespace",
    constructor: "Constructor",
    enumMember: "Enum Member",
    parameter: "Parameter",
  };

  return labelMap[kind] || kind;
}

/**
 * Get color class for symbol kind badge
 */
export function getKindColor(kind: SymbolKind): string {
  const colorMap: Record<string, string> = {
    module: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    class: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    function: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    method: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    property: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    attribute: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    variable: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    interface: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    typeAlias: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    enum: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    namespace: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
    constructor: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    enumMember: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    parameter: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  };

  return colorMap[kind] || "bg-gray-100 text-gray-800";
}
