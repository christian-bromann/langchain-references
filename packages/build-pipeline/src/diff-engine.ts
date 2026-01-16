/**
 * Diff Engine Module
 *
 * Computes differences between symbol versions to generate changelogs.
 * Detects added, removed, modified, and deprecated symbols.
 */

import type {
  SymbolRecord,
  MemberSnapshot,
  ChangeRecord,
  VersionDelta,
} from "@langchain/ir-schema";

import { createSnapshot } from "./snapshot.js";

// =============================================================================
// MINIMAL IR TYPES
// =============================================================================

/**
 * Minimal IR extracted for historical versions.
 * Contains only what's needed for diffing - no full docs.
 */
export interface MinimalIR {
  /** Version this IR represents */
  version: string;

  /** Git SHA */
  sha: string;

  /** Release date */
  releaseDate: string;

  /** Symbols in this version */
  symbols: SymbolRecord[];
}

// =============================================================================
// VERSION DELTA COMPUTATION
// =============================================================================

/**
 * Compute the delta between two versions of a package.
 *
 * @param olderIR - The older version's IR
 * @param newerIR - The newer version's IR
 * @param getMember - Optional function to resolve member references
 * @returns A version delta describing all changes
 */
export function computeVersionDelta(
  olderIR: MinimalIR,
  newerIR: MinimalIR,
  getMember?: (refId: string) => SymbolRecord | undefined,
): VersionDelta {
  const delta: VersionDelta = {
    version: newerIR.version,
    previousVersion: olderIR.version,
    sha: newerIR.sha,
    releaseDate: newerIR.releaseDate,
    added: [],
    removed: [],
    modified: [],
    deprecated: [],
  };

  // Build maps for quick lookup
  const olderSymbols = new Map(olderIR.symbols.map((s) => [s.qualifiedName, s]));
  const newerSymbols = new Map(newerIR.symbols.map((s) => [s.qualifiedName, s]));

  // Find added symbols
  for (const [name, symbol] of newerSymbols) {
    if (!olderSymbols.has(name)) {
      delta.added.push({
        qualifiedName: name,
        snapshot: createSnapshot(symbol, getMember),
      });
    }
  }

  // Find removed symbols
  for (const [name, symbol] of olderSymbols) {
    if (!newerSymbols.has(name)) {
      delta.removed.push({
        qualifiedName: name,
        kind: symbol.kind,
        replacement: findPotentialReplacement(name, newerSymbols),
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
          snapshotBefore: createSnapshot(olderSymbol, getMember),
          snapshotAfter: createSnapshot(newerSymbol, getMember),
        });
      }
    }
  }

  // Find newly deprecated symbols
  for (const [name, newerSymbol] of newerSymbols) {
    const olderSymbol = olderSymbols.get(name);
    const wasDeprecated = olderSymbol?.docs?.deprecated?.isDeprecated;
    const isDeprecated = newerSymbol.docs?.deprecated?.isDeprecated;

    if (isDeprecated && !wasDeprecated) {
      delta.deprecated.push({
        qualifiedName: name,
        message: newerSymbol.docs?.deprecated?.message,
        replacement: newerSymbol.docs?.deprecated?.replacement
          ? { qualifiedName: newerSymbol.docs.deprecated.replacement }
          : undefined,
        snapshot: createSnapshot(newerSymbol, getMember),
      });
    }
  }

  return delta;
}

// =============================================================================
// CHANGE DETECTION
// =============================================================================

/**
 * Detect all changes between two versions of a symbol.
 *
 * @param older - The older symbol
 * @param newer - The newer symbol
 * @returns Array of change records
 */
export function detectChanges(older: SymbolRecord, newer: SymbolRecord): ChangeRecord[] {
  const changes: ChangeRecord[] = [];

  // Signature changes
  if (older.signature !== newer.signature) {
    changes.push({
      type: "signature-changed",
      description: "Signature changed",
      breaking: false, // Determined by specific changes below
      before: { signature: older.signature },
      after: { signature: newer.signature },
    });
  }

  // Inheritance changes
  const oldExtends = older.relations?.extends ?? [];
  const newExtends = newer.relations?.extends ?? [];
  if (!arraysEqual(oldExtends, newExtends)) {
    changes.push({
      type: "extends-changed",
      description: `Base class changed from ${formatList(oldExtends)} to ${formatList(newExtends)}`,
      breaking: true,
      before: { types: oldExtends },
      after: { types: newExtends },
    });
  }

  const oldImplements = older.relations?.implements ?? [];
  const newImplements = newer.relations?.implements ?? [];
  if (!arraysEqual(oldImplements, newImplements)) {
    changes.push({
      type: "implements-changed",
      description: `Implemented interfaces changed from ${formatList(oldImplements)} to ${formatList(newImplements)}`,
      breaking: true,
      before: { types: oldImplements },
      after: { types: newImplements },
    });
  }

  // Return type changes (for functions)
  if (older.returns?.type !== newer.returns?.type) {
    changes.push({
      type: "return-type-changed",
      description: `Return type changed from '${older.returns?.type ?? "void"}' to '${newer.returns?.type ?? "void"}'`,
      breaking: isBreakingReturnTypeChange(older.returns?.type, newer.returns?.type),
      before: { type: older.returns?.type },
      after: { type: newer.returns?.type },
    });
  }

  // Member changes (for classes/interfaces)
  if (older.members || newer.members) {
    const memberChanges = detectMemberChanges(older.members ?? [], newer.members ?? []);
    changes.push(...memberChanges);
  }

  // Parameter changes (for functions)
  if (older.params || newer.params) {
    const paramChanges = detectParamChanges(older.params ?? [], newer.params ?? []);
    changes.push(...paramChanges);
  }

  return changes;
}

