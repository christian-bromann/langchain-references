/**
 * Java IR Transformer
 *
 * Transforms parsed Java types to IR format.
 */

import type {
  JavaType,
  JavaMethod,
  JavaField,
  JavaConstructor,
  JavaParameter,
  ExtractionResult,
} from "./extractor.js";
import type { JavaExtractorConfig } from "./config.js";
import type {
  SymbolRecord,
  SymbolKind,
  SymbolSource,
  SymbolParam,
  SymbolDocs,
  MemberReference,
  TypeParam,
} from "@langchain/ir-schema";

/**
 * Transforms Java extraction result to IR symbols.
 */
export class JavaTransformer {
  private result: ExtractionResult;
  private config: JavaExtractorConfig;
  private packageId: string;

  constructor(result: ExtractionResult, config: JavaExtractorConfig) {
    this.result = result;
    this.config = config;
    this.packageId = `pkg_java_${config.packageName.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  /**
   * Transform all types to IR symbols.
   * Also emits methods, constructors as separate top-level symbols so they have their own pages.
   */
  transform(): SymbolRecord[] {
    const symbols: SymbolRecord[] = [];

    for (const type of this.result.types) {
      const symbol = this.transformType(type);
      symbols.push(symbol);

      // Also emit methods as separate top-level symbols
      for (const method of type.methods) {
        const methodSymbol = this.transformMethodAsSymbol(method, type);
        symbols.push(methodSymbol);
      }

      // Also emit constructors as separate top-level symbols
      for (const ctor of type.constructors) {
        const ctorSymbol = this.transformConstructorAsSymbol(ctor, type);
        symbols.push(ctorSymbol);
      }
    }

    // Deduplicate by ID, preferring symbols with source file info
    const symbolMap = new Map<string, SymbolRecord>();
    for (const symbol of symbols) {
      const existing = symbolMap.get(symbol.id);
      if (!existing) {
        symbolMap.set(symbol.id, symbol);
      } else if (!existing.source?.path && symbol.source?.path) {
        // Prefer the one with source path info
        symbolMap.set(symbol.id, symbol);
      }
    }

    return Array.from(symbolMap.values());
  }

  /**
   * Transform a Java type to an IR symbol.
   */
  private transformType(type: JavaType): SymbolRecord {
    const qualifiedName = type.packageName ? `${type.packageName}.${type.name}` : type.name;

    const members: MemberReference[] = [];

    // Add constructors
    for (const ctor of type.constructors) {
      members.push(this.transformConstructor(ctor, type));
    }

    // Add methods
    for (const method of type.methods) {
      members.push(this.transformMethod(method, type));
    }

    // Add fields
    for (const field of type.fields) {
      members.push(this.transformField(field, type));
    }

    // Determine visibility from modifiers
    const isPublic = type.modifiers.includes("public");
    const visibility = isPublic ? "public" : "private";

    // Use qualified name for ID to ensure uniqueness across packages
    const symbolId = qualifiedName.replace(/\./g, "_");

    const symbol: SymbolRecord = {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: type.name,
      qualifiedName,
      kind: this.mapKind(type.kind),
      language: "java",
      display: {
        name: type.name,
        qualified: qualifiedName,
      },
      signature: this.buildTypeSignature(type),
      docs: this.buildDocs(type.javadoc),
      typeParams: type.typeParameters.map(
        (tp): TypeParam => ({
          name: tp.name,
          constraint: tp.bounds,
        }),
      ),
      members,
      source: this.buildSourceLocation(type.sourceFile, type.startLine),
      urls: {
        canonical: `/${qualifiedName.replace(/\./g, "/")}`,
      },
      tags: {
        stability: "stable",
        visibility,
      },
    };

    return symbol;
  }

  /**
   * Build a consistent symbol ID for a member.
   * This ID must match the ID used for top-level method/constructor symbols
   * so that member lookups work correctly.
   */
  private buildMemberSymbolId(type: JavaType, memberName: string): string {
    const parentQualifiedName = type.packageName ? `${type.packageName}.${type.name}` : type.name;
    const qualifiedName = `${parentQualifiedName}.${memberName}`;
    const symbolId = qualifiedName.replace(/\./g, "_");
    return `${this.packageId}:${symbolId}`;
  }

  /**
   * Transform a constructor to a member reference.
   */
  private transformConstructor(ctor: JavaConstructor, type: JavaType): MemberReference {
    const isPublic = ctor.modifiers.includes("public");
    const visibility = isPublic ? "public" : "private";

    return {
      name: type.name,
      refId: this.buildMemberSymbolId(type, type.name),
      kind: "constructor",
      visibility,
    };
  }

  /**
   * Transform a method to a member reference.
   */
  private transformMethod(method: JavaMethod, type: JavaType): MemberReference {
    const isPublic = method.modifiers.includes("public");
    const visibility = isPublic ? "public" : "private";

    return {
      name: method.name,
      refId: this.buildMemberSymbolId(type, method.name),
      kind: "method",
      visibility,
    };
  }

  /**
   * Transform a field to a member reference.
   */
  private transformField(field: JavaField, type: JavaType): MemberReference {
    const isPublic = field.modifiers.includes("public");
    const visibility = isPublic ? "public" : "private";

    return {
      name: field.name,
      refId: this.buildMemberSymbolId(type, field.name),
      kind: "property",
      visibility,
      type: field.type,
    };
  }

  /**
   * Transform a method to a top-level symbol (for dedicated page).
   */
  private transformMethodAsSymbol(method: JavaMethod, type: JavaType): SymbolRecord {
    const parentQualifiedName = type.packageName ? `${type.packageName}.${type.name}` : type.name;
    const qualifiedName = `${parentQualifiedName}.${method.name}`;
    const symbolId = qualifiedName.replace(/\./g, "_");

    const isPublic = method.modifiers.includes("public");
    const visibility = isPublic ? "public" : "private";

    return {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: method.name,
      qualifiedName,
      kind: "method",
      language: "java",
      display: {
        name: method.name,
        qualified: qualifiedName,
      },
      signature: this.buildMethodSignature(method),
      docs: this.buildDocs(method.javadoc),
      params: method.parameters.map((p) => this.transformParameter(p, method.javadoc)),
      returns: {
        type: method.returnType,
        description: this.extractReturnDescription(method.javadoc),
      },
      source: this.buildSourceLocation(type.sourceFile, method.startLine),
      urls: {
        canonical: `/${qualifiedName.replace(/\./g, "/")}`,
      },
      tags: {
        stability: "stable",
        visibility,
      },
    };
  }

  /**
   * Transform a constructor to a top-level symbol (for dedicated page).
   */
  private transformConstructorAsSymbol(ctor: JavaConstructor, type: JavaType): SymbolRecord {
    const parentQualifiedName = type.packageName ? `${type.packageName}.${type.name}` : type.name;
    const qualifiedName = `${parentQualifiedName}.${type.name}`;
    const symbolId = qualifiedName.replace(/\./g, "_");

    const isPublic = ctor.modifiers.includes("public");
    const visibility = isPublic ? "public" : "private";

    return {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: type.name,
      qualifiedName,
      kind: "constructor",
      language: "java",
      display: {
        name: type.name,
        qualified: qualifiedName,
      },
      signature: this.buildConstructorSignature(ctor, type),
      docs: this.buildDocs(ctor.javadoc),
      params: ctor.parameters.map((p) => this.transformParameter(p, ctor.javadoc)),
      source: this.buildSourceLocation(type.sourceFile, ctor.startLine),
      urls: {
        canonical: `/${qualifiedName.replace(/\./g, "/")}`,
      },
      tags: {
        stability: "stable",
        visibility,
      },
    };
  }

  /**
   * Transform a parameter.
   */
  private transformParameter(param: JavaParameter, javadoc?: string): SymbolParam {
    return {
      name: param.name,
      type: param.type,
      description: this.extractParamDescription(param.name, javadoc),
      required: true,
    };
  }

  /**
   * Map Java kind to IR kind.
   */
  private mapKind(kind: string): SymbolKind {
    switch (kind) {
      case "class":
      case "record":
        return "class";
      case "interface":
        return "interface";
      case "enum":
        return "enum";
      case "annotation":
        return "typeAlias";
      default:
        return "class";
    }
  }

  /**
   * Build type signature.
   */
  private buildTypeSignature(type: JavaType): string {
    const parts: string[] = [];

    // Modifiers
    if (type.modifiers.length > 0) {
      parts.push(type.modifiers.join(" "));
    }

    // Kind
    parts.push(type.kind === "annotation" ? "@interface" : type.kind);

    // Name with type parameters
    let name = type.name;
    if (type.typeParameters.length > 0) {
      const params = type.typeParameters
        .map((tp) => (tp.bounds ? `${tp.name} extends ${tp.bounds}` : tp.name))
        .join(", ");
      name += `<${params}>`;
    }
    parts.push(name);

    // Extends
    if (type.extends) {
      parts.push(`extends ${type.extends}`);
    }

    // Implements
    if (type.implements.length > 0) {
      parts.push(`implements ${type.implements.join(", ")}`);
    }

    return parts.join(" ");
  }

  /**
   * Build method signature.
   */
  private buildMethodSignature(method: JavaMethod): string {
    const parts: string[] = [];

    // Modifiers
    if (method.modifiers.length > 0) {
      parts.push(method.modifiers.join(" "));
    }

    // Return type
    parts.push(method.returnType);

    // Name and parameters
    const params = method.parameters.map((p) => `${p.type} ${p.name}`).join(", ");
    parts.push(`${method.name}(${params})`);

    // Throws
    if (method.throws.length > 0) {
      parts.push(`throws ${method.throws.join(", ")}`);
    }

    return parts.join(" ");
  }

  /**
   * Build constructor signature.
   */
  private buildConstructorSignature(ctor: JavaConstructor, type: JavaType): string {
    const parts: string[] = [];

    // Modifiers
    if (ctor.modifiers.length > 0) {
      parts.push(ctor.modifiers.join(" "));
    }

    // Name and parameters
    const params = ctor.parameters.map((p) => `${p.type} ${p.name}`).join(", ");
    parts.push(`${type.name}(${params})`);

    // Throws
    if (ctor.throws.length > 0) {
      parts.push(`throws ${ctor.throws.join(", ")}`);
    }

    return parts.join(" ");
  }

  /**
   * Build field signature.
   */
  private buildFieldSignature(field: JavaField): string {
    const parts: string[] = [];

    if (field.modifiers.length > 0) {
      parts.push(field.modifiers.join(" "));
    }

    parts.push(field.type);
    parts.push(field.name);

    return parts.join(" ");
  }

  /**
   * Build the docs object for a symbol.
   */
  private buildDocs(javadoc?: string): SymbolDocs {
    if (!javadoc) {
      return { summary: "" };
    }

    const summary = this.extractSummary(javadoc) || "";
    const description = this.javadocToMarkdown(javadoc);

    const docs: SymbolDocs = {
      summary,
    };

    // Add description if it's different from summary
    if (description && description !== summary) {
      docs.description = description;
    }

    return docs;
  }

  /**
   * Extract summary (first sentence) from Javadoc.
   */
  private extractSummary(javadoc?: string): string | undefined {
    if (!javadoc) return undefined;

    // Remove tags
    const withoutTags = javadoc.replace(/@\w+.*$/gm, "").trim();

    // Get first sentence
    const firstSentence = withoutTags.split(/[.!?]\s/)[0];
    if (firstSentence) {
      return this.javadocToMarkdown(firstSentence + ".");
    }

    return undefined;
  }

  /**
   * Convert Javadoc to Markdown.
   */
  private javadocToMarkdown(javadoc?: string): string | undefined {
    if (!javadoc) return undefined;

    return (
      javadoc
        // Convert {@code ...} to backticks
        .replace(/\{@code\s+([^}]+)\}/g, "`$1`")
        // Convert {@link ...} to backticks
        .replace(/\{@link\s+([^}]+)\}/g, "`$1`")
        // Convert {@literal ...} to plain text
        .replace(/\{@literal\s+([^}]+)\}/g, "$1")
        // Convert @param <T> tags (type parameters) to markdown list
        .replace(/@param\s+<(\w+)>\s+(.+)/g, "- **$1**: $2")
        // Convert @param tags to markdown list
        .replace(/@param\s+(\w+)\s+(.+)/g, "- **$1**: $2")
        // Convert @return to Returns section
        .replace(/@return\s+(.+)/g, "**Returns:** $1")
        // Convert @throws to markdown list
        .replace(/@throws\s+(\w+)\s+(.+)/g, "- Throws `$1`: $2")
        // Convert @exception to markdown list
        .replace(/@exception\s+(\w+)\s+(.+)/g, "- Throws `$1`: $2")
        // Convert @deprecated to warning
        .replace(/@deprecated\s+(.+)/g, "**Deprecated:** $1")
        // Remove @since, @author, @version, @see
        .replace(/@(since|author|version|see)\s+.*/g, "")
        // Convert <p> to newlines
        .replace(/<p>/gi, "\n\n")
        // Convert <br> to newlines
        .replace(/<br\s*\/?>/gi, "\n")
        // Convert <code> to backticks
        .replace(/<code>([^<]+)<\/code>/gi, "`$1`")
        // Convert <pre> to code blocks
        .replace(/<pre>([^<]+)<\/pre>/gi, "\n```\n$1\n```\n")
        // Convert <b> and <strong> to bold
        .replace(/<(b|strong)>([^<]+)<\/\1>/gi, "**$2**")
        // Convert <i> and <em> to italic
        .replace(/<(i|em)>([^<]+)<\/\1>/gi, "*$2*")
        // Convert <ul>/<li> to markdown list
        .replace(/<ul>\s*/gi, "\n")
        .replace(/<\/ul>\s*/gi, "\n")
        .replace(/<li>\s*/gi, "- ")
        .replace(/<\/li>\s*/gi, "\n")
        // Remove other HTML tags
        .replace(/<[^>]+>/g, "")
        // Clean up extra whitespace
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  }

  /**
   * Extract @param description from Javadoc.
   */
  private extractParamDescription(paramName: string, javadoc?: string): string | undefined {
    if (!javadoc) return undefined;

    const match = javadoc.match(new RegExp(`@param\\s+${paramName}\\s+(.+?)(?=@|$)`, "s"));
    if (match) {
      return this.javadocToMarkdown(match[1].trim());
    }

    return undefined;
  }

  /**
   * Extract @return description from Javadoc.
   */
  private extractReturnDescription(javadoc?: string): string | undefined {
    if (!javadoc) return undefined;

    const match = javadoc.match(/@return\s+(.+?)(?=@|$)/s);
    if (match) {
      return this.javadocToMarkdown(match[1].trim());
    }

    return undefined;
  }

  /**
   * Build GitHub source URL.
   */
  private buildSourceUrl(file: string, line: number): string {
    if (!this.config.repo || !this.config.sha) {
      return "";
    }

    return `https://github.com/${this.config.repo}/blob/${this.config.sha}/${file}#L${line}`;
  }

  /**
   * Build a complete source location object.
   */
  private buildSourceLocation(file: string, line: number): SymbolSource {
    return {
      repo: this.config.repo,
      sha: this.config.sha,
      path: file,
      line,
    };
  }
}
