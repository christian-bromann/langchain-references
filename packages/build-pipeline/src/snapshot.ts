/**
 * Snapshot Generation Module
 *
 * Creates compact snapshots of symbols for changelog storage.
 * Snapshots contain enough information to display the symbol's API
 * without the full IR (no docs, examples, or private members).
 */

import type {
  SymbolRecord,
  MemberReference,
  SymbolParam,
  TypeParam,
  SymbolSnapshot,
  MemberSnapshot,
  ParamSnapshot,
  TypeParamSnapshot,
} from "@langchain/ir-schema";

// =============================================================================
// SNAPSHOT CREATION
// =============================================================================

/**
 * Create a compact snapshot from a full symbol record.
 *
 * The snapshot contains:
 * - Qualified name and kind
 * - Signature
 * - Public members (for classes/interfaces)
 * - Parameters (for functions)
 * - Type parameters
 * - Inheritance info
 * - Source location (for GitHub links)
 *
 * NOT included:
 * - Full documentation
 * - Examples
 * - Private/protected members
 *
 * @param symbol - The full symbol record
 * @param getMember - Optional function to resolve member references to full symbols
 * @returns A compact snapshot
 */
export function createSnapshot(
  symbol: SymbolRecord,
  getMember?: (refId: string) => SymbolRecord | undefined,
): SymbolSnapshot {
  const snapshot: SymbolSnapshot = {
    qualifiedName: symbol.qualifiedName,
    kind: symbol.kind,
    signature: symbol.signature,
    sourcePath: symbol.source.path,
    sourceLine: symbol.source.line,
  };

  // Add members for classes/interfaces
  if (symbol.members && symbol.members.length > 0) {
    snapshot.members = symbol.members
      .filter((m) => m.visibility === "public")
      .map((m) => createMemberSnapshot(m, getMember));
  }

  // Add parameters for functions/methods
  if (symbol.params && symbol.params.length > 0) {
    snapshot.params = symbol.params.map(createParamSnapshot);
  }

  // Add return type for functions
  if (symbol.returns) {
    snapshot.returnType = symbol.returns.type;
  }

  // Add type parameters
  if (symbol.typeParams && symbol.typeParams.length > 0) {
    snapshot.typeParams = symbol.typeParams.map(createTypeParamSnapshot);
  }

  // Add inheritance info
  if (symbol.relations?.extends && symbol.relations.extends.length > 0) {
    snapshot.extends = symbol.relations.extends;
  }

  if (symbol.relations?.implements && symbol.relations.implements.length > 0) {
    snapshot.implements = symbol.relations.implements;
  }

  return snapshot;
}

/**
 * Create a member snapshot from a member reference.
 *
 * @param member - The member reference
 * @param getMember - Optional function to resolve the full member symbol
 * @returns A member snapshot
 */
export function createMemberSnapshot(
  member: MemberReference,
  getMember?: (refId: string) => SymbolRecord | undefined,
): MemberSnapshot {
  const fullMember = getMember?.(member.refId);

  const snapshot: MemberSnapshot = {
    name: member.name,
    kind: member.kind,
    signature: fullMember?.signature ?? member.name,
    visibility: member.visibility,
  };

  // Try to determine optionality from the signature or full member
  if (fullMember) {
    // Check if property is optional (has ? in name or type allows undefined)
    if (fullMember.signature.includes("?:") || fullMember.signature.includes("?: ")) {
      snapshot.optional = true;
    }

    // Check for readonly
    if (fullMember.signature.startsWith("readonly ")) {
      snapshot.readonly = true;
    }

    // Check for static
    if (fullMember.tags?.isStatic) {
      snapshot.static = true;
    }
  }

  return snapshot;
}

/**
 * Create a parameter snapshot from a symbol parameter.
 *
 * @param param - The parameter definition
 * @returns A parameter snapshot
 */
export function createParamSnapshot(param: SymbolParam): ParamSnapshot {
  return {
    name: param.name,
    type: param.type,
    required: param.required,
    default: param.default,
  };
}

/**
 * Create a type parameter snapshot.
 *
 * @param typeParam - The type parameter definition
 * @returns A type parameter snapshot
 */
export function createTypeParamSnapshot(typeParam: TypeParam): TypeParamSnapshot {
  return {
    name: typeParam.name,
    constraint: typeParam.constraint,
    default: typeParam.default,
  };
}

// =============================================================================
// SNAPSHOT RENDERING
// =============================================================================

/**
 * Render a symbol snapshot as a string (for display in UI).
 *
 * @param snapshot - The snapshot to render
 * @returns A formatted string representation
 */
export function renderSnapshot(snapshot: SymbolSnapshot): string {
  switch (snapshot.kind) {
    case "interface":
    case "class":
      return renderClassOrInterface(snapshot);
    case "function":
      return snapshot.signature;
    case "typeAlias":
      return snapshot.signature;
    default:
      return snapshot.signature;
  }
}

/**
 * Render a class or interface snapshot.
 */
function renderClassOrInterface(snapshot: SymbolSnapshot): string {
  const lines: string[] = [snapshot.signature + " {"];

  if (snapshot.members) {
    for (const member of snapshot.members) {
      lines.push(`  ${member.signature};`);
    }
  }

  lines.push("}");
  return lines.join("\n");
}

// =============================================================================
// SNAPSHOT COMPARISON
// =============================================================================

/**
 * Check if two snapshots are equivalent.
 *
 * @param a - First snapshot
 * @param b - Second snapshot
 * @returns True if the snapshots represent the same interface
 */
export function snapshotsEqual(a: SymbolSnapshot, b: SymbolSnapshot): boolean {
  // Quick check on signature
  if (a.signature !== b.signature) return false;

  // Check members
  if (a.members?.length !== b.members?.length) return false;
  if (a.members && b.members) {
    for (let i = 0; i < a.members.length; i++) {
      if (!membersEqual(a.members[i], b.members[i])) return false;
    }
  }

  // Check params
  if (a.params?.length !== b.params?.length) return false;
  if (a.params && b.params) {
    for (let i = 0; i < a.params.length; i++) {
      if (!paramsEqual(a.params[i], b.params[i])) return false;
    }
  }

  // Check inheritance
  if (!arraysEqual(a.extends, b.extends)) return false;
  if (!arraysEqual(a.implements, b.implements)) return false;

  return true;
}

function membersEqual(a: MemberSnapshot, b: MemberSnapshot): boolean {
  return (
    a.name === b.name &&
    a.kind === b.kind &&
    a.signature === b.signature &&
    a.optional === b.optional &&
    a.readonly === b.readonly &&
    a.static === b.static &&
    a.visibility === b.visibility
  );
}

function paramsEqual(a: ParamSnapshot, b: ParamSnapshot): boolean {
  return (
    a.name === b.name && a.type === b.type && a.required === b.required && a.default === b.default
  );
}

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
