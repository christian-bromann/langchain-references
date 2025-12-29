/**
 * Package Page Component
 *
 * Displays an overview of a package with its classes, functions, and modules.
 */

import Link from "next/link";
import { Box, Code, Folder, ChevronRight, FileType } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UrlLanguage } from "@/lib/utils/url";
import { buildSymbolUrl, getKindColor, getKindLabel } from "@/lib/utils/url";
import { getBuildIdForLanguage, getSymbols } from "@/lib/ir/loader";
import type { SymbolRecord } from "@/lib/ir/types";

interface PackagePageProps {
  language: UrlLanguage;
  packageId: string;
  packageName: string;
}

/**
 * Simple symbol type for display purposes
 */
interface DisplaySymbol {
  id: string;
  kind: "class" | "function" | "method" | "module" | "interface" | "property" | "typeAlias" | "enum";
  name: string;
  qualifiedName: string;
  summary?: string;
  signature?: string;
}

/**
 * Convert IR SymbolRecord to DisplaySymbol
 */
function toDisplaySymbol(symbol: SymbolRecord): DisplaySymbol {
  return {
    id: symbol.id,
    kind: symbol.kind as DisplaySymbol["kind"],
    name: symbol.name,
    qualifiedName: symbol.qualifiedName,
    summary: symbol.docs?.summary,
    signature: symbol.signature,
  };
}

export async function PackagePage({ language, packageId, packageName }: PackagePageProps) {
  const irLanguage = language === "python" ? "python" : "javascript";
  const buildId = await getBuildIdForLanguage(irLanguage);
  const result = buildId ? await getSymbols(buildId, packageId) : null;

  const symbols: DisplaySymbol[] = result?.symbols
    ?.filter((s) => s.tags?.visibility === "public")
    .map(toDisplaySymbol) ?? [];

  // Group symbols by kind
  const classes = symbols.filter((s) => s.kind === "class");
  const functions = symbols.filter((s) => s.kind === "function");
  const modules = symbols.filter((s) => s.kind === "module");
  const interfaces = symbols.filter((s) => s.kind === "interface");
  const types = symbols.filter((s) => s.kind === "typeAlias" || s.kind === "enum");

  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-foreground-secondary">
        <Link
          href={`/${language === "python" ? "python" : "javascript"}`}
          className="hover:text-foreground transition-colors"
        >
          {language === "python" ? "Python" : "JavaScript"}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{packageName}</span>
      </nav>

      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Box className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            {packageName}
          </h1>
        </div>
        <p className="mt-3 text-foreground-secondary text-lg">
          API reference for the {packageName} package.
        </p>
      </div>

      {/* Classes section */}
      {classes.length > 0 && (
        <SymbolSection
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
          title="Types"
          icon={<FileType className="h-5 w-5" />}
          symbols={types}
          language={language}
          packageName={packageName}
        />
      )}

      {/* Empty state */}
      {classes.length === 0 && functions.length === 0 && modules.length === 0 && interfaces.length === 0 && types.length === 0 && (
        <div className="text-center py-12 text-foreground-secondary">
          <p>No symbols found for this package.</p>
          <p className="mt-2 text-sm">
            This package may not have been extracted yet.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Section for a group of symbols
 */
function SymbolSection({
  title,
  icon,
  symbols,
  language,
  packageName,
}: {
  title: string;
  icon: React.ReactNode;
  symbols: DisplaySymbol[];
  language: UrlLanguage;
  packageName: string;
}) {
  return (
    <section>
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
        "hover:border-primary/50 hover:bg-background transition-colors"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 text-xs font-medium rounded", getKindColor(symbol.kind))}>
            {getKindLabel(symbol.kind)}
          </span>
          <h3 className="font-mono font-semibold text-foreground group-hover:text-primary transition-colors">
            {symbol.name}
          </h3>
        </div>
        {symbol.summary && (
          <p className="mt-1 text-sm text-foreground-secondary line-clamp-2">
            {symbol.summary}
          </p>
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
