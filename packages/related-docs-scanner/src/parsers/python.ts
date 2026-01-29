/**
 * Python import parser
 *
 * Parses Python import statements from code blocks to extract symbol references.
 */

export interface PythonImport {
  /** The package/module being imported from */
  packageName: string;

  /** The symbol names imported */
  symbols: string[];
}

/**
 * Parse Python import statements from code content.
 *
 * Handles:
 * - `from package import Symbol`
 * - `from package import Symbol, Symbol2`
 * - `from package.module import Symbol`
 * - Multi-line imports with parentheses
 * - Aliased imports (`as Alias`) - extracts original name
 *
 * @param code - The Python code content
 * @returns Array of parsed imports
 */
export function parsePythonImports(code: string): PythonImport[] {
  const imports: PythonImport[] = [];

  // Normalize multi-line imports by joining lines within parentheses
  const normalizedCode = normalizeMultilineImports(code);

  // Pattern: from package[.module...] import symbol[, symbol2...]
  const importPattern = /from\s+([\w_.]+)\s+import\s+(.+)/g;

  let match;
  while ((match = importPattern.exec(normalizedCode)) !== null) {
    const packageName = match[1];
    const importsStr = match[2];

    // Skip relative imports (start with .)
    if (packageName.startsWith(".")) {
      continue;
    }

    // Parse the imported symbols
    const symbols = parseImportedSymbols(importsStr);

    if (symbols.length > 0) {
      imports.push({
        packageName,
        symbols,
      });
    }
  }

  return imports;
}

/**
 * Normalize multi-line imports by joining lines within parentheses.
 */
function normalizeMultilineImports(code: string): string {
  // Replace newlines within parentheses with spaces
  let result = "";
  let parenDepth = 0;

  for (const char of code) {
    if (char === "(") {
      parenDepth++;
      result += char;
    } else if (char === ")") {
      parenDepth--;
      result += char;
    } else if (char === "\n" && parenDepth > 0) {
      // Replace newline with space inside parentheses
      result += " ";
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Parse a comma-separated list of imported symbols.
 * Handles aliased imports and extracts the original symbol name.
 */
function parseImportedSymbols(importsStr: string): string[] {
  const symbols: string[] = [];

  // Remove parentheses if present
  const cleanStr = importsStr.replace(/^\(|\)$/g, "").trim();

  // Split by comma
  const parts = cleanStr.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Handle aliased imports: Symbol as Alias
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
