# Specification: Multi-Language Support (Java & Go)

**Spec ID**: `2026-01-19-multi-language-support`  
**Created**: January 19, 2026  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State](#2-current-state)
3. [Target State](#3-target-state)
4. [Language Configuration Schema](#4-language-configuration-schema)
5. [Build Pipeline Extensions](#5-build-pipeline-extensions)
6. [Java Extractor](#6-java-extractor)
7. [Go Extractor](#7-go-extractor)
8. [IR Format for Java & Go](#8-ir-format-for-java--go)
9. [UI/UX Design](#9-uiux-design)
10. [Implementation Plan](#10-implementation-plan)
11. [Edge Cases & Safety](#11-edge-cases--safety)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Extend the LangChain Reference Documentation platform to support **Java** and **Go** programming languages, starting with LangSmith SDKs. The language dropdown should dynamically display only languages that are available for the current project, ensuring users only see relevant options.

### 1.2 Problem Statement

Currently, the platform only supports Python and JavaScript/TypeScript. LangSmith provides SDKs in additional languages:

- **Java**: https://github.com/langchain-ai/langsmith-java
- **Go**: https://github.com/langchain-ai/langsmith-go

Users of these SDKs cannot access reference documentation on the platform, and the language dropdown is hardcoded to only show Python and JavaScript regardless of what's actually available.

### 1.3 Scope

**In scope:**

- Extend the build pipeline language system to support Java and Go
- Create new extractors for Java (Javadoc-based) and Go (godoc-based)
- Transform Java and Go documentation to the existing IR format
- Update UI language dropdown to dynamically show available languages per project
- Add LangSmith Java and Go configurations
- Support the same IR schema for all languages (no schema changes needed)

**Out of scope:**

- Adding Java/Go support for other projects (LangChain, LangGraph, etc.) - future work
- Cross-language symbol resolution between Java/Go and Python/JavaScript - future work
- Custom symbol mappings for Java/Go - future work
- Version tracking for Java/Go packages - can be added later

### 1.4 Repositories

| Language | Repository                    | SDK Type           |
| -------- | ----------------------------- | ------------------ |
| Java     | `langchain-ai/langsmith-java` | LangSmith Java SDK |
| Go       | `langchain-ai/langsmith-go`   | LangSmith Go SDK   |

---

## 2. Current State

### 2.1 Language System Architecture

The platform currently supports two languages with the following components:

**1. Build Pipeline Constants** (`packages/build-pipeline/src/constants.ts`):

```typescript
export const CONFIG_LANGUAGES = ["python", "typescript"] as const;
export const OUTPUT_LANGUAGES = ["python", "javascript"] as const;
```

**2. Project Variant Schema** (`packages/ir-schema/src/project.ts`):

```typescript
export interface ProjectVariant {
  language: "python" | "javascript"; // Hardcoded type
  repo: string;
  configPath: string;
  enabled: boolean;
}
```

**3. Language Dropdown** (`apps/web/components/layout/LanguageDropdown.tsx`):

```typescript
const LANGUAGES = [
  { id: "python", name: "Python", icon: <PythonIcon /> },
  { id: "javascript", name: "JavaScript", icon: <JavaScriptIcon /> },
];
```

**4. Config Schema** (`configs/config-schema.json`):

```json
{
  "language": {
    "type": "string",
    "enum": ["python", "typescript"]
  }
}
```

### 2.2 Extractor Architecture

Currently, two extractors exist:

| Extractor  | Package                         | Technology     |
| ---------- | ------------------------------- | -------------- |
| Python     | `packages/extractor-python`     | griffe library |
| TypeScript | `packages/extractor-typescript` | TypeDoc        |

Both extractors output the same IR format defined in `@langchain/ir-schema`.

### 2.3 Current LangSmith Configuration

**Python** (`configs/langsmith-python.json`):

- Repository: `langchain-ai/langsmith-sdk`
- Path: `python`

**TypeScript** (`configs/langsmith-typescript.json`):

- Repository: `langchain-ai/langsmith-sdk`
- Path: `js`

---

## 3. Target State

### 3.1 Extended Language System

Support four languages in the platform:

| Config Language | Output Language | Display Name | Ecosystem             |
| --------------- | --------------- | ------------ | --------------------- |
| `python`        | `python`        | Python       | Python                |
| `typescript`    | `javascript`    | JavaScript   | JavaScript/TypeScript |
| `java`          | `java`          | Java         | JVM                   |
| `go`            | `go`            | Go           | Go                    |

### 3.2 Dynamic Language Availability

The language dropdown shows only languages that have packages available for the current project:

```
LangSmith project:
├── Python ✓ (langsmith-python.json exists)
├── JavaScript ✓ (langsmith-typescript.json exists)
├── Java ✓ (langsmith-java.json exists)
└── Go ✓ (langsmith-go.json exists)

LangChain project:
├── Python ✓
└── JavaScript ✓
(No Java or Go shown - not available for LangChain)
```

### 3.3 New Extractors

Two new extractor packages:

| Package                   | Language | Technology               |
| ------------------------- | -------- | ------------------------ |
| `packages/extractor-java` | Java     | Javadoc API / JavaParser |
| `packages/extractor-go`   | Go       | go/doc + go/ast          |

### 3.4 URL Structure

New language routes:

```
/java/{package}/{symbol-path...}
/go/{package}/{symbol-path...}
```

Examples:

- `/java/langsmith/Client`
- `/go/langsmith/Client`

---

## 4. Language Configuration Schema

### 4.1 Updated Constants

**File:** `packages/build-pipeline/src/constants.ts`

```typescript
/**
 * Languages as specified in config file names.
 */
export const CONFIG_LANGUAGES = ["python", "typescript", "java", "go"] as const;

export type ConfigLanguage = (typeof CONFIG_LANGUAGES)[number];

/**
 * Languages as used in output paths and pointer files.
 */
export const OUTPUT_LANGUAGES = ["python", "javascript", "java", "go"] as const;

export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number];

/**
 * Convert a config language to its output equivalent.
 */
export function configToOutputLanguage(lang: ConfigLanguage): OutputLanguage {
  if (lang === "typescript") return "javascript";
  return lang;
}

/**
 * Convert an output language to its config equivalent.
 */
export function outputToConfigLanguage(lang: OutputLanguage): ConfigLanguage {
  if (lang === "javascript") return "typescript";
  return lang;
}
```

### 4.2 Updated Project Schema

**File:** `packages/ir-schema/src/project.ts`

```typescript
/**
 * Supported languages for reference documentation.
 */
export type Language = "python" | "javascript" | "java" | "go";

/**
 * Language variant configuration for a project.
 */
export interface ProjectVariant {
  /** Language identifier */
  language: Language;

  /** GitHub repository (e.g., "langchain-ai/langchain") */
  repo: string;

  /** Path to configuration file */
  configPath: string;

  /** Whether this variant is enabled */
  enabled: boolean;
}
```

### 4.3 Updated Config Schema

**File:** `configs/config-schema.json`

```json
{
  "language": {
    "type": "string",
    "enum": ["python", "typescript", "java", "go"],
    "description": "The programming language to extract"
  }
}
```

### 4.4 New Configuration Files

**File:** `configs/langsmith-java.json`

```json
{
  "$schema": "./config-schema.json",
  "project": "langsmith",
  "language": "java",
  "repo": "langchain-ai/langsmith-java",
  "packages": [
    {
      "name": "langsmith",
      "path": ".",
      "displayName": "LangSmith Java",
      "versioning": {
        "tagPattern": "v*",
        "maxVersions": 10
      },
      "descriptionSource": "readme"
    }
  ]
}
```

**File:** `configs/langsmith-go.json`

```json
{
  "$schema": "./config-schema.json",
  "project": "langsmith",
  "language": "go",
  "repo": "langchain-ai/langsmith-go",
  "packages": [
    {
      "name": "langsmith",
      "path": ".",
      "displayName": "LangSmith Go",
      "versioning": {
        "tagPattern": "v*",
        "maxVersions": 10
      },
      "descriptionSource": "readme"
    }
  ]
}
```

---

## 5. Build Pipeline Extensions

### 5.1 Build Command Updates

**File:** `packages/build-pipeline/src/commands/build-ir.ts`

Add extraction functions for Java and Go alongside existing Python and TypeScript:

```typescript
/**
 * Run the Java extractor on a package.
 */
async function extractJava(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
): Promise<void> {
  console.log(`   ☕ Extracting: ${packageName}`);

  const extractorPath = path.resolve(__dirname, "../../../../packages/extractor-java");

  // Use gradle or maven to generate Javadoc JSON
  // Then transform to IR format
  await runCommand("node", [
    path.join(extractorPath, "dist/cli.js"),
    "--package",
    packageName,
    "--path",
    packagePath,
    "--output",
    outputPath,
    "--repo",
    repo,
    "--sha",
    sha,
  ]);
}

/**
 * Run the Go extractor on a package.
 */
async function extractGo(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
): Promise<void> {
  console.log(`   🐹 Extracting: ${packageName}`);

  const extractorPath = path.resolve(__dirname, "../../../../packages/extractor-go");

  // Use go doc to generate documentation JSON
  await runCommand("node", [
    path.join(extractorPath, "dist/cli.js"),
    "--package",
    packageName,
    "--path",
    packagePath,
    "--output",
    outputPath,
    "--repo",
    repo,
    "--sha",
    sha,
  ]);
}
```

Update the main extraction logic:

```typescript
// In the extraction loop
if (config.language === "python") {
  await extractPython(
    packagePath,
    pkgConfig.name,
    outputPath,
    config.repo,
    sha,
    pkgConfig.excludePatterns,
  );
} else if (config.language === "typescript") {
  await extractTypeScript(
    packagePath,
    pkgConfig.name,
    outputPath,
    config.repo,
    sha,
    pkgConfig.entryPoints,
  );
} else if (config.language === "java") {
  await extractJava(packagePath, pkgConfig.name, outputPath, config.repo, sha);
} else if (config.language === "go") {
  await extractGo(packagePath, pkgConfig.name, outputPath, config.repo, sha);
}
```

### 5.2 Package ID Generation

Update `normalizePackageId` to handle new languages:

```typescript
function normalizePackageId(packageName: string, language: ConfigLanguage): string {
  const prefix = {
    python: "pkg_py",
    typescript: "pkg_js",
    java: "pkg_java",
    go: "pkg_go",
  }[language];

  const normalizedName = packageName.replace(/^@/, "").replace(/\//g, "_").replace(/-/g, "_");

  return `${prefix}_${normalizedName}`;
}
```

### 5.3 Pointer File Structure

New pointer files will be created:

```
ir-output/
  pointers/
    index-langsmith-java.json
    index-langsmith-go.json
    packages/
      java/
        langsmith.json
      go/
        langsmith.json
```

---

## 6. Java Extractor

### 6.1 Package Structure

**New package:** `packages/extractor-java`

```
packages/extractor-java/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── config.ts
│   ├── extractor.ts
│   └── transformer.ts
└── README.md
```

### 6.2 Extraction Strategy

The Java extractor uses a two-phase approach:

**Phase 1: Source Parsing**

Use JavaParser (npm package `java-parser`) to parse Java source files:

```typescript
import { parse } from "java-parser";

interface JavaClass {
  name: string;
  javadoc?: string;
  modifiers: string[];
  methods: JavaMethod[];
  fields: JavaField[];
  extends?: string;
  implements?: string[];
}

async function parseJavaSource(filePath: string): Promise<JavaClass[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const ast = parse(content);
  return extractClassesFromAST(ast);
}
```

**Phase 2: IR Transformation**

Transform parsed Java structures to IR symbols:

```typescript
function javaClassToSymbol(cls: JavaClass, pkgInfo: PackageInfo): SymbolRecord {
  return {
    id: `${pkgInfo.packageId}:${cls.name}`,
    name: cls.name,
    qualifiedName: `${pkgInfo.packageName}.${cls.name}`,
    kind: "class",
    language: "java",
    summary: extractFirstSentence(cls.javadoc),
    description: cls.javadoc,
    signature: generateClassSignature(cls),
    members: cls.methods.map((m) => methodToMember(m)),
    source: {
      file: cls.sourceFile,
      line: cls.startLine,
      url: buildGitHubUrl(pkgInfo, cls.sourceFile, cls.startLine),
    },
  };
}
```

### 6.3 Symbol Kind Mapping

| Java Construct | IR Kind                |
| -------------- | ---------------------- |
| `class`        | `class`                |
| `interface`    | `interface`            |
| `enum`         | `enum`                 |
| `record`       | `class`                |
| `annotation`   | `type`                 |
| method         | `method` (member)      |
| field          | `property` (member)    |
| constructor    | `constructor` (member) |

### 6.4 Javadoc to Markdown

Convert Javadoc tags to markdown:

```typescript
function javadocToMarkdown(javadoc: string): string {
  return (
    javadoc
      // Convert @param tags to markdown list
      .replace(/@param\s+(\w+)\s+(.+)/g, "- **$1**: $2")
      // Convert @return to Returns section
      .replace(/@return\s+(.+)/g, "**Returns:** $1")
      // Convert @throws to markdown
      .replace(/@throws\s+(\w+)\s+(.+)/g, "- Throws `$1`: $2")
      // Convert {@code ...} to backticks
      .replace(/\{@code\s+([^}]+)\}/g, "`$1`")
      // Convert {@link ...} to plain text (for now)
      .replace(/\{@link\s+([^}]+)\}/g, "`$1`")
      // Remove @since, @author, etc.
      .replace(/@(since|author|version|see)\s+.+/g, "")
  );
}
```

---

## 7. Go Extractor

### 7.1 Package Structure

**New package:** `packages/extractor-go`

```
packages/extractor-go/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── config.ts
│   ├── extractor.ts
│   └── transformer.ts
└── README.md
```

### 7.2 Extraction Strategy

The Go extractor uses the `go doc` command and AST parsing:

**Phase 1: Documentation Extraction**

```typescript
import { execSync } from "child_process";

interface GoDoc {
  name: string;
  doc: string;
  decl: string;
  type: "package" | "type" | "func" | "var" | "const";
}

async function extractGoDoc(packagePath: string): Promise<GoDoc[]> {
  // Use go doc -json to get structured documentation
  const output = execSync(`cd ${packagePath} && go doc -json -all ./...`, { encoding: "utf-8" });
  return JSON.parse(output);
}
```

**Phase 2: AST Parsing**

For detailed type information, parse Go source files:

```typescript
// Use a Go AST parser (e.g., via go/ast bindings or parsing output)
async function parseGoSource(filePath: string): Promise<GoAST> {
  // Alternative: use a Go tool that outputs JSON AST
  const output = execSync(`go-parser --json ${filePath}`, { encoding: "utf-8" });
  return JSON.parse(output);
}
```

**Phase 3: IR Transformation**

```typescript
function goTypeToSymbol(typ: GoType, pkgInfo: PackageInfo): SymbolRecord {
  return {
    id: `${pkgInfo.packageId}:${typ.name}`,
    name: typ.name,
    qualifiedName: `${pkgInfo.packageName}.${typ.name}`,
    kind: goKindToIRKind(typ.kind),
    language: "go",
    summary: extractFirstSentence(typ.doc),
    description: typ.doc,
    signature: typ.decl,
    members: typ.methods?.map((m) => goMethodToMember(m)) || [],
    source: {
      file: typ.sourceFile,
      line: typ.startLine,
      url: buildGitHubUrl(pkgInfo, typ.sourceFile, typ.startLine),
    },
  };
}
```

### 7.3 Symbol Kind Mapping

| Go Construct       | IR Kind           |
| ------------------ | ----------------- |
| `struct`           | `class`           |
| `interface`        | `interface`       |
| `func` (top-level) | `function`        |
| method (receiver)  | `method` (member) |
| `type` alias       | `type`            |
| `const`            | `variable`        |
| `var`              | `variable`        |

### 7.4 Go Doc to Markdown

Go documentation is already plain text, minimal conversion needed:

````typescript
function goDocToMarkdown(doc: string): string {
  return (
    doc
      // Indent code blocks (lines starting with tab or 4 spaces)
      .replace(/^([\t ]{4,}.*)/gm, "```go\n$1\n```")
      // Convert BUG(name) to warning
      .replace(/^BUG\((\w+)\):/gm, "⚠️ **Bug ($1):**")
  );
}
````

---

## 8. IR Format for Java & Go

### 8.1 Symbol Record Extensions

The existing IR schema supports Java and Go without changes. The `language` field accepts any string:

```typescript
interface SymbolRecord {
  // ... existing fields
  language: string; // "python" | "javascript" | "java" | "go"
}
```

### 8.2 Java-Specific Fields

Use existing fields with Java conventions:

```typescript
// Java class example
{
  id: "pkg_java_langsmith:Client",
  name: "Client",
  qualifiedName: "ai.langsmith.Client",
  kind: "class",
  language: "java",
  summary: "Main client for interacting with LangSmith.",
  signature: "public class Client implements AutoCloseable",
  typeParameters: [
    { name: "T", constraint: "extends BaseConfig" }
  ],
  members: [
    {
      id: "pkg_java_langsmith:Client.run",
      name: "run",
      kind: "method",
      signature: "public RunResult run(String name, Map<String, Object> inputs)",
      parameters: [
        { name: "name", type: "String" },
        { name: "inputs", type: "Map<String, Object>" }
      ],
      returns: { type: "RunResult" }
    }
  ]
}
```

### 8.3 Go-Specific Fields

```typescript
// Go struct example
{
  id: "pkg_go_langsmith:Client",
  name: "Client",
  qualifiedName: "langsmith.Client",
  kind: "class",  // Go struct → IR class
  language: "go",
  summary: "Client for interacting with LangSmith API.",
  signature: "type Client struct",
  members: [
    {
      id: "pkg_go_langsmith:Client.Run",
      name: "Run",
      kind: "method",
      signature: "func (c *Client) Run(ctx context.Context, name string, inputs map[string]any) (*RunResult, error)",
      parameters: [
        { name: "ctx", type: "context.Context" },
        { name: "name", type: "string" },
        { name: "inputs", type: "map[string]any" }
      ],
      returns: { type: "(*RunResult, error)" }
    }
  ]
}
```

---

## 9. UI/UX Design

### 9.1 Dynamic Language Dropdown

Update `LanguageDropdown` to show only available languages:

**File:** `apps/web/components/layout/LanguageDropdown.tsx`

```typescript
const ALL_LANGUAGES = [
  { id: "python", name: "Python", icon: <PythonIcon /> },
  { id: "javascript", name: "JavaScript", icon: <JavaScriptIcon /> },
  { id: "java", name: "Java", icon: <JavaIcon /> },
  { id: "go", name: "Go", icon: <GoIcon /> },
];

interface LanguageDropdownProps {
  /** Languages available for the current project */
  availableLanguages: string[];
}

export function LanguageDropdown({ availableLanguages }: LanguageDropdownProps) {
  // Filter to only show available languages
  const languages = ALL_LANGUAGES.filter(
    lang => availableLanguages.includes(lang.id)
  );

  // Don't show dropdown if only one language
  if (languages.length <= 1) {
    return null;
  }

  // ... rest of component
}
```

### 9.2 Language Icons

Add icons for Java and Go:

```tsx
// Java Icon
const JavaIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.851 18.56s-.917.534.653.714c1.902.218 2.874.187 4.969-.211 0 0 .552.346 1.321.646-4.699 2.013-10.633-.118-6.943-1.149M8.276 15.933s-1.028.761.542.924c2.032.209 3.636.227 6.413-.308 0 0 .384.389.987.602-5.679 1.661-12.007.13-7.942-1.218M13.116 11.475c1.158 1.333-.304 2.533-.304 2.533s2.939-1.518 1.589-3.418c-1.261-1.772-2.228-2.652 3.007-5.688 0-.001-8.216 2.051-4.292 6.573" />
    <path d="M19.33 20.504s.679.559-.747.991c-2.712.822-11.288 1.069-13.669.033-.856-.373.75-.89 1.254-.998.527-.114.828-.093.828-.093-.953-.671-6.156 1.317-2.643 1.887 9.58 1.553 17.462-.7 14.977-1.82M9.292 13.21s-4.362 1.036-1.544 1.412c1.189.159 3.561.123 5.77-.062 1.806-.152 3.618-.477 3.618-.477s-.637.272-1.098.587c-4.429 1.165-12.986.623-10.522-.568 2.082-1.006 3.776-.892 3.776-.892M17.116 17.584c4.503-2.34 2.421-4.589.968-4.285-.355.074-.515.138-.515.138s.132-.207.385-.297c2.875-1.011 5.086 2.981-.928 4.562 0-.001.07-.062.09-.118" />
    <path d="M14.401 0s2.494 2.494-2.365 6.33c-3.896 3.077-.889 4.832 0 6.836-2.274-2.053-3.943-3.858-2.824-5.539 1.644-2.469 6.197-3.665 5.189-7.627M9.734 23.924c4.322.277 10.959-.153 11.116-2.198 0 0-.302.775-3.572 1.391-3.688.694-8.239.613-10.937.168 0-.001.553.457 3.393.639" />
  </svg>
);

// Go Icon (Gopher)
const GoIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zM12.129 10.09l-1.764.502c-.14.035-.152.047-.269-.093-.14-.163-.233-.27-.42-.374-.56-.316-1.107-.222-1.611.14-.596.433-.893 1.074-.88 1.846.012.737.502 1.376 1.227 1.529.631.14 1.168-.035 1.611-.479.093-.093.175-.199.269-.303H9.286c-.199 0-.245-.117-.175-.292.117-.315.35-.842.432-1.11.023-.081.082-.21.257-.21h2.465c-.012.152-.012.304-.035.456-.094.726-.327 1.4-.735 2.009-.653.968-1.529 1.587-2.652 1.822-.933.199-1.822.14-2.652-.269-1.056-.514-1.67-1.435-1.857-2.582-.164-1.01.082-1.962.596-2.828.525-.902 1.273-1.517 2.232-1.892.806-.316 1.634-.386 2.49-.222 1.134.199 2.022.764 2.664 1.716.233.339.42.702.502 1.11-.012.035-.035.058-.082.07z" />
    <path d="M18.641 15.262c-1.003-.012-1.939-.257-2.771-.781-.667-.42-1.157-.98-1.46-1.693-.328-.769-.433-1.587-.293-2.419.175-1.075.749-1.927 1.6-2.594.769-.596 1.657-.921 2.63-1.015.889-.082 1.741.047 2.534.432.91.444 1.553 1.11 1.927 2.032.328.815.41 1.67.246 2.547-.187 1.145-.726 2.115-1.647 2.863-.772.632-1.665.991-2.666 1.121-.339.047-.667.059-1.1.07v-.563zm2.396-3.72c-.012-.14-.012-.257-.035-.374-.14-.714-.467-1.308-1.05-1.751-.538-.409-1.167-.514-1.834-.386-.725.14-1.297.514-1.716 1.11-.432.608-.583 1.297-.467 2.032.117.713.467 1.295 1.05 1.728.478.351 1.027.479 1.622.432.769-.059 1.39-.374 1.857-.98.374-.467.561-1.004.573-1.81z" />
  </svg>
);
```

### 9.3 Project Variants Update

Update project configuration to include Java and Go:

**File:** `apps/web/lib/config/projects.ts`

```typescript
{
  id: "langsmith",
  displayName: "LangSmith",
  description: "Debug, evaluate, and monitor your language models",
  slug: "langsmith",
  order: 5,
  enabled: true,
  variants: [
    {
      language: "python",
      repo: "langchain-ai/langsmith-sdk",
      configPath: "configs/langsmith-python.json",
      enabled: true,
    },
    {
      language: "javascript",
      repo: "langchain-ai/langsmith-sdk",
      configPath: "configs/langsmith-typescript.json",
      enabled: true,
    },
    {
      language: "java",
      repo: "langchain-ai/langsmith-java",
      configPath: "configs/langsmith-java.json",
      enabled: true,
    },
    {
      language: "go",
      repo: "langchain-ai/langsmith-go",
      configPath: "configs/langsmith-go.json",
      enabled: true,
    },
  ],
}
```

### 9.4 Available Languages Helper

**File:** `apps/web/lib/config/languages.ts`

```typescript
import { PROJECTS } from "./projects";

/**
 * Get available languages for a project.
 */
export function getAvailableLanguages(projectId: string): string[] {
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return ["python", "javascript"];

  return project.variants.filter((v) => v.enabled).map((v) => v.language);
}

/**
 * Check if a language is available for a project.
 */
export function isLanguageAvailable(projectId: string, language: string): boolean {
  return getAvailableLanguages(projectId).includes(language);
}
```

### 9.5 Mobile Menu Updates

Update `MobileProjectMenu` to handle dynamic languages:

```tsx
// In MobileProjectMenu
const availableLanguages = getAvailableLanguages(currentProject.id);

// Render language options
{
  availableLanguages.map((lang) => (
    <LanguageOption
      key={lang}
      language={lang}
      isSelected={lang === currentLanguage}
      onSelect={() => handleLanguageChange(lang)}
    />
  ));
}
```

### 9.6 Routing Updates

Add new language routes in Next.js:

**File:** `apps/web/app/(ref)/[lang]/layout.tsx`

```typescript
// Validate language parameter
const VALID_LANGUAGES = ["python", "javascript", "java", "go"];

export function generateStaticParams() {
  return VALID_LANGUAGES.map((lang) => ({ lang }));
}
```

---

## 10. Implementation Plan

### 10.1 Phase 1: Schema & Constants Updates

1. Update `packages/ir-schema/src/project.ts` with new Language type
2. Update `packages/build-pipeline/src/constants.ts` with new languages
3. Update `configs/config-schema.json` with java/go enum values
4. Create `configs/langsmith-java.json`
5. Create `configs/langsmith-go.json`
6. Create version config files (`langsmith-java-versions.json`, `langsmith-go-versions.json`)

### 10.2 Phase 2: Java Extractor

**New package:** `packages/extractor-java`

1. Set up package structure with package.json, tsconfig.json
2. Implement Java source parser (using java-parser npm package)
3. Implement Javadoc extractor and markdown converter
4. Implement IR transformer (Java → SymbolRecord)
5. Implement CLI interface matching existing extractors
6. Add unit tests for parsing and transformation
7. Test with langsmith-java repository

### 10.3 Phase 3: Go Extractor

**New package:** `packages/extractor-go`

1. Set up package structure with package.json, tsconfig.json
2. Implement Go doc extractor (using `go doc -json`)
3. Implement Go AST parser for type information
4. Implement IR transformer (Go → SymbolRecord)
5. Implement CLI interface matching existing extractors
6. Add unit tests for parsing and transformation
7. Test with langsmith-go repository

### 10.4 Phase 4: Build Pipeline Updates

1. Update `build-ir.ts` with `extractJava()` and `extractGo()` functions
2. Update `normalizePackageId()` for new language prefixes
3. Update pointer generation for java/go output languages
4. Test full build pipeline with Java and Go configs
5. Verify IR output format is consistent

### 10.5 Phase 5: Web Application Updates

1. Update `projects.ts` with Java/Go variants for LangSmith
2. Create `languages.ts` helper module
3. Update `LanguageDropdown.tsx` for dynamic languages
4. Add Java and Go icons
5. Update `MobileProjectMenu.tsx` for dynamic languages
6. Update routing to support `/java/` and `/go/` paths
7. Test navigation and language switching

### 10.6 Phase 6: Testing & Polish

1. End-to-end test of full build pipeline for all four languages
2. Test language dropdown behavior on different projects
3. Verify cross-language navigation works (with fallbacks)
4. Test sitemap generation includes Java/Go routes
5. Performance testing for new extractors
6. Documentation updates

---

## 11. Edge Cases & Safety

### 11.1 Missing Language Variant

If a language is not available for a project:

- Language dropdown hides unavailable options
- Direct URL access returns 404
- Cross-language switching falls back to available language

```typescript
if (!isLanguageAvailable(projectId, targetLanguage)) {
  // Redirect to default language for project
  const defaultLang = getAvailableLanguages(projectId)[0];
  redirect(`/${defaultLang}/${packageSlug}`);
}
```

### 11.2 Extractor Failures

Handle extraction failures gracefully:

```typescript
try {
  if (config.language === "java") {
    await extractJava(packagePath, packageName, outputPath, repo, sha);
  }
} catch (error) {
  console.error(`   ✗ Java extraction failed: ${error}`);
  // Log but don't fail the entire build
  failedPackages.add(packageName);
}
```

### 11.3 Missing Tools

Java and Go extractors require language tools:

```typescript
async function checkJavaTools(): Promise<boolean> {
  try {
    execSync("java -version", { stdio: "ignore" });
    return true;
  } catch {
    console.warn("⚠️ Java not found - skipping Java extraction");
    return false;
  }
}

async function checkGoTools(): Promise<boolean> {
  try {
    execSync("go version", { stdio: "ignore" });
    return true;
  } catch {
    console.warn("⚠️ Go not found - skipping Go extraction");
    return false;
  }
}
```

### 11.4 Empty Documentation

Handle cases where symbols have no documentation:

```typescript
function extractSummary(doc: string | undefined): string {
  if (!doc || doc.trim() === "") {
    return "No description available.";
  }
  return extractFirstSentence(doc);
}
```

### 11.5 Cross-Language Symbol Resolution

For now, cross-language resolution only works between Python and JavaScript. Java and Go users get fallback behavior:

```typescript
// In symbol resolution
if (targetLanguage === "java" || targetLanguage === "go") {
  // No cross-language mapping available yet
  // Fall back to package or language root
  return {
    found: false,
    targetUrl: `/${targetLanguage}/${packageSlug || "langsmith"}`,
    matchType: "language",
    score: 0,
  };
}
```

---

## 12. Acceptance Criteria

### 12.1 Functional Requirements

| ID  | Requirement                                          | Priority |
| --- | ---------------------------------------------------- | -------- |
| R1  | Java and Go added to config language enum            | P0       |
| R2  | Java extractor produces valid IR from langsmith-java | P0       |
| R3  | Go extractor produces valid IR from langsmith-go     | P0       |
| R4  | Build pipeline handles java/go config files          | P0       |
| R5  | Language dropdown shows only available languages     | P0       |
| R6  | `/java/langsmith` route renders Java documentation   | P0       |
| R7  | `/go/langsmith` route renders Go documentation       | P0       |
| R8  | Mobile menu respects available languages             | P0       |
| R9  | LangSmith project shows 4 language options           | P0       |
| R10 | LangChain project shows only Python/JavaScript       | P0       |
| R11 | Search works for Java/Go symbols                     | P1       |
| R12 | Sitemap includes Java/Go routes                      | P1       |

### 12.2 Quality Requirements

| ID  | Requirement                      | Target                    |
| --- | -------------------------------- | ------------------------- |
| Q1  | Java extraction time per package | < 60s                     |
| Q2  | Go extraction time per package   | < 30s                     |
| Q3  | Symbol coverage for Java         | > 90% of public API       |
| Q4  | Symbol coverage for Go           | > 90% of exported symbols |
| Q5  | Page load time for Java/Go pages | < 500ms                   |

### 12.3 Test Cases

| Test                        | Input                     | Expected Output                       |
| --------------------------- | ------------------------- | ------------------------------------- |
| Java extraction             | langsmith-java repo       | Valid symbols.json with Client class  |
| Go extraction               | langsmith-go repo         | Valid symbols.json with Client struct |
| Java route                  | `/java/langsmith/Client`  | Renders Client class page             |
| Go route                    | `/go/langsmith/Client`    | Renders Client struct page            |
| LangSmith dropdown          | View any LangSmith page   | Shows Python, JavaScript, Java, Go    |
| LangChain dropdown          | View any LangChain page   | Shows only Python, JavaScript         |
| Language switch Java→Python | Click Python in Java page | Navigates to /python/langsmith        |
| Missing language URL        | `/java/langchain`         | 404 or redirect to /python/langchain  |

---

## Appendix A: Java Signature Format

### A.1 Class Signatures

```java
// Input
public class Client<T extends Config> implements AutoCloseable, Runnable

// Output signature
"public class Client<T extends Config> implements AutoCloseable, Runnable"
```

### A.2 Method Signatures

```java
// Input
public <R> CompletableFuture<R> runAsync(
    String name,
    Map<String, Object> inputs,
    Function<RunContext, R> handler
) throws LangSmithException

// Output signature
"public <R> CompletableFuture<R> runAsync(String name, Map<String, Object> inputs, Function<RunContext, R> handler) throws LangSmithException"
```

---

## Appendix B: Go Signature Format

### B.1 Type Signatures

```go
// Input
type Client struct {
    apiKey string
    // ...
}

// Output signature
"type Client struct"
```

### B.2 Function Signatures

```go
// Input
func (c *Client) Run(ctx context.Context, name string, inputs map[string]any) (*RunResult, error)

// Output signature
"func (c *Client) Run(ctx context.Context, name string, inputs map[string]any) (*RunResult, error)"
```

### B.3 Interface Signatures

```go
// Input
type Tracer interface {
    StartSpan(ctx context.Context, name string) Span
    EndSpan(span Span)
}

// Output signature
"type Tracer interface"
```

---

## Appendix C: Language Display Configuration

### C.1 Language Metadata

```typescript
export const LANGUAGE_CONFIG = {
  python: {
    id: "python",
    name: "Python",
    icon: "python-icon",
    fileExtension: ".py",
    ecosystem: "Python",
  },
  javascript: {
    id: "javascript",
    name: "JavaScript",
    icon: "javascript-icon",
    fileExtension: ".ts",
    ecosystem: "JavaScript/TypeScript",
  },
  java: {
    id: "java",
    name: "Java",
    icon: "java-icon",
    fileExtension: ".java",
    ecosystem: "JVM",
  },
  go: {
    id: "go",
    name: "Go",
    icon: "go-icon",
    fileExtension: ".go",
    ecosystem: "Go",
  },
};
```

---

_End of Specification_
