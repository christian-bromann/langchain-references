/**
 * Symbol Card and Section Components
 *
 * Shared components for displaying symbols in package and subpage pages.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { stripAnchors } from "@/lib/utils/html";
import type { UrlLanguage } from "@/lib/utils/url";
import {
  buildSymbolUrl,
  extractPackageFromQualifiedName,
  getKindColor,
  getKindLabel,
} from "@/lib/utils/url";
import type { CatalogEntry } from "@/lib/ir/loader";

/**
 * Simple symbol type for display purposes
 */
export interface DisplaySymbol {
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
export function toDisplaySymbol(entry: CatalogEntry): DisplaySymbol {
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
 * Section for a group of symbols
 */
export function SymbolSection({
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
export async function SymbolCard({
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
  const actualPackage = extractPackageFromQualifiedName(
    symbol.qualifiedName,
    language,
    packageName,
  );
  const href = buildSymbolUrl(language, actualPackage, symbol.qualifiedName);
  const __html = symbol.summaryHtml
    ? /**
       * Strip anchors and get the first line of the summary
       */
      stripAnchors(symbol.summaryHtml).split("\n").shift()
    : undefined;

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
        {__html && (
          <div className="mt-1 [&_code]:text-xs">
            <div
              className="text-sm text-foreground-secondary line-clamp-2 m-0 [&_p]:m-0"
              dangerouslySetInnerHTML={{ __html }}
            />
          </div>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors shrink-0 mt-1" />
    </Link>
  );
}
