/**
 * Java Extractor
 *
 * Parses Java source files and extracts API documentation.
 */

import { readFile } from "fs/promises";
import { join, relative } from "path";
import { glob } from "tinyglobby";
import { parse, type CstNode } from "java-parser";
import type { JavaExtractorConfig } from "./config.js";

/**
 * Represents a parsed Java class, interface, enum, or record.
 */
export interface JavaType {
  name: string;
  kind: "class" | "interface" | "enum" | "record" | "annotation";
  packageName: string;
  modifiers: string[];
  javadoc?: string;
  extends?: string;
  implements: string[];
  typeParameters: JavaTypeParameter[];
  methods: JavaMethod[];
  fields: JavaField[];
  constructors: JavaConstructor[];
  innerTypes: JavaType[];
  sourceFile: string;
  startLine: number;
}

/**
 * Represents a type parameter (generic).
 */
export interface JavaTypeParameter {
  name: string;
  bounds?: string;
}

/**
 * Represents a Java method.
 */
export interface JavaMethod {
  name: string;
  modifiers: string[];
  javadoc?: string;
  returnType: string;
  parameters: JavaParameter[];
  typeParameters: JavaTypeParameter[];
  throws: string[];
  startLine: number;
}

/**
 * Represents a Java constructor.
 */
export interface JavaConstructor {
  modifiers: string[];
  javadoc?: string;
  parameters: JavaParameter[];
  throws: string[];
  startLine: number;
}

/**
 * Represents a method parameter.
 */
export interface JavaParameter {
  name: string;
  type: string;
  annotations: string[];
}

/**
 * Represents a Java field.
 */
export interface JavaField {
  name: string;
  modifiers: string[];
  javadoc?: string;
  type: string;
  startLine: number;
}

/**
 * Result of extraction from all Java files.
 */
export interface ExtractionResult {
  packageName: string;
  types: JavaType[];
  version: string;
}

/**
 * Java source file extractor.
 */
export class JavaExtractor {
  private config: JavaExtractorConfig;

  constructor(config: JavaExtractorConfig) {
    this.config = config;
  }

  /**
   * Extract all Java types from the source directory.
   */
  async extract(): Promise<ExtractionResult> {
    const files = await this.findJavaFiles();
    const types: JavaType[] = [];

    for (const file of files) {
      try {
        const fileTypes = await this.extractFile(file);
        types.push(...fileTypes);
      } catch (error) {
        console.warn(`Warning: Failed to parse ${file}: ${error}`);
      }
    }

    const version = await this.detectVersion();

    return {
      packageName: this.config.packageName,
      types,
      version,
    };
  }

  /**
   * Find all Java files matching the patterns.
   */
  private async findJavaFiles(): Promise<string[]> {
    const files = await glob(this.config.includePatterns, {
      cwd: this.config.packagePath,
      ignore: this.config.excludePatterns,
      absolute: true,
    });

    return files.filter((f) => f.endsWith(".java"));
  }

  /**
   * Extract types from a single Java file.
   */
  private async extractFile(filePath: string): Promise<JavaType[]> {
    const content = await readFile(filePath, "utf-8");
    const relativePath = relative(this.config.packagePath, filePath);

    // Parse the Java file
    const cst = parse(content);

    // Extract package name
    const packageName = this.extractPackageName(cst, content);

    // Extract types
    const types = this.extractTypes(cst, content, packageName, relativePath);

    return types;
  }

  /**
   * Extract package name from CST.
   */
  private extractPackageName(cst: CstNode, content: string): string {
    // Find package declaration in the source
    const packageMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
    return packageMatch ? packageMatch[1] : "";
  }

