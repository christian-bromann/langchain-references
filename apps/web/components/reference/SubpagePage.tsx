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
  getKindColor,
  getKindLabel,
  slugifyPackageName,
  type UrlLanguage,
} from "@/lib/utils/url";
import {
  getBuildIdForPackageId,
  getSubpageData,
  getCatalogEntries,
  type CatalogEntry,
} from "@/lib/ir/loader";
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
  summary?: string;
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
    summary: entry.summary,
    signature: entry.signature,
  };
}

/**
 * Resolve symbol references to catalog entries.
 * Tries exact match, suffix match, and name-only match.
 */
function resolveSymbolRefs(symbolRefs: string[], catalogEntries: CatalogEntry[]): CatalogEntry[] {
  const resolved: CatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const ref of symbolRefs) {
    // Try exact qualified name match
    let match = catalogEntries.find((e) => e.qualifiedName === ref);

    // Try suffix match (e.g., "agents.SummarizationMiddleware" matches "langchain.agents.middleware.SummarizationMiddleware")
    if (!match) {
      match = catalogEntries.find(
        (e) => e.qualifiedName.endsWith(`.${ref}`) || e.qualifiedName.endsWith(ref),
      );
    }

    // Try name-only match (last segment)
    if (!match) {
      const namePart = ref.split(".").pop();
      if (namePart) {
        match = catalogEntries.find((e) => e.name === namePart);
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

  // Resolve symbol references to catalog entries
  const resolvedEntries = resolveSymbolRefs(subpageData.symbolRefs, catalogEntries);
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
            {packageName}
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
            {packageName} &rarr; {subpageData.title}
          </p>
        </div>

        {/* Markdown content (overview section) */}
        {subpageData.markdownContent && (
          <section id="section-overview">
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <MarkdownContent>{subpageData.markdownContent}</MarkdownContent>
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
function SymbolCard({
  symbol,
  language,
  packageName,
}: {
  symbol: DisplaySymbol;
  language: UrlLanguage;
  packageName: string;
}) {
  const href = buildSymbolUrl(language, packageName, symbol.qualifiedName);

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
        {symbol.summary && (
          <p className="mt-1 text-sm text-foreground-secondary line-clamp-2">{symbol.summary}</p>
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
