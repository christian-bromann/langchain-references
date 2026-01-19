/**
 * Search Schema
 *
 * Defines the search record and index structures used for
 * client-side full-text search.
 */

import type { Language } from "./language";

/**
 * A single search record representing a searchable symbol.
 */
export interface SearchRecord {
  /** Unique search entry ID (same as symbol ID) */
  id: string;

  /** Page URL */
  url: string;

  /** Display title */
  title: string;

  /** Breadcrumb path */
  breadcrumbs: string[];

  /** Search excerpt (first ~150 chars of summary) */
  excerpt: string;

  /** Keywords for boosting */
  keywords: string[];

  /** Symbol kind for filtering */
  kind: string;

  /** Language for filtering */
  language: Language;

  /** Package ID for filtering */
  packageId: string;
}

/**
 * The complete search index for a language.
 */
export interface SearchIndex {
  /** Index version */
  version: string;

  /** Build ID this index was generated from */
  buildId: string;

  /** Index creation timestamp */
  createdAt: string;

  /** Language this index covers */
  language: Language;

  /** Total record count */
  totalRecords: number;

  /** All search records */
  records: SearchRecord[];
}

/**
 * Options for search operations.
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;

  /** Filter by symbol kind */
  kind?: string;

  /** Filter by package ID */
  packageId?: string;

  /** Filter by project ID (langchain, langgraph, deepagent) */
  project?: string;

  /** Enable fuzzy matching */
  fuzzy?: boolean;

  /** Enable prefix matching */
  prefix?: boolean;
}

/**
 * A search result with relevance score.
 */
export interface SearchResult extends SearchRecord {
  /** Relevance score (higher is better) */
  score: number;

  /** Matched terms */
  matches?: string[];
}
