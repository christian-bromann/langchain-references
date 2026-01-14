/**
 * TypeDoc to IR Transformer
 *
 * Transforms TypeDoc JSON output into the normalized
 * Intermediate Representation (IR) format.
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import type { JSONOutput } from "typedoc";
import type {
  SymbolRecord,
  SymbolKind,
  Visibility,
  Stability,
  SymbolParam,
  SymbolReturns,
  SymbolDocs,
  SymbolSource,
  MemberReference,
  TypeReference,
} from "@langchain/ir-schema";

export type TypeDocReflection = JSONOutput.Reflection;
export type TypeDocProject = JSONOutput.ProjectReflection;
export type TypeDocComment = JSONOutput.Comment;
export type TypeDocType = JSONOutput.SomeType;

/**
 * TypeDoc reflection kind values.
 */
const ReflectionKind = {
  Project: 1,
  Module: 2,
  Namespace: 4,
  Enum: 8,
  EnumMember: 16,
  Variable: 32,
  Function: 64,
  Class: 128,
  Interface: 256,
  Constructor: 512,
  Property: 1024,
  Method: 2048,
  CallSignature: 4096,
  IndexSignature: 8192,
  ConstructorSignature: 16384,
  Parameter: 32768,
  TypeLiteral: 65536,
  TypeParameter: 131072,
  Accessor: 262144,
  GetSignature: 524288,
  SetSignature: 1048576,
  TypeAlias: 2097152,
  Reference: 4194304,
} as const;

/**
 * Cache for parsed source files to extract extends clauses via TypeScript AST.
 * Used when TypeDoc can't resolve external type names.
 */
const sourceFileCache = new Map<string, ts.SourceFile>();

/**
 * Parse a source file and extract extends/implements clauses for a symbol.
 * This is used as a fallback when TypeDoc returns "unknown" for external types.
 */
function getExtendsFromSource(
  filePath: string,
  symbolName: string,
  sourcePathPrefix: string,
  packagePath?: string
): { extends?: string[]; implements?: string[] } | null {
  // Try multiple path combinations to find the source file
  const pathsToTry: string[] = [];

  // Try with the source path prefix first
  if (sourcePathPrefix) {
    pathsToTry.push(path.join(sourcePathPrefix, filePath));
  }

  // Try with package path + src directory (common convention)
  if (packagePath) {
    pathsToTry.push(path.join(packagePath, "src", filePath));
    pathsToTry.push(path.join(packagePath, filePath));
  }

  // Try the file path as-is
  pathsToTry.push(filePath);

  let fullPath: string | null = null;
  for (const tryPath of pathsToTry) {
    try {
      fs.accessSync(tryPath);
      fullPath = tryPath;
      break;
    } catch {
      // Try next path
    }
  }

  if (!fullPath) {
    return null;
  }

  // Check cache first
  let sourceFile = sourceFileCache.get(fullPath);

  if (!sourceFile) {
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      sourceFile = ts.createSourceFile(fullPath, content, ts.ScriptTarget.Latest, true);
      sourceFileCache.set(fullPath, sourceFile);
    } catch {
      // File not found or not readable
      return null;
    }
  }

  // Find the symbol in the source file
  let result: { extends?: string[]; implements?: string[] } | null = null;

  const visit = (node: ts.Node) => {
    if (result) return; // Already found

    // Check for interface declarations
    if (ts.isInterfaceDeclaration(node) && node.name.text === symbolName) {
      const extendsTypes: string[] = [];
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            for (const type of clause.types) {
              extendsTypes.push(type.expression.getText(sourceFile));
            }
          }
        }
      }
      if (extendsTypes.length > 0) {
        result = { extends: extendsTypes };
      }
      return;
    }

    // Check for class declarations
    if (ts.isClassDeclaration(node) && node.name?.text === symbolName) {
      const extendsTypes: string[] = [];
      const implementsTypes: string[] = [];
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            for (const type of clause.types) {
              extendsTypes.push(type.expression.getText(sourceFile));
            }
          } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            for (const type of clause.types) {
              implementsTypes.push(type.expression.getText(sourceFile));
            }
          }
        }
      }
      if (extendsTypes.length > 0 || implementsTypes.length > 0) {
        result = {
          ...(extendsTypes.length > 0 && { extends: extendsTypes }),
          ...(implementsTypes.length > 0 && { implements: implementsTypes }),
        };
      }
      return;
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return result;
}

/**
 * Transformer for TypeDoc JSON to IR format.
 */
export class TypeDocTransformer {
  private project: TypeDocProject;
  private packageName: string;
  private packageId: string;
  private repo: string;
  private sha: string;
  private sourcePathPrefix: string;
  private packagePath: string;
  /** Package's relative path within the repo (e.g., "libs/langchain-core") */
  private packageRepoPath: string;
  private symbolIdMap: Map<number, string>;

