/**
 * JavaScript/TypeScript import parser
 *
 * Parses ES module import statements from code blocks to extract symbol references.
 */

export interface JavaScriptImport {
  /** The package being imported from */
  packageName: string;

  /** Named imports (from { ... }) */
  namedImports: string[];

  /** Default import name (if any) */
  defaultImport?: string;

  /** Whether this is a type-only import */
  isTypeImport: boolean;
}

/**
 * Parse JavaScript/TypeScript import statements from code content.
 *
 * Handles:
 * - `import { Symbol } from "package"`
 * - `import { Symbol, Symbol2 } from "package"`
 * - `import Symbol from "package"` (default import)
 * - `import type { Symbol } from "package"` (type imports)
 * - `import { Symbol as Alias } from "package"` (renamed imports)
 * - `import * as name from "package"` (namespace imports)
 *
 * @param code - The JavaScript/TypeScript code content
 * @returns Array of parsed imports
 */
export function parseJavaScriptImports(code: string): JavaScriptImport[] {
  const imports: JavaScriptImport[] = [];

  // Pattern for import statements
  // Captures: type keyword (optional), import clause, package name
  const importPattern =
    /import\s+(type\s+)?(?:(\*\s+as\s+\w+)|(\w+)(?:\s*,\s*\{([^}]*)\})?|(?:\{([^}]*)\}))\s+from\s+["']([^"']+)["']/g;

  let match;
  while ((match = importPattern.exec(code)) !== null) {
    const isTypeImport = !!match[1];
    const namespaceImport = match[2]; // * as name
    const defaultImport = match[3]; // default import name
    const namedWithDefault = match[4]; // named imports when default exists
    const namedOnly = match[5]; // named imports without default
    const packageName = match[6];

    // Skip relative imports
    if (packageName.startsWith(".") || packageName.startsWith("/")) {
      continue;
    }

    const namedImports: string[] = [];

    // Parse namespace import (we capture the namespace name but don't extract individual symbols)
    if (namespaceImport) {
      // Namespace imports don't give us individual symbol names
      // We could track them but they're rare in LangChain docs
      continue;
    }

    // Parse named imports
    const namedStr = namedWithDefault || namedOnly;
    if (namedStr) {
      const symbols = parseNamedImports(namedStr);
      namedImports.push(...symbols);
    }

    if (defaultImport || namedImports.length > 0) {
      imports.push({
        packageName,
        namedImports,
        defaultImport,
        isTypeImport,
      });
    }
  }

  return imports;
}

/**
 * Parse a comma-separated list of named imports.
 * Handles renamed imports and extracts the original symbol name.
 */
function parseNamedImports(importsStr: string): string[] {
  const symbols: string[] = [];

  // Split by comma
  const parts = importsStr.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle renamed imports: Symbol as Alias
    const aliasMatch = trimmed.match(/^(\w+)\s+as\s+\w+/);
    if (aliasMatch) {
      symbols.push(aliasMatch[1]);
    } else {
      // Simple import
      const symbolMatch = trimmed.match(/^(\w+)/);
      if (symbolMatch) {
        symbols.push(symbolMatch[1]);
      }
    }
  }

  return symbols;
}

/**
 * Normalize a JavaScript package name to match Python conventions.
 * e.g., "@langchain/anthropic" -> "langchain_anthropic"
 */
export function normalizeJsPackageName(packageName: string): string {
  return packageName.replace(/^@/, "").replace(/\//g, "_").replace(/-/g, "_");
}
