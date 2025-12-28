/**
 * Symbol Page Component
 *
 * Displays detailed documentation for a single symbol (class, function, etc.)
 */

import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UrlLanguage } from "@/lib/utils/url";
import { buildPackageUrl, getKindColor, getKindLabel, slugifyPackageName } from "@/lib/utils/url";
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
 * Generate display code for a symbol.
 * For modules, show an import statement instead of just the module name.
 */
function getDisplayCode(
  symbol: { kind: SymbolKind; name: string; signature: string },
  packageName: string,
  language: UrlLanguage
): string {
  // For modules, show an import statement
  if (symbol.kind === "module") {
    // Module name might be something like "hub/node" or "chat_models/universal"
    const modulePath = symbol.name;

    if (language === "python") {
      // Python: from langchain_core.messages import ...
      const pythonPath = `${packageName}.${modulePath.replace(/\//g, ".")}`;
      return `from ${pythonPath} import ...`;
    } else {
      // JavaScript/TypeScript: import { ... } from "packageName/modulePath"
      // Handle index module specially - it imports from the package root
      if (modulePath === "index") {
        return `import { ... } from "${packageName}";`;
      }
      return `import { ... } from "${packageName}/${modulePath}";`;
    }
  }

  // For other symbols, return the signature as-is
  return symbol.signature;
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
  members?: DisplayMember[];
  bases?: string[];
}

/**
 * Member with resolved type and description info
 */
interface DisplayMember {
  name: string;
  kind: string;
  refId?: string;
  visibility?: Visibility;
  type?: string;
  summary?: string;
  signature?: string;
}

interface DocSection {
  kind: string;
  title?: string;
  items?: DocItem[];
  content?: string;
  description?: string; // Optional description shown before content (e.g., for examples)
}

interface DocItem {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  default?: string;
}

/**
 * Extract type from a signature string
 * e.g., "log: string" -> "string"
 * e.g., "lookup(prompt: string): Promise<Generation[] | null>" -> "Promise<Generation[] | null>"
 */
function extractTypeFromSignature(signature: string, kind: string): string | undefined {
  if (!signature) return undefined;

  if (kind === "method" || kind === "function" || kind === "constructor") {
    // For methods, extract return type after the last ":"
    const returnMatch = signature.match(/\):\s*(.+)$/);
    if (returnMatch) {
      return returnMatch[1].trim();
    }
    return undefined;
  } else {
    // For properties/attributes, extract type after ":"
    const typeMatch = signature.match(/:\s*(.+)$/);
    if (typeMatch) {
      return typeMatch[1].trim();
    }
    return undefined;
  }
}

/**
 * Convert IR SymbolRecord to DisplaySymbol
 */
function toDisplaySymbol(
  symbol: SymbolRecord,
  memberSymbols?: Map<string, SymbolRecord>
): DisplaySymbol {
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
    for (let i = 0; i < symbol.docs.examples.length; i++) {
      const example = symbol.docs.examples[i];
      sections.push({
        kind: "example",
        title: symbol.docs.examples.length > 1 ? `Example ${i + 1}` : "Example",
        content: example.code,
        description: example.title, // Optional description shown before code
      });
    }
  }

  // Resolve member details from their symbol records
  const members: DisplayMember[] | undefined = symbol.members?.map((m) => {
    const memberSymbol = memberSymbols?.get(m.refId);
    const type = memberSymbol
      ? extractTypeFromSignature(memberSymbol.signature, m.kind)
      : undefined;

    return {
      name: m.name,
      kind: m.kind,
      refId: m.refId,
      visibility: m.visibility,
      type,
      summary: memberSymbol?.docs?.summary || undefined,
      signature: memberSymbol?.signature,
    };
  });

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
    members,
    bases: symbol.relations?.extends,
  };
}

/**
 * Kind prefixes used in URLs that should be stripped when looking up symbols
 */
const KIND_PREFIXES = ["modules", "classes", "functions", "interfaces", "types", "enums", "variables", "methods", "propertys", "namespaces"];

/**
 * Find a symbol by path, trying different variations
 */
