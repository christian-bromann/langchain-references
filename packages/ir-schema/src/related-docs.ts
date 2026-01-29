/**
 * Related Documentation Types
 *
 * Types for mapping symbols to documentation pages that reference them.
 * Used by the related-docs-scanner package during build and the web app for rendering.
 */

/**
 * A single related documentation page entry.
 */
export interface RelatedDocEntry {
  /** URL path within docs.langchain.com (e.g., "/docs/tutorials/chatbot") */
  path: string;

  /** Page title extracted from frontmatter or first heading */
  title: string;

  /** Optional page description/summary */
  description?: string;

  /** Section anchor for deep linking (e.g., "#setup") */
  sectionAnchor?: string;

  /** Source file path in the docs repo (for debugging) */
  sourceFile: string;
}

/**
 * Related doc entries with total count for pagination.
 */
export interface RelatedDocEntryWithCount {
  /** The related doc entries (limited to 20) */
  entries: RelatedDocEntry[];

  /** Total count of docs referencing this symbol (may be > 20) */
  totalCount: number;
}

/**
 * Mapping of symbol names to related docs.
 * Stored per-package at: ir/packages/{packageId}/{buildId}/related-docs.json
 */
export interface RelatedDocsMap {
  /** Package this mapping belongs to */
  packageId: string;

  /** When this mapping was generated */
  generatedAt: string;

  /** Docs repository commit SHA used for scanning */
  docsRepoSha: string;

  /** Map of symbol names to their related docs */
  symbols: Record<string, RelatedDocEntryWithCount>;
}
