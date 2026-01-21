/**
 * Go IR Transformer
 *
 * Transforms parsed Go types to IR format.
 */

import type {
  GoType,
  GoMethod,
  GoField,
  GoConst,
  GoParameter,
  ExtractionResult,
} from "./extractor.js";
import type { GoExtractorConfig } from "./config.js";
import type {
  SymbolRecord,
  SymbolKind,
  SymbolSource,
  SymbolParam,
  SymbolDocs,
  MemberReference,
} from "@langchain/ir-schema";

/**
 * Transforms Go extraction result to IR symbols.
 */
export class GoTransformer {
  private result: ExtractionResult;
  private config: GoExtractorConfig;
  private packageId: string;

  constructor(result: ExtractionResult, config: GoExtractorConfig) {
    this.result = result;
    this.config = config;
    this.packageId = `pkg_go_${config.packageName.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  /**
   * Transform all types, functions, and constants to IR symbols.
   * Also emits methods as separate top-level symbols so they have their own pages.
   */
  transform(): SymbolRecord[] {
    const symbols: SymbolRecord[] = [];

    // Transform types (structs, interfaces)
    for (const type of this.result.types) {
      symbols.push(this.transformType(type));

      // Also emit methods as separate top-level symbols
      for (const method of type.methods) {
        symbols.push(this.transformMethodAsSymbol(method, type));
      }
    }

    // Transform top-level functions
    for (const func of this.result.functions) {
      symbols.push(this.transformFunction(func));
    }

    // Transform constants and variables
    for (const constant of this.result.constants) {
      symbols.push(this.transformConstant(constant));
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
   * Transform a Go type to an IR symbol.
   */
  private transformType(type: GoType): SymbolRecord {
    // For Go, use just the symbol name as the qualified name
    // The module path is implicit from the package context
    const qualifiedName = type.name;

    const members: MemberReference[] = [];

    // Add methods
    for (const method of type.methods) {
      members.push(this.transformMethod(method, type));
    }

    // Add fields for structs
    for (const field of type.fields) {
      members.push(this.transformField(field, type));
    }

    // In Go, exported symbols start with uppercase letter
    const isExported = /^[A-Z]/.test(type.name);
    const visibility = isExported ? "public" : "private";

    // Use qualified name for ID to ensure uniqueness across packages
    const symbolId = qualifiedName.replace(/\./g, "_");

    const symbol: SymbolRecord = {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: type.name,
      qualifiedName,
      kind: this.mapKind(type.kind),
      language: "go",
      display: {
        name: type.name,
        qualified: qualifiedName,
      },
      signature: type.signature,
      docs: this.buildDocs(type.doc),
      members,
      source: this.buildSourceLocation(type.sourceFile, type.startLine),
      urls: {
        canonical: `/${qualifiedName}`,
      },
      tags: {
        stability: "stable",
        visibility,
      },
    };

    return symbol;
  }

  /**
   * Transform a Go function to an IR symbol.
   */
  private transformFunction(func: GoMethod): SymbolRecord {
    // For Go, use just the symbol name as the qualified name
    // The module path is implicit from the package context
    const qualifiedName = func.name;

    // In Go, exported symbols start with uppercase letter
    const isExported = /^[A-Z]/.test(func.name);
    const visibility = isExported ? "public" : "private";

    // Use qualified name for ID to ensure uniqueness across packages
    const symbolId = qualifiedName.replace(/\./g, "_");

    const symbol: SymbolRecord = {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: func.name,
      qualifiedName,
      kind: "function",
      language: "go",
      display: {
        name: func.name,
        qualified: qualifiedName,
      },
      signature: func.signature,
      docs: this.buildDocs(func.doc),
      params: func.parameters.map((p) => this.transformParameter(p)),
      returns: func.returns ? { type: func.returns } : undefined,
      source: this.buildSourceLocation("", func.startLine),
      urls: {
        canonical: `/${qualifiedName}`,
      },
      tags: {
        stability: "stable",
        visibility,
      },
    };

    return symbol;
  }

  /**
   * Transform a constant/variable to an IR symbol.
   */
  private transformConstant(constant: GoConst): SymbolRecord {
    // For Go, use just the symbol name as the qualified name
    // The module path is implicit from the package context
    const qualifiedName = constant.name;

    const signature = constant.type
      ? `${constant.kind} ${constant.name} ${constant.type}`
      : `${constant.kind} ${constant.name}`;

    // In Go, exported symbols start with uppercase letter
    const isExported = /^[A-Z]/.test(constant.name);
    const visibility = isExported ? "public" : "private";

    // Use qualified name for ID to ensure uniqueness across packages
    const symbolId = qualifiedName.replace(/\./g, "_");

    const symbol: SymbolRecord = {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: constant.name,
      qualifiedName,
      kind: "variable",
      language: "go",
      display: {
        name: constant.name,
        qualified: qualifiedName,
      },
      signature,
      docs: this.buildDocs(constant.doc),
      source: this.buildSourceLocation(constant.sourceFile, constant.startLine),
      urls: {
        canonical: `/${qualifiedName}`,
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
   * This ID must match the ID used for top-level method symbols
   * so that member lookups work correctly.
   */
  private buildMemberSymbolId(typeName: string, memberName: string): string {
    const qualifiedName = `${typeName}.${memberName}`;
    const symbolId = qualifiedName.replace(/\./g, "_");
    return `${this.packageId}:${symbolId}`;
  }

  /**
   * Transform a method to a member reference.
   */
  private transformMethod(method: GoMethod, type: GoType): MemberReference {
    // In Go, exported symbols start with uppercase letter
    const isExported = /^[A-Z]/.test(method.name);
    const visibility = isExported ? "public" : "private";

    return {
      name: method.name,
      refId: this.buildMemberSymbolId(type.name, method.name),
      kind: "method",
      visibility,
    };
  }

  /**
   * Transform a method to a top-level symbol (for dedicated page).
   */
  private transformMethodAsSymbol(method: GoMethod, type: GoType): SymbolRecord {
    const qualifiedName = `${type.name}.${method.name}`;
    const symbolId = qualifiedName.replace(/\./g, "_");

    // In Go, exported symbols start with uppercase letter
    const isExported = /^[A-Z]/.test(method.name);
    const visibility = isExported ? "public" : "private";

    return {
      id: `${this.packageId}:${symbolId}`,
      packageId: this.packageId,
      name: method.name,
      qualifiedName,
      kind: "method",
      language: "go",
      display: {
        name: method.name,
        qualified: qualifiedName,
      },
      signature: method.signature,
      docs: this.buildDocs(method.doc),
      params: method.parameters.map((p) => this.transformParameter(p)),
      returns: method.returns ? { type: method.returns } : undefined,
      source: this.buildSourceLocation(type.sourceFile, method.startLine),
      urls: {
        canonical: `/${qualifiedName}`,
      },
      tags: {
        stability: "stable",
        visibility,
      },
    };
  }

  /**
   * Transform a field to a member reference.
   */
  private transformField(field: GoField, type: GoType): MemberReference {
    // In Go, exported symbols start with uppercase letter
    const isExported = /^[A-Z]/.test(field.name);
    const visibility = isExported ? "public" : "private";

    return {
      name: field.name,
      refId: this.buildMemberSymbolId(type.name, field.name),
      kind: "property",
      visibility,
      type: field.type,
    };
  }

  /**
   * Transform a parameter.
   */
  private transformParameter(param: GoParameter): SymbolParam {
    return {
      name: param.name,
      type: param.type,
      required: true,
    };
  }

  /**
   * Map Go kind to IR kind.
   */
  private mapKind(kind: string): SymbolKind {
    switch (kind) {
      case "struct":
        return "class";
      case "interface":
        return "interface";
      case "alias":
        return "typeAlias";
      case "func":
        return "function";
      default:
        return "class";
    }
  }

  /**
   * Build the docs object for a symbol.
   */
  private buildDocs(doc?: string): SymbolDocs {
    if (!doc) {
      return { summary: "" };
    }

    const summary = this.extractSummary(doc) || "";
    const description = this.goDocToMarkdown(doc);

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
   * Extract summary (first sentence) from Go doc.
   */
  private extractSummary(doc?: string): string | undefined {
    if (!doc) return undefined;

    // Get first sentence (Go doc convention)
    const firstLine = doc.split("\n")[0];
    const firstSentence = firstLine.split(/[.!?]\s/)[0];

    if (firstSentence) {
      return firstSentence.endsWith(".") ? firstSentence : firstSentence + ".";
    }

    return undefined;
  }

  /**
   * Convert Go doc to Markdown.
   */
  private goDocToMarkdown(doc?: string): string | undefined {
    if (!doc) return undefined;

    return (
      doc
        // Convert indented lines to code blocks
        .replace(/^(\t|    )(.+)$/gm, "```go\n$2\n```")
        // Convert BUG(name): to warning
        .replace(/^BUG\((\w+)\):\s*/gm, "**Bug ($1):** ")
        // Convert DEPRECATED: to deprecation notice
        .replace(/^DEPRECATED:\s*/gm, "**Deprecated:** ")
        // Clean up consecutive code blocks
        .replace(/```\n```go\n/g, "")
        .trim()
    );
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
