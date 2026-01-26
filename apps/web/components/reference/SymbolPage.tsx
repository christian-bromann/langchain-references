/**
 * Symbol Page Component
 *
 * Displays detailed documentation for a single symbol (class, function, etc.)
 *
 * STREAMING OPTIMIZATION:
 * This component uses React Suspense for progressive rendering:
 * 1. Shell (breadcrumbs + header) renders immediately
 * 2. Main content streams when symbol data loads
 * 3. Inherited members stream last (slowest due to cross-package lookups)
 */

import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { symbolLanguageToLanguage } from "@langchain/ir-schema";
import { getProjectForPackage } from "@/lib/config/projects";
import { InheritedMembersSkeleton } from "./skeletons";

import { cn } from "@/lib/utils/cn";
import type { UrlLanguage } from "@/lib/utils/url";
import {
  buildPackageUrl,
  buildSymbolUrl,
  extractPackageFromQualifiedName,
  getDisplayPackageName,
  getKindColor,
  getKindLabel,
  slugifyPackageName,
  slugifySymbolPath,
} from "@/lib/utils/url";
import type {
  SymbolKind,
  Visibility,
  Stability,
  SymbolRecord,
  TypeReference,
} from "@/lib/ir/types";
import type { PackageChangelog, SymbolSnapshot, Language } from "@langchain/ir-schema";
import {
  getPackageBuildId,
  getManifestData,
  getIndividualSymbolData,
  getTypeUrlMap,
  getPackageInfo,
  getRoutingMapData,
  getSymbolViaShardedLookup,
  findSymbolQualifiedNameByName,
  getIndexedRoutingMap,
} from "@/lib/ir/loader";
import { CodeBlock } from "./CodeBlock";
import { SignatureBlock } from "./SignatureBlock";
import { MarkdownContent } from "./MarkdownContent";
import {
  TableOfContents,
  type TOCSection,
  type TOCItem,
  type TOCInheritedGroup,
} from "./TableOfContents";
import { symbolToMarkdown } from "@/lib/ir/markdown-generator";
import { getBaseUrl } from "@/lib/config/mcp";
import { VersionBadge } from "./VersionBadge";
import { VersionHistory } from "./VersionHistory";
import { VersionSwitcher } from "./VersionSwitcher";
import fs from "fs/promises";
import path from "path";
import { cleanExampleCode } from "@/lib/utils/clean-example";
import { getBuiltinTypeDocUrl } from "@/lib/constants/builtin-types";
import { TechArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd";
import { LANGUAGE_CONFIG } from "@/lib/config/languages";

interface SymbolPageProps {
  language: Language;
  packageId: string;
  packageName: string;
  symbolPath: string;
  /** Optional version to display (from URL query param) */
  version?: string;
}

/**
 * Split a string by a delimiter at depth 0 (outside of nested brackets/generics).
 */
function splitAtDepthZero(str: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of str) {
    if (char === "<" || char === "[" || char === "{" || char === "(") {
      depth++;
      current += char;
    } else if (char === ">" || char === "]" || char === "}" || char === ")") {
      depth--;
      current += char;
    } else if (char === delimiter && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * Format a long function/method signature to be multi-line.
 * When a signature exceeds a reasonable width, each parameter and type parameter
 * is placed on its own line.
 */
function formatSignature(signature: string): string {
  // Check if signature is "long" - threshold of 80 characters
  if (signature.length <= 80) {
    return signature;
  }

  // For TypeScript, handle generic type parameters first
  // e.g., "createAgent<T extends Record<string, any>, U = undefined>(...)"
  const genericStart = signature.indexOf("<");
  const parenStart = signature.indexOf("(");

  // If there are generics before the function parentheses, format them
  if (genericStart !== -1 && (parenStart === -1 || genericStart < parenStart)) {
    // Find the matching closing bracket for the generic
    let depth = 0;
    let genericEnd = -1;
    for (let i = genericStart; i < signature.length; i++) {
      const char = signature[i];
      if (char === "<") depth++;
      else if (char === ">") {
        depth--;
        if (depth === 0) {
          genericEnd = i;
          break;
        }
      }
    }

    if (genericEnd !== -1) {
      const funcName = signature.slice(0, genericStart); // e.g., "createAgent"
      const typeParamsStr = signature.slice(genericStart + 1, genericEnd); // e.g., "T extends Record<string, any>, U = undefined"
      const rest = signature.slice(genericEnd + 1); // e.g., "(params: ...): ReturnType"

      // Split type parameters at depth 0
      const typeParams = splitAtDepthZero(typeParamsStr, ",");

      // Format the rest (function parameters) recursively
      const formattedRest = formatSignatureParams(rest);

      // If type params are complex (>2 or signature is very long), format them on separate lines
      if (typeParams.length > 2 || signature.length > 120) {
        const indent = "  ";
        const formattedTypeParams = typeParams.map((p) => `${indent}${p}`).join(",\n");
        return `${funcName}<\n${formattedTypeParams}\n>${formattedRest}`;
      }
    }
  }

  // Format function parameters
  return formatSignatureParams(signature);
}

/**
 * Format function parameters in a signature to be multi-line.
 */
function formatSignatureParams(signature: string): string {
  const parenStart = signature.indexOf("(");
  const parenEnd = signature.lastIndexOf(")");

  if (parenStart === -1 || parenEnd === -1 || parenEnd <= parenStart) {
    return signature;
  }

  // Check if just this part is short enough
  if (signature.length <= 80) {
    return signature;
  }

  const prefix = signature.slice(0, parenStart + 1); // e.g., "handleText("
  const paramsStr = signature.slice(parenStart + 1, parenEnd); // e.g., "text: string, runId: string, ..."
  const suffix = signature.slice(parenEnd); // e.g., "): void | Promise<void>"

  // Split parameters at depth 0
  const params = splitAtDepthZero(paramsStr, ",");

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
  language: UrlLanguage,
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
  return formatSignature(symbol.signature);
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
    summaryHtml?: string;
    description?: string;
    descriptionHtml?: string;
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
  /** Type references for cross-linking in signature */
  typeRefs?: TypeReference[];
}

/**
 * A group of inherited members from a base class
 */
interface InheritedMemberGroup {
  baseName: string;
  /** Full qualified name of the base class (e.g., langchain_core.messages.ai.AIMessage) */
  baseQualifiedName?: string;
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
  /** Raw summary text for inline plain-text display */
  summary?: string;
  /** Pre-rendered HTML summary for rich display */
  summaryHtml?: string;
  signature?: string;
  /** Fully qualified name for the member (e.g., langchain_core.messages.base.merge_content) */
  qualifiedName?: string;
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
  inheritedMembers?: InheritedMemberGroup[],
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
  // NOTE: Some IR builds may include member references with non-routable kinds
  // (e.g. "alias") without emitting a corresponding SymbolRecord. Those would
  // produce broken links like `/.../chat_models/annotations`. We filter them out
  // here to avoid rendering dead member links.
  const filteredMembers = symbol.members?.filter((m) => {
    const kind = m.kind as unknown as string;
    if (!kind || kind === "unknown" || kind === "alias") return false;
    return true;
  });

  const members: DisplayMember[] | undefined = filteredMembers?.map((m) => {
    // Use refId if available (MemberReference format), fall back to id (ExtractorMember format)
    // This handles both TypeScript/Python (refId) and Java/Go (id) member formats
    const memberId = m.refId || (m as unknown as { id?: string }).id;
    const memberSymbol = memberId ? memberSymbols?.get(memberId) : undefined;
    // Use type from member reference (for attributes) or extract from signature
    const type =
      m.type ||
      (memberSymbol ? extractTypeFromSignature(memberSymbol.signature, m.kind) : undefined);

    return {
      name: m.name,
      kind: m.kind,
      refId: memberId,
      visibility: m.visibility,
      type,
      summary: memberSymbol?.docs?.summary,
      summaryHtml: memberSymbol?.docs?.summaryHtml,
      signature: memberSymbol?.signature,
      // Use the actual qualified name from the symbol record (handles re-exports correctly)
      qualifiedName: memberSymbol?.qualifiedName,
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
      summaryHtml: symbol.docs?.summaryHtml,
      description: symbol.docs?.description,
      descriptionHtml: symbol.docs?.descriptionHtml,
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
    typeRefs: symbol.typeRefs,
  };
}

/**
 * Kind prefixes used in URLs that should be stripped when looking up symbols
 */
const KIND_PREFIXES = [
  "modules",
  "classes",
  "functions",
  "interfaces",
  "types",
  "enums",
  "variables",
  "methods",
  "propertys",
  "namespaces",
];

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
  const langSuffix = language;
  return `latest-${project}-${langSuffix}`;
}

/**
 * Fetch the latest build pointer for a project+language from Vercel Blob.
 * Uses time-based revalidation instead of no-store to be compatible with ISR.
 */
async function fetchLatestBuildId(
  blobBaseUrl: string,
  project: string,
  language: string,
): Promise<string | null> {
  const langSuffix = language;
  const pointerUrl = `${blobBaseUrl}/pointers/latest-${project}-${langSuffix}.json`;

  try {
    const response = await fetch(pointerUrl, { next: { revalidate: 3600 } });
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
  packageId: string,
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
    "changelog.json",
  );

  try {
    const localContent = await fs.readFile(localChangelogPath, "utf-8");
    return JSON.parse(localContent);
  } catch {
    // Local file not found, try blob storage
  }

  // Fallback to blob storage
  const blobBaseUrl = process.env.BLOB_URL;
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
  targetVersion: string,
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
 *
 * Note: snapshots only contain `sourcePath` + `sourceLine` (no repo/sha),
 * so we optionally accept a fallback source (e.g. from the current symbol)
 * to build a working GitHub link.
 */
function snapshotToDisplaySymbol(
  snapshot: SymbolSnapshot,
  versionInfo?: DisplaySymbol["versionInfo"],
  fallbackSource?: { repo?: string; sha?: string },
): DisplaySymbol {
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
      repo: fallbackSource?.repo || "",
      sha: fallbackSource?.sha || "",
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
function generateTOCData(symbol: DisplaySymbol): {
  topItems: TOCItem[];
  sections: TOCSection[];
  inheritedGroups: TOCInheritedGroup[];
} {
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
      (s) => s.kind === "parameters" || s.kind === "attributes",
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
      Object.create(null) as Record<string, DisplayMember[]>,
    );

    const kindOrder = ["constructor", "property", "attribute", "accessor", "method", "function"];

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
          items: groupedMembers[kind].map((member, idx) => ({
            id: `member-${member.name}-${idx}`,
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
        Object.create(null) as Record<string, DisplayMember[]>,
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
            items: inheritedGrouped[kind].map((member, idx) => ({
              id: `inherited-${group.baseName}-${member.name}-${idx}`,
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
 * OPTIMIZED: Find a symbol by path using the lookup index and individual symbol files.
 * This fetches only the specific symbol (~1-5KB) instead of all symbols (11MB+).
 * Falls back to full symbol search only if optimized lookup fails.
 */
async function findSymbolOptimized(
  buildId: string,
  packageId: string,
  symbolPath: string,
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

  // Prefer the routing map + individual symbol files.
  // This avoids downloading `lookup.json` which can exceed Next.js' 2MB cache limit.
  // Fetch both in parallel for speed.
  const [pkgInfo, routingMap] = await Promise.all([
    getPackageInfo(buildId, packageId),
    getRoutingMapData(buildId, packageId),
  ]);

  // Derive package prefix from packageId as fallback (e.g., pkg_py_langchain_core -> langchain_core)
  const packagePrefix =
    pkgInfo?.publishedName ||
    pkgInfo?.displayName ||
    packageId.replace(/^pkg_(py|js|java|go)_/, "");

  if (routingMap?.slugs) {
    const candidates: string[] = [];
    for (const p of pathVariations) {
      candidates.push(p);
      // Try with package prefix for python-style qualified names
      if (packagePrefix) {
        candidates.push(`${packagePrefix}.${p}`);
      }
      // Try slash form for TS module paths
      candidates.push(p.replace(/\./g, "/"));
    }

    for (const key of candidates) {
      const entry = routingMap.slugs[key];
      if (!entry?.refId) continue;
      const symbol = await getIndividualSymbolData(buildId, entry.refId, packageId);
      if (symbol) return symbol;
    }
  }

  // OPTIMIZATION: Try sharded lookups in parallel (batch up to 3 at a time)
  // This avoids sequential await in a loop, reducing waterfall latency
  const shardedPaths = pathVariations.slice(0, 3).flatMap((path) => {
    const paths = [path];
    if (packagePrefix) {
      paths.push(`${packagePrefix}.${path}`);
    }
    return paths;
  });

  // Batch lookup: try all paths in parallel
  const shardedResults = await Promise.all(
    shardedPaths.map((path) => getSymbolViaShardedLookup(buildId, packageId, path)),
  );

  // Return the first successful result
  const foundSymbol = shardedResults.find(Boolean);
  if (foundSymbol) return foundSymbol;

  // Don't fall back to getSymbols - return null instead
  // This prevents loading multi-MB files on the hot path
  return null;
}

/**
 * Cache for resolving base symbols across packages.
 * Keyed by `${buildId}:${packageId}:${baseName}`.
 */
const baseSymbolResolutionCache = new Map<
  string,
  { symbol: SymbolRecord; packageId: string; packageName: string } | null
>();

/**
 * Clean a source path that may contain build cache prefixes.
 * Removes paths like /tmp/.../extracted/... and handles duplicated package paths.
 */
function cleanSourcePath(sourcePath: string, repoPathPrefix?: string | null): string {
  let cleaned = sourcePath;

  // Strip everything up to and including /extracted/
  const extractedIdx = cleaned.indexOf("/extracted/");
  if (extractedIdx !== -1) {
    cleaned = cleaned.slice(extractedIdx + "/extracted/".length);
  }

  // Also strip /tmp/ prefix paths that don't have /extracted/
  const tmpIdx = cleaned.indexOf("/tmp/");
  if (tmpIdx !== -1) {
    // Try to find a reasonable starting point after tmp
    const srcMatch = cleaned.match(/\/src\/(.+)$/);
    if (srcMatch) {
      cleaned = `src/${srcMatch[1]}`;
    }
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

function joinRepoPathPrefix(prefix: string, sourcePath: string): string {
  const cleanPrefix = prefix.replace(/\/+$/, "");
  const cleanSource = sourcePath.replace(/^[./]+/, "");

  // Treat "." as empty (means package is at repo root)
  if (!cleanPrefix || cleanPrefix === ".") return cleanSource;
  if (cleanSource === cleanPrefix) return cleanSource;
  if (cleanSource.startsWith(`${cleanPrefix}/`)) return cleanSource;

  return `${cleanPrefix}/${cleanSource}`;
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
  currentPackageSymbols?: SymbolRecord[],
): Promise<InheritedMemberGroup[]> {
  const inheritedGroups: InheritedMemberGroup[] = [];
  const ownMemberSet = new Set(ownMemberNames);
  const processedBases = new Set<string>();

  // Get manifest to find all packages for cross-package inheritance
  const manifest = await getManifestData();
  const manifestPackages = manifest?.packages || [];

  // Limit cross-package lookups heavily to avoid a fetch storm during prerendering.
  // Most inheritance chains resolve from the current package or the core package.
  const crossPackageLimit = Number(process.env.INHERITANCE_CROSS_PACKAGE_LIMIT ?? 3);
  const candidatePackageIds = Array.from(
    new Set([
      currentPackageId,
      ...manifestPackages
        .filter((p) => {
          const published = (p.publishedName || "").toLowerCase();
          const pid = (p.packageId || "").toLowerCase();
          return (
            published.includes("langchain-core") ||
            published.includes("@langchain/core") ||
            pid.includes("langchain_core") ||
            pid.includes("pkg_js_langchain_core") ||
            pid.includes("pkg_py_langchain_core")
          );
        })
        .map((p) => p.packageId),
    ]),
  ).slice(0, Math.max(1, crossPackageLimit));

  // Helper to find a symbol by name across all packages
  // OPTIMIZATION: Uses routing maps (already cached) instead of lookup.json (doesn't exist/slow 404s)
  async function findBaseSymbol(
    simpleBaseName: string,
  ): Promise<{ symbol: SymbolRecord; packageId: string; packageName: string } | null> {
    // First, try to find in current package symbols if we have them
    const baseSymbol =
      currentPackageSymbols?.find(
        (s) =>
          (s.kind === "class" || s.kind === "interface") &&
          (s.name === simpleBaseName ||
            s.qualifiedName === simpleBaseName ||
            s.qualifiedName.endsWith(`.${simpleBaseName}`)),
      ) || null;

    if (baseSymbol) {
      const pkg = manifestPackages.find((p) => p.packageId === currentPackageId);
      return {
        symbol: baseSymbol,
        packageId: currentPackageId,
        packageName: pkg?.publishedName || "",
      };
    }

    // OPTIMIZATION: Search across candidate packages using INDEXED routing maps for O(1) lookups
    // This replaces the O(n) Object.entries() iteration with O(1) Map.get()
    for (const pkgId of candidatePackageIds) {
      const cacheKey = `${buildId}:${pkgId}:${simpleBaseName}`;

      // Check in-memory cache first
      if (baseSymbolResolutionCache.has(cacheKey)) {
        const cached = baseSymbolResolutionCache.get(cacheKey);
        if (cached) return cached;
        continue;
      }

      // Get the package's build ID (might be different from the current build)
      const pkgBuildId =
        (manifestPackages.find((p) => p.packageId === pkgId) as { buildId?: string })?.buildId ||
        buildId;

      // OPTIMIZATION: Use indexed routing map for O(1) lookup instead of O(n) iteration
      const indexedMap = await getIndexedRoutingMap(pkgBuildId, pkgId);
      if (!indexedMap?.slugs) {
        baseSymbolResolutionCache.set(cacheKey, null);
        continue;
      }

      // O(1) lookup: Try direct title match first (most common case)
      let foundEntry: { refId: string; qualifiedName: string } | null = null;
      const directMatch = indexedMap.byTitle.get(simpleBaseName);
      if (directMatch) {
        const entry = indexedMap.slugs[directMatch];
        if (entry && (entry.kind === "class" || entry.kind === "interface")) {
          foundEntry = { refId: entry.refId, qualifiedName: directMatch };
        }
      }

      // Fallback for edge cases: names with dots/slashes (rare but needed for compatibility)
      if (!foundEntry) {
        for (const [qualifiedName, entry] of Object.entries(indexedMap.slugs)) {
          if (
            (entry.kind === "class" || entry.kind === "interface") &&
            (qualifiedName === simpleBaseName ||
              qualifiedName.endsWith(`.${simpleBaseName}`) ||
              qualifiedName.endsWith(`/${simpleBaseName}`))
          ) {
            foundEntry = { refId: entry.refId, qualifiedName };
            break;
          }
        }
      }

      if (!foundEntry) {
        baseSymbolResolutionCache.set(cacheKey, null);
        continue;
      }

      // Fetch the actual symbol using the refId
      const symbol = await getIndividualSymbolData(pkgBuildId, foundEntry.refId, pkgId);
      if (!symbol) {
        baseSymbolResolutionCache.set(cacheKey, null);
        continue;
      }

      const pkg = manifestPackages.find((p) => p.packageId === pkgId);
      const resolved = {
        symbol,
        packageId: pkgId,
        packageName: pkg?.publishedName || "",
      };
      baseSymbolResolutionCache.set(cacheKey, resolved);
      return resolved;
    }

    return null;
  }

  // Helper to extract members from a base class
  async function extractMembersFromBase(
    baseSymbol: SymbolRecord,
    basePackageId: string,
    basePackageName: string,
    simpleBaseName: string,
    baseQualifiedName: string,
  ): Promise<void> {
    if (!baseSymbol.members || baseSymbol.members.length === 0) return;

    // Resolve member details without fetching full symbols.json.
    // We fetch referenced members individually (small files) to avoid blob throttling.
    const symbolsById = new Map<string, SymbolRecord>();
    if (basePackageId === currentPackageId && currentPackageSymbols?.length) {
      for (const s of currentPackageSymbols) {
        symbolsById.set(s.id, s);
      }
    } else {
      const memberIds = baseSymbol.members.map((m) => m.refId).filter(Boolean);
      const resolved = await Promise.all(
        memberIds.map(async (id) => ({
          id,
          symbol: await getIndividualSymbolData(buildId, id, basePackageId),
        })),
      );
      for (const r of resolved) {
        if (r.symbol) symbolsById.set(r.id, r.symbol);
      }
    }

    // Filter out members that are already defined on the current class
    const inheritedMembers: DisplayMember[] = [];

    for (const member of baseSymbol.members) {
      // Skip if already defined on the current class (overridden)
      if (ownMemberSet.has(member.name)) continue;

      // Skip constructors
      if (member.kind === "constructor") continue;

      // Skip private members
      if (member.visibility === "private") continue;

      // Skip members with placeholder-like names (containing brackets)
      // These are likely unresolved placeholders in the IR data
      if (/[\[\]<>]/.test(member.name)) continue;

      // Use refId if available (MemberReference format), fall back to id (ExtractorMember format)
      // This handles both TypeScript/Python (refId) and Java/Go (id) member formats
      const memberId = member.refId || (member as unknown as { id?: string }).id;

      // Resolve member details
      let memberSymbol = memberId ? symbolsById.get(memberId) : undefined;

      // If ID lookup fails, try to find by name in the routing map (for re-exported symbols)
      if (!memberSymbol) {
        const qualifiedName = await findSymbolQualifiedNameByName(
          buildId,
          basePackageId,
          member.name,
          member.kind,
        );
        if (qualifiedName) {
          memberSymbol =
            (await getSymbolViaShardedLookup(buildId, basePackageId, qualifiedName)) ?? undefined;
        }
      }

      const type = memberSymbol
        ? extractTypeFromSignature(memberSymbol.signature, member.kind)
        : undefined;

      inheritedMembers.push({
        name: member.name,
        kind: member.kind,
        refId: memberId,
        visibility: member.visibility,
        type,
        summary: memberSymbol?.docs?.summary,
        summaryHtml: memberSymbol?.docs?.summaryHtml,
        signature: memberSymbol?.signature,
        // Use the actual qualified name from the symbol record (handles re-exports correctly)
        qualifiedName: memberSymbol?.qualifiedName,
      });
    }

    if (inheritedMembers.length > 0) {
      inheritedGroups.push({
        baseName: simpleBaseName,
        baseQualifiedName,
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
    if (
      ["Pick", "Partial", "Omit", "Record", "Exclude", "Extract", "unknown"].includes(
        simpleBaseName,
      )
    ) {
      continue;
    }

    const found = await findBaseSymbol(simpleBaseName);

    if (found) {
      await extractMembersFromBase(
        found.symbol,
        found.packageId,
        found.packageName,
        simpleBaseName,
        found.symbol.qualifiedName,
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

export async function SymbolPage({
  language,
  packageId,
  packageName,
  symbolPath,
  version,
}: SymbolPageProps) {
  const pageStart = Date.now();
  const log = (msg: string) => console.log(`[SymbolPage] ${msg} (+${Date.now() - pageStart}ms)`);
  log(`START: ${packageName}/${symbolPath}`);

  // Get the package-specific buildId
  const buildId = await getPackageBuildId(language, packageName);
  log(`buildId: ${buildId}`);

  // Get project info for version history/switching
  const project = getProjectForPackage(packageName);

  let symbol: DisplaySymbol | null = null;
  let irSymbolForMarkdown: SymbolRecord | null = null;
  let knownSymbols = new Map<string, string>();
  // OPTIMIZATION: Store pkgInfo from initial fetch to avoid duplicate call later
  let cachedPkgInfo: Awaited<ReturnType<typeof getPackageInfo>> | null = null;
  // OPTIMIZATION: Start typeUrlMap fetch early, await later
  let typeUrlMapPromise: Promise<Map<string, string>> | null = null;

  if (buildId) {
    const [pkgInfo, routingMap] = await Promise.all([
      getPackageInfo(buildId, packageId),
      getRoutingMapData(buildId, packageId),
    ]);
    log(`pkgInfo + routingMap loaded`);
    cachedPkgInfo = pkgInfo;

    // Build knownSymbols map for local type linking
    // This iterates over routing map entries but is just CPU work (no I/O), so it's fast
    if (routingMap?.slugs) {
      for (const [slug, entry] of Object.entries(routingMap.slugs)) {
        if (["class", "interface", "typeAlias", "enum"].includes(entry.kind)) {
          // Map symbol name to its URL path (slug)
          knownSymbols.set(entry.title, slug);
        }
      }
    }

    // OPTIMIZATION: Start typeUrlMap fetch early (runs in parallel with symbol loading)
    // This is independent of symbol data and can run concurrently
    const currentPkgSlugForTypeUrl = slugifyPackageName(packageName);
    const localSymbolSetForTypeUrl = new Set(knownSymbols.keys());
    typeUrlMapPromise = getTypeUrlMap(language, currentPkgSlugForTypeUrl, localSymbolSetForTypeUrl);

    // Main symbol lookup (routing map + individual symbol files; falls back as needed)
    log(`findSymbolOptimized START`);
    const irSymbol = await findSymbolOptimized(buildId, packageId, symbolPath);
    log(`findSymbolOptimized END: ${irSymbol ? "found" : "not found"}`);

    // If the symbol isn't found, it may be an "alias" member that was included in a parent
    // module/class's member list but wasn't emitted as a full SymbolRecord in the IR.
    // In that case, render a lightweight stub page instead of "not found".
    if (!irSymbol) {
      const parts = symbolPath.split(".");
      if (parts.length >= 2) {
        const memberName = parts[parts.length - 1]!;
        const parentPath = parts.slice(0, -1).join(".");
        const parent = await findSymbolOptimized(buildId, packageId, parentPath);
        const parentHasAliasMember = !!parent?.members?.some((m) => {
          const kind = (m.kind as unknown as string) || "";
          return m.name === memberName && kind === "alias";
        });

        if (parent && parentHasAliasMember) {
          symbol = {
            id: `alias_stub_${symbolPath}`,
            kind: "variable",
            name: memberName,
            qualifiedName: symbolPath,
            signature: "",
            docs: {
              summary: `This symbol is an alias exported from \`${parentPath}\` and does not have dedicated reference docs.`,
              description: `Go back to \`${parentPath}\` to see the module/class context where this alias is defined.`,
            },
            visibility: "public",
            stability: "stable",
            members: undefined,
            bases: undefined,
            inheritedMembers: undefined,
            versionInfo: undefined,
            typeRefs: undefined,
            source: parent.source
              ? {
                  repo: parent.source.repo,
                  sha: parent.source.sha,
                  path: parent.source.path,
                  line: parent.source.line ?? null,
                }
              : undefined,
          };
        }
      }
    }

    // If a specific version is requested, try to load the historical snapshot
    if (version && irSymbol) {
      const historicalData = await getHistoricalSnapshot(
        project.id,
        language,
        packageId,
        irSymbol.qualifiedName,
        version,
      );

      if (historicalData) {
        symbol = snapshotToDisplaySymbol(
          historicalData.snapshot,
          { since: version },
          { repo: irSymbol.source?.repo, sha: irSymbol.source?.sha },
        );
      }
    }

    // If no historical snapshot (or no version requested), use the fetched symbol
    if (!symbol && irSymbol) {
      // Keep reference for markdown generation
      irSymbolForMarkdown = irSymbol;

      // Fetch member symbols individually (instead of loading all 11MB)
      let memberSymbols: Map<string, SymbolRecord> | undefined;

      if (irSymbol.members && irSymbol.members.length > 0) {
        log(`fetching ${irSymbol.members.length} member symbols`);
        memberSymbols = new Map();
        // Fetch each member symbol individually in parallel
        const memberPromises = irSymbol.members.map(async (member) => {
          // Use refId if available (MemberReference format), fall back to id (ExtractorMember format)
          // This handles both TypeScript/Python (refId) and Java/Go (id) member formats
          const memberId = member.refId || (member as unknown as { id?: string }).id;

          // First, try to fetch the symbol by member ID
          let memberSymbol = memberId
            ? await getIndividualSymbolData(buildId, memberId, packageId)
            : null;

          // If ID lookup fails (common for re-exported symbols), try to find by name
          if (!memberSymbol) {
            const qualifiedName = await findSymbolQualifiedNameByName(
              buildId,
              packageId,
              member.name,
              member.kind,
            );
            if (qualifiedName) {
              // Try to fetch the actual symbol using the qualified name via sharded lookup
              memberSymbol = await getSymbolViaShardedLookup(buildId, packageId, qualifiedName);
            }
          }

          if (memberSymbol) {
            return { memberId, symbol: memberSymbol };
          }
          return null;
        });

        const memberResults = await Promise.all(memberPromises);
        for (const result of memberResults) {
          if (result && result.memberId) {
            memberSymbols.set(result.memberId, result.symbol);
          }
        }
        log(`member symbols done (${memberResults.filter(Boolean).length} found)`);
      }

      // STREAMING OPTIMIZATION: Don't await inherited members here.
      // They will be loaded and streamed via Suspense in the render phase.
      // This allows the main symbol content to render immediately.
      symbol = toDisplaySymbol(irSymbol, memberSymbols, undefined);
    }
  }

  // STREAMING: Prepare data for async inherited members resolution
  // This will be passed to a Suspense-wrapped component
  const inheritedMembersData =
    buildId &&
    irSymbolForMarkdown &&
    (irSymbolForMarkdown.kind === "class" || irSymbolForMarkdown.kind === "interface") &&
    irSymbolForMarkdown.relations?.extends &&
    irSymbolForMarkdown.relations.extends.length > 0
      ? {
          buildId,
          packageId,
          baseClassNames: irSymbolForMarkdown.relations.extends,
          ownMemberNames: irSymbolForMarkdown.members?.map((m) => m.name) || [],
        }
      : null;

  log(`data loading complete, symbol=${!!symbol}`);

  // Show not found state if symbol wasn't loaded
  if (!symbol) {
    const symbolLanguage = symbolLanguageToLanguage(
      language === "javascript" ? "typescript" : language,
    );
    return (
      <div className="space-y-8">
        <nav className="flex items-center gap-2 text-sm text-foreground-secondary">
          <Link href={`/${language}`} className="hover:text-foreground transition-colors">
            {LANGUAGE_CONFIG[symbolLanguage].name}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link
            href={buildPackageUrl(language, packageName)}
            className="hover:text-foreground transition-colors"
          >
            {getDisplayPackageName(packageName, language)}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">{symbolPath}</span>
        </nav>

        <div className="text-center py-12">
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Symbol Not Found</h1>
          <p className="text-foreground-secondary">
            The symbol <code className="font-mono">{symbolPath}</code> was not found in{" "}
            {getDisplayPackageName(packageName, language)}.
          </p>
        </div>
      </div>
    );
  }

  // Get pre-computed typeUrlMap for cross-project type linking
  // OPTIMIZATION: This map is pre-computed and cached (via unstable_cache) so we
  // don't iterate over 20k+ symbols on every render. See getTypeUrlMap() in loader.ts.
  // OPTIMIZATION #2: The promise was started early (after routingMap loaded) and has been
  // running in parallel with symbol loading. Now we just await the result.
  // If buildId existed, we started the fetch early; otherwise fetch now
  log(`typeUrlMap await START`);
  const typeUrlMap = buildId
    ? await typeUrlMapPromise!
    : await getTypeUrlMap(language, slugifyPackageName(packageName), new Set(knownSymbols.keys()));
  log(`typeUrlMap await END (${typeUrlMap.size} entries)`);

  // Prefer package repo path prefix from the build manifest (already part of the IR data).
  // This captures monorepo layouts like `libs/<package>` without hardcoding.
  // OPTIMIZATION: Reuse cachedPkgInfo from initial parallel fetch instead of duplicate call
  const pkgInfo = cachedPkgInfo;
  const repoPathPrefix = pkgInfo?.repo?.path || null;

  // Clean the source path to remove build cache prefixes and fix duplicated paths
  const cleanedSourcePath = symbol.source?.path
    ? cleanSourcePath(symbol.source.path, repoPathPrefix)
    : "";

  const hasValidSource =
    !!symbol.source?.repo &&
    !!symbol.source?.sha &&
    !!cleanedSourcePath &&
    // Exclude node_modules paths - these are external dependencies
    !cleanedSourcePath.includes("node_modules/");

  const githubPath =
    hasValidSource && cleanedSourcePath
      ? repoPathPrefix
        ? joinRepoPathPrefix(repoPathPrefix, cleanedSourcePath)
        : cleanedSourcePath
      : null;

  const sourceUrl =
    hasValidSource && symbol.source?.line && githubPath
      ? `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${githubPath}#L${symbol.source.line}`
      : hasValidSource
        ? `https://github.com/${symbol.source!.repo}/blob/${symbol.source!.sha}/${githubPath}`
        : null;

  // Generate TOC data
  const { topItems, sections, inheritedGroups } = generateTOCData(symbol);

  // Build breadcrumb items for structured data
  const urlLangLabel = LANGUAGE_CONFIG[language].name;
  const displayPackageName = getDisplayPackageName(packageName, language);
  const breadcrumbItems = [
    { name: urlLangLabel, url: `/${language}` },
    { name: displayPackageName, url: buildPackageUrl(language, packageName) },
    { name: symbol.name, url: `/${language}/${slugifyPackageName(packageName)}/${symbolPath}` },
  ];

  return (
    <>
      {/* Structured Data */}
      <TechArticleJsonLd
        title={`${symbol.name} - ${displayPackageName}`}
        description={
          symbol.docs.summary ||
          symbol.docs.description ||
          `API reference for ${symbol.name} in ${displayPackageName}`
        }
        url={`/${language}/${slugifyPackageName(packageName)}/${symbolPath}`}
        language={language}
        packageName={displayPackageName}
      />
      <BreadcrumbJsonLd items={breadcrumbItems} />

      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm text-foreground-secondary flex-wrap">
            <Link href={`/${language}`} className="hover:text-foreground transition-colors">
              {urlLangLabel}
            </Link>
            <ChevronRight className="h-4 w-4 shrink-0" />
            <Link
              href={buildPackageUrl(language, packageName)}
              className="hover:text-foreground transition-colors"
            >
              {displayPackageName}
            </Link>
            {symbolPath.split(".").map((part, i, arr) => {
              // Build cumulative path up to this part
              const pathParts = arr.slice(0, i + 1);
              // Use slashes for URL path
              const urlPath = pathParts.join("/");
              const isLast = i === arr.length - 1;
              const langPath = language;
              const packageSlug = slugifyPackageName(packageName);
              const href = `/${langPath}/${packageSlug}/${urlPath}`;

              return (
                <span key={i} className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 shrink-0" />
                  {isLast ? (
                    <span className="text-foreground">{part}</span>
                  ) : (
                    <Link href={href} className="hover:text-foreground transition-colors">
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
              <span
                className={cn("px-2 py-1 text-sm font-medium rounded", getKindColor(symbol.kind))}
              >
                {getKindLabel(symbol.kind)}
              </span>
              <VersionSwitcher
                qualifiedName={symbol.qualifiedName}
                project={project.id}
                language={language}
                packageId={packageId}
                currentVersion={version}
              />
              {symbol.versionInfo?.since && <VersionBadge since={symbol.versionInfo.since} />}
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
            <h1 className="text-3xl font-bold text-foreground font-mono">{symbol.name}</h1>
            {symbol.docs?.summary && (
              <MarkdownContent compact className="mt-3 text-foreground-secondary text-lg">
                {symbol.docs.summary}
              </MarkdownContent>
            )}
          </div>

          {/* Signature / Import statement */}
          {symbol.signature &&
            (symbol.kind === "module" ? (
              <CodeBlock
                code={getDisplayCode(symbol, packageName, language)}
                language={language === "python" ? "python" : "typescript"}
                className="rounded-lg [&_pre]:p-4 [&_pre]:m-0 [&_pre]:text-sm [&_code]:text-sm [&_pre]:overflow-x-auto"
              />
            ) : (
              <SignatureBlock
                signature={formatSignature(symbol.signature)}
                language={language}
                typeRefs={symbol.typeRefs}
                knownSymbols={knownSymbols}
                packageName={packageName}
                typeUrlMap={typeUrlMap}
                className="rounded-lg"
              />
            ))}

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
                    <TypeReferenceDisplay
                      typeStr={base}
                      knownSymbols={knownSymbols}
                      language={language}
                      packageName={packageName}
                      typeUrlMap={typeUrlMap}
                    />
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {symbol.docs?.description && <MarkdownContent>{symbol.docs.description}</MarkdownContent>}

          {/* Sections (parameters, examples, etc.) */}
          {symbol.docs?.sections?.map((section, i) => (
            <Section
              key={i}
              section={section}
              language={language}
              knownSymbols={knownSymbols}
              packageName={packageName}
              typeUrlMap={typeUrlMap}
            />
          ))}

          {/* Members (for classes/modules) */}
          {symbol.members && symbol.members.length > 0 && (
            <MembersSection
              members={symbol.members}
              language={language}
              packageName={packageName}
              parentQualifiedName={symbol.qualifiedName}
              knownSymbols={knownSymbols}
              typeUrlMap={typeUrlMap}
            />
          )}

          {/* Inherited members from base classes - streamed via Suspense */}
          {inheritedMembersData && (
            <Suspense fallback={<InheritedMembersSkeleton />}>
              <AsyncInheritedMembers
                buildId={inheritedMembersData.buildId}
                packageId={inheritedMembersData.packageId}
                baseClassNames={inheritedMembersData.baseClassNames}
                ownMemberNames={inheritedMembersData.ownMemberNames}
                language={language}
                packageName={packageName}
              />
            </Suspense>
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
            language={language}
            packageId={packageId}
            className="mt-6"
          />
        </div>

        {/* Table of Contents sidebar */}
        <TableOfContents
          topItems={topItems}
          sections={sections}
          inheritedGroups={inheritedGroups}
          markdown={
            irSymbolForMarkdown
              ? symbolToMarkdown(irSymbolForMarkdown, packageName, {
                  // Use repo path prefix from manifest to build correct source links in markdown.
                  repoPathPrefix: repoPathPrefix || undefined,
                })
              : undefined
          }
          pageUrl={`${getBaseUrl()}/${language}/${slugifyPackageName(packageName)}/${symbolPath}`}
        />
      </div>
    </>
  );
}

/**
 * Parse a type string and render with links to known symbols.
 * Uses dashed underlines for linked types.
 * Supports cross-project linking via typeUrlMap.
 */
function TypeReferenceDisplay({
  typeStr,
  knownSymbols,
  language,
  packageName,
  typeUrlMap,
  disableLinks = false,
}: {
  typeStr: string;
  knownSymbols: Map<string, string>;
  language: UrlLanguage;
  packageName: string;
  /** Map of type names to their resolved URLs (for cross-project linking) */
  typeUrlMap?: Map<string, string>;
  /** Disable rendering links (useful when inside another link to avoid nested <a> tags) */
  disableLinks?: boolean;
}) {
  // Regex to match potential type names (identifiers starting with uppercase or lowercase for Python builtins)
  const typeNamePattern = /([A-Za-z][a-zA-Z0-9_]*)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = typeNamePattern.exec(typeStr)) !== null) {
    const typeName = match[1];
    const startIndex = match.index;

    // Add text before this match
    if (startIndex > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{typeStr.slice(lastIndex, startIndex)}</span>);
    }

    // Check if this type is a known symbol in current package
    if (knownSymbols.has(typeName)) {
      const langPath = language;
      const pkgSlug = slugifyPackageName(packageName);
      const symbolPath = knownSymbols.get(typeName)!;
      // Use slugifySymbolPath to properly strip package prefix for Python
      const hasPackagePrefix = language === "python" && symbolPath.includes("_");
      const urlPath = slugifySymbolPath(symbolPath, hasPackagePrefix);
      const href = `/${langPath}/${pkgSlug}/${urlPath}`;

      if (disableLinks) {
        parts.push(
          <span key={`link-${startIndex}`} className="text-primary">
            {typeName}
          </span>,
        );
      } else {
        parts.push(
          <Link
            key={`link-${startIndex}`}
            href={href}
            className="text-primary hover:text-primary/80 underline decoration-dashed decoration-primary/50 underline-offset-2"
          >
            {typeName}
          </Link>,
        );
      }
    }
    // Check if we have a cross-project URL for this type
    else if (typeUrlMap?.has(typeName)) {
      if (disableLinks) {
        parts.push(
          <span key={`link-${startIndex}`} className="text-primary">
            {typeName}
          </span>,
        );
      } else {
        parts.push(
          <Link
            key={`link-${startIndex}`}
            href={typeUrlMap.get(typeName)!}
            className="text-primary hover:text-primary/80 underline decoration-dashed decoration-primary/50 underline-offset-2"
          >
            {typeName}
          </Link>,
        );
      }
    }
    // Check if this is a built-in type with external documentation
    else {
      const builtinUrl = getBuiltinTypeDocUrl(typeName, language);
      if (builtinUrl) {
        if (disableLinks) {
          parts.push(
            <span key={`builtin-${startIndex}`} className="text-foreground-secondary">
              {typeName}
            </span>,
          );
        } else {
          parts.push(
            <a
              key={`builtin-${startIndex}`}
              href={builtinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground-secondary hover:text-foreground underline decoration-dotted decoration-foreground-muted/50 underline-offset-2"
            >
              {typeName}
            </a>,
          );
        }
      } else {
        parts.push(<span key={`type-${startIndex}`}>{typeName}</span>);
      }
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
  typeUrlMap,
}: {
  section: DocSection;
  language: UrlLanguage;
  knownSymbols: Map<string, string>;
  packageName: string;
  /** Map of type names to their resolved URLs (for cross-project linking) */
  typeUrlMap?: Map<string, string>;
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
                    {item.required && <span className="ml-1 text-red-500">*</span>}
                  </td>
                  <td className="py-3 px-3">
                    <code className="font-mono text-foreground-secondary text-xs">
                      {item.type ? (
                        <TypeReferenceDisplay
                          typeStr={item.type}
                          knownSymbols={knownSymbols}
                          language={language}
                          packageName={packageName}
                          typeUrlMap={typeUrlMap}
                        />
                      ) : (
                        "unknown"
                      )}
                    </code>
                  </td>
                  <td className="py-3 px-3 text-foreground-secondary">
                    {item.description && (
                      <MarkdownContent compact>{item.description}</MarkdownContent>
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
    // Clean the example code to remove MkDocs admonition syntax and HTML artifacts
    const cleanedCode = cleanExampleCode(section.content);

    // Skip rendering if the cleaned code is empty
    if (!cleanedCode) {
      return null;
    }

    return (
      <div id="examples">
        <h2 className="text-xl font-heading font-semibold text-foreground mb-4">
          {section.title || "Example"}
        </h2>
        {section.description && (
          <p className="text-foreground-secondary mb-3">{section.description}</p>
        )}
        <CodeBlock
          code={cleanedCode}
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
  knownSymbols,
  typeUrlMap,
}: {
  members: DisplayMember[];
  language: UrlLanguage;
  packageName: string;
  parentQualifiedName: string;
  knownSymbols: Map<string, string>;
  typeUrlMap?: Map<string, string>;
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
    Object.create(null) as Record<string, DisplayMember[]>,
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
  const remainingKinds = Object.keys(groupedMembers).filter((k) => !kindOrder.includes(k));
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
            {groupedMembers[kind].map((member, idx) => (
              <MemberCard
                key={`${member.name}-${idx}`}
                member={member}
                index={idx}
                language={language}
                packageName={packageName}
                parentQualifiedName={parentQualifiedName}
                knownSymbols={knownSymbols}
                typeUrlMap={typeUrlMap}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Kinds that have dedicated pages and should be linked
 */
const LINKABLE_MEMBER_KINDS = new Set([
  "class",
  "interface",
  "function",
  "method",
  "module",
  "enum",
  "typeAlias",
  "constructor",
]);

/**
 * Individual member card
 */
async function MemberCard({
  member,
  language,
  packageName,
  parentQualifiedName,
  knownSymbols,
  typeUrlMap,
  index,
}: {
  member: DisplayMember;
  language: UrlLanguage;
  packageName: string;
  parentQualifiedName: string;
  knownSymbols: Map<string, string>;
  typeUrlMap?: Map<string, string>;
  index: number;
}) {
  const isMethodOrFunction =
    member.kind === "method" || member.kind === "function" || member.kind === "constructor";

  // Check if this member kind should be linked (has a dedicated page)
  const isLinkable = LINKABLE_MEMBER_KINDS.has(member.kind);

  // Use the member's actual qualifiedName if available (handles re-exports correctly)
  // Fall back to constructing from parent path for backwards compatibility
  const symbolPath = member.qualifiedName || `${parentQualifiedName}.${member.name}`;
  const langPath = language;
  const packageSlug = slugifyPackageName(packageName);
  // Use slugifySymbolPath to properly strip package prefix for Python
  const hasPackagePrefix = language === "python" && symbolPath.includes("_");
  const urlPath = slugifySymbolPath(symbolPath, hasPackagePrefix);
  const href = `/${langPath}/${packageSlug}/${urlPath}`;

  // Common content for both linked and non-linked versions
  const cardContent = (
    <>
      <span
        className={cn(
          "px-2 py-0.5 text-xs font-medium rounded shrink-0 mt-0.5",
          getKindColor(member.kind as SymbolKind),
        )}
      >
        {member.kind}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={cn(
              "font-mono text-foreground",
              isLinkable && "group-hover:text-primary transition-colors",
            )}
          >
            {member.name}
          </span>

          {/* Show type for properties/attributes */}
          {!isMethodOrFunction && member.type && (
            <span className="text-foreground-secondary font-mono text-sm">
              :{" "}
              <TypeReferenceDisplay
                typeStr={member.type}
                knownSymbols={knownSymbols}
                language={language}
                packageName={packageName}
                typeUrlMap={typeUrlMap}
                disableLinks={isLinkable}
              />
            </span>
          )}

          {/* Show return type for methods */}
          {isMethodOrFunction && member.type && (
            <span className="text-foreground-muted font-mono text-xs">
              →{" "}
              <TypeReferenceDisplay
                typeStr={member.type}
                knownSymbols={knownSymbols}
                language={language}
                packageName={packageName}
                typeUrlMap={typeUrlMap}
                disableLinks={isLinkable}
              />
            </span>
          )}
        </div>

        {/* Show summary - truncate for linkable members, show full for non-linkable (attributes) */}
        {member.summary && (
          <div className="mt-1 [&_code]:text-xs">
            <MarkdownContent
              compact
              paragraphClassName={cn(
                "text-sm text-foreground-secondary m-0",
                isLinkable && "line-clamp-2",
              )}
            >
              {member.summary}
            </MarkdownContent>
          </div>
        )}
      </div>

      {/* Link indicator - only show for linkable members */}
      {isLinkable && (
        <ChevronRight className="h-4 w-4 text-foreground-muted group-hover:text-primary shrink-0 transition-colors" />
      )}
    </>
  );

  // Render as link only if the member kind has a dedicated page
  if (isLinkable) {
    return (
      <Link
        id={`member-${member.name}-${index}`}
        href={href}
        className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-background-secondary hover:border-primary/50 hover:bg-background transition-colors"
        style={{ cursor: "pointer" }}
      >
        {cardContent}
      </Link>
    );
  }

  // Render as non-clickable div for attributes and other non-linkable kinds
  return (
    <div
      id={`member-${member.name}-${index}`}
      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background-secondary"
    >
      {cardContent}
    </div>
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
          Object.create(null) as Record<string, DisplayMember[]>,
        );

        const orderedKinds = kindOrder.filter((k) => groupedMembers[k]);
        const remainingKinds = Object.keys(groupedMembers).filter((k) => !kindOrder.includes(k));
        const allKinds = [...orderedKinds, ...remainingKinds];

        return (
          <div key={group.baseName} className="border-t border-border pt-6">
            <h2 className="text-lg font-heading font-semibold text-foreground-secondary mb-4 flex items-center gap-2">
              <span>Inherited from</span>
              {group.basePackageName && group.basePackageName !== packageName ? (
                <Link
                  href={
                    group.baseQualifiedName
                      ? buildSymbolUrl(language, group.basePackageName, group.baseQualifiedName)
                      : `/${language}/${slugifyPackageName(group.basePackageName)}/${group.baseName}`
                  }
                  className="font-mono text-primary hover:text-primary/80 underline decoration-dashed underline-offset-2"
                >
                  {group.baseName}
                </Link>
              ) : (
                <code className="font-mono text-foreground">{group.baseName}</code>
              )}
              {group.basePackageName && group.basePackageName !== packageName && (
                <span className="text-sm text-foreground-muted">
                  ({getDisplayPackageName(group.basePackageName, language)})
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
                    {groupedMembers[kind].map((member, idx) => (
                      <InheritedMemberRow
                        key={`${member.name}-${idx}`}
                        member={member}
                        index={idx}
                        language={language}
                        basePackageName={group.basePackageName || packageName}
                        baseClassName={group.baseName}
                        baseQualifiedName={group.baseQualifiedName}
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
 * Async component for streaming inherited members via Suspense.
 * This loads inherited member data asynchronously and renders when ready.
 */
async function AsyncInheritedMembers({
  buildId,
  packageId,
  baseClassNames,
  ownMemberNames,
  language,
  packageName,
}: {
  buildId: string;
  packageId: string;
  baseClassNames: string[];
  ownMemberNames: string[];
  language: UrlLanguage;
  packageName: string;
}) {
  // Resolve inherited members (this is the slow operation)
  const inheritedGroups = await resolveInheritedMembers(
    buildId,
    packageId,
    baseClassNames,
    ownMemberNames,
  );

  // If no inherited members found, render nothing
  if (!inheritedGroups || inheritedGroups.length === 0) {
    return null;
  }

  return (
    <InheritedMembersSection
      inheritedGroups={inheritedGroups}
      language={language}
      packageName={packageName}
    />
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
  baseQualifiedName,
  index,
}: {
  member: DisplayMember;
  language: UrlLanguage;
  basePackageName: string;
  baseClassName: string;
  baseQualifiedName?: string;
  index: number;
}) {
  const isMethodOrFunction = member.kind === "method" || member.kind === "function";

  // Build the URL using the member's qualified name if available,
  // otherwise construct from base class qualified name
  let href: string;
  if (member.qualifiedName) {
    // Use the member's actual qualified name for the URL
    const memberPackage = extractPackageFromQualifiedName(
      member.qualifiedName,
      language,
      basePackageName,
    );
    href = buildSymbolUrl(language, memberPackage, member.qualifiedName);
  } else if (baseQualifiedName) {
    // Construct qualified name from base class qualified name + member name
    const memberQualifiedName = `${baseQualifiedName}.${member.name}`;
    const memberPackage = extractPackageFromQualifiedName(
      memberQualifiedName,
      language,
      basePackageName,
    );
    href = buildSymbolUrl(language, memberPackage, memberQualifiedName);
  } else {
    // Fallback: construct URL from base class name (less accurate but works for same-package)
    const langPath = language;
    const packageSlug = slugifyPackageName(basePackageName);
    const symbolPath = `${baseClassName}.${member.name}`;
    const hasPackagePrefix = language === "python" && symbolPath.includes("_");
    const urlPath = slugifySymbolPath(symbolPath, hasPackagePrefix);
    href = `/${langPath}/${packageSlug}/${urlPath}`;
  }

  return (
    <Link
      id={`inherited-${baseClassName}-${member.name}-${index}`}
      href={href}
      className="group flex items-center gap-3 py-2 px-3 rounded-md hover:bg-background-secondary transition-colors"
    >
      <span
        className={cn(
          "px-1.5 py-0.5 text-xs font-medium rounded shrink-0",
          getKindColor(member.kind as SymbolKind),
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
        <span className="text-xs text-foreground-muted truncate flex-1">— {member.summary}</span>
      )}
    </Link>
  );
}

/**
 * Type display with potential linking for known types
 */