// =============================================================================
// MEMBER CHANGE DETECTION
// =============================================================================

/**
 * Detect changes in class/interface members.
 *
 * @param olderMembers - Members from older version
 * @param newerMembers - Members from newer version
 * @returns Array of change records for member changes
 */
export function detectMemberChanges(
  olderMembers: { name: string; refId: string; visibility: string }[],
  newerMembers: { name: string; refId: string; visibility: string }[],
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const olderMap = new Map(olderMembers.map((m) => [m.name, m]));
  const newerMap = new Map(newerMembers.map((m) => [m.name, m]));

  // Added members
  for (const [name] of newerMap) {
    if (!olderMap.has(name)) {
      changes.push({
        type: "member-added",
        description: `Added member '${name}'`,
        breaking: false,
        memberName: name,
        after: { signature: name },
      });
    }
  }

  // Removed members
  for (const [name] of olderMap) {
    if (!newerMap.has(name)) {
      changes.push({
        type: "member-removed",
        description: `Removed member '${name}'`,
        breaking: true,
        memberName: name,
        before: { signature: name },
      });
    }
  }

  // Modified members - visibility changes
  for (const [name, newerMember] of newerMap) {
    const olderMember = olderMap.get(name);
    if (olderMember && olderMember.visibility !== newerMember.visibility) {
      changes.push({
        type: "member-visibility-changed",
        description: `Visibility of '${name}' changed from ${olderMember.visibility} to ${newerMember.visibility}`,
        breaking: isVisibilityChangeBreaking(olderMember.visibility, newerMember.visibility),
        memberName: name,
        before: { visibility: olderMember.visibility as "public" | "protected" | "private" },
        after: { visibility: newerMember.visibility as "public" | "protected" | "private" },
      });
    }
  }

  return changes;
}

/**
 * Detect detailed member changes using full member snapshots.
 */
export function detectMemberSnapshotChanges(
  olderMembers: MemberSnapshot[],
  newerMembers: MemberSnapshot[],
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const olderMap = new Map(olderMembers.map((m) => [m.name, m]));
  const newerMap = new Map(newerMembers.map((m) => [m.name, m]));

  // Added members
  for (const [name, member] of newerMap) {
    if (!olderMap.has(name)) {
      changes.push({
        type: "member-added",
        description: `Added ${member.kind} '${name}'`,
        breaking: false,
        memberName: name,
        after: { signature: member.signature },
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
        memberName: name,
        before: { signature: member.signature },
      });
    }
  }

  // Modified members
  for (const [name, newerMember] of newerMap) {
    const olderMember = olderMap.get(name);
    if (olderMember) {
      // Type/signature changed
      if (olderMember.signature !== newerMember.signature) {
        changes.push({
          type: "member-type-changed",
          description: `Type of '${name}' changed`,
          breaking: isMemberTypeChangeBreaking(olderMember, newerMember),
          memberName: name,
          before: { signature: olderMember.signature },
          after: { signature: newerMember.signature },
        });
      }

      // Optionality changed
      if (olderMember.optional !== newerMember.optional) {
        const becameRequired = olderMember.optional && !newerMember.optional;
        changes.push({
          type: "member-optionality-changed",
          description: `'${name}' ${becameRequired ? "became required" : "became optional"}`,
          breaking: becameRequired ?? false,
          memberName: name,
          before: { required: !olderMember.optional },
          after: { required: !newerMember.optional },
        });
      }

      // Visibility changed
      if (olderMember.visibility !== newerMember.visibility) {
        changes.push({
          type: "member-visibility-changed",
          description: `Visibility of '${name}' changed from ${olderMember.visibility} to ${newerMember.visibility}`,
          breaking: isVisibilityChangeBreaking(olderMember.visibility, newerMember.visibility),
          memberName: name,
          before: { visibility: olderMember.visibility },
          after: { visibility: newerMember.visibility },
        });
      }

      // Readonly changed
      if (olderMember.readonly !== newerMember.readonly) {
        changes.push({
          type: "member-readonly-changed",
          description: `'${name}' ${newerMember.readonly ? "became readonly" : "is no longer readonly"}`,
          breaking: newerMember.readonly === true,
          memberName: name,
          before: { readonly: olderMember.readonly },
          after: { readonly: newerMember.readonly },
        });
      }

      // Static changed
      if (olderMember.static !== newerMember.static) {
        changes.push({
          type: "member-static-changed",
          description: `'${name}' ${newerMember.static ? "became static" : "is no longer static"}`,
          breaking: true,
          memberName: name,
        });
      }
    }
  }

  return changes;
}

