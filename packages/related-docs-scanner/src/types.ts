/**
 * Types for the related docs scanner package
 *
 * Re-exports shared types from @langchain/ir-schema and defines
 * scanner-specific types used during the scanning process.
 */

// Re-export shared types from ir-schema
export type {
  RelatedDocEntry,
  RelatedDocEntryWithCount,
  RelatedDocsMap,
} from "@langchain/ir-schema";

/**
 * A matched symbol import from a docs file
 */
export interface SymbolMatch {
  /** The symbol name (e.g., "ChatAnthropic") */
  symbolName: string;

  /** The package name (e.g., "langchain_anthropic" or "@langchain/anthropic") */
  packageName: string;

  /** The file path in the docs repo */
  filePath: string;

  /** The section anchor where the import appears */
  sectionAnchor?: string;

  /** Language of the import */
  language: "python" | "javascript";
}

/**
 * Extracted code block from markdown
 */
export interface CodeBlock {
  /** The code content */
  content: string;

  /** The language tag (python, js, ts, etc.) */
  language: string;

  /** Line number in the source file where the block starts */
  startLine: number;
}

/**
 * Section information from a markdown file
 */
export interface Section {
  /** Section title (from heading) */
  title: string;

  /** Anchor slug (e.g., "setup" from "## Setup") */
  anchor: string;

  /** Heading level (1-6) */
  level: number;

  /** Line number where the section starts */
  startLine: number;
}

/**
 * Parsed page metadata
 */
export interface PageMetadata {
  /** Page title from frontmatter or first heading */
  title: string;

  /** Page description from frontmatter */
  description?: string;

  /** URL path derived from file path */
  urlPath: string;

  /** All sections in the page */
  sections: Section[];
}