  /**
   * Extract types from CST.
   */
  private extractTypes(
    cst: CstNode,
    content: string,
    packageName: string,
    sourceFile: string,
  ): JavaType[] {
    const types: JavaType[] = [];
    const lines = content.split("\n");

    // Match type declarations - handle extends and implements separately
    // The pattern captures:
    // 1. Modifiers (public, private, protected, abstract, final, static)
    // 2. Type keyword (class, interface, enum, record, @interface)
    // 3. Type name
    // 4. Type parameters <...> or record parameters (...)
    // 5. extends clause (up to implements or {)
    // 6. implements clause (up to {)
    // Note: records have (params) after name, so we need to handle that
    const typePattern =
      /((?:public|private|protected|abstract|final|static)\s+)*(class|interface|enum|record|@interface)\s+(\w+)(\s*<[^{(]+?>)?(\s*\([^)]*\))?(?:\s+extends\s+([^{]+?))?(?:\s+implements\s+([^{]+?))?\s*\{/g;

    let match;
    while ((match = typePattern.exec(content)) !== null) {
      const kind = match[2] as "class" | "interface" | "enum" | "record" | "@interface";
      const name = match[3];
      const typeParamsMatch = match[4] || "";
      // match[5] is record parameters (String id, String name, int value) - skip it
      let extendsClause = match[6];
      let implementsClause = match[7];

      // Clean up extends clause - remove any implements that leaked in
      if (extendsClause) {
        const implIndex = extendsClause.indexOf(" implements ");
        if (implIndex !== -1) {
          if (!implementsClause) {
            implementsClause = extendsClause.substring(implIndex + 12);
          }
          extendsClause = extendsClause.substring(0, implIndex);
        }
        extendsClause = extendsClause.trim();
      }

      // Parse modifiers from all matches
      const allModifiersMatch = content.substring(
        Math.max(0, match.index - 50),
        match.index + (match[1]?.length || 0)
      );
      const modifiers = this.parseModifiers(allModifiersMatch);

      const isPublic = modifiers.includes("public");
      const isPrivate = modifiers.includes("private");
      const isProtected = modifiers.includes("protected");

      if (this.config.excludePrivate && isPrivate) {
        continue;
      }

      if (this.config.excludePackagePrivate && !isPublic && !isProtected && !isPrivate) {
        continue;
      }

      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      // Extract Javadoc - look before the match for /** ... */
      const javadoc = this.extractJavadocBefore(content, match.index);

      // Parse implements list
      const implementsList = implementsClause
        ? this.splitTypeList(implementsClause.trim())
        : [];

      // Extract methods and fields for this type
      const typeEndIndex = this.findTypeEndIndex(content, match.index + match[0].length - 1);
      const typeBody = content.substring(match.index + match[0].length, typeEndIndex);

      const methods = this.extractMethods(typeBody, lines, lineNumber, kind === "interface");
      const fields = this.extractFields(typeBody, lines, lineNumber);
      const constructors = this.extractConstructors(typeBody, name, lines, lineNumber);

      // Extract type parameters
      const typeParameters = this.extractTypeParameters(typeParamsMatch);

      const javaType: JavaType = {
        name,
        kind: kind === "@interface" ? "annotation" : kind,
        packageName,
        modifiers,
        javadoc,
        extends: extendsClause || undefined,
        implements: implementsList,
        typeParameters,
        methods,
        fields,
        constructors,
        innerTypes: [],
        sourceFile,
        startLine: lineNumber,
      };

      types.push(javaType);
    }

    return types;
  }

  /**
   * Parse modifiers from a string.
   */
  private parseModifiers(str: string): string[] {
    const validModifiers = [
      "public",
      "private",
      "protected",
      "abstract",
      "final",
      "static",
      "synchronized",
      "native",
      "volatile",
      "transient",
      "default",
    ];
    const modifiers: string[] = [];
    for (const mod of validModifiers) {
      if (new RegExp(`\\b${mod}\\b`).test(str)) {
        modifiers.push(mod);
      }
    }
    return modifiers;
  }

  /**
   * Split a comma-separated type list, handling nested generics.
   */
  private splitTypeList(str: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of str) {
      if (char === "<") {
        depth++;
        current += char;
      } else if (char === ">") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        if (current.trim()) {
          result.push(current.trim());
        }
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
   * Find the end index of a type body (matching braces).
   */
  private findTypeEndIndex(content: string, startIndex: number): number {
    let braceCount = 0;
    let inString = false;
    let stringChar = "";
    let foundFirstBrace = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : "";

      // Handle string literals
      if ((char === '"' || char === "'") && prevChar !== "\\") {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (inString) continue;

      if (char === "{") {
        braceCount++;
        foundFirstBrace = true;
      } else if (char === "}") {
        braceCount--;
        if (foundFirstBrace && braceCount === 0) {
          return i;
        }
      }
    }

    return content.length;
  }

  /**
   * Extract Javadoc comment before a given index.
   */
  private extractJavadocBefore(content: string, index: number): string | undefined {
    // Look backwards from index to find Javadoc
    const before = content.substring(0, index);

    // Find all Javadoc comments and get the last one that is close to the declaration
    // The Javadoc should be followed only by whitespace, annotations, and modifiers
    const javadocPattern = /\/\*\*([\s\S]*?)\*\//g;
    let lastMatch: RegExpExecArray | null = null;
    let match;

    while ((match = javadocPattern.exec(before)) !== null) {
      // Check if there's only whitespace, annotations, and modifiers between this Javadoc and the end
      const afterJavadoc = before.substring(match.index + match[0].length);
      // Allow: whitespace, annotations (@Name(...)), and access modifiers
      if (/^[\s]*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|abstract|final|static|synchronized|native|default|volatile|transient)\s+)*$/.test(afterJavadoc)) {
        lastMatch = match;
      }
    }

    if (lastMatch) {
      return this.cleanJavadoc(lastMatch[0]);
    }
    return undefined;
  }

  /**
   * Clean Javadoc comment.
   */
  private cleanJavadoc(javadoc: string): string {
    return javadoc
      .replace(/^\/\*\*\s*/, "")
      .replace(/\s*\*\/$/, "")
      .replace(/^\s*\*\s?/gm, "")
      .trim();
  }

  /**
   * Extract type parameters from a declaration like "<T extends Comparable<T>, K>".
   */
  private extractTypeParameters(declaration: string): JavaTypeParameter[] {
    if (!declaration) return [];

    // Remove outer < and >
    const inner = declaration.trim().replace(/^<\s*/, "").replace(/\s*>$/, "");
    if (!inner) return [];

    // Split by comma, respecting nested generics
    const params = this.splitTypeParameters(inner);

    return params.map((param) => {
      const trimmed = param.trim();
      // Match: NAME extends BOUNDS or just NAME
      const extendsMatch = trimmed.match(/^(\w+)\s+extends\s+(.+)$/);
      if (extendsMatch) {
        return {
          name: extendsMatch[1],
          bounds: extendsMatch[2],
        };
      }
      return {
        name: trimmed,
        bounds: undefined,
      };
    });
  }

  /**
   * Split type parameters respecting nested generics.
   */
  private splitTypeParameters(str: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of str) {
      if (char === "<") {
        depth++;
        current += char;
      } else if (char === ">") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        if (current.trim()) {
          result.push(current.trim());
        }
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
   * Extract methods from type body.
   */
  private extractMethods(
    body: string,
    allLines: string[],
    typeStartLine: number,
    isInterface: boolean,
  ): JavaMethod[] {
    const methods: JavaMethod[] = [];

    // Match method declarations - include default for interface methods
    // Handle complex generic return types and annotation methods with "default value"
    // Pattern breakdown:
    // 1. Modifiers (public, static, etc.)
    // 2. Optional type parameters <T>
    // 3. Return type (handles nested generics via separate extraction)
    // 4. Method name
    // 5. Parameters
    // 6. Optional throws clause
    // 7. Method body { or ; or default value
    const methodPattern =
      /\b((?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+|synchronized\s+|native\s+|default\s+)*)(?:(<[^{(]+?>)\s+)?(\w[\w.<>,\s[\]]*?)\s+(\w+)\s*\(([^)]*)\)(?:\s+throws\s+([\w,\s.]+))?(?:\s*(?:default\s+[^;]+)?[{;])/g;

    let match;
    while ((match = methodPattern.exec(body)) !== null) {
      const fullModifiersStr = match[1] || "";
      const typeParams = match[2];
      let returnType = match[3].trim();
      const name = match[4];
      const paramsStr = match[5];
      const throwsStr = match[6];

      // Clean up return type - remove any trailing whitespace
      returnType = returnType.replace(/\s+/g, "");

      // Parse modifiers from the full modifier string
      const modifiers = this.parseModifiers(fullModifiersStr);

      // For interfaces, methods without explicit modifiers are implicitly public
      if (isInterface && modifiers.length === 0) {
        modifiers.push("public");
      }

      // Skip private methods if configured
      if (this.config.excludePrivate && modifiers.includes("private")) {
        continue;
      }

      // Skip package-private methods if configured
      const hasVisibility = modifiers.some(m => ["public", "private", "protected"].includes(m));
      if (this.config.excludePackagePrivate && !hasVisibility && !isInterface) {
        continue;
      }

      const beforeMatch = body.substring(0, match.index);
      const lineOffset = beforeMatch.split("\n").length;

      const javadoc = this.extractJavadocBefore(body, match.index);
      const parameters = this.parseParameters(paramsStr);
      const throwsList = throwsStr ? throwsStr.split(",").map((s) => s.trim()) : [];

      // Extract method-level type parameters
      const methodTypeParams = typeParams ? this.extractTypeParameters(typeParams) : [];

      methods.push({
        name,
        modifiers,
        javadoc,
        returnType,
        parameters,
        typeParameters: methodTypeParams,
        throws: throwsList,
        startLine: typeStartLine + lineOffset,
      });
    }

    return methods;
  }

  /**
   * Extract constructors from type body.
   */
  private extractConstructors(
    body: string,
    className: string,
    allLines: string[],
    typeStartLine: number,
  ): JavaConstructor[] {
    const constructors: JavaConstructor[] = [];

    // Match constructor declarations
    const constructorPattern = new RegExp(
      `((?:public|private|protected)\\s+)?${className}\\s*\\(([^)]*)\\)(?:\\s+throws\\s+([\\w,\\s.]+))?(?:\\s*\\{)`,
      "g",
    );

    let match;
    while ((match = constructorPattern.exec(body)) !== null) {
      const modifiersStr = match[1] || "";
      const paramsStr = match[2];
      const throwsStr = match[3];

      const modifiers = this.parseModifiers(modifiersStr);

      if (this.config.excludePrivate && modifiers.includes("private")) {
        continue;
      }

      const beforeMatch = body.substring(0, match.index);
      const lineOffset = beforeMatch.split("\n").length;

      const javadoc = this.extractJavadocBefore(body, match.index);
      const parameters = this.parseParameters(paramsStr);
      const throwsList = throwsStr ? throwsStr.split(",").map((s) => s.trim()) : [];

      constructors.push({
        modifiers,
        javadoc,
        parameters,
        throws: throwsList,
        startLine: typeStartLine + lineOffset,
      });
    }

    return constructors;
  }

  /**
   * Extract fields from type body.
   */
  private extractFields(
    body: string,
    allLines: string[],
    typeStartLine: number,
  ): JavaField[] {
    const fields: JavaField[] = [];

    // Match field declarations - capture all modifiers properly
    const fieldPattern =
      /((?:(?:public|private|protected|final|static|volatile|transient)\s+)+)(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*[;=]/g;

    let match;
    while ((match = fieldPattern.exec(body)) !== null) {
      const modifiersStr = match[1] || "";
      const type = match[2];
      const name = match[3];

      const modifiers = this.parseModifiers(modifiersStr);

      // Skip private fields if configured
      if (this.config.excludePrivate && modifiers.includes("private")) {
        continue;
      }

      // Skip package-private fields if configured
      const hasVisibility = modifiers.some(m => ["public", "private", "protected"].includes(m));
      if (this.config.excludePackagePrivate && !hasVisibility) {
        continue;
      }

      const beforeMatch = body.substring(0, match.index);
      const lineOffset = beforeMatch.split("\n").length;

      const javadoc = this.extractJavadocBefore(body, match.index);

      fields.push({
        name,
        modifiers,
        javadoc,
        type,
        startLine: typeStartLine + lineOffset,
      });
    }

    return fields;
  }

  /**
   * Parse method parameters from a parameter string.
   */
  private parseParameters(paramsStr: string): JavaParameter[] {
    if (!paramsStr.trim()) return [];

    const params: JavaParameter[] = [];
    const paramParts = this.splitParameters(paramsStr);

    for (const part of paramParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Match: annotations? type name
      const paramMatch = trimmed.match(
        /(?:(@\w+(?:\([^)]*\))?\s+)*)?([\w.<>,\s[\]]+)\s+(\w+)$/,
      );

      if (paramMatch) {
        const annotationsStr = paramMatch[1] || "";
        const type = paramMatch[2].trim();
        const name = paramMatch[3];

        const annotations = annotationsStr.match(/@\w+/g) || [];

        params.push({
          name,
          type,
          annotations,
        });
      }
    }

    return params;
  }

  /**
   * Split parameter string handling nested generics.
   */
  private splitParameters(paramsStr: string): string[] {
    const params: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of paramsStr) {
      if (char === "<") depth++;
      else if (char === ">") depth--;
      else if (char === "," && depth === 0) {
        params.push(current);
        current = "";
        continue;
      }
      current += char;
    }

    if (current.trim()) {
      params.push(current);
    }

    return params;
  }

  /**
   * Detect package version from build files.
   */
  private async detectVersion(): Promise<string> {
    // Try to find version from pom.xml or build.gradle
    try {
      const pomPath = join(this.config.packagePath, "pom.xml");
      const pomContent = await readFile(pomPath, "utf-8");
      const versionMatch = pomContent.match(/<version>([^<]+)<\/version>/);
      if (versionMatch) {
        return versionMatch[1];
      }
    } catch {
      // pom.xml not found
    }

    try {
      const gradlePath = join(this.config.packagePath, "build.gradle");
      const gradleContent = await readFile(gradlePath, "utf-8");
      const versionMatch = gradleContent.match(/version\s*[=:]\s*['"]([^'"]+)['"]/);
      if (versionMatch) {
        return versionMatch[1];
      }
    } catch {
      // build.gradle not found
    }

    return "0.0.0";
  }
}
