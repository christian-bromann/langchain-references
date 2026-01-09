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
import type { PackageChangelog, SymbolSnapshot } from "@langchain/ir-schema";
import {
  getBuildIdForLanguage,
  getManifestData,
  getSymbols,
  getSymbolData,
  getKnownSymbolNamesData,
  getSymbolOptimized,
  getIndividualSymbol,
  isProduction,
} from "@/lib/ir/loader";
import { getProjectForPackage } from "@/lib/config/projects";
import { CodeBlock } from "./CodeBlock";
import { MarkdownContent } from "./MarkdownContent";
import { TableOfContents, type TOCSection, type TOCItem, type TOCInheritedGroup } from "./TableOfContents";
import { symbolToMarkdown } from "@/lib/ir/markdown-generator";
import { getBaseUrl } from "@/lib/config/mcp";
import { VersionBadge } from "./VersionBadge";
import { VersionHistory } from "./VersionHistory";
import { VersionSwitcher } from "./VersionSwitcher";
import fs from "fs/promises";
import path from "path";

interface SymbolPageProps {
  language: "python" | "javascript";
  packageId: string;
  packageName: string;
  symbolPath: string;
  /** Optional version to display (from URL query param) */
  version?: string;
}

/**
 * Format a long function/method signature to be multi-line.
 * When a signature exceeds a reasonable width, each parameter is placed on its own line.
 */
function formatSignature(signature: string, language: UrlLanguage): string {
  // Only format if signature contains parentheses (functions/methods)
  const parenStart = signature.indexOf("(");
  const parenEnd = signature.lastIndexOf(")");

  if (parenStart === -1 || parenEnd === -1 || parenEnd <= parenStart) {
    return signature;
  }

  // Check if signature is "long" - threshold of 80 characters
  if (signature.length <= 80) {
    return signature;
  }

  const prefix = signature.slice(0, parenStart + 1); // e.g., "handleText("
  const paramsStr = signature.slice(parenStart + 1, parenEnd); // e.g., "text: string, runId: string, ..."
  const suffix = signature.slice(parenEnd); // e.g., "): void | Promise<void>"

  // Parse parameters - handle nested generics and brackets
  const params: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of paramsStr) {
    if (char === "<" || char === "[" || char === "{" || char === "(") {
      depth++;
      current += char;
    } else if (char === ">" || char === "]" || char === "}" || char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      params.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    params.push(current.trim());
  }

  // If only 1-2 params and not too long, keep on one line
  if (params.length <= 2 && signature.length <= 100) {
    return signature;
  }

  // Format with each parameter on its own line
  const indent = "  ";
  const formattedParams = params.map((p) => `${indent}${p}`).join(",\n");

  return `${prefix}\n${formattedParams}\n${suffix}`;
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

  // For other symbols, format the signature if it's long
  return formatSignature(symbol.signature, language);
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
  inheritedMembers?: InheritedMemberGroup[];
  versionInfo?: {
    since?: string;
    deprecation?: {
      since: string;
      message?: string;
      replacement?: string;
    };
  };
}

/**
 * A group of inherited members from a base class
 */
interface InheritedMemberGroup {
  baseName: string;
  basePackageId?: string;
  basePackageName?: string;
  members: DisplayMember[];
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
  memberSymbols?: Map<string, SymbolRecord>,
  inheritedMembers?: InheritedMemberGroup[]
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
    inheritedMembers,
    versionInfo: symbol.versionInfo,
  };
}

/**
 * Kind prefixes used in URLs that should be stripped when looking up symbols
 */
const KIND_PREFIXES = ["modules", "classes", "functions", "interfaces", "types", "enums", "variables", "methods", "propertys", "namespaces"];

/**
 * Pointer type for latest builds.
 */
interface LatestPointer {
  buildId: string;
  updatedAt: string;
}

/**
 * Get the local IR path for a project+language.
 */