async function findSymbol(
  buildId: string,
  packageId: string,
  symbolPath: string
): Promise<SymbolRecord | null> {
  // Generate variations of the path to try
  const pathVariations: string[] = [symbolPath];

  // Strip kind prefix if present (e.g., "modules.chat_models.universal" -> "chat_models.universal")
  for (const prefix of KIND_PREFIXES) {
    if (symbolPath.startsWith(`${prefix}.`)) {
      const withoutPrefix = symbolPath.slice(prefix.length + 1);
      pathVariations.push(withoutPrefix);
      // Also try with slashes instead of dots (for TypeScript modules)
      pathVariations.push(withoutPrefix.replace(/\./g, "/"));
    }
  }

  // Try dots replaced with slashes (for TypeScript module paths like chat_models/universal)
  pathVariations.push(symbolPath.replace(/\./g, "/"));

  // Try underscores instead of dots (for Python module paths)
  pathVariations.push(symbolPath.replace(/\./g, "_"));

  // Try each variation
  for (const path of pathVariations) {
    const symbol = await getLocalSymbolByPath(buildId, packageId, path);
    if (symbol) return symbol;
  }

  // Try searching in all symbols
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (result?.symbols) {
    // Build a list of paths to try matching
    const pathsToMatch = new Set(pathVariations);

    // Try to find by qualified name or name
    const found = result.symbols.find((s) => {
      // Exact match on any variation
      if (pathsToMatch.has(s.qualifiedName)) return true;
      if (pathsToMatch.has(s.name)) return true;

      // Check if qualified name ends with any variation
      for (const path of pathsToMatch) {
        if (s.qualifiedName.endsWith(`.${path}`) || s.qualifiedName.endsWith(`/${path}`)) {
          return true;
        }
      }

      // Last resort: match by final symbol name
      const lastPart = symbolPath.split(".").pop() || symbolPath.split("/").pop();
      return s.name === lastPart;
    });

    if (found) return found;
  }

  return null;
}

