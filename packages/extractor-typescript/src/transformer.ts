/**
 * TypeDoc to IR Transformer
 *
 * Transforms TypeDoc JSON output into the normalized
 * Intermediate Representation (IR) format.
 */

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
} from "@langchain/ir-schema";

type TypeDocReflection = JSONOutput.Reflection;
type TypeDocProject = JSONOutput.ProjectReflection;
type TypeDocComment = JSONOutput.Comment;
type TypeDocType = JSONOutput.SomeType;

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
 * Transformer for TypeDoc JSON to IR format.
 */
export class TypeDocTransformer {
  private project: TypeDocProject;
  private packageName: string;
  private packageId: string;
  private repo: string;
  private sha: string;
  private sourcePathPrefix: string;

  constructor(
    project: TypeDocProject,
    packageName: string,
    repo: string,
    sha: string,
    sourcePathPrefix?: string
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

      case "reference":
        if (type.typeArguments && type.typeArguments.length > 0) {
          const args = type.typeArguments.map((t) => this.formatType(t)).join(", ");
          return `${type.name}<${args}>`;
        }
        return type.name;

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
        return "object";

      default:
        return "unknown";
    }
  }

  /**
   * Extract documentation from a reflection.
   */
  private extractDocs(reflection: TypeDocReflection): SymbolDocs {
    const comment = "comment" in reflection ? reflection.comment as TypeDocComment : null;

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
      docs.examples = examples.map((t) => ({
        code: this.extractCommentText(t.content),
        language: "typescript",
      }));
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
   * Extract member references from a class/interface.
   */
  private extractMembers(reflection: TypeDocReflection): MemberReference[] | undefined {
    if (!("children" in reflection) || !reflection.children) {
      return undefined;
    }

    return (reflection.children as TypeDocReflection[])
      .filter((child) => {
        const kind = this.mapKind(child.kind);
        return kind && ["method", "property", "constructor"].includes(kind);
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
   */
  private extractRelations(reflection: TypeDocReflection): { extends?: string[]; implements?: string[] } | undefined {
    const relations: { extends?: string[]; implements?: string[] } = {};

    if ("extendedTypes" in reflection && reflection.extendedTypes) {
      relations.extends = (reflection.extendedTypes as TypeDocType[]).map((t) => this.formatType(t));
    }

    if ("implementedTypes" in reflection && reflection.implementedTypes) {
      relations.implements = (reflection.implementedTypes as TypeDocType[]).map((t) => this.formatType(t));
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
    if (this.sourcePathPrefix && filePath.startsWith(this.sourcePathPrefix)) {
      filePath = filePath.slice(this.sourcePathPrefix.length);
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