function getLocalIrPath(project: string, language: string): string {
  const langSuffix = language === "python" ? "python" : "javascript";
  return `latest-${project}-${langSuffix}`;
}

/**
 * Fetch the latest build pointer for a project+language from Vercel Blob.
 */
async function fetchLatestBuildId(
  blobBaseUrl: string,
  project: string,
  language: string
): Promise<string | null> {
  const langSuffix = language === "python" ? "python" : "javascript";
  const pointerUrl = `${blobBaseUrl}/pointers/latest-${project}-${langSuffix}.json`;

  try {
    const response = await fetch(pointerUrl, { cache: "no-store" });
    if (!response.ok) return null;
    const pointer = (await response.json()) as LatestPointer;
    return pointer.buildId;
  } catch {
    return null;
  }
}

/**
 * Load the changelog for a package.
 */
async function loadChangelog(
  project: string,
  language: string,
  packageId: string
): Promise<PackageChangelog | null> {
  // Try local IR output first (for development)
  const localIrPath = getLocalIrPath(project, language);
  const localChangelogPath = path.join(
    process.cwd(),
    "..",
    "..",
    "ir-output",
    localIrPath,
    "packages",
    packageId,
    "changelog.json"
  );

  try {
    const localContent = await fs.readFile(localChangelogPath, "utf-8");
    return JSON.parse(localContent);
  } catch {
    // Local file not found, try blob storage
  }

  // Fallback to blob storage
  const blobBaseUrl = process.env.BLOB_BASE_URL || process.env.BLOB_URL;
  if (blobBaseUrl) {
    const buildId = await fetchLatestBuildId(blobBaseUrl, project, language);
    if (buildId) {
      const changelogUrl = `${blobBaseUrl}/ir/${buildId}/packages/${packageId}/changelog.json`;
      try {
        const response = await fetch(changelogUrl, {
          next: { revalidate: 3600 },
        });
        if (response.ok) {
          return await response.json();
        }
      } catch {
        // Failed to fetch from blob
      }
    }
  }

  return null;
}

/**
 * Get the historical snapshot of a symbol at a specific version.
 */
async function getHistoricalSnapshot(
  project: string,
  language: string,
  packageId: string,
  symbolName: string,
  targetVersion: string
): Promise<{ snapshot: SymbolSnapshot; changeType: "added" | "modified" } | null> {
  const changelog = await loadChangelog(project, language, packageId);
  if (!changelog) return null;

  for (const delta of changelog.history) {
    if (delta.version !== targetVersion) continue;

    // Check if symbol was added in this version
    const added = delta.added.find((a) => a.qualifiedName === symbolName);
    if (added) {
      return { snapshot: added.snapshot, changeType: "added" };
    }

    // Check if symbol was modified in this version - use snapshotAfter
    const modified = delta.modified.find((m) => m.qualifiedName === symbolName);
    if (modified && modified.snapshotAfter) {
      return { snapshot: modified.snapshotAfter, changeType: "modified" };
    }
  }

  return null;
}

/**
 * Convert a SymbolSnapshot to a DisplaySymbol for rendering.
 */
function snapshotToDisplaySymbol(snapshot: SymbolSnapshot, versionInfo?: DisplaySymbol["versionInfo"]): DisplaySymbol {
  // Convert members from snapshot format to display format
  const members: DisplayMember[] | undefined = snapshot.members?.map((m) => ({
    name: m.name,
    kind: m.kind,
    visibility: m.visibility,
    type: extractTypeFromSignature(m.signature, m.kind),
    signature: m.signature,
  }));

  return {
    id: `snapshot_${snapshot.qualifiedName}`,
    kind: snapshot.kind,
    name: snapshot.qualifiedName.split(".").pop() || snapshot.qualifiedName,
    qualifiedName: snapshot.qualifiedName,
    signature: snapshot.signature,
    docs: {
      summary: "", // Snapshots don't include documentation
    },
    source: {
      repo: "",
      sha: "",
      path: snapshot.sourcePath,
      line: snapshot.sourceLine,
    },
    members,
    bases: snapshot.extends,
    versionInfo,
  };
}

