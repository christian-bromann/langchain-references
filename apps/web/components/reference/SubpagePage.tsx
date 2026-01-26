/**
 * Subpage Component
 *
 * Displays a curated subpage with markdown content and grouped symbol cards.
 * Symbols are resolved from the ::: directives in the markdown source.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Code, Folder, ChevronRight, FileType, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  buildSymbolUrl,
  extractPackageFromQualifiedName,
  getDisplayPackageName,
  getKindColor,
  getKindLabel,
  slugifyPackageName,
  type UrlLanguage,
} from "@/lib/utils/url";
import {
  getBuildIdForPackageId,
  getSubpageData,
  getCatalogEntries,
  getProjectPackageIndex,
  type CatalogEntry,
} from "@/lib/ir/loader";
import { getProjectForPackage } from "@/lib/config/projects";
import { PackageTableOfContents, type PackageTOCSection } from "./PackageTableOfContents";
import { MarkdownContent } from "./MarkdownContent";
import { subpageToMarkdown } from "@/lib/ir/markdown-generator";
import { getBaseUrl } from "@/lib/config/mcp";
import { languageToSymbolLanguage, symbolLanguageToLanguage } from "@langchain/ir-schema";
import { LANGUAGE_CONFIG } from "@/lib/config/languages";

interface SubpagePageProps {
  language: UrlLanguage;
  packageId: string;
  packageName: string;
  subpageSlug: string;
}

/**
 * Simple symbol type for display purposes
 */
interface DisplaySymbol {
  id: string;
  kind:
    | "class"
    | "function"
    | "method"
    | "module"
    | "interface"
    | "property"
    | "typeAlias"
    | "enum";
  name: string;
  qualifiedName: string;
  summaryHtml?: string;
  signature?: string;
}

/**
 * Convert CatalogEntry to DisplaySymbol
 */
function toDisplaySymbol(entry: CatalogEntry): DisplaySymbol {
  return {
    id: entry.id,
    kind: entry.kind as DisplaySymbol["kind"],
    name: entry.name,
    qualifiedName: entry.qualifiedName,
    summaryHtml: entry.summaryHtml,
    signature: entry.signature,
  };
}

/**
 * Transform anchor links in markdown content to proper symbol page URLs.
 *
 * Uses catalog entries to resolve the actual qualified names, fixing cases where
 * the markdown anchor uses a shortened path (e.g., `#langchain.agents.middleware.SummarizationMiddleware`)
 * but the actual symbol is at a deeper path (e.g., `langchain.agents.middleware.summarization.SummarizationMiddleware`).
 *
 * @param content - Raw markdown content with anchor links
 * @param language - Current language (python, javascript, etc.)
 * @param packageName - Current package name
 * @param catalogEntries - Catalog entries for symbol lookup
 * @param crossPackageCatalogs - Cross-package catalog entries for fallback lookup
 * @returns Markdown content with transformed links
 */
function transformAnchorLinksToSymbolUrls(
  content: string,
  language: UrlLanguage,
  packageName: string,
  catalogEntries: CatalogEntry[],
  crossPackageCatalogs: CatalogEntry[] = [],
): string {
  if (!content) return content;

  // Build a lookup map from symbol names to catalog entries for fast resolution
  // This allows us to find the actual qualified name when the anchor uses a shortened path
  const symbolByName = new Map<string, CatalogEntry>();
  const allCatalogs = [...catalogEntries, ...crossPackageCatalogs];

  for (const entry of allCatalogs) {
    // Index by simple name (prefer entries from primary catalog)
    if (!symbolByName.has(entry.name) || catalogEntries.includes(entry)) {
      symbolByName.set(entry.name, entry);
    }
  }

  // Match markdown links with anchor refs that look like qualified names
  // Pattern: [text](#qualified.name.Symbol) or [`text`](#qualified.name.Symbol)
  const anchorLinkPattern = /\[([^\]]+)\]\(#([a-zA-Z_][a-zA-Z0-9_.]*)\)/g;

  return content.replace(anchorLinkPattern, (match, linkText, anchorQualifiedName) => {
    // Only transform if it looks like a Python qualified name (has dots)
    if (!anchorQualifiedName.includes(".")) {
      return match; // Keep as-is for simple anchors
    }

    // Extract the symbol name from the anchor (last part after the last dot)
    const symbolName = anchorQualifiedName.split(".").pop();
    if (!symbolName) {
      return match;
    }

    // Try to find the symbol in the catalog to get the actual qualified name
    const catalogEntry = symbolByName.get(symbolName);

    let actualQualifiedName: string;
    let actualPackage: string;

    if (catalogEntry) {
      // Use the actual qualified name from the catalog
      actualQualifiedName = catalogEntry.qualifiedName;
      actualPackage = extractPackageFromQualifiedName(actualQualifiedName, language, packageName);
    } else {
      // Fall back to the anchor's qualified name if not found in catalog
      actualQualifiedName = anchorQualifiedName;
      actualPackage = extractPackageFromQualifiedName(anchorQualifiedName, language, packageName);
    }

    // Build the symbol URL using the resolved qualified name
    const symbolUrl = buildSymbolUrl(language, actualPackage, actualQualifiedName);

    return `[${linkText}](${symbolUrl})`;
  });
}

