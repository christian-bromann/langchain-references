/**
 * Markdown Generator
 *
 * Converts IR symbol data to clean, LLM-optimized markdown.
 * Used for:
 * - Serving markdown responses to LLM crawlers
 * - "Copy page" functionality
 * - llms.txt generation
 */

import type { SymbolRecord, SymbolKind, Language } from "./types";
import { slugifyPackageName, slugifySymbolPath } from "../utils/url";
import { getBaseUrl } from "../config/mcp";
import { cleanExampleCode } from "../utils/clean-example";

/**
 * Options for markdown generation
 */
export interface MarkdownOptions {
  /** Include source link to GitHub (default: true) */
  includeSourceLink?: boolean;
  /** Include code examples (default: true) */
  includeExamples?: boolean;
  /** Include member details for classes (default: true) */
  includeMemberDetails?: boolean;
  /**
   * Optional repository path prefix for the current package (e.g. `libs/langchain`).
   * When provided, this is prepended to `symbol.source.path` if not already present.
   */
  repoPathPrefix?: string;
  /** Base URL for canonical links */
  baseUrl?: string;
}

const DEFAULT_OPTIONS: Required<MarkdownOptions> = {
  includeSourceLink: true,
  includeExamples: true,
  includeMemberDetails: true,
  repoPathPrefix: "",
  baseUrl: "",
};

/**
 * Clean a source path that may contain build cache prefixes.
 * Removes paths like /tmp/.../extracted/... and handles duplicated package paths.
 */
function cleanSourcePath(sourcePath: string, repoPathPrefix?: string): string {
  let cleaned = sourcePath;

  // Strip everything up to and including /extracted/
  const extractedIdx = cleaned.indexOf("/extracted/");
  if (extractedIdx !== -1) {
    cleaned = cleaned.slice(extractedIdx + "/extracted/".length);
  }

  // Handle duplicated package paths (e.g., libs/pkg/libs/pkg/src/... -> libs/pkg/src/...)
  if (repoPathPrefix) {
    const pkgPathWithSlash = repoPathPrefix.replace(/^\/|\/$/g, "") + "/";
    if (cleaned.startsWith(pkgPathWithSlash)) {
      const afterPkgPath = cleaned.slice(pkgPathWithSlash.length);
      if (afterPkgPath.startsWith(pkgPathWithSlash) || afterPkgPath.startsWith(repoPathPrefix)) {
        cleaned = afterPkgPath;
      }
    }
  }

  // Clean up leading ./ or /
  cleaned = cleaned.replace(/^[./]+/, "");

  return cleaned;
}

/**
 * Get human-readable label for symbol kind
 */
function getKindLabel(kind: SymbolKind): string {
  const labels: Record<SymbolKind, string> = {
    class: "Class",
    function: "Function",
    method: "Method",
    property: "Property",
    attribute: "Attribute",
    interface: "Interface",
    typeAlias: "Type Alias",
    module: "Module",
    enum: "Enum",
    enumMember: "Enum Member",
    variable: "Variable",
    namespace: "Namespace",
    constructor: "Constructor",
    parameter: "Parameter",
  };
  return labels[kind] || kind;
}

/**
 * Get the code language identifier for syntax highlighting
 */
function getCodeLanguage(language: Language): string {
  return language === "python" ? "python" : "typescript";
}

/**
 * Escape pipe characters in table cells
 */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Convert a symbol record to markdown format
 *
 * @param symbol - The symbol record to convert
 * @param packageName - The package name for context
 * @param options - Generation options
 * @returns Markdown string
 */