  constructor(
    project: TypeDocProject,
    packageName: string,
    repo: string,
    sha: string,
    sourcePathPrefix?: string,
    packagePath?: string,
    /** Package's relative path within the repo (e.g., "libs/langchain-core") */
    packageRepoPath?: string
  ) {
    this.project = project;
    this.packageName = packageName;
    this.packageId = this.generatePackageId();
    this.repo = repo;
    this.sha = sha;
    // Normalize the prefix - ensure it ends with / if provided
    this.sourcePathPrefix = sourcePathPrefix
      ? sourcePathPrefix.replace(/\/?$/, "/")
      : "";
    this.packagePath = packagePath || "";
    // Normalize the package repo path - remove leading/trailing slashes
    this.packageRepoPath = (packageRepoPath || "").replace(/^\/|\/$/g, "");
    // Build a map from symbol IDs to their names for type resolution
    this.symbolIdMap = this.buildSymbolIdMap();
  }

  /**
   * Build a map from TypeDoc symbol IDs to their names.
   * This allows us to resolve type references to their original names.
   */
  private buildSymbolIdMap(): Map<number, string> {
    const idMap = new Map<number, string>();

    // TypeDoc includes symbolIdMap in the project for cross-references
    const projectAny = this.project as any;
    if (projectAny.symbolIdMap) {
      for (const [id, info] of Object.entries(projectAny.symbolIdMap)) {
        const numId = parseInt(id, 10);
        if (!isNaN(numId) && typeof (info as any)?.name === "string") {
          idMap.set(numId, (info as any).name);
        }
      }
    }

    // Also build from children recursively
    const addReflection = (reflection: TypeDocReflection) => {
      if (reflection.id !== undefined && reflection.name) {
        idMap.set(reflection.id, reflection.name);
      }
      if ("children" in reflection && reflection.children) {
        for (const child of reflection.children as TypeDocReflection[]) {
          addReflection(child);
        }
      }
    };

    if (this.project.children) {
      for (const child of this.project.children) {
        addReflection(child);
      }
    }

    return idMap;
  }

