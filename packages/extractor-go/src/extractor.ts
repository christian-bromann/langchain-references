/**
 * Go Extractor
 *
 * Parses Go source files and extracts API documentation.
 */

import { readFile } from "fs/promises";
import { join, relative } from "path";
import { glob } from "tinyglobby";
import type { GoExtractorConfig } from "./config.js";

/**
 * Represents a parsed Go type (struct, interface, etc.).
 */
export interface GoType {
  name: string;
  kind: "struct" | "interface" | "alias" | "func";
  packageName: string;
  doc?: string;
  signature: string;
  methods: GoMethod[];
  fields: GoField[];
  sourceFile: string;
  startLine: number;
}

/**
 * Represents a Go function or method.
 */
export interface GoMethod {
  name: string;
  doc?: string;
  signature: string;
  receiver?: string;
  receiverType?: string;
  parameters: GoParameter[];
  returns: string;
  startLine: number;
}

/**
 * Represents a struct field.
 */
export interface GoField {
  name: string;
  doc?: string;
  type: string;
  tag?: string;
  startLine: number;
}

/**
 * Represents a function/method parameter.
 */
export interface GoParameter {
  name: string;
  type: string;
}

/**
 * Represents a constant or variable.
 */
export interface GoConst {
  name: string;
  kind: "const" | "var";
  doc?: string;
  type?: string;
  value?: string;
  sourceFile: string;
  startLine: number;
}

/**
 * Result of extraction from all Go files.
 */
export interface ExtractionResult {
  packageName: string;
  moduleName: string;
  types: GoType[];
  functions: GoMethod[];
  constants: GoConst[];
  version: string;
}

/**
 * Go source file extractor.
 */
export class GoExtractor {
  private config: GoExtractorConfig;

  constructor(config: GoExtractorConfig) {
    this.config = config;
  }

  /**
   * Extract all Go symbols from the source directory.
   */
  async extract(): Promise<ExtractionResult> {
    const files = await this.findGoFiles();
    const types: GoType[] = [];
    const functions: GoMethod[] = [];
    const constants: GoConst[] = [];
    let moduleName = "";

    // Try to get module name from go.mod
    moduleName = await this.detectModuleName();

    for (const file of files) {
      try {
        const fileResult = await this.extractFile(file);
        types.push(...fileResult.types);
        functions.push(...fileResult.functions);
        constants.push(...fileResult.constants);
      } catch (error) {
        console.warn(`Warning: Failed to parse ${file}: ${error}`);
      }
    }

    const version = await this.detectVersion();

    return {
      packageName: this.config.packageName,
      moduleName,
      types,
      functions,
      constants,
      version,
    };
  }

  /**
   * Find all Go files matching the patterns.
   */
  private async findGoFiles(): Promise<string[]> {
    const files = await glob(this.config.includePatterns, {
      cwd: this.config.packagePath,
      ignore: this.config.excludePatterns,
      absolute: true,
    });

    return files.filter((f) => f.endsWith(".go"));
  }