export function symbolToMarkdown(
  symbol: SymbolRecord,
  packageName: string,
  options: MarkdownOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const baseUrl = opts.baseUrl || getBaseUrl();
  const lines: string[] = [];

  // Title
  lines.push(`# ${symbol.name}`);
  lines.push("");

  // Kind and package badge
  lines.push(`> **${getKindLabel(symbol.kind)}** in \`${packageName}\``);
  lines.push("");

  // Canonical URL
  const langPath = symbol.language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(packageName);
  // Use slugifySymbolPath to properly strip package prefix for Python
  const hasPackagePrefix = symbol.language === "python" && symbol.qualifiedName.includes("_");
  const symbolPath = slugifySymbolPath(symbol.qualifiedName, hasPackagePrefix);
  const canonicalUrl = `${baseUrl}/${langPath}/${packageSlug}/${symbolPath}`;
  lines.push(`📖 [View in docs](${canonicalUrl})`);
  lines.push("");

  // Summary
  if (symbol.docs?.summary) {
    lines.push(symbol.docs.summary);
    lines.push("");
  }

  // Signature
  if (symbol.signature) {
    const codeLang = getCodeLanguage(symbol.language);
    lines.push("## Signature");
    lines.push("");
    lines.push("```" + codeLang);
    lines.push(symbol.signature);
    lines.push("```");
    lines.push("");
  }

  // Description
  if (symbol.docs?.description) {
    lines.push("## Description");
    lines.push("");
    lines.push(symbol.docs.description);
    lines.push("");
  }

  // Parameters
  if (symbol.params && symbol.params.length > 0) {
    lines.push("## Parameters");
    lines.push("");
    lines.push("| Name | Type | Required | Description |");
    lines.push("|------|------|----------|-------------|");

    for (const param of symbol.params) {
      const required = param.required ? "Yes" : "No";
      const defaultVal = param.default ? ` (default: \`${param.default}\`)` : "";
      const desc = escapeTableCell((param.description || "") + defaultVal);
      const type = escapeTableCell(param.type || "unknown");
      lines.push(`| \`${param.name}\` | \`${type}\` | ${required} | ${desc} |`);
    }
    lines.push("");
  }

  // Returns
  if (symbol.returns) {
    lines.push("## Returns");
    lines.push("");
    lines.push(`\`${symbol.returns.type}\``);
    if (symbol.returns.description) {
      lines.push("");
      lines.push(symbol.returns.description);
    }
    lines.push("");
  }

  // Type parameters (generics)
  if (symbol.typeParams && symbol.typeParams.length > 0) {
    lines.push("## Type Parameters");
    lines.push("");
    for (const tp of symbol.typeParams) {
      let line = `- \`${tp.name}\``;
      if (tp.constraint) {
        line += ` extends \`${tp.constraint}\``;
      }
      if (tp.default) {
        line += ` = \`${tp.default}\``;
      }
      lines.push(line);
    }
    lines.push("");
  }

  // Bases (inheritance)
  if (symbol.relations?.extends && symbol.relations.extends.length > 0) {
    lines.push("## Extends");
    lines.push("");
    for (const base of symbol.relations.extends) {
      lines.push(`- \`${base}\``);
    }
    lines.push("");
  }

  // Implements
  if (symbol.relations?.implements && symbol.relations.implements.length > 0) {
    lines.push("## Implements");
    lines.push("");
    for (const iface of symbol.relations.implements) {
      lines.push(`- \`${iface}\``);
    }
    lines.push("");
  }

  // Members (properties and methods)
  if (opts.includeMemberDetails && symbol.members && symbol.members.length > 0) {
    const properties = symbol.members.filter(
      (m) => m.kind === "property" || m.kind === "attribute",
    );
    const methods = symbol.members.filter((m) => m.kind === "method" || m.kind === "function");
    const constructors = symbol.members.filter((m) => m.kind === "constructor");

    if (constructors.length > 0) {
      lines.push("## Constructors");
      lines.push("");
      for (const ctor of constructors) {
        lines.push(`- \`${ctor.name}()\``);
      }
      lines.push("");
    }

    if (properties.length > 0) {
      lines.push("## Properties");
      lines.push("");
      for (const prop of properties) {
        lines.push(`- \`${prop.name}\``);
      }
      lines.push("");
    }

    if (methods.length > 0) {
      lines.push("## Methods");
      lines.push("");
      for (const method of methods) {
        lines.push(`- \`${method.name}()\``);
      }
      lines.push("");
    }
  }

  // Examples
  if (opts.includeExamples && symbol.docs?.examples && symbol.docs.examples.length > 0) {
    lines.push("## Examples");
    lines.push("");
    for (let i = 0; i < symbol.docs.examples.length; i++) {
      const example = symbol.docs.examples[i];
      // Clean the example code to remove MkDocs admonition syntax
      const cleanedCode = cleanExampleCode(example.code);
      if (!cleanedCode) continue; // Skip empty examples

      if (example.title) {
        lines.push(`### ${example.title}`);
        lines.push("");
      } else if (symbol.docs.examples.length > 1) {
        lines.push(`### Example ${i + 1}`);
        lines.push("");
      }
      const exampleLang = example.language || getCodeLanguage(symbol.language);
      lines.push("```" + exampleLang);
      lines.push(cleanedCode);
      lines.push("```");
      lines.push("");
    }
  }

  // Deprecation warning
  if (symbol.docs?.deprecated) {
    lines.push("## ⚠️ Deprecated");
    lines.push("");
    if (symbol.docs.deprecated.message) {
      lines.push(symbol.docs.deprecated.message);
    }
    if (symbol.docs.deprecated.replacement) {
      lines.push("");
      lines.push(`Use \`${symbol.docs.deprecated.replacement}\` instead.`);
    }
    if (symbol.docs.deprecated.since) {
      lines.push("");
      lines.push(`Deprecated since version ${symbol.docs.deprecated.since}.`);
    }
    lines.push("");
  }

  // Source link - skip if path is empty or contains node_modules (external dependency)
  if (opts.includeSourceLink && symbol.source && symbol.source.path) {
    // Clean the source path to remove build cache prefixes and fix duplicated paths
    const cleanedPath = cleanSourcePath(symbol.source.path, opts.repoPathPrefix);

    // Skip external dependencies (node_modules)
    if (cleanedPath && !cleanedPath.includes("node_modules/")) {
      // Some IR builds store `symbol.source.path` relative to the package root (e.g. `src/...`).
      // If the caller provides `repoPathPrefix` (from the manifest's package repo path),
      // we join it to build a correct GitHub URL for monorepos.
      const cleanPrefix = opts.repoPathPrefix ? opts.repoPathPrefix.replace(/\/+$/, "") : "";
      const githubPath =
        cleanPrefix && !cleanedPath.startsWith(`${cleanPrefix}/`)
          ? `${cleanPrefix}/${cleanedPath}`
          : cleanedPath;

      const sourceUrl = symbol.source.line
        ? `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${githubPath}#L${symbol.source.line}`
        : `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${githubPath}`;

      lines.push("---");
      lines.push("");
      lines.push(`[View source on GitHub](${sourceUrl})`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a compact markdown summary for search results or listings
 *
 * @param symbol - The symbol record
 * @param packageName - The package name
 * @returns Compact markdown string
 */
export function symbolToCompactMarkdown(symbol: SymbolRecord, packageName: string): string {
  const lines: string[] = [];

  lines.push(`### ${symbol.name}`);
  lines.push("");
  lines.push(`**${getKindLabel(symbol.kind)}** in \`${packageName}\``);

  if (symbol.docs?.summary) {
    lines.push("");
    lines.push(symbol.docs.summary);
  }

  if (symbol.signature) {
    lines.push("");
    lines.push("```" + getCodeLanguage(symbol.language));
    lines.push(symbol.signature);
    lines.push("```");
  }

  return lines.join("\n");
}

/**
 * Generate markdown for a module/package overview
 *
 * @param packageName - The package name
 * @param symbols - Array of symbols in the package
 * @param language - The language (python or typescript)
 * @returns Markdown string
 */
export function packageToMarkdown(
  packageName: string,
  symbols: SymbolRecord[],
  language: Language,
): string {
  const lines: string[] = [];
  const baseUrl = getBaseUrl();
  const langPath = language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(packageName);

  lines.push(`# ${packageName}`);
  lines.push("");
  lines.push(`> ${language === "python" ? "Python" : "JavaScript/TypeScript"} package`);
  lines.push("");
  lines.push(`📖 [View in docs](${baseUrl}/${langPath}/${packageSlug})`);
  lines.push("");

  // Group symbols by kind
  const classes = symbols.filter((s) => s.kind === "class");
  const functions = symbols.filter((s) => s.kind === "function");
  const interfaces = symbols.filter((s) => s.kind === "interface");
  const types = symbols.filter((s) => s.kind === "typeAlias");
  const enums = symbols.filter((s) => s.kind === "enum");

  if (classes.length > 0) {
    lines.push("## Classes");
    lines.push("");
    for (const cls of classes) {
      const summary = cls.docs?.summary ? ` - ${cls.docs.summary}` : "";
      lines.push(`- \`${cls.name}\`${summary}`);
    }
    lines.push("");
  }

  if (functions.length > 0) {
    lines.push("## Functions");
    lines.push("");
    for (const fn of functions) {
      const summary = fn.docs?.summary ? ` - ${fn.docs.summary}` : "";
      lines.push(`- \`${fn.name}()\`${summary}`);
    }
    lines.push("");
  }

  if (interfaces.length > 0) {
    lines.push("## Interfaces");
    lines.push("");
    for (const iface of interfaces) {
      const summary = iface.docs?.summary ? ` - ${iface.docs.summary}` : "";
      lines.push(`- \`${iface.name}\`${summary}`);
    }
    lines.push("");
  }

  if (types.length > 0) {
    lines.push("## Types");
    lines.push("");
    for (const type of types) {
      const summary = type.docs?.summary ? ` - ${type.docs.summary}` : "";
      lines.push(`- \`${type.name}\`${summary}`);
    }
    lines.push("");
  }

  if (enums.length > 0) {
    lines.push("## Enums");
    lines.push("");
    for (const enumSym of enums) {
      const summary = enumSym.docs?.summary ? ` - ${enumSym.docs.summary}` : "";
      lines.push(`- \`${enumSym.name}\`${summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Catalog entry type for lightweight symbol summaries.
 * Matches CatalogEntry from loader.ts
 */
interface CatalogEntry {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  summary?: string;
  signature?: string;
}

/**
 * Options for package markdown generation from catalog
 */
export interface PackageMarkdownOptions {
  /** Package description/README content in markdown format */
  description?: string | null;
}

/**
 * Generate markdown documentation for a package from catalog entries.
 * Uses lightweight catalog entries instead of full SymbolRecord objects.
 *
 * @param packageName - The package name
 * @param entries - Array of catalog entries
 * @param language - The language (python or typescript)
 * @param options - Optional settings including package description
 * @returns Markdown string
 */
export function packageToMarkdownFromCatalog(
  packageName: string,
  entries: CatalogEntry[],
  language: Language,
  options: PackageMarkdownOptions = {},
): string {
  const lines: string[] = [];
  const baseUrl = getBaseUrl();
  const langPath = language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(packageName);

  lines.push(`# ${packageName}`);
  lines.push("");
  lines.push(`> ${language === "python" ? "Python" : "JavaScript/TypeScript"} package`);
  lines.push("");
  lines.push(`📖 [View in docs](${baseUrl}/${langPath}/${packageSlug})`);
  lines.push("");

  // Include package description (README content) if available
  if (options.description) {
    lines.push(options.description);
    lines.push("");
  }

  // Helper to build a symbol URL
  const buildEntryUrl = (entry: CatalogEntry): string => {
    // Detect if the qualifiedName has a package prefix (Python uses underscores)
    const parts = entry.qualifiedName.split(".");
    const hasPackagePrefix = language === "python" && parts.length > 1 && parts[0].includes("_");
    const symbolSlug = slugifySymbolPath(entry.qualifiedName, hasPackagePrefix);
    return `${baseUrl}/${langPath}/${packageSlug}/${symbolSlug}`;
  };

  // Group entries by kind
  const classes = entries.filter((e) => e.kind === "class");
  const functions = entries.filter((e) => e.kind === "function");
  const interfaces = entries.filter((e) => e.kind === "interface");
  const types = entries.filter((e) => e.kind === "typeAlias");
  const enums = entries.filter((e) => e.kind === "enum");

  if (classes.length > 0) {
    lines.push("## Classes");
    lines.push("");
    for (const cls of classes) {
      const url = buildEntryUrl(cls);
      const summary = cls.summary ? ` - ${cls.summary}` : "";
      lines.push(`- [\`${cls.name}\`](${url})${summary}`);
    }
    lines.push("");
  }

  if (functions.length > 0) {
    lines.push("## Functions");
    lines.push("");
    for (const fn of functions) {
      const url = buildEntryUrl(fn);
      const summary = fn.summary ? ` - ${fn.summary}` : "";
      lines.push(`- [\`${fn.name}()\`](${url})${summary}`);
    }
    lines.push("");
  }

  if (interfaces.length > 0) {
    lines.push("## Interfaces");
    lines.push("");
    for (const iface of interfaces) {
      const url = buildEntryUrl(iface);
      const summary = iface.summary ? ` - ${iface.summary}` : "";
      lines.push(`- [\`${iface.name}\`](${url})${summary}`);
    }
    lines.push("");
  }

  if (types.length > 0) {
    lines.push("## Types");
    lines.push("");
    for (const type of types) {
      const url = buildEntryUrl(type);
      const summary = type.summary ? ` - ${type.summary}` : "";
      lines.push(`- [\`${type.name}\`](${url})${summary}`);
    }
    lines.push("");
  }

  if (enums.length > 0) {
    lines.push("## Enums");
    lines.push("");
    for (const enumSym of enums) {
      const url = buildEntryUrl(enumSym);
      const summary = enumSym.summary ? ` - ${enumSym.summary}` : "";
      lines.push(`- [\`${enumSym.name}\`](${url})${summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