export async function SymbolPage({ language, packageId, packageName, symbolPath }: SymbolPageProps) {
  // Load symbol from IR
  const irLanguage = language === "python" ? "python" : "javascript";
  const buildId = await getLocalLatestBuildId(irLanguage);

  let symbol: DisplaySymbol | null = null;
  let knownSymbols = new Set<string>();

  if (buildId) {
    // Load all package symbols for linking and member resolution
    const allSymbolsResult = await getLocalPackageSymbols(buildId, packageId);

    if (allSymbolsResult?.symbols) {
      // Build a set of known symbol names for type linking
      // Include classes, interfaces, type aliases, and enums
      const linkableKinds = ["class", "interface", "typeAlias", "enum"];
      for (const s of allSymbolsResult.symbols) {
        if (linkableKinds.includes(s.kind)) {
          knownSymbols.add(s.name);
        }
      }
    }

    const irSymbol = await findSymbol(buildId, packageId, symbolPath);
    if (irSymbol) {
      // Fetch member symbols to get their types and descriptions
      let memberSymbols: Map<string, SymbolRecord> | undefined;

      if (irSymbol.members && irSymbol.members.length > 0 && allSymbolsResult?.symbols) {
        memberSymbols = new Map();
        // Build a lookup map of all symbols by ID
        const symbolsById = new Map(allSymbolsResult.symbols.map((s) => [s.id, s]));

        // Resolve each member
        for (const member of irSymbol.members) {
          const memberSymbol = symbolsById.get(member.refId);
          if (memberSymbol) {
            memberSymbols.set(member.refId, memberSymbol);
          }
        }
      }

      symbol = toDisplaySymbol(irSymbol, memberSymbols);
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
        {symbolPath.split(".").map((part, i, arr) => {
          // Build cumulative path up to this part
          const pathParts = arr.slice(0, i + 1);
          const cumulativePath = pathParts.join(".");
          const isLast = i === arr.length - 1;
          const langPath = language === "python" ? "python" : "javascript";
          const packageSlug = slugifyPackageName(packageName);
          const href = `/${langPath}/${packageSlug}/${cumulativePath}`;

          return (
            <span key={i} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 shrink-0" />
              {isLast ? (
                <span className="text-foreground">{part}</span>
              ) : (
                <Link
                  href={href}
                  className="hover:text-foreground transition-colors"
                >
                  {part}
                </Link>
              )}
            </span>
          );
        })}
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

      {/* Signature / Import statement */}
      {symbol.signature && (
        <CodeBlock
          code={getDisplayCode(symbol, packageName, language)}
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
        <Section
          key={i}
          section={section}
          language={language}
          knownSymbols={knownSymbols}
          packageName={packageName}
        />
      ))}

      {/* Members (for classes/modules) */}
      {symbol.members && symbol.members.length > 0 && (
        <MembersSection
          members={symbol.members}
          language={language}
          packageName={packageName}
          parentQualifiedName={symbol.qualifiedName}
        />
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
 * Parse a type string and render with links to known symbols.
 * Uses dashed underlines for linked types.
 */
function TypeReference({
  typeStr,
  knownSymbols,
  language,
  packageName,
}: {
  typeStr: string;
  knownSymbols: Set<string>;
  language: UrlLanguage;
  packageName: string;
}) {
  // Regex to match potential type names (PascalCase identifiers)
  // This captures type names like CreateAgentParams, InteropZodType, etc.
  const typeNamePattern = /([A-Z][a-zA-Z0-9_]*)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = typeNamePattern.exec(typeStr)) !== null) {
    const typeName = match[1];
    const startIndex = match.index;

    // Add text before this match
    if (startIndex > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>{typeStr.slice(lastIndex, startIndex)}</span>
      );
    }

    // Check if this type is a known symbol
    if (knownSymbols.has(typeName)) {
      const langPath = language === "python" ? "python" : "javascript";
      const pkgSlug = slugifyPackageName(packageName);
      const href = `/${langPath}/${pkgSlug}/${typeName}`;

      parts.push(
        <Link
          key={`link-${startIndex}`}
          href={href}
          className="text-primary hover:text-primary/80 underline decoration-dashed decoration-primary/50 underline-offset-2"
        >
          {typeName}
        </Link>
      );
    } else {
      parts.push(<span key={`type-${startIndex}`}>{typeName}</span>);
    }

    lastIndex = startIndex + typeName.length;
  }

  // Add remaining text after last match
  if (lastIndex < typeStr.length) {
    parts.push(<span key={`text-end`}>{typeStr.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

/**
 * Render a documentation section
 */
async function Section({
  section,
  language,
  knownSymbols,
  packageName,
}: {
  section: DocSection;
  language: UrlLanguage;
  knownSymbols: Set<string>;
  packageName: string;
}) {
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
                      {item.type ? (
                        <TypeReference
                          typeStr={item.type}
                          knownSymbols={knownSymbols}
                          language={language}
                          packageName={packageName}
                        />
                      ) : (
                        "unknown"
                      )}
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
        {section.description && (
          <p className="text-foreground-secondary mb-3">{section.description}</p>
        )}
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

/**
 * Members section with grouped display
 */
function MembersSection({
  members,
  language,
  packageName,
  parentQualifiedName,
}: {
  members: DisplayMember[];
  language: UrlLanguage;
  packageName: string;
  parentQualifiedName: string;
}) {
  // Group members by kind (use Object.create(null) to avoid prototype properties like 'constructor')
  const groupedMembers = members.reduce(
    (acc, member) => {
      const kind = member.kind;
      if (!Object.hasOwn(acc, kind)) {
        acc[kind] = [];
      }
      acc[kind].push(member);
      return acc;
    },
    Object.create(null) as Record<string, DisplayMember[]>
  );

  // Order of display
  const kindOrder = [
    "constructor",
    "property",
    "attribute",
    "method",
    "function",
    "class",
    "interface",
    "typeAlias",
    "enum",
    "variable",
  ];

  const orderedKinds = kindOrder.filter((k) => groupedMembers[k]);
  // Add any remaining kinds not in the order
  const remainingKinds = Object.keys(groupedMembers).filter(
    (k) => !kindOrder.includes(k)
  );
  const allKinds = [...orderedKinds, ...remainingKinds];

  const kindLabels: Record<string, string> = {
    constructor: "Constructors",
    property: "Properties",
    attribute: "Attributes",
    method: "Methods",
    function: "Functions",
    class: "Classes",
    interface: "Interfaces",
    typeAlias: "Type Aliases",
    enum: "Enums",
    variable: "Variables",
  };

  return (
    <div className="space-y-8">
      {allKinds.map((kind) => (
        <div key={kind}>
          <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
            {kindLabels[kind] || `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`}
          </h2>
          <div className="space-y-2">
            {groupedMembers[kind].map((member) => (
              <MemberCard
                key={member.name}
                member={member}
                language={language}
                packageName={packageName}
                parentQualifiedName={parentQualifiedName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Individual member card
 */
function MemberCard({
  member,
  language,
  packageName,
  parentQualifiedName,
}: {
  member: DisplayMember;
  language: UrlLanguage;
  packageName: string;
  parentQualifiedName: string;
}) {
  const isMethodOrFunction =
    member.kind === "method" ||
    member.kind === "function" ||
    member.kind === "constructor";

  // Build the symbol path for linking
  const symbolPath = `${parentQualifiedName}.${member.name}`;
  const langPath = language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(packageName);
  const href = `/${langPath}/${packageSlug}/${symbolPath}`;

  return (
    <Link
      href={href}
      className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-background-secondary hover:border-primary/50 hover:bg-background transition-colors"
      style={{ cursor: "pointer" }}
    >
      <span
        className={cn(
          "px-2 py-0.5 text-xs font-medium rounded shrink-0 mt-0.5",
          getKindColor(member.kind as SymbolKind)
        )}
      >
        {member.kind}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-foreground group-hover:text-primary transition-colors">
            {member.name}
          </span>

          {/* Show type for properties/attributes */}
          {!isMethodOrFunction && member.type && (
            <span className="text-foreground-secondary font-mono text-sm">
              : <TypeDisplay type={member.type} />
            </span>
          )}

          {/* Show return type for methods */}
          {isMethodOrFunction && member.type && (
            <span className="text-foreground-muted font-mono text-xs">
              → <TypeDisplay type={member.type} />
            </span>
          )}
        </div>

        {/* Show summary for methods */}
        {member.summary && (
          <p className="text-sm text-foreground-secondary mt-1 line-clamp-2">
            {member.summary}
          </p>
        )}
      </div>

      {/* Link indicator */}
      <ChevronRight className="h-4 w-4 text-foreground-muted group-hover:text-primary shrink-0 transition-colors" />
    </Link>
  );
}

/**
 * Type display with potential linking for known types
 */
function TypeDisplay({ type }: { type: string }) {
  // For now, just display the type. Future enhancement: parse and link known types
  return <span className="text-foreground-secondary">{type}</span>;
}