/**
 * Resolve symbol references to catalog entries.
 * Tries exact match, suffix match, and name-only match.
 *
 * For symbols not found in the primary catalog, falls back to cross-package catalogs.
 * This handles cases where symbols are re-exported (aliased) from other packages,
 * e.g., langchain.messages.AIMessage -> langchain_core.messages.AIMessage
 */
function resolveSymbolRefs(
  symbolRefs: string[],
  catalogEntries: CatalogEntry[],
  crossPackageCatalogs: CatalogEntry[] = [],
): CatalogEntry[] {
  const resolved: CatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const ref of symbolRefs) {
    // Try exact qualified name match in primary catalog
    let match = catalogEntries.find((e) => e.qualifiedName === ref);

    // Try suffix match in primary catalog
    if (!match) {
      match = catalogEntries.find(
        (e) => e.qualifiedName.endsWith(`.${ref}`) || e.qualifiedName.endsWith(ref),
      );
    }

    // Try name-only match in primary catalog
    if (!match) {
      const namePart = ref.split(".").pop();
      if (namePart) {
        match = catalogEntries.find((e) => e.name === namePart);
      }
    }

    // If not found in primary catalog, try cross-package catalogs
    // This handles re-exports (aliases) like langchain.messages.AIMessage
    if (!match && crossPackageCatalogs.length > 0) {
      const namePart = ref.split(".").pop();
      if (namePart) {
        // For re-exports, look for exact name match in related packages
        // Prioritize entries that contain similar module path parts
        const refParts = ref.split(".");
        const modulePart = refParts.length > 2 ? refParts[refParts.length - 2] : null;

        if (modulePart) {
          // First try to find a match with the same module name (e.g., "messages")
          match = crossPackageCatalogs.find(
            (e) => e.name === namePart && e.qualifiedName.includes(`.${modulePart}.`),
          );
        }

        // Fall back to simple name match
        if (!match) {
          match = crossPackageCatalogs.find((e) => e.name === namePart);
        }
      }
    }

    if (match && !seenIds.has(match.id)) {
      seenIds.add(match.id);
      resolved.push(match);
    }
  }

  return resolved;
}

