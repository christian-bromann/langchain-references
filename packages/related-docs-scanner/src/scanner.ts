/**
 * Main scanner module for finding symbol imports in docs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";

import type { SymbolMatch, RelatedDocEntry, PageMetadata } from "./types.js";
import { extractCodeBlocks } from "./extract-blocks.js";
import { parsePythonImports } from "./parsers/python.js";
import { parseJavaScriptImports } from "./parsers/javascript.js";
import { parsePageMetadata, findContainingSection } from "./extract-sections.js";
import { matchesPythonPackage, matchesJavaScriptPackage } from "./config-reader.js";

export interface ScanOptions {
  /** Path to the docs repository source directory */
  docsDir: string;

  /** Language to scan for ("python", "javascript", or both if not specified) */
  language?: "python" | "javascript";

  /** Set of known Python package names to match against */
  pythonPackages?: Set<string>;

  /** Set of known JavaScript/TypeScript package names to match against */
  javascriptPackages?: Set<string>;
}

export interface ScanResult {
  /** All symbol matches found */
  matches: SymbolMatch[];

  /** Page metadata by file path */
  pages: Map<string, PageMetadata>;
}

/**
 * Scan the docs directory for symbol imports.
 *
 * @param options - Scan options
 * @returns Scan results with matches and page metadata
 */
export async function scanDocsForImports(options: ScanOptions): Promise<ScanResult> {
  const { docsDir, language, pythonPackages, javascriptPackages } = options;

  // Find all markdown files
  const files = await glob(["**/*.md", "**/*.mdx"], {
    cwd: docsDir,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const matches: SymbolMatch[] = [];
  const pages = new Map<string, PageMetadata>();

  console.log(`📄 Scanning ${files.length} markdown files...`);

  // Log package filter info
  if (pythonPackages) {
    console.log(`   🐍 Filtering Python imports against ${pythonPackages.size} known packages`);
  }
  if (javascriptPackages) {
    console.log(`   📦 Filtering JS/TS imports against ${javascriptPackages.size} known packages`);
  }

  for (const file of files) {
    const filePath = path.join(docsDir, file);
    const content = await fs.readFile(filePath, "utf-8");

    // Parse page metadata
    const metadata = parsePageMetadata(content, file);
    pages.set(file, metadata);

    // Extract code blocks
    const allBlocks = extractCodeBlocks(content);

    // Scan for Python imports
    if (!language || language === "python") {
      const pythonBlocks = allBlocks.filter((b) =>
        ["python", "py"].includes(b.language.toLowerCase()),
      );

      for (const block of pythonBlocks) {
        const imports = parsePythonImports(block.content);

        for (const imp of imports) {
          // Use config-based filtering if packages provided, otherwise skip unknown packages
          if (pythonPackages) {
            if (!matchesPythonPackage(imp.packageName, pythonPackages)) continue;
          } else {
            // No filter provided - skip this import (require explicit package list)
            continue;
          }

          // Find the section containing this code block
          const section = findContainingSection(metadata.sections, block.startLine);

          for (const symbol of imp.symbols) {
            matches.push({
              symbolName: symbol,
              packageName: imp.packageName,
              filePath: file,
              sectionAnchor: section?.anchor,
              language: "python",
            });
          }
        }
      }
    }

    // Scan for JavaScript/TypeScript imports
    if (!language || language === "javascript") {
      const jsBlocks = allBlocks.filter((b) =>
        ["javascript", "typescript", "js", "ts", "jsx", "tsx"].includes(b.language.toLowerCase()),
      );

      for (const block of jsBlocks) {
        const imports = parseJavaScriptImports(block.content);

        for (const imp of imports) {
          // Use config-based filtering if packages provided, otherwise skip unknown packages
          if (javascriptPackages) {
            if (!matchesJavaScriptPackage(imp.packageName, javascriptPackages)) continue;
          } else {
            // No filter provided - skip this import (require explicit package list)
            continue;
          }

          // Find the section containing this code block
          const section = findContainingSection(metadata.sections, block.startLine);

          // Add named imports
          for (const symbol of imp.namedImports) {
            matches.push({
              symbolName: symbol,
              packageName: imp.packageName,
              filePath: file,
              sectionAnchor: section?.anchor,
              language: "javascript",
            });
          }

          // Add default import
          if (imp.defaultImport) {
            matches.push({
              symbolName: imp.defaultImport,
              packageName: imp.packageName,
              filePath: file,
              sectionAnchor: section?.anchor,
              language: "javascript",
            });
          }
        }
      }
    }
  }

  console.log(`✅ Found ${matches.length} symbol imports`);

  return { matches, pages };
}

/**
 * Group matches by symbol name and create RelatedDocEntry objects.
 *
 * @param scanResult - The scan result
 * @param maxEntriesPerSymbol - Maximum entries to store per symbol (default: 20)
 * @returns Map of symbol names to their related doc entries
 */
export function groupMatchesBySymbol(
  scanResult: ScanResult,
  maxEntriesPerSymbol: number = 20,
): Map<string, { entries: RelatedDocEntry[]; totalCount: number }> {
  const { matches, pages } = scanResult;

  // Group matches by symbol name
  const symbolMatches = new Map<string, SymbolMatch[]>();

  for (const match of matches) {
    const key = match.symbolName;
    if (!symbolMatches.has(key)) {
      symbolMatches.set(key, []);
    }
    symbolMatches.get(key)!.push(match);
  }

  // Convert to RelatedDocEntry with deduplication
  const result = new Map<string, { entries: RelatedDocEntry[]; totalCount: number }>();

  for (const [symbolName, symbolMatchList] of symbolMatches) {
    // Deduplicate by file path (a symbol might be imported multiple times in the same file)
    const seenPaths = new Set<string>();
    const dedupedEntries: RelatedDocEntry[] = [];

    for (const match of symbolMatchList) {
      const pathKey = match.filePath + (match.sectionAnchor || "");
      if (seenPaths.has(pathKey)) continue;
      seenPaths.add(pathKey);

      const metadata = pages.get(match.filePath);
      if (!metadata) continue;

      dedupedEntries.push({
        path: metadata.urlPath + (match.sectionAnchor ? `#${match.sectionAnchor}` : ""),
        title: metadata.title,
        description: metadata.description,
        sectionAnchor: match.sectionAnchor,
        sourceFile: match.filePath,
      });
    }

    // Sort by title for consistent ordering
    dedupedEntries.sort((a, b) => a.title.localeCompare(b.title));

    result.set(symbolName, {
      entries: dedupedEntries.slice(0, maxEntriesPerSymbol),
      totalCount: dedupedEntries.length,
    });
  }

  return result;
}