  /**
   * Generate a unique package ID.
   */
  private generatePackageId(): string {
    // Normalize package name (handle scoped packages)
    const normalized = this.packageName
      .replace(/^@/, "")
      .replace(/\//g, "_")
      .replace(/-/g, "_");
    return `pkg_js_${normalized}`;
  }

  /**
   * Transform the TypeDoc project to IR symbols.
   */
  transform(): SymbolRecord[] {
    const symbols: SymbolRecord[] = [];

    if (this.project.children) {
      for (const child of this.project.children) {
        symbols.push(...this.transformReflection(child, []));
      }
    }

    return symbols;
  }

  /**
   * Transform a single reflection and its children.
   */
  private transformReflection(
    reflection: TypeDocReflection,
    parentPath: string[]
  ): SymbolRecord[] {
    const symbols: SymbolRecord[] = [];
    const currentPath = [...parentPath, reflection.name];

    // Create symbol record for this reflection
    const symbol = this.createSymbolRecord(reflection, currentPath);
    if (symbol) {
      symbols.push(symbol);
    }

    // Process children
    if ("children" in reflection && reflection.children) {
      for (const child of reflection.children as TypeDocReflection[]) {
        symbols.push(...this.transformReflection(child, currentPath));
      }
    }

    return symbols;
  }

  /**
   * Create an IR symbol record from a TypeDoc reflection.
   */
  private createSymbolRecord(
    reflection: TypeDocReflection,
    path: string[]
  ): SymbolRecord | null {
    const kind = this.mapKind(reflection.kind);
    if (!kind) return null;

    const id = this.generateSymbolId(kind, path);
    const qualifiedName = path.join(".");

    const typeRefs = this.extractTypeRefs(reflection);

    return {
      id,
      packageId: this.packageId,
      language: "typescript",
      kind,
      name: reflection.name,
      qualifiedName,
      display: {
        name: reflection.name,
        qualified: qualifiedName,
      },
      signature: this.getSignature(reflection),
      docs: this.extractDocs(reflection),
      params: this.extractParams(reflection),
      returns: this.extractReturns(reflection),
      members: this.extractMembers(reflection),
      relations: this.extractRelations(reflection),
      source: this.extractSource(reflection),
      urls: {
        canonical: this.generateUrl(kind, path),
      },
      tags: this.extractTags(reflection),
      ...(typeRefs.length > 0 ? { typeRefs } : {}),
    };
  }

  /**
   * Map TypeDoc kind value to IR kind.
   */
  private mapKind(kindValue: number): SymbolKind | null {
    const kindMap: Record<number, SymbolKind> = {
      [ReflectionKind.Module]: "module",
      [ReflectionKind.Namespace]: "namespace",
      [ReflectionKind.Enum]: "enum",
      [ReflectionKind.EnumMember]: "enumMember",
      [ReflectionKind.Variable]: "variable",
      [ReflectionKind.Function]: "function",
      [ReflectionKind.Class]: "class",
      [ReflectionKind.Interface]: "interface",
      [ReflectionKind.Constructor]: "constructor",
      [ReflectionKind.Property]: "property",
      [ReflectionKind.Method]: "method",
      [ReflectionKind.Accessor]: "property",
      [ReflectionKind.TypeAlias]: "typeAlias",
      [ReflectionKind.Reference]: "namespace",
    };

    return kindMap[kindValue] || null;
  }

  /**
   * Generate a unique symbol ID.
   */
  private generateSymbolId(kind: SymbolKind, path: string[]): string {
    const pathStr = path.join("_").replace(/[^a-zA-Z0-9_]/g, "_");
    return `sym_ts_${kind}_${pathStr}`;
  }

  /**
   * Generate the canonical URL for a symbol.
   */
  private generateUrl(kind: SymbolKind, path: string[]): string {
    const packageSlug = this.packageName.replace(/^@/, "").replace(/\//g, "_");
    const symbolName = path[path.length - 1];

    switch (kind) {
      case "class":
        return `/javascript/${packageSlug}/classes/${symbolName}/`;
      case "interface":
        return `/javascript/${packageSlug}/interfaces/${symbolName}/`;
      case "function":
        return `/javascript/${packageSlug}/functions/${symbolName}/`;
      case "typeAlias":
        return `/javascript/${packageSlug}/types/${symbolName}/`;
      case "enum":
        return `/javascript/${packageSlug}/enums/${symbolName}/`;
      case "variable":
        return `/javascript/${packageSlug}/variables/${symbolName}/`;
      default:
        return `/javascript/${packageSlug}/${kind}s/${symbolName}/`;
    }
  }

  /**
   * Get the signature string for a reflection.
   */
  private getSignature(reflection: TypeDocReflection): string {
    // Handle function/method signatures
    if ("signatures" in reflection && Array.isArray(reflection.signatures) && reflection.signatures?.[0]) {
      const sig = reflection.signatures[0] as JSONOutput.SignatureReflection;
      const params = this.formatParams(sig);
      const returns = this.formatType(sig.type);
      const typeParams = this.formatTypeParams(sig);

      let signature = reflection.name;
      if (typeParams) signature += typeParams;
      signature += `(${params})`;
      if (returns !== "void") signature += `: ${returns}`;

      return signature;
    }

    // Handle accessor (getter) - TypeDoc puts getter info in getSignature, not signatures
    if ("getSignature" in reflection && reflection.getSignature) {
      const getSig = reflection.getSignature as JSONOutput.SignatureReflection;
      const returnType = this.formatType(getSig.type);
      return `${reflection.name}: ${returnType}`;
    }

    // Handle type/variable with type annotation
    if ("type" in reflection && reflection.type) {
      return `${reflection.name}: ${this.formatType(reflection.type as TypeDocType)}`;
    }

    // Handle class/interface
    if (reflection.kind === ReflectionKind.Class || reflection.kind === ReflectionKind.Interface) {
      const keyword = reflection.kind === ReflectionKind.Class ? "class" : "interface";
      return `${keyword} ${reflection.name}`;
    }

    return reflection.name;
  }

  /**
   * Format function parameters as string.
   */
  private formatParams(sig: JSONOutput.SignatureReflection): string {
    if (!sig.parameters) return "";

    return sig.parameters
      .map((p) => {
        const type = this.formatType(p.type);
        const optional = p.flags?.isOptional ? "?" : "";
        const defaultValue = p.defaultValue ? ` = ${p.defaultValue}` : "";
        return `${p.name}${optional}: ${type}${defaultValue}`;
      })
      .join(", ");
  }

  /**
   * Format type parameters as string.
   */
  private formatTypeParams(sig: JSONOutput.SignatureReflection): string {
    if (!sig.typeParameters || sig.typeParameters.length === 0) return "";

    const params = sig.typeParameters.map((tp) => {
      let str = tp.name;
      if (tp.type) str += ` extends ${this.formatType(tp.type)}`;
      if (tp.default) str += ` = ${this.formatType(tp.default)}`;
      return str;
    });

    return `<${params.join(", ")}>`;
  }

  /**
   * Format a type to string.
   */
  private formatType(type: TypeDocType | undefined): string {
    if (!type) return "unknown";

    switch (type.type) {
      case "intrinsic":
        return type.name;

      case "reference": {
        // Get the qualified name if available (for external types like OpenAIClient.Chat.X)
        const qualifiedName = (type as any).qualifiedName;
        // Get the package name for external types (e.g., "@langchain/google-gauth")
        const externalPackage = (type as any).package;
        // TypeDoc may include reflection info for unresolved types
        const reflection = (type as any).reflection;

        // Start with the type name
        let typeName = type.name;

        // Check if we can resolve by target ID (for type aliases that reference other types)
        const targetId = (type as any).target;
        if (typeof targetId === "number" && this.symbolIdMap.has(targetId)) {
          const resolvedName = this.symbolIdMap.get(targetId);
          if (resolvedName && resolvedName !== "__type") {
            typeName = resolvedName;
          }
        }

        // Check if we can resolve by direct ID
        const typeId = (type as any).id;
        if (typeof typeId === "number" && this.symbolIdMap.has(typeId)) {
          const resolvedName = this.symbolIdMap.get(typeId);
          if (resolvedName && resolvedName !== "__type") {
            typeName = resolvedName;
          }
        }

        // Handle Zod utility types - TypeDoc resolves these without type arguments
        // z.input<Schema> and z.output<Schema> become just "z.input" with no schema info
        // Show "object" as that's the most useful representation for developers
        if (qualifiedName === "z.input" || qualifiedName === "z.output" ||
            qualifiedName === "z.infer" || typeName === "input" || typeName === "output") {
          return "object";
        }

        // Only use qualified name when typeName is unhelpful (like "any")
        // Do NOT use dotted qualified names as they break tokenization
        // (e.g., "Runnable.CallOptions" would be split into "Runnable" and "CallOptions")
        if (qualifiedName && typeName === "any") {
          // For qualified names with dots, only use them if the type name is completely unhelpful
          // Otherwise prefer the simple type name for proper linking
          if (!qualifiedName.includes(".")) {
            typeName = qualifiedName;
          }
        }

        // Fall back to qualified name if type name is unhelpful
        if (!typeName || typeName === "input" || typeName === "output") {
          typeName = qualifiedName || type.name;
        }

        // For external types from other packages, try reflection name
        if ((!typeName || typeName === "unknown") && reflection?.name) {
          typeName = reflection.name;
        }

        // For unresolved external types, show package info if available
        // This helps developers understand where the type comes from
        if ((!typeName || typeName === "unknown") && externalPackage) {
          typeName = `${externalPackage}.<unresolved>`;
        }

        if (type.typeArguments && type.typeArguments.length > 0) {
          const args = type.typeArguments.map((t) => this.formatType(t)).join(", ");
          return `${typeName}<${args}>`;
        }
        return typeName || "unknown";
      }

      case "array":
        return `${this.formatType(type.elementType)}[]`;

      case "union":
        return type.types.map((t) => this.formatType(t)).join(" | ");

      case "intersection":
        return type.types.map((t) => this.formatType(t)).join(" & ");

      case "literal":
        if (type.value === null) return "null";
        if (typeof type.value === "string") return `"${type.value}"`;
        return String(type.value);

      case "tuple":
        if (type.elements) {
          return `[${type.elements.map((t) => this.formatType(t)).join(", ")}]`;
        }
        return "[]";

      case "query":
        return `typeof ${this.formatType(type.queryType)}`;

      case "typeOperator":
        return `${type.operator} ${this.formatType(type.target)}`;

      case "mapped":
        return `{ [${type.parameter} in ${this.formatType(type.parameterType)}]: ${this.formatType(type.templateType)} }`;

      case "conditional":
        return `${this.formatType(type.checkType)} extends ${this.formatType(type.extendsType)} ? ${this.formatType(type.trueType)} : ${this.formatType(type.falseType)}`;

      case "indexedAccess":
        return `${this.formatType(type.objectType)}[${this.formatType(type.indexType)}]`;

      case "reflection":
        if (type.declaration?.signatures?.[0]) {
          const sig = type.declaration.signatures[0];
          const params = this.formatParams(sig);
          const returns = this.formatType(sig.type);
          return `(${params}) => ${returns}`;
        }
        // Check if the reflection has a name property (for named object types)
        if (type.declaration?.name) {
          return type.declaration.name;
        }
        return "object";

      case "namedTupleMember":
        return this.formatType((type as any).element);

      case "templateLiteral":
        return "string";

      case "predicate":
        return `${(type as any).name} is ${this.formatType((type as any).targetType)}`;

      case "optional":
        return `${this.formatType((type as any).elementType)}?`;

      case "rest":
        return `...${this.formatType((type as any).elementType)}`;

      default:
        // Log unhandled types for debugging
        console.warn(`Unhandled type: ${type.type}`, JSON.stringify(type).slice(0, 200));
        // Try to extract a name if available
        if ("name" in type && typeof (type as any).name === "string") {
          return (type as any).name;
        }
        return "unknown";
    }
  }

  /**
   * Extract documentation from a reflection.
   * For functions/methods, also checks the signature for comments (where TypeDoc puts docs for overloaded functions).
   */
  private extractDocs(reflection: TypeDocReflection): SymbolDocs {
    // First try to get comment from the reflection itself
    let comment = "comment" in reflection ? reflection.comment as TypeDocComment : null;

    // For functions/methods, TypeDoc puts the comment on the signature, not the reflection
    // This is especially important for overloaded functions where the first overload has the docs
    if (!comment && "signatures" in reflection && Array.isArray(reflection.signatures)) {
      // Check all signatures for a comment (first one with a comment wins)
      for (const sig of reflection.signatures as JSONOutput.SignatureReflection[]) {
        if (sig.comment) {
          comment = sig.comment as TypeDocComment;
          break;
        }
      }
    }

    if (!comment) {
      return { summary: "" };
    }

    const docs: SymbolDocs = {
      summary: this.extractCommentText(comment.summary),
    };

    // Extract description from @remarks
    const remarks = comment.blockTags?.filter((t) => t.tag === "@remarks");
    if (remarks && remarks.length > 0) {
      docs.description = remarks.map((t) => this.extractCommentText(t.content)).join("\n\n");
    }

    // Extract examples
    const examples = comment.blockTags?.filter((t) => t.tag === "@example");
    if (examples && examples.length > 0) {
      docs.examples = examples.map((t) => this.parseExample(t.content));
    }

    // Check for deprecation
    const deprecated = comment.blockTags?.find((t) => t.tag === "@deprecated");
    if (deprecated) {
      docs.deprecated = {
        isDeprecated: true,
        message: this.extractCommentText(deprecated.content),
      };
    }

    return docs;
  }

  /**
   * Extract text from comment content.
   */
  private extractCommentText(content: JSONOutput.CommentDisplayPart[] | undefined): string {
    if (!content) return "";
    return content.map((p) => p.text).join("");
  }

  /**
   * Parse an @example block tag into title and code.
   * Examples can have a title before the code fence:
   *   @example Title here
   *   ```typescript
   *   code here
   *   ```
   */
  private parseExample(content: JSONOutput.CommentDisplayPart[] | undefined): {
    code: string;
    language: string;
    title?: string;
  } {
    const rawText = this.extractCommentText(content);

    // Match code fence with optional language: ```lang\ncode\n```
    const codeFenceRegex = /```(\w+)?\n?([\s\S]*?)```/;
    const match = rawText.match(codeFenceRegex);

    if (match) {
      const language = match[1] || "typescript";
      const code = match[2].trim();

      // Everything before the code fence is the title
      const beforeFence = rawText.substring(0, rawText.indexOf("```")).trim();

      return {
        code,
        language,
        title: beforeFence || undefined,
      };
    }

    // No code fence found - treat entire content as code
    return {
      code: rawText.trim(),
      language: "typescript",
    };
  }

  /**
   * Built-in types that should not be included in typeRefs (primitives, common JS types)
   */
  private static BUILTIN_TYPES = new Set([
    // Primitives
    "string", "number", "boolean", "undefined", "null", "void", "never", "unknown", "any", "object", "symbol", "bigint",
    // Common built-in types
    "Object", "String", "Number", "Boolean", "Array", "Function", "Symbol", "BigInt",
    "Date", "RegExp", "Error", "Map", "Set", "WeakMap", "WeakSet", "Promise",
    "ArrayBuffer", "DataView", "JSON", "Math", "Reflect", "Proxy",
    "Int8Array", "Uint8Array", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
    "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
    // TypeScript utility types
    "Record", "Partial", "Required", "Readonly", "Pick", "Omit", "Exclude", "Extract",
    "NonNullable", "ReturnType", "Parameters", "ConstructorParameters", "InstanceType", "Awaited",
    "ThisType", "Uppercase", "Lowercase", "Capitalize", "Uncapitalize",
    // Web APIs
    "URL", "URLSearchParams", "FormData", "Blob", "File", "Headers", "Request", "Response",
    "ReadableStream", "WritableStream", "AbortController", "AbortSignal",
  ]);

  /**
   * Extract type references from a reflection for cross-linking.
   * Collects all referenced types from parameters, return types, and base classes.
   */
  private extractTypeRefs(reflection: TypeDocReflection): TypeReference[] {
    const refs = new Map<string, TypeReference>();

    // Helper to add a type reference
    const addTypeRef = (type: TypeDocType | undefined) => {
      if (!type) return;
      this.collectTypeRefsFromType(type, refs);
    };

    // Extract from function signatures
    if ("signatures" in reflection && Array.isArray(reflection.signatures)) {
      for (const sig of reflection.signatures as JSONOutput.SignatureReflection[]) {
        // Parameters
        if (sig.parameters) {
          for (const param of sig.parameters) {
            addTypeRef(param.type);
          }
        }
        // Return type
        addTypeRef(sig.type);
        // Type parameters (generics)
        if (sig.typeParameters) {
          for (const tp of sig.typeParameters) {
            addTypeRef(tp.type);
            addTypeRef(tp.default);
          }
        }
      }
    }

    // Extract from type (for variables, type aliases, properties)
    if ("type" in reflection && reflection.type) {
      addTypeRef(reflection.type as TypeDocType);
    }

    // Extract from extended types
    if ("extendedTypes" in reflection && Array.isArray(reflection.extendedTypes)) {
      for (const ext of reflection.extendedTypes as TypeDocType[]) {
        addTypeRef(ext);
      }
    }

    // Extract from implemented types
    if ("implementedTypes" in reflection && Array.isArray(reflection.implementedTypes)) {
      for (const impl of reflection.implementedTypes as TypeDocType[]) {
        addTypeRef(impl);
      }
    }

    // Extract from type parameters on classes/interfaces
    if ("typeParameters" in reflection && Array.isArray(reflection.typeParameters)) {
      for (const tp of reflection.typeParameters as JSONOutput.TypeParameterReflection[]) {
        addTypeRef(tp.type);
        addTypeRef(tp.default);
      }
    }

    return Array.from(refs.values());
  }

  /**
   * Recursively collect type references from a TypeDoc type.
   */
  private collectTypeRefsFromType(
    type: TypeDocType,
    refs: Map<string, TypeReference>
  ): void {
    switch (type.type) {
      case "reference": {
        const name = type.name;
        // Skip built-in types
        if (TypeDocTransformer.BUILTIN_TYPES.has(name)) return;
        // Skip types that look like internal (__type, etc.)
        if (name.startsWith("__") || name.startsWith("_")) return;

        // Get qualified name and package info from TypeDoc
        const qualifiedName = (type as any).qualifiedName;
        const externalPackage = (type as any).package;

        const ref: TypeReference = { name };

        // Add qualified name if available
        if (qualifiedName && qualifiedName !== name) {
          ref.qualifiedName = qualifiedName;
        }

        // For external packages, include package info in qualifiedName
        if (externalPackage && !ref.qualifiedName) {
          ref.qualifiedName = `${externalPackage}.${name}`;
        }

        // Use name as key to avoid duplicates
        if (!refs.has(name)) {
          refs.set(name, ref);
        }

        // Recurse into type arguments
        if ("typeArguments" in type && Array.isArray(type.typeArguments)) {
          for (const arg of type.typeArguments as TypeDocType[]) {
            this.collectTypeRefsFromType(arg, refs);
          }
        }
        break;
      }

      case "union":
      case "intersection": {
        if ("types" in type && Array.isArray(type.types)) {
          for (const t of type.types as TypeDocType[]) {
            this.collectTypeRefsFromType(t, refs);
          }
        }
        break;
      }

      case "array": {
        if ("elementType" in type && type.elementType) {
          this.collectTypeRefsFromType(type.elementType as TypeDocType, refs);
        }
        break;
      }

      case "tuple": {
        if ("elements" in type && Array.isArray(type.elements)) {
          for (const el of type.elements as TypeDocType[]) {
            this.collectTypeRefsFromType(el, refs);
          }
        }
        break;
      }

      case "conditional": {
        const cond = type as any;
        if (cond.checkType) this.collectTypeRefsFromType(cond.checkType, refs);
        if (cond.extendsType) this.collectTypeRefsFromType(cond.extendsType, refs);
        if (cond.trueType) this.collectTypeRefsFromType(cond.trueType, refs);
        if (cond.falseType) this.collectTypeRefsFromType(cond.falseType, refs);
        break;
      }

      case "mapped": {
        const mapped = type as any;
        if (mapped.templateType) this.collectTypeRefsFromType(mapped.templateType, refs);
        if (mapped.nameType) this.collectTypeRefsFromType(mapped.nameType, refs);
        break;
      }

      case "indexedAccess": {
        const indexed = type as any;
        if (indexed.objectType) this.collectTypeRefsFromType(indexed.objectType, refs);
        if (indexed.indexType) this.collectTypeRefsFromType(indexed.indexType, refs);
        break;
      }

      case "typeOperator": {
        const typeOp = type as any;
        if (typeOp.target) this.collectTypeRefsFromType(typeOp.target, refs);
        break;
      }

      case "reflection": {
        // Handle inline type literals
        const refl = type as any;
        if (refl.declaration?.signatures) {
          for (const sig of refl.declaration.signatures) {
            if (sig.parameters) {
              for (const param of sig.parameters) {
                if (param.type) this.collectTypeRefsFromType(param.type, refs);
              }
            }
            if (sig.type) this.collectTypeRefsFromType(sig.type, refs);
          }
        }
        if (refl.declaration?.children) {
          for (const child of refl.declaration.children) {
            if (child.type) this.collectTypeRefsFromType(child.type, refs);
          }
        }
        break;
      }

      // Intrinsic types (string, number, etc.) are skipped
      case "intrinsic":
      case "literal":
      case "templateLiteral":
      case "predicate":
      case "query":
      case "inferred":
      case "optional":
      case "rest":
      case "unknown":
        break;

      default:
        // Unknown type (including named-tuple-member), skip
        break;
    }
  }

  /**
   * Extract parameters from a reflection.
   */
  private extractParams(reflection: TypeDocReflection): SymbolParam[] | undefined {
    if (!("signatures" in reflection) || !Array.isArray(reflection.signatures) || !reflection.signatures?.[0]) {
      return undefined;
    }

    const sig = reflection.signatures[0] as JSONOutput.SignatureReflection;
    if (!sig.parameters) return undefined;

    return sig.parameters.map((p) => ({
      name: p.name,
      type: this.formatType(p.type),
      description: p.comment ? this.extractCommentText(p.comment.summary) : undefined,
      default: p.defaultValue,
      required: !p.flags?.isOptional && !p.defaultValue,
    }));
  }

  /**
   * Extract return type from a reflection.
   */
  private extractReturns(reflection: TypeDocReflection): SymbolReturns | undefined {
    if (!("signatures" in reflection) || !Array.isArray(reflection.signatures) || !reflection.signatures?.[0]) {
      return undefined;
    }

    const sig = reflection.signatures[0] as JSONOutput.SignatureReflection;
    if (!sig.type) return undefined;

    const returnComment = sig.comment?.blockTags?.find((t) => t.tag === "@returns");

    return {
      type: this.formatType(sig.type),
      description: returnComment ? this.extractCommentText(returnComment.content) : undefined,
    };
  }

  /**
   * Extract member references from a class/interface/module.
   */
  private extractMembers(reflection: TypeDocReflection): MemberReference[] | undefined {
    if (!("children" in reflection) || !reflection.children) {
      return undefined;
    }

    // For modules and namespaces, include all exported symbols (classes, functions, types, etc.)
    // For classes/interfaces, include methods, properties, and constructors
    const isModuleOrNamespace = reflection.kind === ReflectionKind.Module ||
      reflection.kind === ReflectionKind.Namespace ||
      reflection.kind === ReflectionKind.Reference;
    const allowedKinds = isModuleOrNamespace
      ? ["class", "function", "interface", "typeAlias", "enum", "variable", "method", "property", "constructor", "namespace"]
      : ["method", "property", "constructor"];

    return (reflection.children as TypeDocReflection[])
      .filter((child) => {
        const kind = this.mapKind(child.kind);
        return kind && allowedKinds.includes(kind);
      })
      .map((child) => {
        const kind = this.mapKind(child.kind) || "property";
        return {
          name: child.name,
          refId: this.generateSymbolId(kind, [reflection.name, child.name]),
          kind,
          visibility: this.getVisibility(child),
        };
      });
  }

  /**
   * Extract class/interface relations.
   * Uses TypeScript AST as fallback when TypeDoc can't resolve external types.
   */
  private extractRelations(reflection: TypeDocReflection): { extends?: string[]; implements?: string[] } | undefined {
    const relations: { extends?: string[]; implements?: string[] } = {};

    if ("extendedTypes" in reflection && reflection.extendedTypes) {
      relations.extends = (reflection.extendedTypes as TypeDocType[]).map((t) => this.formatType(t));
    }

    if ("implementedTypes" in reflection && reflection.implementedTypes) {
      relations.implements = (reflection.implementedTypes as TypeDocType[]).map((t) => this.formatType(t));
    }

    // If TypeDoc returned "unknown" for extends/implements, try to resolve from source using TS AST
    // Check for "unknown", "unknown<...>" (with type params), or "<unresolved>"
    const isUnknownType = (t: string) => t === "unknown" || t.startsWith("unknown<") || t.includes("<unresolved>");
    const hasUnknownExtends = relations.extends?.some(isUnknownType);
    const hasUnknownImplements = relations.implements?.some(isUnknownType);

    if (hasUnknownExtends || hasUnknownImplements) {
      // Get source file path from reflection
      const sources = "sources" in reflection ? reflection.sources : null;
      if (sources && Array.isArray(sources) && sources.length > 0) {
        const sourceFile = sources[0].fileName;
        const astRelations = getExtendsFromSource(sourceFile, reflection.name, this.sourcePathPrefix, this.packagePath);

        if (astRelations) {
          // Replace "unknown" entries with actual type names from AST
          if (hasUnknownExtends && astRelations.extends) {
            relations.extends = astRelations.extends;
          }
          if (hasUnknownImplements && astRelations.implements) {
            relations.implements = astRelations.implements;
          }
        }
      }
    }

    return relations.extends || relations.implements ? relations : undefined;
  }

  /**
   * Extract source location.
   */
  private extractSource(reflection: TypeDocReflection): SymbolSource {
    const sources = "sources" in reflection ? reflection.sources : null;

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return {
        repo: this.repo,
        sha: this.sha,
        path: "",
        line: 0,
      };
    }

    const source = sources[0];
    // Strip the cache/extraction path prefix from file paths
    // TypeDoc includes the full path from extraction, but we only want the repo-relative path
    let filePath = source.fileName;

    // Handle absolute paths - strip the extraction prefix
    if (this.sourcePathPrefix && filePath.startsWith(this.sourcePathPrefix)) {
      filePath = filePath.slice(this.sourcePathPrefix.length);
    }

    // Strip everything up to and including /extracted/ from the path
    // This handles both absolute and relative paths that go through the build cache
    const extractedIdx = filePath.indexOf("/extracted/");
    if (extractedIdx !== -1) {
      filePath = filePath.slice(extractedIdx + "/extracted/".length);
    }

    // If we have a package repo path (e.g., "libs/providers/langchain-openai"),
    // check if the path has a duplicated prefix. This happens when TypeDoc reports
    // paths relative to the extraction root, resulting in patterns like:
    // libs/providers/langchain-openai/libs/providers/langchain-openai/src/...
    // We want to normalize this to just: libs/providers/langchain-openai/src/...
    if (this.packageRepoPath) {
      const pkgPathWithSlash = this.packageRepoPath.replace(/^\/|\/$/g, "") + "/";
      // Check if path starts with the package path and then repeats it
      if (filePath.startsWith(pkgPathWithSlash)) {
        const afterPkgPath = filePath.slice(pkgPathWithSlash.length);
        // If what remains still starts with the package path, we have duplication
        if (afterPkgPath.startsWith(pkgPathWithSlash) || afterPkgPath.startsWith(this.packageRepoPath)) {
          // Remove the first occurrence, keep the second (which includes the actual file path)
          filePath = afterPkgPath;
        }
      }
    }

    // Ensure the path doesn't start with ../ or /
    if (filePath.startsWith("../") || filePath.startsWith("/")) {
      // Try to find src/ in the path and extract from there
      const srcMatch = filePath.match(/\/src\/(.+)$/);
      if (srcMatch) {
        filePath = `src/${srcMatch[1]}`;
      }
    }

    // Clean up any leading ./ or /
    filePath = filePath.replace(/^[./]+/, "");

    // If the path still contains node_modules, it's an external dependency
    // We can't link to it in the project repo, so clear the source reference
    if (filePath.includes("node_modules/")) {
      return {
        repo: this.repo,
        sha: this.sha,
        path: "",
        line: 0,
      };
    }

    // If we have a package repo path and the path doesn't already start with it,
    // prepend it to ensure the source URL correctly points to the file in the monorepo
    if (this.packageRepoPath && !filePath.startsWith(this.packageRepoPath)) {
      filePath = `${this.packageRepoPath}/${filePath}`;
    }

    return {
      repo: this.repo,
      sha: this.sha,
      path: filePath,
      line: source.line,
    };
  }

  /**
   * Extract metadata tags.
   */
  private extractTags(reflection: TypeDocReflection): {
    stability: Stability;
    visibility: Visibility;
    isAsync?: boolean;
    isAbstract?: boolean;
    isStatic?: boolean;
  } {
    const flags = "flags" in reflection ? reflection.flags : {};
    const comment = "comment" in reflection ? reflection.comment as TypeDocComment : null;

    // Determine stability
    let stability: Stability = "stable";
    if (comment?.blockTags?.some((t) => t.tag === "@deprecated")) {
      stability = "deprecated";
    } else if (comment?.blockTags?.some((t) => t.tag === "@experimental")) {
      stability = "experimental";
    } else if (comment?.blockTags?.some((t) => t.tag === "@beta")) {
      stability = "beta";
    }

    return {
      stability,
      visibility: this.getVisibility(reflection),
      // @ts-ignore
      isAsync: flags.isAsync,
      isAbstract: flags.isAbstract,
      isStatic: flags.isStatic,
    };
  }

  /**
   * Get visibility from reflection flags.
   */
  private getVisibility(reflection: TypeDocReflection): Visibility {
    const flags = "flags" in reflection ? reflection.flags : {};

    if (flags.isPrivate) return "private";
    if (flags.isProtected) return "protected";
    return "public";
  }
}

