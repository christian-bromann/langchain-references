/**
 * Versioning Schema
 *
 * Defines types for tracking version history of symbols across releases.
 * Supports delta-based changelog storage with compact snapshots.
 */

import type { SymbolKind, Visibility } from "./symbol.js";

// =============================================================================
// VERSION INDEX TYPES (versions.json)
// =============================================================================

/**
 * Index of all tracked versions for a package.
 */
export interface PackageVersionIndex {
  /** Package identifier (e.g., "pkg_js_langchain_core") */
  packageId: string;

  /** Human-readable package name */
  packageName: string;

  /** Latest version information */
  latest: VersionInfo;

  /** List of all tracked minor/major versions (newest first) */
  versions: VersionInfo[];

  /** Optional: Complete list of all releases for reference */
  allReleases?: ReleaseReference[];
}

/**
 * Information about a specific version.
 */
export interface VersionInfo {
  /** Semantic version string (e.g., "0.2.15") */
  version: string;

  /** Git commit SHA at this version */
  sha: string;

  /** Git tag name (e.g., "@langchain/core@0.2.15") */
  tag: string;

  /** Release date (ISO 8601) */
  releaseDate: string;

  /** Extraction date for latest, null for historical */
  extractedAt?: string;

  /** Summary statistics for this version */
  stats: VersionStats;
}

/**
 * Statistics summarizing changes in a version.
 */
export interface VersionStats {
  /** Number of symbols added in this version */
  added: number;

  /** Number of symbols removed in this version */
  removed: number;

  /** Number of symbols modified in this version */
  modified: number;

  /** Number of breaking changes in this version */
  breaking: number;

  /** Total symbols at this version */
  totalSymbols: number;
}

/**
 * Lightweight reference to a release (for allReleases list).
 */
export interface ReleaseReference {
  /** Semantic version string */
  version: string;

  /** Git tag name */
  tag: string;

  /** Release date */
  releaseDate: string;

  /** Whether this version is tracked in detail */
  isTracked: boolean;
}

// =============================================================================
// CHANGELOG TYPES (changelog.json)
// =============================================================================

/**
 * Complete changelog for a package with all version deltas.
 */
export interface PackageChangelog {
  /** Package identifier */
  packageId: string;

  /** Package name */
  packageName: string;

  /** When this changelog was generated */
  generatedAt: string;

  /** History entries (newest first) */
  history: VersionDelta[];
}

/**
 * Changes introduced in a specific version.
 */
export interface VersionDelta {
  /** Version this delta represents */
  version: string;

  /** Previous version (for diffing context) */
  previousVersion: string | null;

  /** Git SHA for this version */
  sha: string;

  /** Release date */
  releaseDate: string;

  /** Symbols added in this version */
  added: AddedSymbol[];

  /** Symbols removed in this version */
  removed: RemovedSymbol[];

  /** Symbols modified in this version */
  modified: ModifiedSymbol[];

  /** Symbols deprecated in this version */
  deprecated: DeprecatedSymbol[];
}

/**
 * A symbol that was added in this version.
 */
export interface AddedSymbol {
  /** Fully qualified name (stable identifier) */
  qualifiedName: string;

  /** Full snapshot of the new symbol */
  snapshot: SymbolSnapshot;
}

/**
 * A symbol that was removed in this version.
 */
export interface RemovedSymbol {
  /** Fully qualified name that was removed */
  qualifiedName: string;

  /** Symbol kind that was removed */
  kind: SymbolKind;

  /** Suggested replacement (if any) */
  replacement?: ReplacementInfo;
}

/**
 * A symbol that was modified in this version.
 */
export interface ModifiedSymbol {
  /** Fully qualified name */
  qualifiedName: string;

  /** List of specific changes */
  changes: ChangeRecord[];

  /** How the symbol looked before this version */
  snapshotBefore: SymbolSnapshot;

  /** How the symbol looks after this version */
  snapshotAfter: SymbolSnapshot;
}

/**
 * A symbol that was deprecated in this version.
 */
export interface DeprecatedSymbol {
  /** Fully qualified name */
  qualifiedName: string;

  /** Deprecation message */
  message?: string;

  /** Suggested replacement */
  replacement?: ReplacementInfo;

  /** Symbol snapshot at deprecation time */
  snapshot: SymbolSnapshot;
}

/**
 * Information about a replacement for removed/deprecated symbols.
 */
export interface ReplacementInfo {
  /** Qualified name of the replacement */
  qualifiedName: string;

  /** Human-readable migration note */
  note?: string;
}

// =============================================================================
// SNAPSHOT TYPES (Compact symbol representations)
// =============================================================================

/**
 * Compact snapshot of a symbol's interface.
 * Contains enough information to display the symbol's API without full IR.
 *
 * What's included:
 * - Qualified name (stable identifier)
 * - Symbol kind and signature
 * - Member/parameter lists with signatures
 * - Type parameters and inheritance
 * - Source location (for GitHub links)
 *
 * What's NOT included (to keep storage compact):
 * - Full JSDoc/docstrings
 * - Extended descriptions
 * - Usage examples
 * - Private/protected members
 */
export interface SymbolSnapshot {
  /** Fully qualified name (stable identifier) */
  qualifiedName: string;