export async function SubpagePage({
  language,
  packageId,
  packageName,
  subpageSlug,
}: SubpagePageProps) {
  // Get build ID for the package
  const buildId = await getBuildIdForPackageId(packageId);

  if (!buildId) {
    notFound();
  }

  // Fetch subpage data and catalog entries in parallel
  const [subpageData, catalogEntries] = await Promise.all([
    getSubpageData(buildId, packageId, subpageSlug),
    getCatalogEntries(buildId, packageId),
  ]);

  if (!subpageData) {
    notFound();
  }

  // Get cross-package catalogs for resolving re-exported symbols
  // This handles cases like langchain.messages.AIMessage -> langchain_core.messages.AIMessage
  const crossPackageCatalogs: CatalogEntry[] = [];

  // Get the project for this package to find related packages
  const project = getProjectForPackage(packageName);
  const projectLanguage = language === "javascript" ? "javascript" : "python";

  try {
    const packageIndex = await getProjectPackageIndex(project.id, projectLanguage);
    if (packageIndex?.packages) {
      // Load catalogs from other packages in the same project
      const otherPackagePromises = Object.entries(packageIndex.packages)
        .filter(([pkgName]) => pkgName !== packageName)
        .map(async ([pkgName, pkgInfo]) => {
          const pkgId = `pkg_${projectLanguage === "python" ? "py" : "js"}_${pkgName}`;
          try {
            return await getCatalogEntries(pkgInfo.buildId, pkgId);
          } catch {
            return [];
          }
        });

      const otherCatalogs = await Promise.all(otherPackagePromises);
      crossPackageCatalogs.push(...otherCatalogs.flat());
    }
  } catch {
    // Cross-package resolution is best-effort; continue without it
  }

  // Resolve symbol references to catalog entries (with cross-package fallback)
  const resolvedEntries = resolveSymbolRefs(
    subpageData.symbolRefs,
    catalogEntries,
    crossPackageCatalogs,
  );
  const symbols: DisplaySymbol[] = resolvedEntries.map(toDisplaySymbol);

  // Group symbols by kind
  const classes = symbols.filter((s) => s.kind === "class");
  const functions = symbols.filter((s) => s.kind === "function");
  const modules = symbols.filter((s) => s.kind === "module");
  const interfaces = symbols.filter((s) => s.kind === "interface");
  const types = symbols.filter((s) => s.kind === "typeAlias" || s.kind === "enum");

  // Build TOC sections for the sidebar
  const tocSections: PackageTOCSection[] = [];
  if (subpageData.markdownContent) {
    tocSections.push({
      id: "section-overview",
      title: "Overview",
      icon: "module",
    });
  }
  if (classes.length > 0) {
    tocSections.push({
      id: "section-classes",
      title: "Classes",
      icon: "class",
      count: classes.length,
    });
  }
  if (functions.length > 0) {
    tocSections.push({
      id: "section-functions",
      title: "Functions",
      icon: "function",
      count: functions.length,
    });
  }
  if (modules.length > 0) {
    tocSections.push({
      id: "section-modules",
      title: "Modules",
      icon: "module",
      count: modules.length,
    });
  }
  if (interfaces.length > 0) {
    tocSections.push({
      id: "section-interfaces",
      title: "Interfaces",
      icon: "interface",
      count: interfaces.length,
    });
  }
  if (types.length > 0) {
    tocSections.push({
      id: "section-types",
      title: "Types",
      icon: "type",
      count: types.length,
    });
  }

  const symbolLanguage = symbolLanguageToLanguage(
    language === "javascript" ? "typescript" : language,
  );
  const languageLabel = LANGUAGE_CONFIG[symbolLanguage].name;
  const languagePath = language === "python" ? "python" : "javascript";
  const packageSlug = packageName.replace(/_/g, "-").toLowerCase();

  return (
    <div className="flex gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm text-foreground-secondary">
          <Link href={`/${languagePath}`} className="hover:text-foreground transition-colors">
            {languageLabel}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link
            href={`/${languagePath}/${packageSlug}`}
            className="hover:text-foreground transition-colors"
          >
            {getDisplayPackageName(packageName, language)}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">{subpageData.title}</span>
        </nav>

        {/* Page header */}
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-heading font-bold text-foreground">{subpageData.title}</h1>
          </div>
          <p className="mt-3 text-foreground-secondary text-lg">
            {getDisplayPackageName(packageName, language)} &rarr; {subpageData.title}
          </p>
        </div>

        {/* Markdown content (overview section) */}
        {subpageData.markdownContent && (
          <section id="section-overview">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <MarkdownContent>
                {transformAnchorLinksToSymbolUrls(
                  subpageData.markdownContent,
                  language,
                  packageName,
                  catalogEntries,
                  crossPackageCatalogs,
                )}
              </MarkdownContent>
            </div>
          </section>
        )}

        {/* Classes section */}
        {classes.length > 0 && (
          <SymbolSection
            id="section-classes"
            title="Classes"
            icon={<Box className="h-5 w-5" />}
            symbols={classes}
            language={language}
            packageName={packageName}
          />
        )}

        {/* Functions section */}
        {functions.length > 0 && (
          <SymbolSection
            id="section-functions"
            title="Functions"
            icon={<Code className="h-5 w-5" />}
            symbols={functions}
            language={language}
            packageName={packageName}
          />
        )}

        {/* Modules section */}
        {modules.length > 0 && (
          <SymbolSection
            id="section-modules"
            title="Modules"
            icon={<Folder className="h-5 w-5" />}
            symbols={modules}
            language={language}
            packageName={packageName}
          />
        )}

        {/* Interfaces section */}
        {interfaces.length > 0 && (
          <SymbolSection
            id="section-interfaces"
            title="Interfaces"
            icon={<FileType className="h-5 w-5" />}
            symbols={interfaces}
            language={language}
            packageName={packageName}
          />
        )}

        {/* Types section */}
        {types.length > 0 && (
          <SymbolSection
            id="section-types"
            title="Types"
            icon={<FileType className="h-5 w-5" />}
            symbols={types}
            language={language}
            packageName={packageName}
          />
        )}

        {/* Empty state when no symbols resolved */}
        {symbols.length === 0 && !subpageData.markdownContent && (
          <div className="text-center py-12 text-foreground-secondary">
            <p>No content found for this subpage.</p>
          </div>
        )}
      </div>

      {/* Table of Contents sidebar */}
      <PackageTableOfContents
        sections={tocSections}
        markdown={subpageToMarkdown(
          subpageData.title,
          packageName,
          subpageData.markdownContent || "",
          resolvedEntries,
          symbolLanguageToLanguage(
            languageToSymbolLanguage(language === "typescript" ? "javascript" : language),
          ),
        )}
        pageUrl={`${getBaseUrl()}/${languagePath}/${slugifyPackageName(packageName)}/${subpageSlug}`}
      />
    </div>
  );
}

