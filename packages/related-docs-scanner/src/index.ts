/**
 * Related Docs Scanner
 *
 * Scans the LangChain docs repository to find which documentation pages
 * import and use each symbol, enabling "Related Documentation" links
 * on symbol reference pages.
 */

// Types
export type {
  RelatedDocEntry,
  RelatedDocsMap,
  RelatedDocEntryWithCount,
  SymbolMatch,
  CodeBlock,
  Section,
  PageMetadata,
} from "./types.js";

// Clone utilities
export { cloneDocsRepo, pullDocsRepo, cloneOrUpdateDocsRepo, isGitRepo } from "./clone.js";

// Code block extraction
export { extractCodeBlocks, isPythonLanguage, isJavaScriptLanguage } from "./extract-blocks.js";

// Section extraction
export {
  extractSections,
  parsePageMetadata,
  filePathToUrlPath,
  findContainingSection,
  slugifyHeading,
} from "./extract-sections.js";

// Parsers
export { parsePythonImports, type PythonImport } from "./parsers/python.js";

export {
  parseJavaScriptImports,
  normalizeJsPackageName,
  type JavaScriptImport,
} from "./parsers/javascript.js";

// Config reader - extracts package names from config files
export {
  readPackageNamesFromConfigs,
  matchesPythonPackage,
  matchesJavaScriptPackage,
  type PackageLists,
  type PackageConfig,
  type Config,
} from "./config-reader.js";

// Main scanner
export {
  scanDocsForImports,
  groupMatchesBySymbol,
  type ScanOptions,
  type ScanResult,
} from "./scanner.js";
