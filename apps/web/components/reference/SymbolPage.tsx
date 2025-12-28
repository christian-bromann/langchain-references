/**
 * Symbol Page Component
 *
 * Displays detailed documentation for a single symbol (class, function, etc.)
 */

import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UrlLanguage } from "@/lib/utils/url";
import { buildPackageUrl, getKindColor, getKindLabel } from "@/lib/utils/url";
import type { SymbolKind, Visibility, Stability, SymbolRecord } from "@/lib/ir/types";
import {
  getLocalLatestBuildId,
  getLocalSymbolByPath,
  getLocalPackageSymbols,
} from "@/lib/ir/loader";
import { CodeBlock } from "./CodeBlock";
import { MarkdownContent } from "./MarkdownContent";

interface SymbolPageProps {
  language: UrlLanguage;
  packageId: string;
  packageName: string;
  symbolPath: string;
}

/**
 * Display symbol structure for the page
 */
interface DisplaySymbol {
  id: string;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  signature: string;
  visibility?: Visibility;
  stability?: Stability;
  docs: {
    summary: string;
    description?: string;
    sections?: DocSection[];
  };
  source?: {
    repo: string;
    sha: string;
    path: string;
    line: number | null;
    endLine?: number;
  };
  members?: { name: string; kind: string; refId?: string; visibility?: Visibility }[];
  bases?: string[];
}

interface DocSection {
  kind: string;
  title?: string;
  items?: DocItem[];
  content?: string;
}

interface DocItem {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  default?: string;
}

/**
 * Convert IR SymbolRecord to DisplaySymbol
 */
function toDisplaySymbol(symbol: SymbolRecord): DisplaySymbol {
  // Build sections from params if available
  const sections: DocSection[] = [];

  if (symbol.params && symbol.params.length > 0) {
    sections.push({
      kind: "parameters",
      title: "Parameters",
      items: symbol.params.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
        default: p.default,
      })),
    });
  }

  // Add examples if present in docs
  if (symbol.docs?.examples) {
    for (const example of symbol.docs.examples) {
      sections.push({
        kind: "example",
        title: example.title || "Example",
        content: example.code,
      });
    }
  }

  return {
    id: symbol.id,
    kind: symbol.kind,
    name: symbol.name,
    qualifiedName: symbol.qualifiedName,
    signature: symbol.signature,
    visibility: symbol.tags?.visibility,
    stability: symbol.tags?.stability,
    docs: {
      summary: symbol.docs?.summary || "",
      description: symbol.docs?.description,
      sections: sections.length > 0 ? sections : undefined,
    },
    source: symbol.source
      ? {
          repo: symbol.source.repo,
          sha: symbol.source.sha,
          path: symbol.source.path,
          line: symbol.source.line,
        }
      : undefined,
    members: symbol.members?.map((m) => ({
      name: m.name,
      kind: m.kind,
      refId: m.refId,
      visibility: m.visibility,
    })),
    bases: symbol.relations?.extends,
  };
}

/**
 * Find a symbol by path, trying different variations
 */
async function findSymbol(
  buildId: string,
  packageId: string,
  symbolPath: string
): Promise<SymbolRecord | null> {
  // Try exact match first
  let symbol = await getLocalSymbolByPath(buildId, packageId, symbolPath);
  if (symbol) return symbol;

  // Try with underscores instead of dots for Python module paths
  const underscorePath = symbolPath.replace(/\./g, "_");
  symbol = await getLocalSymbolByPath(buildId, packageId, underscorePath);
  if (symbol) return symbol;

  // Try searching by name
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (result?.symbols) {
    // Try to find by qualified name ending
    const found = result.symbols.find(
      (s) =>
        s.qualifiedName === symbolPath ||
        s.qualifiedName.endsWith(`.${symbolPath}`) ||
        s.name === symbolPath.split(".").pop()
    );
    if (found) return found;
  }

  return null;
}