  /**
   * Extract symbols from a single Go file.
   */
  private async extractFile(
    filePath: string,
  ): Promise<{ types: GoType[]; functions: GoMethod[]; constants: GoConst[] }> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.packagePath, filePath);

    // Extract package name
    const packageMatch = content.match(/^package\s+(\w+)/m);
    const packageName = packageMatch ? packageMatch[1] : "";

    const types = this.extractTypes(content, packageName, relativePath);
    const functions = this.extractFunctions(content, relativePath);
    const constants = this.extractConstants(content, relativePath);

    // Associate methods with types
    this.associateMethodsWithTypes(types, functions);

    // Filter to only top-level functions (not methods)
    const topLevelFunctions = functions.filter((f) => !f.receiver);

    return { types, functions: topLevelFunctions, constants };
  }

  /**
   * Extract type declarations from content.
   */
  private extractTypes(content: string, packageName: string, sourceFile: string): GoType[] {
    const types: GoType[] = [];

    // Match type declarations - don't consume doc comments in pattern
    // type Name struct { ... }
    // type Name interface { ... }
    // type Name = OtherType
    const typePattern = /\btype\s+([A-Z]\w*)\s+(struct|interface)\s*\{/g;

    let match;
    while ((match = typePattern.exec(content)) !== null) {
      const name = match[1];
      const kind = match[2] as "struct" | "interface";

      // Skip unexported types if configured
      if (this.config.exportedOnly && !this.isExported(name)) {
        continue;
      }

      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      // Extract doc comment
      const doc = this.extractDocBefore(content, match.index);

      // Find the closing brace
      const bodyStart = match.index + match[0].length - 1;
      const bodyEnd = this.findClosingBrace(content, bodyStart);
      const body = content.substring(bodyStart + 1, bodyEnd);

      // Extract fields for structs
      const fields = kind === "struct" ? this.extractFields(body, lineNumber) : [];

      // Build signature
      const signature = `type ${name} ${kind}`;

      types.push({
        name,
        kind,
        packageName,
        doc,
        signature,
        methods: [],
        fields,
        sourceFile,
        startLine: lineNumber,
      });
    }

    // Match type aliases - don't consume doc comments in pattern
    const aliasPattern = /\btype\s+([A-Z]\w*)\s+=\s+(.+)/g;

    while ((match = aliasPattern.exec(content)) !== null) {
      const name = match[1];
      const aliasedType = match[2].trim();

      if (this.config.exportedOnly && !this.isExported(name)) {
        continue;
      }

      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;
      const doc = this.extractDocBefore(content, match.index);

      types.push({
        name,
        kind: "alias",
        packageName,
        doc,
        signature: `type ${name} = ${aliasedType}`,
        methods: [],
        fields: [],
        sourceFile,
        startLine: lineNumber,
      });
    }

    return types;
  }

  /**
   * Extract function and method declarations.
   */
  private extractFunctions(content: string, _sourceFile: string): GoMethod[] {
    const functions: GoMethod[] = [];

    // Match function declarations - don't consume doc comments in pattern
    // func Name(params) returns
    // func (r *Receiver) Name(params) returns
    const funcPattern = /\bfunc\s+(?:\((\w+)\s+(\*?\w+)\)\s+)?([A-Z]\w*)\s*\(([^)]*)\)\s*([^{]*)/g;

    let match;
    while ((match = funcPattern.exec(content)) !== null) {
      const receiverName = match[1];
      const receiverType = match[2];
      const name = match[3];
      const paramsStr = match[4];
      const returnsStr = match[5].trim();

      if (this.config.exportedOnly && !this.isExported(name)) {
        continue;
      }

      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;
      const doc = this.extractDocBefore(content, match.index);

      // Parse parameters
      const parameters = this.parseParameters(paramsStr);

      // Build signature
      let signature = "func ";
      if (receiverName && receiverType) {
        signature += `(${receiverName} ${receiverType}) `;
      }
      signature += `${name}(${paramsStr})`;
      if (returnsStr) {
        signature += ` ${returnsStr}`;
      }

      functions.push({
        name,
        doc,
        signature: signature.trim(),
        receiver: receiverName,
        receiverType: receiverType?.replace(/^\*/, ""),
        parameters,
        returns: returnsStr,
        startLine: lineNumber,
      });
    }

    return functions;
  }

  /**
   * Extract constants and variables.
   */
  private extractConstants(content: string, sourceFile: string): GoConst[] {
    const constants: GoConst[] = [];

    // Match const declarations - use \w+ to match both exported and unexported
    const constPattern = /\b(const|var)\s+(\w+)\s*(?:(\w+)\s*)?=/g;

    let match;
    while ((match = constPattern.exec(content)) !== null) {
      const kind = match[1] as "const" | "var";
      const name = match[2];
      const type = match[3];

      if (this.config.exportedOnly && !this.isExported(name)) {
        continue;
      }

      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;
      const doc = this.extractDocBefore(content, match.index);

      constants.push({
        name,
        kind,
        doc,
        type,
        sourceFile,
        startLine: lineNumber,
      });
    }

    return constants;
  }

  /**
   * Extract struct fields.
   */
  private extractFields(body: string, typeStartLine: number): GoField[] {
    const fields: GoField[] = [];
    const lines = body.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("//") || line.startsWith("/*")) {
        continue;
      }

      // Match field: Name Type `tag`
      const fieldMatch = line.match(/^([A-Z]\w*)\s+(\S+)(?:\s+`([^`]+)`)?/);
      if (fieldMatch) {
        const name = fieldMatch[1];
        const type = fieldMatch[2];
        const tag = fieldMatch[3];

        // Look for doc comment above
        let doc: string | undefined;
        if (i > 0) {
          const prevLine = lines[i - 1].trim();
          if (prevLine.startsWith("//")) {
            doc = prevLine.replace(/^\/\/\s*/, "");
          }
        }

        fields.push({
          name,
          doc,
          type,
          tag,
          startLine: typeStartLine + i,
        });
      }
    }

    return fields;
  }

  /**
   * Associate methods with their receiver types.
   */
  private associateMethodsWithTypes(types: GoType[], methods: GoMethod[]): void {
    for (const method of methods) {
      if (method.receiverType) {
        const type = types.find((t) => t.name === method.receiverType);
        if (type) {
          type.methods.push(method);
        }
      }
    }
  }

  /**
   * Find the closing brace matching an opening brace.
   */
  private findClosingBrace(content: string, openIndex: number): number {
    let depth = 1;
    for (let i = openIndex + 1; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return content.length;
  }

  /**
   * Extract doc comment before a given index.
   */
  private extractDocBefore(content: string, index: number): string | undefined {
    const before = content.substring(0, index);
    const lines = before.split("\n");

    // Look for consecutive // comments or /* */ block
    const docLines: string[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();

      if (line.startsWith("//")) {
        docLines.unshift(line.replace(/^\/\/\s*/, ""));
      } else if (line === "" && docLines.length > 0) {
        // Stop at empty line after finding doc
        break;
      } else if (line !== "") {
        // Stop at non-comment, non-empty line
        break;
      }
    }

    if (docLines.length > 0) {
      return docLines.join("\n");
    }

    // Check for block comment
    const blockMatch = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    if (blockMatch) {
      return blockMatch[1]
        .split("\n")
        .map((l) => l.replace(/^\s*\*\s?/, ""))
        .join("\n")
        .trim();
    }

    return undefined;
  }

  /**
   * Parse function parameters.
   * Handles Go's grouped parameter syntax: `a, b string` -> [{name: "a", type: "string"}, {name: "b", type: "string"}]
   */
  private parseParameters(paramsStr: string): GoParameter[] {
    if (!paramsStr.trim()) return [];

    const params: GoParameter[] = [];

    // First, split by comma while respecting nested types
    const parts = this.splitParameters(paramsStr);

    // Collect names without types (for grouped params like `a, b string`)
    const pendingNames: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const trimmed = parts[i].trim();
      if (!trimmed) continue;

      // Match: name type
      const match = trimmed.match(/^(\w+)\s+(.+)$/);
      if (match) {
        // This part has a type - apply it to all pending names too
        const name = match[1];
        const type = match[2].trim();

        // Add all pending names with this type
        for (const pendingName of pendingNames) {
          params.push({ name: pendingName, type });
        }
        pendingNames.length = 0;

        // Add this parameter
        params.push({ name, type });
      } else {
        // Just a name - collect it for later
        pendingNames.push(trimmed);
      }
    }

    // If there are leftover pending names, they're unnamed params (shouldn't happen in valid Go)
    for (const name of pendingNames) {
      params.push({ name: "", type: name });
    }

    return params;
  }

  /**
   * Split parameters by comma, respecting nested types like func(int) error.
   */
  private splitParameters(paramsStr: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of paramsStr) {
      if (char === "(" || char === "[" || char === "{") {
        depth++;
        current += char;
      } else if (char === ")" || char === "]" || char === "}") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  /**
   * Check if a name is exported (starts with uppercase).
   */
  private isExported(name: string): boolean {
    return /^[A-Z]/.test(name);
  }

  /**
   * Detect module name from go.mod.
   */
  private async detectModuleName(): Promise<string> {
    try {
      const goModPath = join(this.config.packagePath, "go.mod");
      const content = await readFile(goModPath, "utf-8");
      const match = content.match(/^module\s+(.+)$/m);
      if (match) {
        return match[1].trim();
      }
    } catch {
      // go.mod not found
    }
    return this.config.packageName;
  }

  /**
   * Detect version from go.mod or git tags.
   * Note: Go modules don't have version in go.mod itself, so we return default.
   */
  private async detectVersion(): Promise<string> {
    // Go modules get versions from git tags, not from go.mod
    // For now, return a default version
    return "0.0.0";
  }
}