/**
 * Section for a group of symbols
 */
function SymbolSection({
  id,
  title,
  icon,
  symbols,
  language,
  packageName,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  symbols: DisplaySymbol[];
  language: UrlLanguage;
  packageName: string;
}) {
  return (
    <section id={id}>
      <h2 className="flex items-center gap-2 text-xl font-heading font-semibold text-foreground mb-4">
        {icon}
        {title}
      </h2>
      <div className="space-y-2">
        {symbols.map((symbol) => (
          <SymbolCard
            key={symbol.id}
            symbol={symbol}
            language={language}
            packageName={packageName}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Card for a single symbol
 */
async function SymbolCard({
  symbol,
  language,
  packageName,
}: {
  symbol: DisplaySymbol;
  language: UrlLanguage;
  packageName: string;
}) {
  // Extract the actual package from the qualified name for cross-package symbols
  // e.g., if viewing langchain but symbol is from langchain_core, use langchain_core
  const actualPackage = extractPackageFromQualifiedName(symbol.qualifiedName, language, packageName);
  const href = buildSymbolUrl(language, actualPackage, symbol.qualifiedName);

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-4 p-4 rounded-lg",
        "border border-border bg-background-secondary",
        "hover:border-primary/50 hover:bg-background transition-colors",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn("px-2 py-0.5 text-xs font-medium rounded", getKindColor(symbol.kind))}
          >
            {getKindLabel(symbol.kind)}
          </span>
          <h3 className="font-mono font-semibold text-foreground group-hover:text-primary transition-colors">
            {symbol.name}
          </h3>
        </div>
        {symbol.summaryHtml && (
          <div className="mt-1 [&_code]:text-xs">
            <div
              className="text-sm text-foreground-secondary line-clamp-2 m-0 [&_p]:m-0"
              dangerouslySetInnerHTML={{ __html: symbol.summaryHtml }}
            />
          </div>
        )}
        {symbol.signature && (
          <code className="mt-2 block text-xs text-foreground-muted font-mono truncate">
            {symbol.signature}
          </code>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors shrink-0 mt-1" />
    </Link>
  );
}