export async function SymbolPage({ language, packageId, packageName, symbolPath }: SymbolPageProps) {
  // Load symbol from IR
  const irLanguage = language === "python" ? "python" : "javascript";
  const buildId = await getLocalLatestBuildId(irLanguage);

  let symbol: DisplaySymbol | null = null;

  if (buildId) {
    const irSymbol = await findSymbol(buildId, packageId, symbolPath);
    if (irSymbol) {
      symbol = toDisplaySymbol(irSymbol);
    }
  }

  // Show not found state if symbol wasn't loaded
  if (!symbol) {
    return (
      <div className="space-y-8">
        <nav className="flex items-center gap-2 text-sm text-foreground-secondary">
          <Link
            href={`/${language === "python" ? "python" : "javascript"}`}
            className="hover:text-foreground transition-colors"
          >
            {language === "python" ? "Python" : "JavaScript"}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link
            href={buildPackageUrl(language, packageName)}
            className="hover:text-foreground transition-colors"
          >
            {packageName}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">{symbolPath}</span>
        </nav>

        <div className="text-center py-12">
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
            Symbol Not Found
          </h1>
          <p className="text-foreground-secondary">
            The symbol <code className="font-mono">{symbolPath}</code> was not found in {packageName}.
          </p>
        </div>
      </div>
    );
  }

  const sourceUrl =
    symbol.source && symbol.source.line
      ? `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${symbol.source.path}#L${symbol.source.line}`
      : symbol.source
        ? `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${symbol.source.path}`
        : null;

  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-foreground-secondary flex-wrap">
        <Link
          href={`/${language === "python" ? "python" : "javascript"}`}
          className="hover:text-foreground transition-colors"
        >
          {language === "python" ? "Python" : "JavaScript"}
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0" />
        <Link
          href={buildPackageUrl(language, packageName)}
          className="hover:text-foreground transition-colors"
        >
          {packageName}
        </Link>
        {symbolPath.split(".").map((part, i, arr) => (
          <span key={i} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className={i === arr.length - 1 ? "text-foreground" : ""}>
              {part}
            </span>
          </span>
        ))}
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className={cn("px-2 py-1 text-sm font-medium rounded", getKindColor(symbol.kind))}>
            {getKindLabel(symbol.kind)}
          </span>
          {symbol.visibility === "private" && (
            <span className="px-2 py-1 text-sm font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              Private
            </span>
          )}
          {symbol.stability === "deprecated" && (
            <span className="px-2 py-1 text-sm font-medium rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              Deprecated
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold text-foreground font-mono">
          {symbol.name}
        </h1>
        {symbol.docs?.summary && (
          <MarkdownContent compact className="mt-3 text-foreground-secondary text-lg">
            {symbol.docs.summary}
          </MarkdownContent>
        )}
      </div>

      {/* Signature */}
      {symbol.signature && (
        <CodeBlock
          code={symbol.signature}
          language={language === "python" ? "python" : "typescript"}
          className="rounded-lg overflow-x-auto [&_pre]:p-4 [&_pre]:m-0 [&_pre]:text-sm [&_code]:text-sm"
        />
      )}

      {/* Bases (for classes) */}
      {symbol.bases && symbol.bases.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-2">
            Bases
          </h2>
          <div className="flex flex-wrap gap-2">
            {symbol.bases.map((base) => (
              <code
                key={base}
                className="px-2 py-1 bg-background-secondary rounded text-sm font-mono text-foreground"
              >
                {base}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {symbol.docs?.description && (
        <MarkdownContent>
          {symbol.docs.description}
        </MarkdownContent>
      )}

      {/* Sections (parameters, examples, etc.) */}
      {symbol.docs?.sections?.map((section, i) => (
        <Section key={i} section={section} language={language} />
      ))}

      {/* Members (for classes/modules) */}
      {symbol.members && symbol.members.length > 0 && (
        <div>
          <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
            Members
          </h2>
          <div className="space-y-2">
            {symbol.members.map((member) => (
              <div
                key={member.name}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background-secondary"
              >
                <span className={cn("px-2 py-0.5 text-xs font-medium rounded", getKindColor(member.kind as SymbolKind))}>
                  {member.kind}
                </span>
                <code className="font-mono text-foreground">{member.name}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source link */}
      {sourceUrl && (
        <div className="pt-4 border-t border-border">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-foreground-secondary hover:text-primary transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            View source on GitHub
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Render a documentation section
 */
async function Section({ section, language }: { section: DocSection; language: UrlLanguage }) {
  if (section.kind === "parameters" || section.kind === "attributes") {
    return (
      <div>
        <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
          {section.title || "Parameters"}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 font-semibold text-foreground">Name</th>
                <th className="text-left py-2 px-3 font-semibold text-foreground">Type</th>
                <th className="text-left py-2 px-3 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {section.items?.map((item) => (
                <tr key={item.name} className="border-b border-border last:border-0">
                  <td className="py-3 px-3">
                    <code className="font-mono text-foreground">{item.name}</code>
                    {item.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <code className="font-mono text-foreground-secondary text-xs">
                      {item.type}
                    </code>
                  </td>
                  <td className="py-3 px-3 text-foreground-secondary">
                    {item.description && (
                      <MarkdownContent compact>
                        {item.description}
                      </MarkdownContent>
                    )}
                    {item.default && (
                      <span className="ml-2 text-xs text-foreground-muted">
                        Default: <code>{item.default}</code>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section.kind === "example" && section.content) {
    return (
      <div>
        <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
          {section.title || "Example"}
        </h2>
        <CodeBlock
          code={section.content}
          language={language === "python" ? "python" : "typescript"}
          className="rounded-lg overflow-x-auto [&_pre]:p-4 [&_pre]:m-0 [&_pre]:text-sm [&_code]:text-sm"
        />
      </div>
    );
  }

  return null;
}
