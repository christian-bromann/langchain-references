/**
 * llms-full.txt Route
 *
 * Provides a comprehensive symbol listing for LLM consumption.
 * Lists all symbols from all packages with their descriptions.
 *
 * @see https://llmstxt.org/
 */

import { getBuildIdForLanguage, getManifestData, getSymbols } from "@/lib/ir/loader";
import { getBaseUrl } from "@/lib/config/mcp";
import { slugifyPackageName, slugifySymbolPath } from "@/lib/utils/url";
import type { SymbolRecord } from "@langchain/ir-schema";

export const dynamic = "force-static";
export const revalidate = 3600; // Revalidate every hour

// Maximum output size to prevent excessive length (~500KB)
const MAX_OUTPUT_BYTES = 500 * 1024;
// Maximum description length per symbol
const MAX_DESCRIPTION_LENGTH = 150;

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 */
function truncate(text: string | undefined, maxLength: number): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + "...";
}

/**
 * Get a short description for a symbol.
 */
function getSymbolDescription(symbol: SymbolRecord): string {
  // Use first sentence of summary or truncated description
  const desc = symbol.docs?.summary || symbol.docs?.description || "";
  const firstSentence = desc.split(/\.\s/)[0];
  return truncate(firstSentence, MAX_DESCRIPTION_LENGTH);
}

/**
 * Format a single symbol entry.
 */
function formatSymbol(
  symbol: SymbolRecord,
  packageName: string,
  langPath: string,
  baseUrl: string,
): string {
  const pkgSlug = slugifyPackageName(packageName);
  // Clean up any :: or # separators first
  const cleanedQualifiedName = symbol.qualifiedName.replace(/::/g, ".").replace(/#/g, ".");
  // Use slugifySymbolPath to properly strip package prefix for Python
  const isPython = langPath === "python";
  const hasPackagePrefix = isPython && cleanedQualifiedName.includes("_");
  const symbolPath = slugifySymbolPath(cleanedQualifiedName, hasPackagePrefix);
  const url = `${baseUrl}/${langPath}/${pkgSlug}/${symbolPath}`;

  const kind = symbol.kind || "symbol";
  const desc = getSymbolDescription(symbol);

  return `- [${symbol.name}](${url}) (${kind})${desc ? `: ${desc}` : ""}`;
}

export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const lines: string[] = [];
  let currentBytes = 0;
  let truncated = false;

  const addLine = (line: string): boolean => {
    const lineBytes = Buffer.byteLength(line + "\n", "utf-8");
    if (currentBytes + lineBytes > MAX_OUTPUT_BYTES) {
      truncated = true;
      return false;
    }
    lines.push(line);
    currentBytes += lineBytes;
    return true;
  };

  // Header
  addLine("# LangChain API Reference - Full Symbol Index");
  addLine("");
  addLine("> Complete listing of all symbols from LangChain Python and JavaScript packages.");
  addLine("");
  addLine("---");
  addLine("");

  // Process Python packages
  const pythonBuildId = await getBuildIdForLanguage("python");
  if (pythonBuildId && !truncated) {
    const pythonManifest = await getManifestData(pythonBuildId);
    if (pythonManifest) {
      const pythonPackages = pythonManifest.packages.filter((p) => p.language === "python");

      if (pythonPackages.length > 0) {
        addLine("## Python Packages");
        addLine("");

        for (const pkg of pythonPackages) {
          if (truncated) break;

          addLine(`### ${pkg.publishedName}`);
          addLine("");

          const symbolsData = await getSymbols(pythonBuildId, pkg.packageId);
          if (symbolsData && symbolsData.symbols.length > 0) {
            // Sort symbols by kind, then by name
            const sorted = [...symbolsData.symbols].sort((a, b) => {
              if (a.kind !== b.kind) return (a.kind || "").localeCompare(b.kind || "");
              return a.name.localeCompare(b.name);
            });

            // Group by kind
            const byKind = new Map<string, SymbolRecord[]>();
            for (const sym of sorted) {
              const kind = sym.kind || "other";
              if (!byKind.has(kind)) byKind.set(kind, []);
              byKind.get(kind)!.push(sym);
            }

            for (const [kind, syms] of byKind) {
              if (truncated) break;

              addLine(`#### ${kind.charAt(0).toUpperCase() + kind.slice(1)}s`);
              addLine("");

              for (const sym of syms) {
                if (!addLine(formatSymbol(sym, pkg.publishedName, "python", baseUrl))) {
                  break;
                }
              }
              addLine("");
            }
          } else {
            addLine("_No symbols available._");
            addLine("");
          }
        }
      }
    }
  }

  // Process JavaScript packages
  const jsBuildId = await getBuildIdForLanguage("javascript");
  if (jsBuildId && !truncated) {
    const jsManifest = await getManifestData(jsBuildId);
    if (jsManifest) {
      const jsPackages = jsManifest.packages.filter((p) => p.language === "typescript");

      if (jsPackages.length > 0) {
        addLine("## JavaScript Packages");
        addLine("");

        for (const pkg of jsPackages) {
          if (truncated) break;

          addLine(`### ${pkg.publishedName}`);
          addLine("");

          const symbolsData = await getSymbols(jsBuildId, pkg.packageId);
          if (symbolsData && symbolsData.symbols.length > 0) {
            // Sort symbols by kind, then by name
            const sorted = [...symbolsData.symbols].sort((a, b) => {
              if (a.kind !== b.kind) return (a.kind || "").localeCompare(b.kind || "");
              return a.name.localeCompare(b.name);
            });

            // Group by kind
            const byKind = new Map<string, SymbolRecord[]>();
            for (const sym of sorted) {
              const kind = sym.kind || "other";
              if (!byKind.has(kind)) byKind.set(kind, []);
              byKind.get(kind)!.push(sym);
            }

            for (const [kind, syms] of byKind) {
              if (truncated) break;

              addLine(`#### ${kind.charAt(0).toUpperCase() + kind.slice(1)}s`);
              addLine("");

              for (const sym of syms) {
                if (!addLine(formatSymbol(sym, pkg.publishedName, "javascript", baseUrl))) {
                  break;
                }
              }
              addLine("");
            }
          } else {
            addLine("_No symbols available._");
            addLine("");
          }
        }
      }
    }
  }

  // Add truncation notice if needed
  if (truncated) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("_Note: This listing was truncated due to size limits._");
    lines.push("_Use the individual package pages for complete symbol details._");
  }

  const content = lines.join("\n");

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