// =============================================================================
// PARAMETER CHANGE DETECTION
// =============================================================================

/**
 * Detect changes in function parameters.
 *
 * @param olderParams - Parameters from older version
 * @param newerParams - Parameters from newer version
 * @returns Array of change records for parameter changes
 */
export function detectParamChanges(
  olderParams: { name: string; type: string; required: boolean; default?: string }[],
  newerParams: { name: string; type: string; required: boolean; default?: string }[],
): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const olderMap = new Map(olderParams.map((p) => [p.name, p]));
  const newerMap = new Map(newerParams.map((p) => [p.name, p]));

  // Added parameters
  for (const [name, param] of newerMap) {
    if (!olderMap.has(name)) {
      changes.push({
        type: "param-added",
        description: `Added parameter '${name}'${param.required ? " (required)" : ""}`,
        breaking: param.required,
        memberName: name,
        after: { type: param.type, required: param.required },
      });
    }
  }

  // Removed parameters
  for (const [name, param] of olderMap) {
    if (!newerMap.has(name)) {
      changes.push({
        type: "param-removed",
        description: `Removed parameter '${name}'`,
        breaking: true,
        memberName: name,
        before: { type: param.type, required: param.required },
      });
    }
  }

  // Modified parameters
  for (const [name, newerParam] of newerMap) {
    const olderParam = olderMap.get(name);
    if (olderParam) {
      // Type changed
      if (olderParam.type !== newerParam.type) {
        changes.push({
          type: "param-type-changed",
          description: `Type of parameter '${name}' changed from '${olderParam.type}' to '${newerParam.type}'`,
          breaking: !isTypeWidening(olderParam.type, newerParam.type),
          memberName: name,
          before: { type: olderParam.type },
          after: { type: newerParam.type },
        });
      }

      // Optionality changed
      if (olderParam.required !== newerParam.required) {
        const becameRequired = !olderParam.required && newerParam.required;
        changes.push({
          type: "param-optionality-changed",
          description: `Parameter '${name}' ${becameRequired ? "became required" : "became optional"}`,
          breaking: becameRequired,
          memberName: name,
          before: { required: olderParam.required },
          after: { required: newerParam.required },
        });
      }

      // Default value changed
      if (olderParam.default !== newerParam.default) {
        changes.push({
          type: "param-default-changed",
          description: `Default value of '${name}' changed`,
          breaking: false,
          memberName: name,
          before: { default: olderParam.default },
          after: { default: newerParam.default },
        });
      }
    }
  }

  return changes;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Try to find a potential replacement for a removed symbol.
 */
function findPotentialReplacement(
  removedName: string,
  newerSymbols: Map<string, SymbolRecord>,
): { qualifiedName: string; note?: string } | undefined {
  // Simple heuristic: look for similar names
  const baseName = removedName.split(".").pop() ?? removedName;

  for (const [name] of newerSymbols) {
    const otherBaseName = name.split(".").pop() ?? name;
    if (
      otherBaseName.toLowerCase().includes(baseName.toLowerCase()) ||
      baseName.toLowerCase().includes(otherBaseName.toLowerCase())
    ) {
      return {
        qualifiedName: name,
        note: `Possible replacement based on name similarity`,
      };
    }
  }

  return undefined;
}

/**
 * Check if a visibility change is breaking.
 */
function isVisibilityChangeBreaking(oldVisibility: string, newVisibility: string): boolean {
  const order = ["public", "protected", "private"];
  const oldIndex = order.indexOf(oldVisibility);
  const newIndex = order.indexOf(newVisibility);
  return newIndex > oldIndex; // More restrictive is breaking
}

/**
 * Check if a member type change is breaking.
 */
function isMemberTypeChangeBreaking(older: MemberSnapshot, newer: MemberSnapshot): boolean {
  // If the new type is a superset (union includes old type), not breaking
  if (newer.signature.includes(older.signature.replace(/[?:]/g, ""))) {
    return false;
  }
  return true;
}

/**
 * Check if a return type change is breaking.
 */
function isBreakingReturnTypeChange(
  oldType: string | undefined,
  newType: string | undefined,
): boolean {
  if (!oldType || !newType) return false;
  // Widening return type is breaking (callers may depend on narrower type)
  return true;
}

/**
 * Check if a type change is a widening (non-breaking).
 */
function isTypeWidening(oldType: string, newType: string): boolean {
  // If new type is a union that includes old type, it's widening
  if (newType.includes("|") && newType.includes(oldType)) {
    return true;
  }
  return false;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function formatList(items: string[]): string {
  if (items.length === 0) return "none";
  return items.join(", ");
}
