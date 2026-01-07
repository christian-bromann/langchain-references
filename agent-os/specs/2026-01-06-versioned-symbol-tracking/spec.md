# Specification: Versioned Symbol Tracking System

**Spec ID**: `2026-01-06-versioned-symbol-tracking`  
**Created**: January 6, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Version Discovery](#3-version-discovery)
4. [Build Pipeline](#4-build-pipeline)
5. [UI Integration](#5-ui-integration)
6. [Configuration](#6-configuration)
7. [Implementation Plan](#7-implementation-plan)
8. [Acceptance Criteria](#8-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Build a delta-based version history system for API reference documentation across the LangChain ecosystem (LangChain, LangGraph, DeepAgent). The system must track when symbols were introduced, when they changed, and allow users to see historical versions—without extracting full IR for every release.

### 1.2 Problem Statement

- Users need to know when API symbols were introduced and how they've evolved
- Full IR extraction is expensive (~2-5 MB per package) and slow
- Most packages release frequently, making full extraction for every version impractical
- Monorepos have independently-versioned packages (e.g., `@langchain/core@0.2.15` releases while `@langchain/openai` stays at `0.1.8`)

### 1.3 Solution: Delta-Based Version Tracking

**Core Principle:**
1. **Store full IR only for the latest version** (existing behavior)
2. **Store compact deltas (changelogs) for historical versions** — what changed, not the full state
3. **Include signature snapshots** in deltas so users can see what a symbol looked like at any version without fetching additional data

### 1.4 Storage Efficiency

| Approach | Per-package storage |
|----------|---------------------|
| Full IR per version (10 versions) | ~30-50 MB |
| Delta-based with snapshots | ~3-4 MB (full latest) + ~500 KB (all changelogs) |

### 1.5 Scope

**In Scope (v1)**:
- Version discovery from git tags
- Per-package version tracking (independent of other packages)
- Changelog generation with symbol snapshots
- Symbol page version badges ("Since v0.2.0")
- Version history panel showing changes per version
- Inline signature diffs for modified symbols
- Deprecation tracking with version info

**Out of Scope (v1)**:
- Cross-package version correlation
- Full documentation reconstruction for historical versions (use GitHub links)
- Interactive "time travel" to view entire docs at a past version
- Breaking change detection automation (manual flagging only)

---

## 2. Data Model

### 2.1 Per-Package File Structure

```
/ir/{project}/{language}/{package}/
├── latest/
│   └── symbols.json        # Full IR (existing format, unchanged)
├── versions.json           # Index of all tracked versions
└── changelog.json          # All version deltas with snapshots
```

### 2.2 PackageVersionIndex (versions.json)

```typescript
// packages/ir-schema/src/versioning.ts

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
```

### 2.3 PackageChangelog (changelog.json)

```typescript
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
```

### 2.4 SymbolSnapshot (Compact)

```typescript
/**
 * Compact snapshot of a symbol's interface.
 * Contains enough information to display the symbol's API without full IR.
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
```

**What's included in snapshots:**
- Qualified name (stable identifier)
- Symbol kind and signature
- Member/parameter lists with signatures
- Type parameters and inheritance
- Source location (for GitHub links)

**What's NOT included in snapshots** (to keep storage compact):
- Full JSDoc/docstrings
- Extended descriptions
- Usage examples
- Private/protected members

**Why exclude documentation?** Docs would bloat storage significantly (~10x larger). For full documentation at a historical version, users click the GitHub link which takes them to the exact file at that commit SHA.

```typescript
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
```

### 2.5 ChangeRecord (Granular Changes)

```typescript
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

export type ChangeType = SymbolChangeType | MemberChangeType | ParamChangeType;

/**
 * A specific change to a symbol (general changes).
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
```

### 2.5.1 Change Detection Examples

To illustrate how changes are recorded, here's an example of an interface evolving across versions:

**v0.1.0 → v0.2.0**: `temperature` becomes optional
```typescript
// Before (v0.1.0)
interface ChatModelParams {
  model: string;
  temperature: number;      // required
  maxTokens: number;
}

// After (v0.2.0)
interface ChatModelParams {
  model: string;
  temperature?: number;     // now optional
  maxTokens: number;
}
```

**Change record:**
```json
{
  "type": "member-optionality-changed",
  "memberName": "temperature",
  "description": "Changed from required to optional",
  "breaking": false,
  "before": { "required": true },
  "after": { "required": false }
}
```

**v0.2.0 → v0.3.0**: `maxTokens` type expands
```typescript
// Before (v0.2.0)
maxTokens: number;

// After (v0.3.0)
maxTokens: number | "auto";
```

**Change record:**
```json
{
  "type": "member-type-changed",
  "memberName": "maxTokens",
  "description": "Type changed from 'number' to 'number | \"auto\"'",
  "breaking": false,
  "before": { "type": "number" },
  "after": { "type": "number | \"auto\"" }
}
```

### 2.6 VersionInfo Extension for SymbolRecord

```typescript
/**
 * Version information attached to a symbol in the latest IR.
 */
export interface SymbolVersionInfo {
  /** Version when this symbol was first introduced */
  since: string;

  /** Deprecation information (if deprecated) */
  deprecation?: {
    /** Version when deprecated */
    since: string;
    /** Deprecation message */
    message?: string;
    /** Suggested replacement */
    replacement?: string;
  };

  /** List of versions where this symbol had notable changes */
  modifiedIn?: string[];
}

// Extend existing SymbolRecord
export interface SymbolRecord {
  // ... existing fields ...

  /** Version history information */
  versionInfo?: SymbolVersionInfo;
}
```

---

## 3. Version Discovery

### 3.1 Tag Pattern Configuration

Each package specifies its own tag pattern since monorepo packages have independent versioning:

```typescript
/**
 * Tag patterns for different versioning conventions.
 */
type TagPattern =
  | `${string}@*`           // Scoped npm style: "@langchain/core@*"
  | `${string}-v*`          // Prefix style: "langchain-core-v*"
  | "v*";                   // Simple tags: "v*"
```

**Examples:**
- `@langchain/core` uses tags like `@langchain/core@0.2.15`
- `langgraph` uses tags like `langgraph-v0.1.5`
- Standalone packages might use `v1.2.3`

### 3.2 Version Discovery Algorithm

```typescript
async function discoverVersions(
  repo: string,
  tagPattern: string,
  options: VersionDiscoveryOptions
): Promise<DiscoveredVersion[]> {
  // 1. Fetch all tags matching the pattern
  const tags = await fetchGitTags(repo, tagPattern);

  // 2. Parse version from each tag
  const versions = tags.map(tag => ({
    tag: tag.name,
    version: parseVersionFromTag(tag.name, tagPattern),
    sha: tag.sha,
    date: tag.date,
  }));

  // 3. Sort by semantic version (newest first)
  versions.sort((a, b) => semver.rcompare(a.version, b.version));

  // 4. Filter to keep only the latest patch per minor version
  const filteredVersions = filterToMinorVersions(versions);

  // 5. Apply maxVersions limit
  let result = filteredVersions.slice(0, options.maxVersions);

  // 6. Always include specified versions
  if (options.alwaysInclude) {
    for (const v of options.alwaysInclude) {
      if (!result.find(r => r.version === v)) {
        const found = versions.find(ver => ver.version === v);
        if (found) result.push(found);
      }
    }
  }

  return result.sort((a, b) => semver.rcompare(a.version, b.version));
}

interface VersionDiscoveryOptions {
  /** Maximum minor/major versions to track (default: 10) */
  maxVersions: number;

  /** Versions to always include regardless of limit */
  alwaysInclude?: string[];

  /** Minimum version to consider */
  minVersion?: string;
}
```

### 3.3 Minor Version Filtering

```typescript
/**
 * Keep only the latest patch release for each minor version.
 * Example: [0.2.15, 0.2.14, 0.2.13, 0.1.5, 0.1.4] → [0.2.15, 0.1.5]
 */
function filterToMinorVersions(
  versions: DiscoveredVersion[]
): DiscoveredVersion[] {
  const seen = new Map<string, DiscoveredVersion>();

  for (const v of versions) {
    const minorKey = `${semver.major(v.version)}.${semver.minor(v.version)}`;
    if (!seen.has(minorKey)) {
      seen.set(minorKey, v);
    }
  }

  return Array.from(seen.values());
}
```

---

## 4. Build Pipeline

### 4.1 Build Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Build Pipeline                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. DISCOVER VERSIONS                                                │
│     ├─ Fetch git tags matching package pattern                       │
│     ├─ Filter to minor/major versions                                │
│     └─ Apply maxVersions limit                                       │
│                                                                      │
│  2. EXTRACT LATEST (Full)                                            │
│     ├─ Use existing extraction flow                                  │
│     └─ Produces full IR (symbols.json)                               │
│                                                                      │
│  3. EXTRACT HISTORICAL (Minimal)                                     │
│     ├─ Fetch source at each historical SHA                           │
│     ├─ Extract minimal IR (signatures only, skip docs)               │
│     └─ Store temporarily for diffing                                 │
│                                                                      │
│  4. COMPUTE DIFFS                                                    │
│     ├─ Compare version pairs (older → newer)                         │
│     ├─ Detect added/removed/modified symbols                         │
│     ├─ Generate before/after snapshots                               │
│     └─ Identify breaking changes                                     │
│                                                                      │
│  5. GENERATE OUTPUT                                                  │
│     ├─ changelog.json (all version deltas)                           │
│     ├─ versions.json (version index)                                 │
│     └─ Annotate latest IR with versionInfo                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Minimal IR Extraction

For historical versions, extract only what's needed for diffing:

```typescript
interface MinimalExtractionOptions {
  /** Skip documentation parsing */
  skipDocs: true;

  /** Skip examples */
  skipExamples: true;

  /** Only extract public symbols */
  publicOnly: true;

  /** Include signatures and structure only */
  signaturesOnly: true;
}

async function extractMinimalIR(
  source: string,
  sha: string,
  options: MinimalExtractionOptions
): Promise<MinimalIR> {
  // Extract just enough for diffing:
  // - Symbol qualified names
  // - Signatures
  // - Member lists (names and types)
  // - Parameter lists
  // - Return types
  // - Inheritance relationships
}
```

### 4.3 Diff Computation

```typescript
/**
 * Compare two versions of a package and generate a delta.
 */
async function computeVersionDelta(
  olderIR: MinimalIR,
  newerIR: MinimalIR,
  olderVersion: string,
  newerVersion: string
): Promise<VersionDelta> {
  const delta: VersionDelta = {
    version: newerVersion,
    previousVersion: olderVersion,
    sha: newerIR.sha,
    releaseDate: newerIR.releaseDate,
    added: [],
    removed: [],
    modified: [],
    deprecated: [],
  };

  const olderSymbols = new Map(olderIR.symbols.map(s => [s.qualifiedName, s]));
  const newerSymbols = new Map(newerIR.symbols.map(s => [s.qualifiedName, s]));

  // Find added symbols
  for (const [name, symbol] of newerSymbols) {
    if (!olderSymbols.has(name)) {
      delta.added.push({
        qualifiedName: name,
        snapshot: createSnapshot(symbol),
      });
    }
  }

  // Find removed symbols
  for (const [name, symbol] of olderSymbols) {
    if (!newerSymbols.has(name)) {
      delta.removed.push({
        qualifiedName: name,
        kind: symbol.kind,
        replacement: findReplacement(name, newerSymbols),
      });
    }
  }

  // Find modified symbols
  for (const [name, newerSymbol] of newerSymbols) {
    const olderSymbol = olderSymbols.get(name);
    if (olderSymbol) {
      const changes = detectChanges(olderSymbol, newerSymbol);
      if (changes.length > 0) {
        delta.modified.push({
          qualifiedName: name,
          changes,
          snapshotBefore: createSnapshot(olderSymbol),
          snapshotAfter: createSnapshot(newerSymbol),
        });
      }
    }
  }

  // Find newly deprecated symbols
  for (const [name, newerSymbol] of newerSymbols) {
    const olderSymbol = olderSymbols.get(name);
    if (newerSymbol.deprecated && (!olderSymbol || !olderSymbol.deprecated)) {
      delta.deprecated.push({
        qualifiedName: name,
        message: newerSymbol.deprecated.message,
        replacement: newerSymbol.deprecated.replacement
          ? { qualifiedName: newerSymbol.deprecated.replacement }
          : undefined,
        snapshot: createSnapshot(newerSymbol),
      });
    }
  }

  return delta;
}
```

### 4.4 Change Detection

```typescript
/**
 * Detect specific changes between two versions of a symbol.
 */
function detectChanges(
  older: MinimalSymbol,
  newer: MinimalSymbol
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];

  // Signature changes (overall)
  if (older.signature !== newer.signature) {
    changes.push({
      type: "signature-changed",
      description: "Signature changed",
      breaking: false, // Determined by specific changes
      before: older.signature,
      after: newer.signature,
    });
  }

  // Inheritance changes
  if (!arraysEqual(older.extends, newer.extends)) {
    changes.push({
      type: "extends-changed",
      description: `Base class changed from ${formatList(older.extends)} to ${formatList(newer.extends)}`,
      breaking: true,
      before: formatList(older.extends),
      after: formatList(newer.extends),
    });
  }

  // Member changes (for classes/interfaces)
  if (older.members && newer.members) {
    const memberChanges = detectMemberChanges(older.members, newer.members);
    changes.push(...memberChanges);
  }

  // Parameter changes (for functions)
  if (older.params && newer.params) {
    const paramChanges = detectParamChanges(older.params, newer.params);
    changes.push(...paramChanges);
  }

  // Return type changes
  if (older.returnType !== newer.returnType) {
    changes.push({
      type: "return-type-changed",
      description: `Return type changed from '${older.returnType}' to '${newer.returnType}'`,
      breaking: isBreakingReturnTypeChange(older.returnType, newer.returnType),
      before: older.returnType,
      after: newer.returnType,
    });
  }

  return changes;
}

/**
 * Detect changes in class/interface members.
 */
function detectMemberChanges(
  olderMembers: MemberSnapshot[],
  newerMembers: MemberSnapshot[]
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const olderMap = new Map(olderMembers.map(m => [m.name, m]));
  const newerMap = new Map(newerMembers.map(m => [m.name, m]));

  // Added members
  for (const [name, member] of newerMap) {
    if (!olderMap.has(name)) {
      changes.push({
        type: "member-added",
        description: `Added ${member.kind} '${name}'`,
        breaking: false,
        target: name,
        after: member.signature,
      });
    }
  }

  // Removed members
  for (const [name, member] of olderMap) {
    if (!newerMap.has(name)) {
      changes.push({
        type: "member-removed",
        description: `Removed ${member.kind} '${name}'`,
        breaking: true,
        target: name,
        before: member.signature,
      });
    }
  }

  // Modified members
  for (const [name, newerMember] of newerMap) {
    const olderMember = olderMap.get(name);
    if (olderMember) {
      // Type changed
      if (olderMember.signature !== newerMember.signature) {
        changes.push({
          type: "member-type-changed",
          description: `Type of '${name}' changed`,
          breaking: isMemberTypeChangeBreaking(olderMember, newerMember),
          target: name,
          before: olderMember.signature,
          after: newerMember.signature,
        });
      }

      // Optionality changed
      if (olderMember.optional !== newerMember.optional) {
        const becameRequired = olderMember.optional && !newerMember.optional;
        changes.push({
          type: "member-optionality-changed",
          description: `'${name}' ${becameRequired ? "became required" : "became optional"}`,
          breaking: becameRequired,
          target: name,
          before: olderMember.optional ? "optional" : "required",
          after: newerMember.optional ? "optional" : "required",
        });
      }

      // Visibility changed
      if (olderMember.visibility !== newerMember.visibility) {
        changes.push({
          type: "member-visibility-changed",
          description: `Visibility of '${name}' changed from ${olderMember.visibility} to ${newerMember.visibility}`,
          breaking: isVisibilityChangeBreaking(olderMember.visibility, newerMember.visibility),
          target: name,
          before: olderMember.visibility,
          after: newerMember.visibility,
        });
      }

      // Readonly changed
      if (olderMember.readonly !== newerMember.readonly) {
        changes.push({
          type: "member-readonly-changed",
          description: `'${name}' ${newerMember.readonly ? "became readonly" : "is no longer readonly"}`,
          breaking: newerMember.readonly === true, // Adding readonly is breaking
          target: name,
          before: olderMember.readonly ? "readonly" : "mutable",
          after: newerMember.readonly ? "readonly" : "mutable",
        });
      }

      // Static changed
      if (olderMember.static !== newerMember.static) {
        changes.push({
          type: "member-static-changed",
          description: `'${name}' ${newerMember.static ? "became static" : "is no longer static"}`,
          breaking: true,
          target: name,
          before: olderMember.static ? "static" : "instance",
          after: newerMember.static ? "static" : "instance",
        });
      }
    }
  }

  return changes;
}
```

### 4.5 Annotating Latest IR

After generating the changelog, annotate the latest IR with version information:

```typescript
/**
 * Add version information to symbols in the latest IR.
 */
function annotateLatestIR(
  latestIR: SymbolRecord[],
  changelog: PackageChangelog
): void {
  // Build a map of when each symbol was introduced
  const introductionMap = new Map<string, string>();
  const modificationMap = new Map<string, string[]>();
  const deprecationMap = new Map<string, DeprecatedSymbol>();

  // Process changelog from oldest to newest
  const sortedHistory = [...changelog.history].reverse();

  for (const delta of sortedHistory) {
    // Track introductions
    for (const added of delta.added) {
      if (!introductionMap.has(added.qualifiedName)) {
        introductionMap.set(added.qualifiedName, delta.version);
      }
    }

    // Track modifications
    for (const modified of delta.modified) {
      const existing = modificationMap.get(modified.qualifiedName) || [];
      existing.push(delta.version);
      modificationMap.set(modified.qualifiedName, existing);
    }

    // Track deprecations
    for (const deprecated of delta.deprecated) {
      deprecationMap.set(deprecated.qualifiedName, {
        ...deprecated,
        version: delta.version,
      });
    }
  }

  // Apply to latest IR
  for (const symbol of latestIR) {
    symbol.versionInfo = {
      since: introductionMap.get(symbol.qualifiedName) || changelog.history[changelog.history.length - 1]?.version || "unknown",
      modifiedIn: modificationMap.get(symbol.qualifiedName),
    };

    const deprecation = deprecationMap.get(symbol.qualifiedName);
    if (deprecation) {
      symbol.versionInfo.deprecation = {
        since: deprecation.version,
        message: deprecation.message,
        replacement: deprecation.replacement?.qualifiedName,
      };
    }
  }
}
```

### 4.6 Incremental Builds

For efficiency, the build pipeline downloads existing changelogs from deployed storage and only processes new versions. This avoids re-extracting and re-diffing historical versions on every release.

#### 4.6.1 Incremental Build Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Incremental Build Flow                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. FETCH DEPLOYED CHANGELOG                                         │
│     ├─ Download existing changelog.json from blob storage            │
│     ├─ Download existing versions.json from blob storage             │
│     └─ If not found → full build (first time)                        │
│                                                                      │
│  2. DISCOVER CURRENT VERSIONS                                        │
│     ├─ Fetch git tags from repository                                │
│     └─ Filter to minor/major versions                                │
│                                                                      │
│  3. DETECT NEW VERSIONS                                              │
│     ├─ Compare discovered versions vs existing changelog             │
│     └─ If no new versions → skip (return existing)                   │
│                                                                      │
│  4. EXTRACT ONLY NEW VERSIONS                                        │
│     ├─ Fetch source at new version SHA(s)                            │
│     ├─ Run minimal extraction on new version(s)                      │
│     └─ Use latest from existing changelog as diff base               │
│                                                                      │
│  5. COMPUTE DELTAS FOR NEW VERSIONS ONLY                             │
│     └─ Diff: existing latest → new version(s)                        │
│                                                                      │
│  6. MERGE INTO EXISTING CHANGELOG                                    │
│     ├─ Prepend new deltas to history array                           │
│     ├─ Update versions.json with new entries                         │
│     └─ Upload merged changelog                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4.6.2 Fetching Deployed Changelog

```typescript
/**
 * Fetch the currently deployed changelog for a package.
 * Returns null if no changelog exists (first build).
 */
async function fetchDeployedChangelog(
  project: string,
  language: string,
  packageId: string
): Promise<{ changelog: PackageChangelog; versions: PackageVersionIndex } | null> {
  const baseUrl = process.env.BLOB_BASE_URL;
  
  try {
    const [changelogRes, versionsRes] = await Promise.all([
      fetch(`${baseUrl}/ir/${project}/${language}/${packageId}/changelog.json`),
      fetch(`${baseUrl}/ir/${project}/${language}/${packageId}/versions.json`),
    ]);

    if (!changelogRes.ok || !versionsRes.ok) {
      console.log(`No existing changelog found for ${packageId} - will do full build`);
      return null;
    }

    return {
      changelog: await changelogRes.json(),
      versions: await versionsRes.json(),
    };
  } catch (error) {
    console.log(`Failed to fetch existing changelog: ${error} - will do full build`);
    return null;
  }
}
```

#### 4.6.3 Incremental Build Logic

```typescript
async function incrementalBuild(
  project: string,
  language: string,
  packageId: string,
  config: VersioningConfig
): Promise<{ changelog: PackageChangelog; versions: PackageVersionIndex }> {
  // Step 1: Fetch existing deployed changelog
  const existing = await fetchDeployedChangelog(project, language, packageId);
  
  // Step 2: Discover current versions from git tags
  const discoveredVersions = await discoverVersions(config.repo, config.tagPattern, {
    maxVersions: config.maxVersions ?? 10,
    alwaysInclude: config.alwaysInclude,
    minVersion: config.minVersion,
  });

  // Step 3: If no existing changelog, do full build
  if (!existing) {
    console.log(`First build for ${packageId} - extracting all ${discoveredVersions.length} versions`);
    return fullChangelogBuild(packageId, discoveredVersions);
  }

  // Step 4: Find versions not already in changelog
  const existingVersionSet = new Set(existing.changelog.history.map(h => h.version));
  const newVersions = discoveredVersions.filter(v => !existingVersionSet.has(v.version));

  if (newVersions.length === 0) {
    console.log(`No new versions for ${packageId} - using existing changelog`);
    return existing;
  }

  console.log(`Found ${newVersions.length} new version(s) for ${packageId}: ${newVersions.map(v => v.version).join(', ')}`);

  // Step 5: Only extract and diff new versions
  // Use the most recent version from existing changelog as the diff base
  const mostRecentExisting = existing.changelog.history[0];
  
  const newDeltas = await computeDeltasForVersions(
    packageId,
    newVersions,
    mostRecentExisting // Base for diffing
  );

  // Step 6: Merge new deltas into existing changelog
  const mergedChangelog: PackageChangelog = {
    ...existing.changelog,
    generatedAt: new Date().toISOString(),
    history: [...newDeltas, ...existing.changelog.history],
  };

  const mergedVersions: PackageVersionIndex = {
    ...existing.versions,
    latest: {
      version: newVersions[0].version,
      sha: newVersions[0].sha,
      tag: newVersions[0].tag,
      releaseDate: newVersions[0].releaseDate,
      extractedAt: new Date().toISOString(),
      stats: computeVersionStats(newDeltas[0]),
    },
    versions: [
      ...newVersions.map(v => ({
        version: v.version,
        sha: v.sha,
        tag: v.tag,
        releaseDate: v.releaseDate,
        stats: computeVersionStats(newDeltas.find(d => d.version === v.version)!),
      })),
      ...existing.versions.versions,
    ],
  };

  return { changelog: mergedChangelog, versions: mergedVersions };
}
```

#### 4.6.4 Build Command Flags

```bash
# Full build (ignore existing, rebuild everything)
pnpm build:ir --with-versions --full

# Incremental build (default - fetch existing, only process new versions)
pnpm build:ir --with-versions

# Skip versioning entirely (existing behavior)
pnpm build:ir
```

#### 4.6.5 Efficiency Comparison

| Scenario | Full Build | Incremental Build |
|----------|------------|-------------------|
| First release | Extract 10 versions, compute 9 diffs | Same |
| New minor release | Extract 10 versions, compute 9 diffs | **Fetch existing + extract 1 version + compute 1 diff** |
| Patch release (no new minor) | Extract 10 versions, compute 9 diffs | **Fetch existing, detect no changes, skip** |

**Time savings**: For a typical new release, incremental builds are **~90% faster** (extracting 1 version vs 10).

### 4.7 Parallel Version Extraction

When extracting multiple historical versions (full build or catching up on several missed releases), extract them in parallel for faster builds:

```typescript
/**
 * Extract minimal IR for multiple versions in parallel.
 * Significantly faster than sequential extraction.
 */
async function extractVersionsParallel(
  repo: string,
  versions: DiscoveredVersion[],
  options: { concurrency?: number } = {}
): Promise<Map<string, MinimalIR>> {
  const concurrency = options.concurrency ?? 4; // Limit parallel extractions
  const results = new Map<string, MinimalIR>();
  
  // Process in batches to avoid overwhelming resources
  for (let i = 0; i < versions.length; i += concurrency) {
    const batch = versions.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(async (version) => {
        console.log(`Extracting ${version.version} (${version.sha.slice(0, 7)})...`);
        const ir = await extractMinimalIR(repo, version.sha);
        return { version: version.version, ir };
      })
    );
    
    for (const { version, ir } of batchResults) {
      results.set(version, ir);
    }
  }
  
  return results;
}
```

#### Performance Comparison

| Versions | Sequential | Parallel (4x) | Speedup |
|----------|------------|---------------|---------|
| 4 versions | ~40s | ~10s | 4x |
| 10 versions | ~100s | ~25s | 4x |
| 20 versions | ~200s | ~50s | 4x |

**Note**: Concurrency is limited to avoid GitHub API rate limits and memory pressure.

### 4.8 GitHub Workflow Integration

The build workflow needs updates to support versioned builds with incremental and full rebuild modes.

#### 4.8.1 Workflow Triggers

```yaml
on:
  # Manual trigger with versioning options
  workflow_dispatch:
    inputs:
      project:
        description: 'Project to build (leave empty for all)'
        required: false
        type: choice
        options:
          - ''
          - langchain
          - langgraph
          - deepagent
      language:
        description: 'Language to build (leave empty for all)'
        required: false
        type: choice
        options:
          - ''
          - python
          - typescript
      with_versions:
        description: 'Include version history tracking'
        required: false
        type: boolean
        default: true
      full_rebuild:
        description: 'Force full rebuild (ignore existing changelogs)'
        required: false
        type: boolean
        default: false

  # Trigger on extractor/config changes
  push:
    branches:
      - main
    paths:
      - '.github/workflows/build-ir.yml'
      - 'scripts/**'
      - 'packages/extractor-*/**'
      - 'packages/ir-schema/**'
      - 'configs/**'

  # Optional: Trigger on upstream releases (via repository_dispatch)
  repository_dispatch:
    types: [upstream-release]
```

#### 4.8.2 Build Step with Versioning Flags

```yaml
- name: Build IR
  run: |
    FLAGS=""
    
    # Add versioning flag if enabled
    if [ "${{ inputs.with_versions }}" == "true" ]; then
      FLAGS="$FLAGS --with-versions"
    fi
    
    # Add full rebuild flag if requested
    if [ "${{ inputs.full_rebuild }}" == "true" ]; then
      FLAGS="$FLAGS --full"
    fi
    
    npx tsx scripts/build-ir.ts \
      --config ./configs/${{ matrix.config }} \
      $FLAGS
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    BLOB_BASE_URL: ${{ vars.BLOB_BASE_URL }}
```

#### 4.8.3 Full Rebuild Mode

For complete IR catalog rebuilds (e.g., fixing bugs in extraction):

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Full Rebuild Strategy                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PARALLELISM LEVELS:                                                 │
│                                                                      │
│  Level 1: Matrix Strategy (GitHub Actions)                           │
│  ├─ Job 1: langchain-python                                          │
│  ├─ Job 2: langchain-typescript                                      │
│  ├─ Job 3: langgraph-python                                          │
│  ├─ Job 4: langgraph-typescript                                      │
│  ├─ Job 5: deepagent-python                                          │
│  └─ Job 6: deepagent-typescript                                      │
│                                                                      │
│  Level 2: Parallel Version Extraction (within each job)              │
│  └─ Each job extracts up to 4 versions concurrently                  │
│                                                                      │
│  RESULT: 6 projects × 4 concurrent versions = 24 parallel extracts   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4.8.4 Upstream Release Trigger

To trigger builds when upstream repos make releases, set up a webhook or use `repository_dispatch`:

```bash
# Trigger from external system (e.g., upstream repo webhook)
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/langchain-ai/references/dispatches \
  -d '{"event_type":"upstream-release","client_payload":{"project":"langchain","language":"typescript"}}'
```

Or use a separate workflow that monitors upstream releases:

```yaml
# .github/workflows/watch-releases.yml
name: Watch Upstream Releases

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  check-releases:
    runs-on: ubuntu-latest
    steps:
      - name: Check for new releases
        run: |
          # Check each upstream repo for new releases
          # Trigger build-ir workflow if new release found
          # (Implementation depends on release tracking strategy)
```

---

## 5. UI Integration

### 5.1 Symbol Page Enhancements

#### 5.1.1 Version Badge

Display "Since v0.2.0" next to the symbol name:

```tsx
// apps/web/components/reference/VersionBadge.tsx

interface VersionBadgeProps {
  since: string;
  className?: string;
}

export function VersionBadge({ since, className }: VersionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        "bg-emerald-100 text-emerald-800",
        "dark:bg-emerald-900/30 dark:text-emerald-400",
        className
      )}
    >
      Since {since}
    </span>
  );
}
```

#### 5.1.2 Deprecation Banner

If deprecated, show a warning banner:

```tsx
// apps/web/components/reference/DeprecationBanner.tsx

interface DeprecationBannerProps {
  since: string;
  message?: string;
  replacement?: string;
  replacementHref?: string;
}

export function DeprecationBanner({
  since,
  message,
  replacement,
  replacementHref,
}: DeprecationBannerProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-amber-800 dark:text-amber-200">
            Deprecated since {since}
          </h4>
          {message && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {message}
            </p>
          )}
          {replacement && (
            <p className="mt-2 text-sm">
              <span className="text-amber-700 dark:text-amber-300">Use </span>
              {replacementHref ? (
                <Link
                  href={replacementHref}
                  className="font-mono text-amber-900 dark:text-amber-100 underline hover:no-underline"
                >
                  {replacement}
                </Link>
              ) : (
                <code className="font-mono text-amber-900 dark:text-amber-100">
                  {replacement}
                </code>
              )}
              <span className="text-amber-700 dark:text-amber-300"> instead.</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

#### 5.1.3 Version History Panel

Expandable panel showing version history. **Changelog data is loaded dynamically** when the user expands the panel (not on initial page load) to improve page performance.

##### Lazy Loading Architecture

```
Initial Page Load:
┌─────────────────────────────────────────┐
│ Symbol Page                             │
│ ├─ Header with Version Badge ✓ (from versionInfo) │
│ ├─ Deprecation Banner ✓ (from versionInfo)        │
│ ├─ Signature & Docs ✓                   │
│ └─ Version History [collapsed]          │
│     └─ "Click to expand" (no data loaded yet)     │
└─────────────────────────────────────────┘

On Expand:
┌─────────────────────────────────────────┐
│ Version History [expanded]              │
│ ├─ Loading spinner (fetching changelog) │
│ └─ ... changelog.json fetched ...       │
│     └─ History entries rendered         │
└─────────────────────────────────────────┘
```

**Why lazy load?**
- Changelog files can be ~500KB per package
- Most users view symbol docs without checking version history
- Initial page load is faster without changelog fetch
- Version badge ("Since v0.2.0") comes from `versionInfo` on the symbol (already loaded)

##### Implementation:

```tsx
// apps/web/components/reference/VersionHistory.tsx

interface VersionHistoryProps {
  qualifiedName: string;
  packageId: string;
  project: string;
  language: string;
  /** versionInfo from the symbol (for "has history" indicator) */
  versionInfo?: SymbolVersionInfo;
}

export function VersionHistory({
  qualifiedName,
  packageId,
  project,
  language,
  versionInfo,
}: VersionHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [changelog, setChangelog] = useState<PackageChangelog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy load changelog when panel is expanded
  useEffect(() => {
    if (expanded && !changelog && !loading) {
      setLoading(true);
      setError(null);
      
      fetchChangelog(project, language, packageId)
        .then(setChangelog)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [expanded, changelog, loading, project, language, packageId]);

  // Don't show panel if symbol has no version history
  const hasHistory = versionInfo?.modifiedIn?.length || versionInfo?.since;
  if (!hasHistory) {
    return null;
  }

  // Filter to relevant entries for this symbol (once loaded)
  const relevantHistory = changelog?.history.filter(delta =>
    delta.added.some(a => a.qualifiedName === qualifiedName) ||
    delta.modified.some(m => m.qualifiedName === qualifiedName) ||
    delta.deprecated.some(d => d.qualifiedName === qualifiedName)
  ) ?? [];

  return (
    <section className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <History className="h-4 w-4" />
        Version History
        {versionInfo?.modifiedIn && (
          <span className="text-xs text-gray-500">
            ({versionInfo.modifiedIn.length} changes)
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="mt-4">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading version history...
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              Failed to load version history: {error}
            </div>
          )}

          {/* Loaded state */}
          {changelog && relevantHistory.length > 0 && (
            <div className="space-y-4">
              {relevantHistory.map(delta => (
                <VersionHistoryEntry
                  key={delta.version}
                  delta={delta}
                  qualifiedName={qualifiedName}
                />
              ))}
            </div>
          )}

          {/* No history for this symbol */}
          {changelog && relevantHistory.length === 0 && (
            <div className="text-sm text-gray-500">
              No recorded changes for this symbol.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Fetch changelog from API (cached by Next.js/browser).
 */
async function fetchChangelog(
  project: string,
  language: string,
  packageId: string
): Promise<PackageChangelog> {
  const res = await fetch(`/api/changelog/${project}/${language}/${packageId}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

interface VersionHistoryEntryProps {
  delta: VersionDelta;
  qualifiedName: string;
}

function VersionHistoryEntry({ delta, qualifiedName }: VersionHistoryEntryProps) {
  const [showSnapshot, setShowSnapshot] = useState(false);

  // Find the relevant change for this symbol
  const added = delta.added.find(a => a.qualifiedName === qualifiedName);
  const modified = delta.modified.find(m => m.qualifiedName === qualifiedName);
  const deprecated = delta.deprecated.find(d => d.qualifiedName === qualifiedName);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
            v{delta.version}
          </span>
          <span className="text-xs text-gray-500">
            {formatDate(delta.releaseDate)}
          </span>
        </div>
        <a
          href={`https://github.com/.../${delta.sha}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {delta.sha.slice(0, 7)}
        </a>
      </div>

      {/* Show what happened */}
      <div className="mt-3">
        {added && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Plus className="h-4 w-4" />
            <span>Introduced in this version</span>
          </div>
        )}

        {modified && (
          <div className="space-y-2">
            {modified.changes.map((change, i) => (
              <ChangeDescription key={i} change={change} />
            ))}

            {/* Inline diff */}
            <SignatureDiff
              before={modified.snapshotBefore.signature}
              after={modified.snapshotAfter.signature}
            />

            {/* Expandable full interface view */}
            <button
              onClick={() => setShowSnapshot(!showSnapshot)}
              className="text-xs text-primary hover:underline"
            >
              {showSnapshot ? "Hide" : "View"} full interface at this version
            </button>

            {showSnapshot && (
              <SnapshotViewer snapshot={modified.snapshotBefore} />
            )}
          </div>
        )}

        {deprecated && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span>Deprecated in this version</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a single change with member name highlighted.
 */
function ChangeDescription({ change }: { change: ChangeRecord }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {change.memberName && (
        <code className="font-mono text-primary bg-primary/10 px-1 rounded">
          {change.memberName}
        </code>
      )}
      <span className="text-gray-700 dark:text-gray-300">
        {change.description}
      </span>
      {change.breaking && (
        <span className="text-xs text-red-600 dark:text-red-400 font-medium">
          Breaking
        </span>
      )}
    </div>
  );
}

/**
 * Renders a member-level inline diff.
 */
function MemberDiff({ change }: { change: ChangeRecord }) {
  if (!change.before || !change.after) return null;
  
  const beforeSig = change.before.signature || change.before.type;
  const afterSig = change.after.signature || change.after.type;
  
  if (!beforeSig || !afterSig) return null;
  
  return (
    <div className="font-mono text-xs bg-gray-50 dark:bg-gray-900 rounded p-2 mt-1">
      <div className="text-red-600 dark:text-red-400">
        - {change.memberName}: {beforeSig}
      </div>
      <div className="text-emerald-600 dark:text-emerald-400">
        + {change.memberName}: {afterSig}
      </div>
    </div>
  );
}
```

#### 5.1.4 Signature Diff Component

```tsx
// apps/web/components/reference/SignatureDiff.tsx

interface SignatureDiffProps {
  before: string;
  after: string;
}

export function SignatureDiff({ before, after }: SignatureDiffProps) {
  // Use a diff library to compute line-by-line changes
  const diff = computeDiff(before, after);

  return (
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-900 p-3 font-mono text-sm overflow-x-auto">
      {diff.map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre",
            line.type === "removed" && "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
            line.type === "added" && "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200",
            line.type === "unchanged" && "text-gray-600 dark:text-gray-400"
          )}
        >
          <span className="select-none mr-2">
            {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
          </span>
          {line.content}
        </div>
      ))}
    </div>
  );
}
```

#### 5.1.5 Snapshot Viewer Component

**Key insight**: Clicking "View full interface" expands to show data that's **already stored in the changelog** - no extra fetch needed. This is client-side only.

```tsx
// apps/web/components/reference/SnapshotViewer.tsx

interface SnapshotViewerProps {
  snapshot: SymbolSnapshot;
  repoUrl: string;
  sha: string;
}

export function SnapshotViewer({ snapshot, repoUrl, sha }: SnapshotViewerProps) {
  /**
   * Render interface from stored snapshot.
   * The member signatures are already in the snapshot data.
   */
  const renderInterface = (snapshot: SymbolSnapshot): string => {
    const members = snapshot.members
      ?.map(m => `  ${m.signature};`)
      .join('\n');
    return `${snapshot.signature} {\n${members}\n}`;
  };

  const sourceUrl = `${repoUrl}/blob/${sha}/${snapshot.sourcePath}#L${snapshot.sourceLine}`;

  return (
    <div className="mt-3 space-y-3">
      {/* Rendered from snapshot - no fetch needed! */}
      <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 font-mono text-sm overflow-x-auto">
        <pre className="text-gray-800 dark:text-gray-200">
          {renderInterface(snapshot)}
        </pre>
      </div>

      {/* Link to GitHub for full source with docs */}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        View source with full documentation
      </a>
    </div>
  );
}
```

#### 5.1.6 Data Source Summary

| What User Sees | Data Source | Fetch Required? |
|----------------|-------------|-----------------|
| Change description | `changelog.json` → `changes[].description` | No (already loaded) |
| Inline diff (before/after) | `changelog.json` → `changes[].before/after` | No (already loaded) |
| Full interface at version | `changelog.json` → `snapshotBefore.members` | No (already loaded) |
| Full docs/examples | GitHub link (external) | Yes (external link) |

**Key design decision**: Signatures are small, docs are big. Store signatures, link to docs.

### 5.2 UI Mockups

#### 5.2.1 Full Symbol Page with Version History

```
┌─────────────────────────────────────────────────────────────────┐
│ ChatModelParams                                    interface    │
│                                               Since v0.1.0      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ interface ChatModelParams {                                     │
│   model: string;                                                │
│   temperature?: number;                                         │
│   maxTokens: number | "auto";                                   │
│ }                                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ 📜 Version History                                              │
│                                                                 │
│ ┌─ v0.3.0  ─────────────────────────── Dec 1, 2025 ──────────┐ │
│ │                                                             │ │
│ │  maxTokens  Type changed from 'number' to 'number | "auto"'│ │
│ │                                                             │ │
│ │  - maxTokens: number                                        │ │
│ │  + maxTokens: number | "auto"                               │ │
│ │                                                             │ │
│ │  ▸ View full interface at v0.3.0                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ v0.2.0  ─────────────────────────── Sep 15, 2025 ─────────┐ │
│ │                                                             │ │
│ │  temperature  Changed from required to optional             │ │
│ │                                                             │ │
│ │  - temperature: number                                      │ │
│ │  + temperature?: number                                     │ │
│ │                                                             │ │
│ │  ▸ View full interface at v0.2.0                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ v0.1.0  ─────────────────────────── Jun 1, 2025 ──────────┐ │
│ │                                                             │ │
│ │  ✨ Introduced                                              │ │
│ │                                                             │ │
│ │  ▸ View full interface at v0.1.0                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.2.2 Expanded Version Entry

When user clicks "View full interface at v0.2.0":

```
┌─ v0.2.0  ─────────────────────────── Sep 15, 2025 ───────────────┐
│                                                                   │
│  temperature  Changed from required to optional                   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ interface ChatModelParams {                                 │  │
│  │   model: string;                                            │  │
│  │   temperature?: number;  // ← changed in this version       │  │
│  │   maxTokens: number;                                        │  │
│  │ }                                                           │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  📎 View source at v0.2.0 →                                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

#### 5.2.3 Deprecated Symbol Banner

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️  Deprecated since v0.4.0                                      │
│                                                                  │
│     This interface has been deprecated in favor of the new       │
│     configuration system.                                        │
│                                                                  │
│     Use ChatModelConfig instead.                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Optional Version Selector

For power users, add a dropdown to view documentation as of a specific version:

```tsx
// apps/web/components/reference/VersionSelector.tsx

interface VersionSelectorProps {
  currentVersion: string;
  availableVersions: string[];
  onVersionChange: (version: string) => void;
}

export function VersionSelector({
  currentVersion,
  availableVersions,
  onVersionChange,
}: VersionSelectorProps) {
  return (
    <select
      value={currentVersion}
      onChange={e => onVersionChange(e.target.value)}
      className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800"
    >
      {availableVersions.map(version => (
        <option key={version} value={version}>
          v{version}
          {version === availableVersions[0] && " (latest)"}
        </option>
      ))}
    </select>
  );
}
```

---

## 6. Configuration

### 6.1 Package Versioning Configuration

Extend the package config with optional `versioning` block:

```typescript
// Updated package config interface
interface PackageConfig {
  name: string;
  path: string;
  displayName?: string;
  entryPoints?: string[];

  /** Version tracking configuration */
  versioning?: VersioningConfig;
}

interface VersioningConfig {
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
}
```

### 6.2 Example Configuration

```json
// configs/langchain-typescript.json
{
  "$schema": "./config-schema.json",
  "project": "langchain",
  "language": "typescript",
  "repo": "langchain-ai/langchainjs",
  "packages": [
    {
      "name": "@langchain/core",
      "path": "langchain-core",
      "entryPoints": ["auto"],
      "displayName": "Core",
      "versioning": {
        "tagPattern": "@langchain/core@*",
        "maxVersions": 10,
        "alwaysInclude": ["0.1.0"],
        "minVersion": "0.1.0"
      }
    },
    {
      "name": "@langchain/openai",
      "path": "libs/langchain-openai",
      "entryPoints": ["auto"],
      "displayName": "OpenAI",
      "versioning": {
        "tagPattern": "@langchain/openai@*",
        "maxVersions": 10
      }
    }
  ]
}
```

### 6.3 Updated Config Schema

```json
// configs/config-schema.json (additions)
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "definitions": {
    "versioning": {
      "type": "object",
      "properties": {
        "tagPattern": {
          "type": "string",
          "description": "Git tag pattern for version discovery (e.g., '@langchain/core@*')"
        },
        "maxVersions": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "default": 10,
          "description": "Maximum number of minor/major versions to track"
        },
        "alwaysInclude": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Version strings to always include regardless of maxVersions"
        },
        "minVersion": {
          "type": "string",
          "description": "Minimum version to start tracking (e.g., '0.1.0')"
        },
        "enabled": {
          "type": "boolean",
          "default": true,
          "description": "Whether to enable version tracking for this package"
        }
      },
      "required": ["tagPattern"]
    }
  }
}
```

---

## 7. Implementation Plan

### 7.1 Phase 1: Schema & Types (Days 1-2)

1. **Add Versioning Types to IR Schema**
   - Create `packages/ir-schema/src/versioning.ts`
   - Define `PackageVersionIndex`, `PackageChangelog`, `VersionDelta`, etc.
   - Define `SymbolSnapshot` and `ChangeRecord` types
   - Export from package index

2. **Extend SymbolRecord**
   - Add optional `versionInfo` field
   - Update type exports

3. **Update Config Schema**
   - Add `versioning` block to package config
   - Update JSON schema validation

### 7.2 Phase 2: Version Discovery (Days 3-4)

4. **Create Version Discovery Utilities**
   - Implement `discoverVersions()` function
   - Add tag pattern parsing
   - Implement minor version filtering
   - Add semver sorting and comparison

5. **Add Git Tag Fetching**
   - Implement `fetchGitTags()` API call
   - Parse tag dates and SHAs
   - Handle pagination for large tag lists

### 7.3 Phase 3: Diff Computation (Days 5-7)

6. **Create Minimal Extraction Mode**
   - Add flags for minimal extraction
   - Skip documentation parsing
   - Output lightweight symbol structure

7. **Implement Diff Engine**
   - Create `computeVersionDelta()` function
   - Implement `detectChanges()` for symbols
   - Implement `detectMemberChanges()` for classes/interfaces
   - Implement `detectParamChanges()` for functions

8. **Create Snapshot Generation**
   - Implement `createSnapshot()` function
   - Test with various symbol types

### 7.4 Phase 4: Build Pipeline (Days 8-10)

9. **Update Build Script**
   - Add versioned extraction flow
   - Implement incremental changelog updates
   - Add `versions.json` generation
   - Add `changelog.json` generation

10. **Annotate Latest IR**
    - Implement `annotateLatestIR()` function
    - Add `versionInfo` to all symbols
    - Test with full extraction

11. **Update Upload Scripts**
    - Add versioned file paths
    - Handle changelog uploads
    - Update KV entries for versioned data

### 7.5 Phase 5: UI Components (Days 11-14)

12. **Create Version Badge Component**
    - Implement `VersionBadge.tsx`
    - Style for light/dark modes

13. **Create Deprecation Banner**
    - Implement `DeprecationBanner.tsx`
    - Add replacement linking

14. **Create Version History Panel**
    - Implement `VersionHistory.tsx`
    - Add expandable entries
    - Add snapshot viewer

15. **Create Signature Diff Component**
    - Implement `SignatureDiff.tsx`
    - Add syntax highlighting for diffs

### 7.6 Phase 6: Integration & Polish (Days 15-17)

16. **Update SymbolPage**
    - Add version badge to header
    - Add deprecation banner
    - Add version history section
    - Load changelog data

17. **Update IR Loader**
    - Add `getChangelog()` function
    - Add `getVersionIndex()` function
    - Cache changelog loading

18. **Testing & Refinement**
    - Test with all package types
    - Verify UI across light/dark modes
    - Performance testing for large changelogs

---

## 8. Acceptance Criteria

### 8.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Version discovery from git tags works for all tag patterns | P0 |
| F2 | Changelog generated for tracked versions | P0 |
| F3 | "Since" badge appears on symbol pages | P0 |
| F4 | Deprecation banner shows for deprecated symbols | P0 |
| F5 | Version history panel shows changes per version | P0 |
| F6 | Signature diffs display inline | P0 |
| F7 | Snapshots allow viewing historical interfaces | P1 |
| F8 | Incremental builds download existing changelog and only process new versions | P0 |
| F9 | GitHub links point to correct SHA | P1 |
| F10 | Version selector allows viewing historical snapshots | P2 |

### 8.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF1 | Changelog file size per package | < 500 KB |
| NF2 | Version discovery time | < 5 seconds |
| NF3 | Diff computation time per version pair | < 10 seconds |
| NF4 | Version history panel render time (after load) | < 100ms |
| NF5 | Full build with versioning (parallel) | < 2 minutes per package |
| NF6 | Parallel extraction speedup | ~4x vs sequential |
| NF7 | Initial page load (without changelog) | No changelog fetch |
| NF8 | Changelog API response time | < 500ms |
| NF9 | Incremental build (no new versions) | < 10 seconds |

### 8.3 Definition of Done

- [ ] All P0 functional requirements implemented
- [ ] Schema types exported from `@langchain/ir-schema`
- [ ] Version discovery works for scoped npm tags
- [ ] Changelog generated and uploaded for at least one package
- [ ] "Since" badge displays correctly in light and dark modes
- [ ] Deprecation banner renders with replacement links
- [ ] Version history panel expands and shows changes
- [ ] Signature diffs render with syntax highlighting
- [ ] Build pipeline supports versioned extraction
- [ ] Incremental builds work without full re-extraction
- [ ] Documentation updated with versioning configuration

---

## Appendix A: Complete Changelog Example

This appendix shows a complete `changelog.json` example for an interface that evolves across three versions.

### A.1 Interface Evolution

**v0.1.0 (initial)**
```typescript
interface ChatModelParams {
  model: string;
  temperature: number;
  maxTokens: number;
}
```

**v0.2.0 (temperature becomes optional)**
```typescript
interface ChatModelParams {
  model: string;
  temperature?: number;  // Changed: now optional
  maxTokens: number;
}
```

**v0.3.0 (maxTokens type changes)**
```typescript
interface ChatModelParams {
  model: string;
  temperature?: number;
  maxTokens: number | "auto";  // Changed: now accepts "auto"
}
```

### A.2 Complete changelog.json

```json
{
  "packageId": "pkg_js_langchain_core",
  "packageName": "@langchain/core",
  "generatedAt": "2025-12-15T10:30:00Z",
  "history": [
    {
      "version": "0.3.0",
      "previousVersion": "0.2.0",
      "sha": "abc123def456",
      "releaseDate": "2025-12-01T00:00:00Z",
      "added": [],
      "removed": [],
      "modified": [
        {
          "qualifiedName": "@langchain/core.ChatModelParams",
          "changes": [
            {
              "type": "member-type-changed",
              "memberName": "maxTokens",
              "description": "Type changed from 'number' to 'number | \"auto\"'",
              "breaking": false,
              "before": { "type": "number" },
              "after": { "type": "number | \"auto\"" }
            }
          ],
          "snapshotBefore": {
            "qualifiedName": "@langchain/core.ChatModelParams",
            "kind": "interface",
            "signature": "interface ChatModelParams",
            "members": [
              { "name": "model", "kind": "property", "signature": "model: string", "visibility": "public" },
              { "name": "temperature", "kind": "property", "signature": "temperature?: number", "optional": true, "visibility": "public" },
              { "name": "maxTokens", "kind": "property", "signature": "maxTokens: number", "visibility": "public" }
            ],
            "sourcePath": "libs/langchain-core/src/types.ts",
            "sourceLine": 42
          },
          "snapshotAfter": {
            "qualifiedName": "@langchain/core.ChatModelParams",
            "kind": "interface",
            "signature": "interface ChatModelParams",
            "members": [
              { "name": "model", "kind": "property", "signature": "model: string", "visibility": "public" },
              { "name": "temperature", "kind": "property", "signature": "temperature?: number", "optional": true, "visibility": "public" },
              { "name": "maxTokens", "kind": "property", "signature": "maxTokens: number | \"auto\"", "visibility": "public" }
            ],
            "sourcePath": "libs/langchain-core/src/types.ts",
            "sourceLine": 42
          }
        }
      ],
      "deprecated": []
    },
    {
      "version": "0.2.0",
      "previousVersion": "0.1.0",
      "sha": "def456789abc",
      "releaseDate": "2025-09-15T00:00:00Z",
      "added": [],
      "removed": [],
      "modified": [
        {
          "qualifiedName": "@langchain/core.ChatModelParams",
          "changes": [
            {
              "type": "member-optionality-changed",
              "memberName": "temperature",
              "description": "Changed from required to optional",
              "breaking": false,
              "before": { "required": true },
              "after": { "required": false }
            }
          ],
          "snapshotBefore": {
            "qualifiedName": "@langchain/core.ChatModelParams",
            "kind": "interface",
            "signature": "interface ChatModelParams",
            "members": [
              { "name": "model", "kind": "property", "signature": "model: string", "visibility": "public" },
              { "name": "temperature", "kind": "property", "signature": "temperature: number", "visibility": "public" },
              { "name": "maxTokens", "kind": "property", "signature": "maxTokens: number", "visibility": "public" }
            ],
            "sourcePath": "libs/langchain-core/src/types.ts",
            "sourceLine": 38
          },
          "snapshotAfter": {
            "qualifiedName": "@langchain/core.ChatModelParams",
            "kind": "interface",
            "signature": "interface ChatModelParams",
            "members": [
              { "name": "model", "kind": "property", "signature": "model: string", "visibility": "public" },
              { "name": "temperature", "kind": "property", "signature": "temperature?: number", "optional": true, "visibility": "public" },
              { "name": "maxTokens", "kind": "property", "signature": "maxTokens: number", "visibility": "public" }
            ],
            "sourcePath": "libs/langchain-core/src/types.ts",
            "sourceLine": 42
          }
        }
      ],
      "deprecated": []
    },
    {
      "version": "0.1.0",
      "previousVersion": null,
      "sha": "789ghijkl012",
      "releaseDate": "2025-06-01T00:00:00Z",
      "added": [
        {
          "qualifiedName": "@langchain/core.ChatModelParams",
          "snapshot": {
            "qualifiedName": "@langchain/core.ChatModelParams",
            "kind": "interface",
            "signature": "interface ChatModelParams",
            "members": [
              { "name": "model", "kind": "property", "signature": "model: string", "visibility": "public" },
              { "name": "temperature", "kind": "property", "signature": "temperature: number", "visibility": "public" },
              { "name": "maxTokens", "kind": "property", "signature": "maxTokens: number", "visibility": "public" }
            ],
            "sourcePath": "libs/langchain-core/src/types.ts",
            "sourceLine": 35
          }
        }
      ],
      "removed": [],
      "modified": [],
      "deprecated": []
    }
  ]
}
```

### A.3 Helper Function to Render Snapshot

```typescript
function renderInterfaceSnapshot(snapshot: SymbolSnapshot): string {
  const members = snapshot.members
    ?.map(m => `  ${m.signature};`)
    .join('\n');
  
  return `${snapshot.signature} {\n${members}\n}`;
}

// Output for v0.2.0 snapshot:
// interface ChatModelParams {
//   model: string;
//   temperature?: number;
//   maxTokens: number;
// }
```

---

## Appendix B: File Changes Summary

### New Files

```
packages/ir-schema/src/versioning.ts       # Version tracking types

scripts/
├── discover-versions.ts                   # Version discovery utilities
├── compute-diff.ts                        # Diff computation engine
├── generate-changelog.ts                  # Changelog generation

apps/web/
├── lib/ir/versioning.ts                   # Changelog loading utilities
├── components/reference/
│   ├── VersionBadge.tsx                   # "Since v0.2.0" badge
│   ├── DeprecationBanner.tsx              # Deprecation warning
│   ├── VersionHistory.tsx                 # Version history panel
│   ├── VersionHistoryEntry.tsx            # Individual history entry
│   ├── SignatureDiff.tsx                  # Inline signature diff
│   └── SnapshotViewer.tsx                 # Historical snapshot viewer
```

### Modified Files

```
packages/ir-schema/
├── src/index.ts                           # Export versioning types
└── src/symbol.ts                          # Add versionInfo to SymbolRecord

configs/
├── config-schema.json                     # Add versioning block
├── langchain-typescript.json              # Add versioning config
└── langchain-python.json                  # Add versioning config

scripts/
├── build-ir.ts                            # Add versioned extraction flow
└── upload-ir.ts                           # Handle versioned uploads

apps/web/
├── lib/ir/loader.ts                       # Add changelog loading
└── components/reference/SymbolPage.tsx    # Add version UI elements
```

---

*End of Specification*