/**
 * Generate Table of Contents data from a symbol
 */
function generateTOCData(
  symbol: DisplaySymbol
): { topItems: TOCItem[]; sections: TOCSection[]; inheritedGroups: TOCInheritedGroup[] } {
  const topItems: TOCItem[] = [];
  const sections: TOCSection[] = [];
  const inheritedGroups: TOCInheritedGroup[] = [];

  // Add examples to top items if present
  if (symbol.docs?.sections) {
    const exampleSections = symbol.docs.sections.filter((s) => s.kind === "example");
    if (exampleSections.length > 0) {
      topItems.push({
        id: "examples",
        label: "Examples",
      });
    }

    // Add parameters section if present
    const paramSections = symbol.docs.sections.filter(
      (s) => s.kind === "parameters" || s.kind === "attributes"
    );
    if (paramSections.length > 0) {
      topItems.push({
        id: "parameters",
        label: "Parameters",
      });
    }
  }

  // Group members by kind for sections
  if (symbol.members && symbol.members.length > 0) {
    const groupedMembers = symbol.members.reduce(
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

    const kindOrder = [
      "constructor",
      "property",
      "attribute",
      "accessor",
      "method",
      "function",
    ];

    const kindLabels: Record<string, string> = {
      constructor: "Constructors",
      property: "Properties",
      attribute: "Attributes",
      accessor: "Accessors",
      method: "Methods",
      function: "Functions",
    };

    for (const kind of kindOrder) {
      if (groupedMembers[kind] && groupedMembers[kind].length > 0) {
        sections.push({
          id: `section-${kind}`,
          title: kindLabels[kind] || `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`,
          items: groupedMembers[kind].map((member) => ({
            id: `member-${member.name}`,
            label: member.name,
            kind: member.kind,
          })),
        });
      }
    }
  }

  // Add inherited members as nested groups
  if (symbol.inheritedMembers && symbol.inheritedMembers.length > 0) {
    for (const group of symbol.inheritedMembers) {
      const inheritedGrouped = group.members.reduce(
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

      const kindOrder = ["property", "attribute", "accessor", "method", "function"];
      const kindLabels: Record<string, string> = {
        property: "Properties",
        attribute: "Attributes",
        accessor: "Accessors",
        method: "Methods",
        function: "Functions",
      };

      const nestedSections: TOCSection[] = [];
      for (const kind of kindOrder) {
        if (inheritedGrouped[kind] && inheritedGrouped[kind].length > 0) {
          nestedSections.push({
            id: `inherited-${group.baseName}-${kind}`,
            title: kindLabels[kind] || `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`,
            items: inheritedGrouped[kind].map((member) => ({
              id: `inherited-${group.baseName}-${member.name}`,
              label: member.name,
              kind: member.kind,
            })),
          });
        }
      }

      if (nestedSections.length > 0) {
        inheritedGroups.push({
          id: `inherited-${group.baseName}`,
          baseName: group.baseName,
          sections: nestedSections,
        });
      }
    }
  }

  return { topItems, sections, inheritedGroups };
}

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
    const symbol = await getSymbolData(buildId, packageId, path);
    if (symbol) return symbol;
  }

  // Try searching in all symbols
  const result = await getSymbols(buildId, packageId);
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

/**
 * OPTIMIZED: Find a symbol by path using the lookup index and individual symbol files.
 * This fetches only the specific symbol (~1-5KB) instead of all symbols (11MB+).
 * Falls back to full symbol search only if optimized lookup fails.
 */
async function findSymbolOptimized(
  buildId: string,
  packageId: string,
  symbolPath: string
): Promise<SymbolRecord | null> {
  // Generate variations of the path to try
  const pathVariations: string[] = [symbolPath];

  // Strip kind prefix if present
  for (const prefix of KIND_PREFIXES) {
    if (symbolPath.startsWith(`${prefix}.`)) {
      const withoutPrefix = symbolPath.slice(prefix.length + 1);
      pathVariations.push(withoutPrefix);
      pathVariations.push(withoutPrefix.replace(/\./g, "/"));
    }
  }

  // Add common variations
  pathVariations.push(symbolPath.replace(/\./g, "/"));
  pathVariations.push(symbolPath.replace(/\./g, "_"));

  // Try optimized lookup for each variation
  for (const path of pathVariations) {
    const symbol = await getSymbolOptimized(buildId, packageId, path);
    if (symbol) return symbol;
  }

  // If optimized lookup failed, fall back to the original method
  // This handles edge cases and ensures backward compatibility
  return findSymbol(buildId, packageId, symbolPath);
}

/**
 * Resolve inherited members from base classes.
 * Searches for base class symbols in the current package and other packages.
 * Recursively follows the inheritance chain.
 */
async function resolveInheritedMembers(
  buildId: string,
  currentPackageId: string,
  baseClassNames: string[],
  ownMemberNames: string[],
  currentPackageSymbols: SymbolRecord[]
): Promise<InheritedMemberGroup[]> {
  const inheritedGroups: InheritedMemberGroup[] = [];
  const ownMemberSet = new Set(ownMemberNames);
  const processedBases = new Set<string>();

  // Get manifest to find all packages for cross-package inheritance
  const manifest = await getManifestData(buildId);
  const allPackageIds = manifest?.packages.map((p) => p.packageId) || [];

  // Helper to find a symbol by name across all packages
  async function findBaseSymbol(
    simpleBaseName: string
  ): Promise<{ symbol: SymbolRecord; packageId: string; packageName: string } | null> {
    // First, try to find in current package
    let baseSymbol =
      currentPackageSymbols.find(
        (s) =>
          (s.kind === "class" || s.kind === "interface") &&
          (s.name === simpleBaseName ||
            s.qualifiedName === simpleBaseName ||
            s.qualifiedName.endsWith(`.${simpleBaseName}`))
      ) || null;

    if (baseSymbol) {
      const pkg = manifest?.packages.find((p) => p.packageId === currentPackageId);
      return {
        symbol: baseSymbol,
        packageId: currentPackageId,
        packageName: pkg?.publishedName || "",
      };
    }

    // Search in other packages (like @langchain/core)
    for (const pkgId of allPackageIds) {
      if (pkgId === currentPackageId) continue;

      const pkgSymbols = await getSymbols(buildId, pkgId);
      if (!pkgSymbols?.symbols) continue;

      baseSymbol =
        pkgSymbols.symbols.find(
          (s) =>
            (s.kind === "class" || s.kind === "interface") &&
            (s.name === simpleBaseName ||
              s.qualifiedName === simpleBaseName ||
              s.qualifiedName.endsWith(`.${simpleBaseName}`))
        ) || null;

      if (baseSymbol) {
        const pkg = manifest?.packages.find((p) => p.packageId === pkgId);
        return {
          symbol: baseSymbol,
          packageId: pkgId,
          packageName: pkg?.publishedName || "",
        };
      }
    }

    return null;
  }

  // Helper to extract members from a base class
  async function extractMembersFromBase(
    baseSymbol: SymbolRecord,
    basePackageId: string,
    basePackageName: string,
    simpleBaseName: string
  ): Promise<void> {
    if (!baseSymbol.members || baseSymbol.members.length === 0) return;

    // Get the package's symbol list for resolving member details
    const pkgSymbols =
      basePackageId === currentPackageId
        ? currentPackageSymbols
        : (await getSymbols(buildId, basePackageId))?.symbols || [];

    const symbolsById = new Map(pkgSymbols.map((s) => [s.id, s]));

    // Filter out members that are already defined on the current class
    const inheritedMembers: DisplayMember[] = [];

    for (const member of baseSymbol.members) {
      // Skip if already defined on the current class (overridden)
      if (ownMemberSet.has(member.name)) continue;

      // Skip constructors
      if (member.kind === "constructor") continue;

      // Skip private members
      if (member.visibility === "private") continue;

      // Resolve member details
      const memberSymbol = symbolsById.get(member.refId);
      const type = memberSymbol
        ? extractTypeFromSignature(memberSymbol.signature, member.kind)
        : undefined;

      inheritedMembers.push({
        name: member.name,
        kind: member.kind,
        refId: member.refId,
        visibility: member.visibility,
        type,
        summary: memberSymbol?.docs?.summary || undefined,
        signature: memberSymbol?.signature,
      });
    }

    if (inheritedMembers.length > 0) {
      inheritedGroups.push({
        baseName: simpleBaseName,
        basePackageId,
        basePackageName,
        members: inheritedMembers,
      });
    }
  }

  // Process each direct base class recursively
  const toProcess = [...baseClassNames];

  while (toProcess.length > 0) {
    const baseName = toProcess.shift()!;

    // Extract the simple class name from complex generics like "BaseChatModel<CallOptions, AIMessageChunk>"
    const simpleBaseName = baseName.replace(/<.*$/, "").replace(/^.*\./, "");

    // Skip if already processed
    if (processedBases.has(simpleBaseName)) continue;
    processedBases.add(simpleBaseName);

    // Skip utility types and unresolved types
    if (["Pick", "Partial", "Omit", "Record", "Exclude", "Extract", "unknown"].includes(simpleBaseName)) {
      continue;
    }

    const found = await findBaseSymbol(simpleBaseName);

    if (found) {
      await extractMembersFromBase(
        found.symbol,
        found.packageId,
        found.packageName,
        simpleBaseName
      );

      // Add parent's bases to the processing queue (recursive inheritance)
      if (found.symbol.relations?.extends) {
        for (const parentBase of found.symbol.relations.extends) {
          const parentSimpleName = parentBase.replace(/<.*$/, "").replace(/^.*\./, "");
          if (!processedBases.has(parentSimpleName)) {
            toProcess.push(parentBase);
          }
        }
      }
    }
  }

  return inheritedGroups;
}

export async function SymbolPage({ language, packageId, packageName, symbolPath, version }: SymbolPageProps) {
  const irLanguage = language === "python" ? "python" : "javascript";

  // Determine which project this package belongs to
  const project = getProjectForPackage(packageName);
  const buildId = await getBuildIdForLanguage(irLanguage, project.id);

  let symbol: DisplaySymbol | null = null;
  let irSymbolForMarkdown: SymbolRecord | null = null;
  let knownSymbols = new Set<string>();

  if (buildId) {
    // OPTIMIZATION: Fetch known symbols and main symbol in parallel
    const [knownSymbolNames, irSymbol] = await Promise.all([
      getKnownSymbolNamesData(buildId, packageId),
      findSymbolOptimized(buildId, packageId, symbolPath),
    ]);
    
    knownSymbols = new Set(knownSymbolNames);

    // If a specific version is requested, try to load the historical snapshot
    if (version && irSymbol) {
      const historicalData = await getHistoricalSnapshot(
        project.id,
        irLanguage,
        packageId,
        irSymbol.qualifiedName,
        version
      );

      if (historicalData) {
        symbol = snapshotToDisplaySymbol(historicalData.snapshot, {
          since: version,
        });
      }
    }

    // If no historical snapshot (or no version requested), use the fetched symbol
    if (!symbol && irSymbol) {
      // Keep reference for markdown generation
      irSymbolForMarkdown = irSymbol;

        // Fetch member symbols individually (instead of loading all 11MB)
        let memberSymbols: Map<string, SymbolRecord> | undefined;

        if (irSymbol.members && irSymbol.members.length > 0) {
          memberSymbols = new Map();
          // Fetch each member symbol individually in parallel
          const memberPromises = irSymbol.members.map(async (member) => {
            const memberSymbol = await getIndividualSymbol(buildId, member.refId);
            if (memberSymbol) {
              return { refId: member.refId, symbol: memberSymbol };
            }
            return null;
          });

          const memberResults = await Promise.all(memberPromises);
          for (const result of memberResults) {
            if (result) {
              memberSymbols.set(result.refId, result.symbol);
            }
          }
        }

        // For inherited members, we still need the full symbols (but only if class has extends)
        // This is a rare case and the data is cached, so it's acceptable
        let inheritedMembers: InheritedMemberGroup[] | undefined;
        if (
          (irSymbol.kind === "class" || irSymbol.kind === "interface") &&
          irSymbol.relations?.extends &&
          irSymbol.relations.extends.length > 0
        ) {
          // For inherited members, we need the full package symbols
          // This is cached in-memory, so subsequent loads are fast
          const allSymbolsResult = await getSymbols(buildId, packageId);
          if (allSymbolsResult?.symbols) {
            inheritedMembers = await resolveInheritedMembers(
              buildId,
              packageId,
              irSymbol.relations.extends,
              irSymbol.members?.map((m) => m.name) || [],
              allSymbolsResult.symbols
            );
          }
        }

      symbol = toDisplaySymbol(irSymbol, memberSymbols, inheritedMembers);
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

  // Generate TOC data
  const { topItems, sections, inheritedGroups } = generateTOCData(symbol);

  return (
    <div className="flex gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8">
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
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className={cn("px-2 py-1 text-sm font-medium rounded", getKindColor(symbol.kind))}>
            {getKindLabel(symbol.kind)}
          </span>
          <VersionSwitcher
            qualifiedName={symbol.qualifiedName}
            project={project.id}
            language={irLanguage}
            packageId={packageId}
            currentVersion={version}
          />
          {symbol.versionInfo?.since && (
            <VersionBadge since={symbol.versionInfo.since} />
          )}
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
          {/* Show banner when viewing historical version */}
          {version && (
            <span className="px-2 py-1 text-sm font-medium rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Viewing v{version}
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
          className="rounded-lg [&_pre]:p-4 [&_pre]:m-0 [&_pre]:text-sm [&_code]:text-sm [&_pre]:overflow-x-auto"
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
                <TypeReference
                  typeStr={base}
                  knownSymbols={knownSymbols}
                  language={language}
                  packageName={packageName}
                />
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

      {/* Inherited members from base classes */}
      {symbol.inheritedMembers && symbol.inheritedMembers.length > 0 && (
        <InheritedMembersSection
          inheritedGroups={symbol.inheritedMembers}
          language={language}
          packageName={packageName}
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

      {/* Version History */}
      <VersionHistory
        qualifiedName={symbol.qualifiedName}
        project={project.id}
        language={irLanguage}
        packageId={packageId}
        className="mt-6"
      />
      </div>

      {/* Table of Contents sidebar */}
      <TableOfContents
        topItems={topItems}
        sections={sections}
        inheritedGroups={inheritedGroups}
        markdown={irSymbolForMarkdown ? symbolToMarkdown(irSymbolForMarkdown, packageName) : undefined}
        pageUrl={`${getBaseUrl()}/${language === "python" ? "python" : "javascript"}/${slugifyPackageName(packageName)}/${symbolPath}`}
      />
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
      <div id="parameters">
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
      <div id="examples">
        <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
          {section.title || "Example"}
        </h2>
        {section.description && (
          <p className="text-foreground-secondary mb-3">{section.description}</p>
        )}
        <CodeBlock
          code={section.content}
          language={language === "python" ? "python" : "typescript"}
          className="rounded-lg [&_pre]:p-4 [&_pre]:m-0 [&_pre]:text-sm [&_code]:text-sm [&_pre]:overflow-x-auto"
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
      id={`member-${member.name}`}
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
 * Inherited members section - displays members inherited from base classes
 */
function InheritedMembersSection({
  inheritedGroups,
  language,
  packageName,
}: {
  inheritedGroups: InheritedMemberGroup[];
  language: UrlLanguage;
  packageName: string;
}) {
  const kindOrder = [
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

  const kindLabels: Record<string, string> = {
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
      {inheritedGroups.map((group) => {
        // Group members by kind within each inheritance group
        const groupedMembers = group.members.reduce(
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

        const orderedKinds = kindOrder.filter((k) => groupedMembers[k]);
        const remainingKinds = Object.keys(groupedMembers).filter(
          (k) => !kindOrder.includes(k)
        );
        const allKinds = [...orderedKinds, ...remainingKinds];

        return (
          <div key={group.baseName} className="border-t border-border pt-6">
            <h2 className="text-lg font-heading font-semibold text-foreground-secondary mb-4 flex items-center gap-2">
              <span>Inherited from</span>
              {group.basePackageName && group.basePackageName !== packageName ? (
                <Link
                  href={`/${language === "python" ? "python" : "javascript"}/${slugifyPackageName(group.basePackageName)}/${group.baseName}`}
                  className="font-mono text-primary hover:text-primary/80 underline decoration-dashed underline-offset-2"
                >
                  {group.baseName}
                </Link>
              ) : (
                <code className="font-mono text-foreground">{group.baseName}</code>
              )}
              {group.basePackageName && group.basePackageName !== packageName && (
                <span className="text-sm text-foreground-muted">
                  ({group.basePackageName})
                </span>
              )}
            </h2>

            <div className="space-y-6">
              {allKinds.map((kind) => (
                <div key={kind}>
                  <h3 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider mb-3">
                    {kindLabels[kind] || `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`}
                  </h3>
                  <div className="space-y-1">
                    {groupedMembers[kind].map((member) => (
                      <InheritedMemberRow
                        key={member.name}
                        member={member}
                        language={language}
                        basePackageName={group.basePackageName || packageName}
                        baseClassName={group.baseName}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact row for inherited member display
 */
function InheritedMemberRow({
  member,
  language,
  basePackageName,
  baseClassName,
}: {
  member: DisplayMember;
  language: UrlLanguage;
  basePackageName: string;
  baseClassName: string;
}) {
  const isMethodOrFunction =
    member.kind === "method" ||
    member.kind === "function";

  // Link to the base class's member page
  const langPath = language === "python" ? "python" : "javascript";
  const packageSlug = slugifyPackageName(basePackageName);
  const symbolPath = `${baseClassName}.${member.name}`;
  const href = `/${langPath}/${packageSlug}/${symbolPath}`;

  return (
    <Link
      id={`inherited-${baseClassName}-${member.name}`}
      href={href}
      className="group flex items-center gap-3 py-2 px-3 rounded-md hover:bg-background-secondary transition-colors"
    >
      <span
        className={cn(
          "px-1.5 py-0.5 text-xs font-medium rounded shrink-0",
          getKindColor(member.kind as SymbolKind)
        )}
      >
        {member.kind.charAt(0).toUpperCase()}
      </span>

      <span className="font-mono text-sm text-foreground group-hover:text-primary transition-colors">
        {member.name}
      </span>

      {/* Show type/return type */}
      {member.type && (
        <span className="text-foreground-muted font-mono text-xs">
          {isMethodOrFunction ? "→" : ":"} {member.type}
        </span>
      )}

      {/* Show summary if available */}
      {member.summary && (
        <span className="text-xs text-foreground-muted truncate flex-1">
          — {member.summary}
        </span>
      )}
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