  /** Symbol kind */
  kind: SymbolKind;

  /** Full signature string */
  signature: string;

  /** For classes/interfaces: list of public members */
  members?: MemberSnapshot[];

  /** For functions: parameter list */
  params?: ParamSnapshot[];

  /** Return type (for functions) */
  returnType?: string;

  /** Type parameters (generics) */
  typeParams?: TypeParamSnapshot[];

  /** Base classes/interfaces */
  extends?: string[];

  /** Implemented interfaces */
  implements?: string[];

  /** Source file path (for GitHub links) */
  sourcePath: string;

  /** Source line number */
  sourceLine: number;
}

/**
 * Snapshot of a class/interface member.
 */
export interface MemberSnapshot {
  /** Member name */
  name: string;

  /** Member kind (method, property, etc.) */
  kind: SymbolKind;

  /** Full signature string */
  signature: string;

  /** Whether the member is optional */
  optional?: boolean;

  /** Whether the member is readonly */
  readonly?: boolean;

  /** Whether the member is static */
  static?: boolean;

  /** Visibility level */
  visibility: Visibility;
}

/**
 * Snapshot of a function parameter.
 */
export interface ParamSnapshot {
  /** Parameter name */
  name: string;

  /** Type annotation */
  type: string;

  /** Whether required */
  required: boolean;

  /** Default value (as string) */
  default?: string;
}

/**
 * Snapshot of a type parameter.
 */
export interface TypeParamSnapshot {
  /** Type parameter name (e.g., "T") */
  name: string;

  /** Constraint (e.g., "extends BaseClass") */
  constraint?: string;

  /** Default type */
  default?: string;
}

// =============================================================================
// CHANGE RECORD TYPES (Granular change tracking)
// =============================================================================

/**
 * Types of changes that can be tracked for symbols.
 */
export type SymbolChangeType =
  | "signature-changed"
  | "extends-changed"
  | "implements-changed"
  | "return-type-changed"
  | "type-param-added"
  | "type-param-removed"
  | "type-param-constraint-changed";

/**
 * Types of changes specific to class/interface members.
 */
export type MemberChangeType =
  | "member-added"
  | "member-removed"
  | "member-type-changed"
  | "member-optionality-changed"
  | "member-visibility-changed"
  | "member-readonly-changed"
  | "member-static-changed"
  | "member-default-changed"
  | "member-renamed";

/**
 * Types of changes specific to function parameters.
 */
export type ParamChangeType =
  | "param-added"
  | "param-removed"
  | "param-type-changed"
  | "param-optionality-changed"
  | "param-default-changed";

/**
 * All possible change types.
 */
export type ChangeType = SymbolChangeType | MemberChangeType | ParamChangeType;

/**
 * A specific change to a symbol.
 */
export interface ChangeRecord {
  /** Type of change */
  type: ChangeType;

  /** Human-readable description */
  description: string;

  /** Whether this is a breaking change */
  breaking: boolean;

  /** Affected member or parameter name (for member/param changes) */
  memberName?: string;

  /** Type-specific before state */
  before?: ChangeValue;

  /** Type-specific after state */
  after?: ChangeValue;
}

/**
 * Structured before/after values for changes.
 * Different change types use different fields.
 */
export interface ChangeValue {
  /** Type annotation (for type changes) */
  type?: string;

  /** Whether required (for optionality changes) */
  required?: boolean;

  /** Whether readonly (for readonly changes) */
  readonly?: boolean;

  /** Visibility level (for visibility changes) */
  visibility?: Visibility;

  /** Default value as string (for default changes) */
  default?: string;

  /** Full signature string (for signature changes) */
  signature?: string;

  /** List of base types (for extends/implements changes) */
  types?: string[];
}

// =============================================================================
// SYMBOL VERSION INFO
// =============================================================================

// SymbolVersionInfo is defined in symbol.ts and re-exported from there
// to avoid circular dependencies. Import it from the main index if needed.

// =============================================================================
// VERSIONING CONFIGURATION
// =============================================================================

/**
 * Configuration for version tracking of a package.
 */
export interface VersioningConfig {
  /** Git tag pattern for this package's releases */
  tagPattern: string;

  /** Maximum minor/major versions to track (default: 10) */
  maxVersions?: number;

  /** Versions to always include regardless of limit */
  alwaysInclude?: string[];

  /** Minimum version to start tracking from */
  minVersion?: string;

  /** Whether to track versions at all (default: true) */
  enabled?: boolean;

  /**
   * Version-specific path overrides for packages that moved directories.
   * Keys are version patterns ("0.x", "0.1.x") and values are the path at that version.
   * Example: { "0.x": "langchain-core" } for when @langchain/core was at root level.
   */
  pathOverrides?: Record<string, string>;
}

// =============================================================================
// DISCOVERED VERSION (Internal build type)
// =============================================================================

/**
 * A version discovered from git tags (used during build).
 */
export interface DiscoveredVersion {
  /** Semantic version string */
  version: string;

  /** Git commit SHA */
  sha: string;

  /** Git tag name */
  tag: string;

  /** Release date (from tag) */
  releaseDate: string;
}

