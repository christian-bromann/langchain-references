# Specification: IR Extractor & Reference UI

**Spec ID**: `2025-12-28-ir-extractor-and-reference-ui`  
**Created**: December 28, 2025  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Python Extractor](#3-python-extractor)
4. [TypeScript Extractor](#4-typescript-extractor)
5. [Intermediate Representation (IR)](#5-intermediate-representation-ir)
6. [Next.js Reference UI](#6-nextjs-reference-ui)
7. [Component Specifications](#7-component-specifications)
8. [Search Implementation](#8-search-implementation)
9. [Build Pipeline](#9-build-pipeline)
10. [API Routes](#10-api-routes)
11. [Testing Strategy](#11-testing-strategy)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Build a unified API reference documentation platform that:
- Extracts API documentation from Python and TypeScript source code
- Generates a normalized Intermediate Representation (IR)
- Renders a Next.js application matching the Mintlify Aspen theme
- Deploys to `reference.langchain.com`

### 1.2 Scope

**In Scope (v1)**:
- Python extractor using griffe (static parsing)
- TypeScript extractor using TypeDoc (without node_modules)
- IR generation and storage
- Next.js reference UI with Mintlify design
- Language-specific search
- Manual build triggers

**Out of Scope (v1)**:
- LangGraph packages
- LangSmith documentation
- Cross-language search
- Automated release triggers
- Version history (only `latest`)

### 1.3 Package Scope

#### Python Packages
| Package | Source Path |
|---------|-------------|
| `langchain` | `libs/langchain_v1` |
| `langchain-core` | `libs/core` |
| `langchain-text-splitters` | `libs/text-splitters` |
| `langchain-mcp-adapters` | External repo |
| `langchain-tests` | `libs/standard-tests` |
| `langchain-classic` | `libs/langchain` |

#### TypeScript Packages
| Package | Source Path |
|---------|-------------|
| `@langchain/core` | `libs/langchain-core` |
| `@langchain/community` | `libs/langchain-community` |
| `@langchain/anthropic` | `libs/providers/langchain-anthropic` |
| `@langchain/aws` | `libs/providers/langchain-aws` |
| `@langchain/deepseek` | `libs/providers/langchain-deepseek` |
| `@langchain/google-genai` | `libs/providers/langchain-google-genai` |
| `@langchain/google-vertexai` | `libs/providers/langchain-google-vertexai` |
| `@langchain/google-vertexai-web` | `libs/providers/langchain-google-vertexai-web` |
| `@langchain/groq` | `libs/providers/langchain-groq` |
| `@langchain/classic` | `langchain` |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                BUILD LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│   │   GitHub    │     │   Python    │     │ TypeScript  │                   │
│   │   Tarball   │────▶│  Extractor  │     │  Extractor  │                   │
│   │   Fetcher   │     │  (griffe)   │     │  (TypeDoc)  │                   │
│   └─────────────┘     └──────┬──────┘     └──────┬──────┘                   │
│                              │                   │                           │
│                              └─────────┬─────────┘                           │
│                                        ▼                                     │
│                              ┌─────────────────┐                             │
│                              │  IR Transformer │                             │
│                              └────────┬────────┘                             │
│                                       │                                      │
│         ┌─────────────────────────────┼─────────────────────────────┐        │
│         ▼                             ▼                             ▼        │
│  ┌────────────┐              ┌────────────────┐              ┌───────────┐   │
│  │  Manifest  │              │ Symbol Shards  │              │  Search   │   │
│  │   .json    │              │    .json       │              │  Index    │   │
│  └────────────┘              └────────────────┘              └───────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               STORAGE LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐                    ┌──────────────────┐              │
│   │   Vercel Blob    │                    │    Vercel KV     │              │
│   │                  │                    │                  │              │
│   │ /ir/{buildId}/   │                    │ latest:python:*  │              │
│   │   manifest.json  │                    │ latest:js:*      │              │
│   │   routing/*.json │                    │ build:*          │              │
│   │   symbols/*.json │                    │                  │              │
│   │   search/*.json  │                    │                  │              │
│   └──────────────────┘                    └──────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RENDERING LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────┐      │
│   │                      Next.js App Router                           │      │
│   │                                                                   │      │
│   │   /python/[...slug]/page.tsx                                     │      │
│   │   /javascript/[...slug]/page.tsx                                 │      │
│   │                                                                   │      │
│   └──────────────────────────────────────────────────────────────────┘      │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────┐      │
│   │                         Vercel Edge                               │      │
│   │                    reference.langchain.com                        │      │
│   └──────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Directory Structure

```
langchain-reference-docs/
├── apps/
│   └── web/                          # Next.js application
│       ├── app/
│       │   ├── (ref)/                # Reference docs route group
│       │   │   ├── layout.tsx        # Shared chrome
│       │   │   ├── python/
│       │   │   │   └── [...slug]/
│       │   │   │       └── page.tsx
│       │   │   └── javascript/
│       │   │       └── [...slug]/
│       │   │           └── page.tsx
│       │   ├── api/
│       │   │   ├── build/
│       │   │   │   └── route.ts      # Manual build trigger
│       │   │   └── search/
│       │   │       └── route.ts      # Search API
│       │   └── layout.tsx
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Header.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── TableOfContents.tsx
│       │   │   └── Footer.tsx
│       │   ├── reference/
│       │   │   ├── ClassPage.tsx
│       │   │   ├── FunctionPage.tsx
│       │   │   ├── ModulePage.tsx
│       │   │   ├── MethodSignature.tsx
│       │   │   ├── ParameterTable.tsx
│       │   │   └── TypeAnnotation.tsx
│       │   ├── search/
│       │   │   ├── SearchModal.tsx
│       │   │   └── SearchResults.tsx
│       │   └── ui/                   # Base UI components
│       │       ├── CodeBlock.tsx
│       │       ├── Breadcrumbs.tsx
│       │       └── ...
│       ├── lib/
│       │   ├── ir/
│       │   │   ├── loader.ts         # IR fetching utilities
│       │   │   └── types.ts          # IR TypeScript types
│       │   ├── search/
│       │   │   └── client.ts         # Search client
│       │   └── utils/
│       │       └── url.ts            # URL helpers
│       └── styles/
│           ├── globals.css
│           └── tokens.css            # Design tokens
│
├── packages/
│   ├── extractor-python/             # Python extractor
│   │   ├── src/
│   │   │   ├── __init__.py
│   │   │   ├── extractor.py          # Main extraction logic
│   │   │   ├── transformer.py        # griffe → IR
│   │   │   └── cli.py                # CLI interface
│   │   ├── pyproject.toml
│   │   └── README.md
│   │
│   ├── extractor-typescript/         # TypeScript extractor
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── extractor.ts          # TypeDoc wrapper
│   │   │   ├── transformer.ts        # TypeDoc JSON → IR
│   │   │   └── cli.ts                # CLI interface
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── ir-schema/                    # Shared IR types
│       ├── src/
│       │   ├── index.ts
│       │   ├── manifest.ts
│       │   ├── symbol.ts
│       │   └── search.ts
│       └── package.json
│
├── scripts/
│   ├── build-ir.ts                   # Orchestrates IR generation
│   ├── fetch-tarball.ts              # GitHub tarball fetcher
│   └── upload-ir.ts                  # Upload to Vercel Blob
│
├── .github/
│   └── workflows/
│       └── build.yml                 # Manual dispatch workflow
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## 3. Python Extractor

### 3.1 Overview

The Python extractor uses **griffe** to statically parse Python source code and extract API documentation without runtime imports.

### 3.2 Extraction Configuration

```python
# packages/extractor-python/src/config.py

from dataclasses import dataclass
from typing import List, Optional

@dataclass
class ExtractionConfig:
    """Configuration for Python extraction."""
    
    # Package to extract
    package_name: str
    package_path: str
    
    # Parsing options
    docstring_style: str = "google"  # google | numpy | sphinx
    include_private: bool = False
    include_special: bool = False
    
    # Filtering
    exclude_patterns: List[str] = None
    
    # Source info
    repo: str = ""
    sha: str = ""
```

### 3.3 Extraction Process

```python
# packages/extractor-python/src/extractor.py

import griffe
from pathlib import Path
from typing import Dict, Any

class PythonExtractor:
    """Extract Python API documentation using griffe."""
    
    def __init__(self, config: ExtractionConfig):
        self.config = config
        self.loader = griffe.GriffeLoader(
            docstring_parser=griffe.DocstringStyle.google,
            resolve_external_references=False,  # Static only
        )
    
    def extract(self) -> Dict[str, Any]:
        """Extract all symbols from the package."""
        
        # Load the package
        package = self.loader.load(
            self.config.package_name,
            search_paths=[self.config.package_path],
        )
        
        # Collect all symbols
        symbols = []
        for obj in self._walk(package):
            if self._should_include(obj):
                symbols.append(self._extract_symbol(obj))
        
        return {
            "package": self.config.package_name,
            "version": self._get_version(),
            "symbols": symbols,
        }
    
    def _walk(self, obj):
        """Recursively walk all objects in a module."""
        yield obj
        for member in obj.members.values():
            yield from self._walk(member)
    
    def _should_include(self, obj) -> bool:
        """Check if object should be included in output."""
        # Skip private unless configured
        if obj.name.startswith("_") and not self.config.include_private:
            if not (obj.name.startswith("__") and obj.name.endswith("__")):
                return False
        
        # Skip excluded patterns
        if self.config.exclude_patterns:
            for pattern in self.config.exclude_patterns:
                if pattern in obj.path:
                    return False
        
        return True
    
    def _extract_symbol(self, obj) -> Dict[str, Any]:
        """Extract symbol information."""
        return {
            "kind": self._get_kind(obj),
            "name": obj.name,
            "path": obj.path,
            "signature": self._get_signature(obj),
            "docstring": self._extract_docstring(obj),
            "source": {
                "file": str(obj.filepath) if obj.filepath else None,
                "line": obj.lineno,
            },
            "members": [m.name for m in obj.members.values()] if hasattr(obj, "members") else [],
        }
    
    def _get_kind(self, obj) -> str:
        """Map griffe kind to IR kind."""
        kind_map = {
            griffe.ObjectKind.MODULE: "module",
            griffe.ObjectKind.CLASS: "class",
            griffe.ObjectKind.FUNCTION: "function",
            griffe.ObjectKind.METHOD: "method",
            griffe.ObjectKind.PROPERTY: "property",
            griffe.ObjectKind.ATTRIBUTE: "attribute",
        }
        return kind_map.get(obj.kind, "unknown")
    
    def _get_signature(self, obj) -> str:
        """Get the signature string."""
        if hasattr(obj, "signature"):
            return str(obj.signature)
        return ""
    
    def _extract_docstring(self, obj) -> Dict[str, Any]:
        """Extract parsed docstring."""
        if not obj.docstring:
            return {"summary": "", "sections": []}
        
        parsed = obj.docstring.parsed
        return {
            "summary": str(parsed[0]) if parsed else "",
            "sections": [
                {
                    "kind": section.kind.name.lower(),
                    "value": self._section_to_dict(section),
                }
                for section in parsed
            ],
        }
    
    def _section_to_dict(self, section) -> Any:
        """Convert docstring section to dict."""
        if hasattr(section, "value"):
            if isinstance(section.value, list):
                return [
                    {
                        "name": item.name,
                        "annotation": str(item.annotation) if item.annotation else None,
                        "description": item.description,
                        "default": str(item.default) if item.default else None,
                    }
                    for item in section.value
                ]
            return str(section.value)
        return str(section)
```

### 3.4 CLI Interface

```python
# packages/extractor-python/src/cli.py

import argparse
import json
from pathlib import Path
from .extractor import PythonExtractor
from .config import ExtractionConfig

def main():
    parser = argparse.ArgumentParser(description="Extract Python API docs")
    parser.add_argument("--package", required=True, help="Package name")
    parser.add_argument("--path", required=True, help="Path to package source")
    parser.add_argument("--output", required=True, help="Output JSON file")
    parser.add_argument("--repo", default="", help="Repository URL")
    parser.add_argument("--sha", default="", help="Git SHA")
    
    args = parser.parse_args()
    
    config = ExtractionConfig(
        package_name=args.package,
        package_path=args.path,
        repo=args.repo,
        sha=args.sha,
    )
    
    extractor = PythonExtractor(config)
    result = extractor.extract()
    
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2))
    
    print(f"Extracted {len(result['symbols'])} symbols to {args.output}")

if __name__ == "__main__":
    main()
```

---

## 4. TypeScript Extractor

### 4.1 Overview

The TypeScript extractor uses **TypeDoc** to generate JSON output from TypeScript source code, then transforms it to IR format.

### 4.2 Extraction Configuration

```typescript
// packages/extractor-typescript/src/config.ts

export interface ExtractionConfig {
  // Package info
  packageName: string;
  packagePath: string;
  
  // TypeDoc options
  entryPoints: string[];
  tsconfig?: string;
  
  // Filtering
  excludePrivate: boolean;
  excludeInternal: boolean;
  excludeExternals: boolean;
  
  // Source info
  repo: string;
  sha: string;
}

export const defaultConfig: Partial<ExtractionConfig> = {
  excludePrivate: true,
  excludeInternal: true,
  excludeExternals: true,
};
```

### 4.3 TypeDoc Wrapper

```typescript
// packages/extractor-typescript/src/extractor.ts

import * as td from "typedoc";
import { ExtractionConfig, defaultConfig } from "./config";

export class TypeScriptExtractor {
  private config: ExtractionConfig;
  
  constructor(config: ExtractionConfig) {
    this.config = { ...defaultConfig, ...config };
  }
  
  async extract(): Promise<td.ProjectReflection | null> {
    const app = await td.Application.bootstrap({
      entryPoints: this.config.entryPoints,
      tsconfig: this.config.tsconfig,
      
      // Output options
      json: true,
      
      // Filtering
      excludePrivate: this.config.excludePrivate,
      excludeInternal: this.config.excludeInternal,
      excludeExternals: this.config.excludeExternals,
      
      // Skip type checking for speed
      skipErrorChecking: true,
      
      // Don't require node_modules
      excludeNotDocumented: false,
    });
    
    const project = await app.convert();
    
    if (!project) {
      throw new Error("TypeDoc conversion failed");
    }
    
    return project;
  }
  
  async extractToJson(): Promise<object> {
    const project = await this.extract();
    if (!project) {
      throw new Error("No project to serialize");
    }
    
    const app = await td.Application.bootstrap({});
    const serializer = new td.Serializer();
    return serializer.projectToObject(project, process.cwd());
  }
}
```

### 4.4 TypeDoc to IR Transformer

```typescript
// packages/extractor-typescript/src/transformer.ts

import type { JSONOutput } from "typedoc";
import type { SymbolRecord } from "@langchain/ir-schema";

type TypeDocReflection = JSONOutput.Reflection;
type TypeDocProject = JSONOutput.ProjectReflection;

export class TypeDocTransformer {
  private project: TypeDocProject;
  private packageName: string;
  private repo: string;
  private sha: string;
  
  constructor(
    project: TypeDocProject,
    packageName: string,
    repo: string,
    sha: string
  ) {
    this.project = project;
    this.packageName = packageName;
    this.repo = repo;
    this.sha = sha;
  }
  
  transform(): SymbolRecord[] {
    const symbols: SymbolRecord[] = [];
    
    if (this.project.children) {
      for (const child of this.project.children) {
        symbols.push(...this.transformReflection(child, []));
      }
    }
    
    return symbols;
  }
  
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
      for (const child of reflection.children) {
        symbols.push(...this.transformReflection(child, currentPath));
      }
    }
    
    return symbols;
  }
  
  private createSymbolRecord(
    reflection: TypeDocReflection,
    path: string[]
  ): SymbolRecord | null {
    const kind = this.mapKind(reflection.kind);
    if (!kind) return null;
    
    const id = `sym_ts_${kind}_${path.join("_")}`;
    
    return {
      id,
      packageId: `pkg_js_${this.packageName.replace(/[@/]/g, "_")}`,
      language: "typescript",
      kind,
      name: reflection.name,
      qualifiedName: path.join("."),
      signature: this.getSignature(reflection),
      docs: this.extractDocs(reflection),
      params: this.extractParams(reflection),
      returns: this.extractReturns(reflection),
      source: this.extractSource(reflection),
    };
  }
  
  private mapKind(kindValue: number): string | null {
    // TypeDoc kind values
    const KIND_MAP: Record<number, string> = {
      1: "module",      // Project
      2: "module",      // Module
      4: "namespace",   // Namespace
      8: "enum",        // Enum
      16: "enumMember", // EnumMember
      32: "variable",   // Variable
      64: "function",   // Function
      128: "class",     // Class
      256: "interface", // Interface
      512: "constructor", // Constructor
      1024: "property", // Property
      2048: "method",   // Method
      4096: "function", // CallSignature
      8192: "function", // IndexSignature
      16384: "function", // ConstructorSignature
      32768: "parameter", // Parameter
      65536: "typeAlias", // TypeLiteral
      131072: "typeAlias", // TypeParameter
      262144: "property", // Accessor
      524288: "property", // GetSignature
      1048576: "property", // SetSignature
      2097152: "typeAlias", // TypeAlias
      4194304: "module", // Reference
    };
    
    return KIND_MAP[kindValue] || null;
  }
  
  private getSignature(reflection: TypeDocReflection): string {
    // Build signature from type info
    if ("signatures" in reflection && reflection.signatures?.[0]) {
      const sig = reflection.signatures[0];
      const params = this.formatParams(sig);
      const returns = this.formatType(sig.type);
      return `(${params}) => ${returns}`;
    }
    
    if ("type" in reflection && reflection.type) {
      return this.formatType(reflection.type);
    }
    
    return "";
  }
  
  private formatParams(sig: any): string {
    if (!sig.parameters) return "";
    
    return sig.parameters
      .map((p: any) => {
        const type = this.formatType(p.type);
        const optional = p.flags?.isOptional ? "?" : "";
        return `${p.name}${optional}: ${type}`;
      })
      .join(", ");
  }
  
  private formatType(type: any): string {
    if (!type) return "unknown";
    
    switch (type.type) {
      case "intrinsic":
        return type.name;
      case "reference":
        return type.name + (type.typeArguments 
          ? `<${type.typeArguments.map((t: any) => this.formatType(t)).join(", ")}>`
          : "");
      case "array":
        return `${this.formatType(type.elementType)}[]`;
      case "union":
        return type.types.map((t: any) => this.formatType(t)).join(" | ");
      case "literal":
        return JSON.stringify(type.value);
      default:
        return "unknown";
    }
  }
  
  private extractDocs(reflection: TypeDocReflection): SymbolRecord["docs"] {
    const comment = "comment" in reflection ? reflection.comment : null;
    
    if (!comment) {
      return { summary: "" };
    }
    
    return {
      summary: comment.summary?.map((p: any) => p.text).join("") || "",
      description: comment.blockTags
        ?.filter((t: any) => t.tag === "@remarks")
        .map((t: any) => t.content.map((p: any) => p.text).join(""))
        .join("\n") || undefined,
      examples: comment.blockTags
        ?.filter((t: any) => t.tag === "@example")
        .map((t: any) => ({
          code: t.content.map((p: any) => p.text).join(""),
        })) || undefined,
      deprecated: comment.blockTags?.find((t: any) => t.tag === "@deprecated")
        ? { message: "" }
        : undefined,
    };
  }
  
  private extractParams(reflection: TypeDocReflection): SymbolRecord["params"] {
    if (!("signatures" in reflection) || !reflection.signatures?.[0]) {
      return undefined;
    }
    
    const sig = reflection.signatures[0];
    if (!sig.parameters) return undefined;
    
    return sig.parameters.map((p: any) => ({
      name: p.name,
      type: this.formatType(p.type),
      description: p.comment?.summary?.map((s: any) => s.text).join("") || undefined,
      default: p.defaultValue || undefined,
    }));
  }
  
  private extractReturns(reflection: TypeDocReflection): SymbolRecord["returns"] {
    if (!("signatures" in reflection) || !reflection.signatures?.[0]) {
      return undefined;
    }
    
    const sig = reflection.signatures[0];
    if (!sig.type) return undefined;
    
    const returnComment = sig.comment?.blockTags?.find(
      (t: any) => t.tag === "@returns"
    );
    
    return {
      type: this.formatType(sig.type),
      description: returnComment?.content?.map((p: any) => p.text).join("") || undefined,
    };
  }
  
  private extractSource(reflection: TypeDocReflection): SymbolRecord["source"] {
    const sources = "sources" in reflection ? reflection.sources : null;
    
    if (!sources || sources.length === 0) {
      return {
        repo: this.repo,
        sha: this.sha,
        path: "",
        line: 0,
      };
    }
    
    const source = sources[0];
    return {
      repo: this.repo,
      sha: this.sha,
      path: source.fileName,
      line: source.line,
    };
  }
}
```

---

## 5. Intermediate Representation (IR)

### 5.1 IR Schema Types

```typescript
// packages/ir-schema/src/index.ts

export * from "./manifest";
export * from "./symbol";
export * from "./search";
export * from "./routing";
```

### 5.2 Manifest Schema

```typescript
// packages/ir-schema/src/manifest.ts

export interface Manifest {
  /** IR schema version */
  irVersion: "1.0";
  
  /** Build metadata */
  build: {
    /** Unique build identifier (hash-based) */
    buildId: string;
    /** ISO timestamp of build */
    createdAt: string;
    /** Base URL for the reference site */
    baseUrl: string;
  };
  
  /** Source repositories used in this build */
  sources: Array<{
    /** Full repo path (e.g., "langchain-ai/langchain") */
    repo: string;
    /** Git commit SHA */
    sha: string;
    /** When tarball was fetched */
    fetchedAt: string;
  }>;
  
  /** Packages included in this build */
  packages: Package[];
}

export interface Package {
  /** Unique package identifier */
  packageId: string;
  
  /** Human-readable display name */
  displayName: string;
  
  /** Package name as published (npm/PyPI) */
  publishedName: string;
  
  /** Programming language */
  language: "python" | "typescript";
  
  /** Package ecosystem */
  ecosystem: "python" | "javascript";
  
  /** Version string */
  version: string;
  
  /** Source repository */
  repo: {
    owner: string;
    name: string;
    sha: string;
    path: string;
  };
  
  /** Entry point for navigation */
  entry: {
    kind: "module";
    refId: string;
  };
  
  /** Navigation structure hints */
  nav: {
    rootGroups: string[];
  };
  
  /** Symbol counts by kind */
  stats: {
    classes: number;
    functions: number;
    modules: number;
    types: number;
    total: number;
  };
}
```

### 5.3 Symbol Schema

```typescript
// packages/ir-schema/src/symbol.ts

export type SymbolKind =
  | "module"
  | "class"
  | "function"
  | "method"
  | "property"
  | "attribute"
  | "interface"
  | "typeAlias"
  | "enum"
  | "enumMember"
  | "variable"
  | "namespace"
  | "parameter";

export type Language = "python" | "typescript";
export type Visibility = "public" | "protected" | "private";
export type Stability = "experimental" | "beta" | "stable" | "deprecated";

export interface SymbolRecord {
  /** Unique symbol identifier */
  id: string;
  
  /** Parent package ID */
  packageId: string;
  
  /** Source language */
  language: Language;
  
  /** Symbol kind */
  kind: SymbolKind;
  
  /** Simple name (e.g., "ChatOpenAI") */
  name: string;
  
  /** Fully qualified name (e.g., "langchain_openai.ChatOpenAI") */
  qualifiedName: string;
  
  /** Display information */
  display: {
    /** Name for display (may include formatting) */
    name: string;
    /** Qualified path for breadcrumbs */
    qualified: string;
  };
  
  /** Signature string */
  signature: string;
  
  /** Documentation */
  docs: {
    /** One-line summary */
    summary: string;
    /** Full description (markdown) */
    description?: string;
    /** Usage examples */
    examples?: Array<{
      title?: string;
      code: string;
      language?: string;
    }>;
    /** Deprecation notice */
    deprecated?: {
      isDeprecated: true;
      message?: string;
      since?: string;
      replacement?: string;
    };
  };
  
  /** Function/method parameters */
  params?: Array<{
    name: string;
    type: string;
    description?: string;
    default?: string;
    required: boolean;
  }>;
  
  /** Return type information */
  returns?: {
    type: string;
    description?: string;
  };
  
  /** Type parameters (generics) */
  typeParams?: Array<{
    name: string;
    constraint?: string;
    default?: string;
  }>;
  
  /** Class members (for classes) */
  members?: Array<{
    name: string;
    refId: string;
    kind: SymbolKind;
    visibility: Visibility;
  }>;
  
  /** Inheritance and implementation */
  relations?: {
    extends?: string[];
    implements?: string[];
    mixes?: string[];
  };
  
  /** Source location */
  source: {
    repo: string;
    sha: string;
    path: string;
    line: number;
    endLine?: number;
  };
  
  /** URL information */
  urls: {
    /** Canonical page URL */
    canonical: string;
    /** Anchor links for members */
    anchors?: Record<string, string>;
  };
  
  /** Metadata tags */
  tags: {
    stability: Stability;
    visibility: Visibility;
    isAsync?: boolean;
    isGenerator?: boolean;
    isAbstract?: boolean;
    isStatic?: boolean;
  };
}
```

### 5.4 Search Schema

```typescript
// packages/ir-schema/src/search.ts

export interface SearchRecord {
  /** Unique search entry ID */
  id: string;
  
  /** Page URL */
  url: string;
  
  /** Display title */
  title: string;
  
  /** Breadcrumb path */
  breadcrumbs: string[];
  
  /** Search excerpt (first ~150 chars of summary) */
  excerpt: string;
  
  /** Keywords for boosting */
  keywords: string[];
  
  /** Symbol kind for filtering */
  kind: string;
  
  /** Language for filtering */
  language: "python" | "typescript";
  
  /** Package ID for filtering */
  packageId: string;
}

export interface SearchIndex {
  /** Index version */
  version: string;
  
  /** Build ID this index was generated from */
  buildId: string;
  
  /** Index creation timestamp */
  createdAt: string;
  
  /** Language this index covers */
  language: "python" | "typescript";
  
  /** All search records */
  records: SearchRecord[];
}
```

### 5.5 Routing Schema

```typescript
// packages/ir-schema/src/routing.ts

export interface RoutingMap {
  /** Package ID this routing map is for */
  packageId: string;
  
  /** Package display name */
  displayName: string;
  
  /** Language */
  language: "python" | "typescript";
  
  /** URL slug → symbol ref ID mapping */
  slugs: Record<string, SlugEntry>;
}

export interface SlugEntry {
  /** Symbol reference ID */
  refId: string;
  
  /** Symbol kind */
  kind: string;
  
  /** Page type */
  pageType: "module" | "class" | "function" | "interface" | "type" | "enum";
  
  /** Title for the page */
  title: string;
}
```

---

## 6. Next.js Reference UI

### 6.1 App Router Structure

```typescript
// apps/web/app/(ref)/layout.tsx

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { getManifest } from "@/lib/ir/loader";

export default async function ReferenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const manifest = await getManifest();
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="flex-1 flex">
        {/* Left Sidebar */}
        <Sidebar packages={manifest.packages} />
        
        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
      
      <Footer />
    </div>
  );
}
```

### 6.2 Python Route Handler

```typescript
// apps/web/app/(ref)/python/[...slug]/page.tsx

import { notFound } from "next/navigation";
import { getRoutingMap, getSymbol } from "@/lib/ir/loader";
import { ClassPage } from "@/components/reference/ClassPage";
import { FunctionPage } from "@/components/reference/FunctionPage";
import { ModulePage } from "@/components/reference/ModulePage";
import { TableOfContents } from "@/components/layout/TableOfContents";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function PythonReferencePage({ params }: PageProps) {
  const { slug } = await params;
  const path = slug.join("/");
  
  // Parse the URL to extract package and symbol path
  // e.g., /python/langchain/classes/ChatOpenAI
  const [packageSlug, ...symbolPath] = slug;
  
  // Load routing map for this package
  const routing = await getRoutingMap("python", packageSlug);
  if (!routing) {
    notFound();
  }
  
  // Find the symbol entry
  const slugKey = symbolPath.join("/");
  const entry = routing.slugs[slugKey];
  if (!entry) {
    notFound();
  }
  
  // Load the symbol
  const symbol = await getSymbol(entry.refId);
  if (!symbol) {
    notFound();
  }
  
  // Render based on page type
  const PageComponent = getPageComponent(entry.pageType);
  
  return (
    <div className="flex">
      {/* Content Area */}
      <article className="flex-1 max-w-4xl px-8 py-12">
        <PageComponent symbol={symbol} />
      </article>
      
      {/* Right TOC */}
      <aside className="hidden xl:block w-64 flex-shrink-0">
        <TableOfContents symbol={symbol} />
      </aside>
    </div>
  );
}

function getPageComponent(pageType: string) {
  switch (pageType) {
    case "class":
      return ClassPage;
    case "function":
      return FunctionPage;
    case "module":
      return ModulePage;
    default:
      return ModulePage;
  }
}

// Generate static params for prerendering popular pages
export async function generateStaticParams() {
  // For now, return empty - pages will be generated on-demand
  return [];
}

// Enable ISR with revalidation
export const revalidate = 3600; // 1 hour
```

### 6.3 IR Loader Utilities

```typescript
// apps/web/lib/ir/loader.ts

import { get } from "@vercel/blob";
import { kv } from "@vercel/kv";
import type { Manifest, SymbolRecord, RoutingMap } from "@langchain/ir-schema";

const IR_BASE_URL = process.env.BLOB_BASE_URL!;

// Cache for build ID resolution
let cachedBuildId: string | null = null;
let buildIdFetchedAt = 0;
const BUILD_ID_TTL = 60 * 1000; // 1 minute

async function getLatestBuildId(): Promise<string> {
  const now = Date.now();
  
  if (cachedBuildId && now - buildIdFetchedAt < BUILD_ID_TTL) {
    return cachedBuildId;
  }
  
  const result = await kv.get<{ buildId: string }>("latest:build");
  if (!result) {
    throw new Error("No latest build found");
  }
  
  cachedBuildId = result.buildId;
  buildIdFetchedAt = now;
  
  return result.buildId;
}

export async function getManifest(): Promise<Manifest> {
  const buildId = await getLatestBuildId();
  const url = `${IR_BASE_URL}/ir/${buildId}/reference.manifest.json`;
  
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to load manifest: ${response.status}`);
  }
  
  return response.json();
}

export async function getRoutingMap(
  language: "python" | "javascript",
  packageSlug: string
): Promise<RoutingMap | null> {
  const buildId = await getLatestBuildId();
  const url = `${IR_BASE_URL}/ir/${buildId}/routing/${language}/${packageSlug}.json`;
  
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to load routing map: ${response.status}`);
  }
  
  return response.json();
}

export async function getSymbol(refId: string): Promise<SymbolRecord | null> {
  const buildId = await getLatestBuildId();
  
  // Symbols are sharded by first 2 chars of refId
  const shard = refId.substring(0, 2);
  const url = `${IR_BASE_URL}/ir/${buildId}/symbols/${shard}/${refId}.json`;
  
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to load symbol: ${response.status}`);
  }
  
  return response.json();
}

export async function getSearchIndex(
  language: "python" | "javascript"
): Promise<SearchIndex> {
  const buildId = await getLatestBuildId();
  const url = `${IR_BASE_URL}/ir/${buildId}/search/${language}.json`;
  
  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to load search index: ${response.status}`);
  }
  
  return response.json();
}
```

---

## 7. Component Specifications

### 7.1 Design Tokens

```css
/* apps/web/styles/tokens.css */

:root {
  /* Brand Colors (from Mintlify docs.json) */
  --color-primary: #2F6868;
  --color-light: #84C4C0;
  --color-dark: #1C3C3C;
  
  /* Accent */
  --color-accent-gold: #D4A574;
  
  /* Backgrounds */
  --bg-primary: #FAFAF8;
  --bg-secondary: #FFFFFF;
  --bg-code: #1E1E1E;
  
  /* Text */
  --text-primary: #1C1C1C;
  --text-secondary: #6B6B6B;
  --text-muted: #9B9B9B;
  
  /* Borders */
  --border-light: #E5E5E5;
  --border-medium: #D0D0D0;
  
  /* Typography */
  --font-heading: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  /* Spacing */
  --sidebar-width: 280px;
  --toc-width: 240px;
  --content-max-width: 768px;
  --header-height: 64px;
}

[data-theme="dark"] {
  --bg-primary: #0D0D0D;
  --bg-secondary: #1A1A1A;
  --bg-code: #0D0D0D;
  
  --text-primary: #FAFAFA;
  --text-secondary: #A0A0A0;
  --text-muted: #707070;
  
  --border-light: #2A2A2A;
  --border-medium: #3A3A3A;
}
```

### 7.2 Header Component

```tsx
// apps/web/components/layout/Header.tsx

"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchModal } from "@/components/search/SearchModal";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  
  return (
    <header className="sticky top-0 z-50 bg-bg-secondary border-b border-border-light">
      <div className="flex items-center h-16 px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img 
            src="/images/brand/langchain-docs-teal.svg" 
            alt="LangChain Docs"
            className="h-8 dark:hidden"
          />
          <img 
            src="/images/brand/langchain-docs-lilac.svg" 
            alt="LangChain Docs"
            className="h-8 hidden dark:block"
          />
        </Link>
        
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="ml-8 flex items-center gap-2 px-4 py-2 rounded-lg
                     bg-bg-primary border border-border-light
                     text-text-muted hover:text-text-secondary
                     transition-colors"
        >
          <SearchIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden md:inline px-2 py-0.5 rounded bg-bg-secondary
                          border border-border-light text-xs">
            ⌘K
          </kbd>
        </button>
        
        {/* Right Actions */}
        <div className="ml-auto flex items-center gap-4">
          <Link 
            href="https://chat.langchain.com/"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
          >
            <MessageIcon className="w-4 h-4" />
            <span className="hidden lg:inline">Ask AI</span>
          </Link>
          
          <Link 
            href="https://github.com/langchain-ai"
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary"
          >
            <GitHubIcon className="w-5 h-5" />
            <span className="hidden lg:inline">GitHub</span>
          </Link>
          
          <ThemeToggle />
          
          <Link
            href="https://smith.langchain.com/"
            className="px-4 py-2 rounded-lg bg-primary text-white
                       hover:bg-primary/90 transition-colors"
          >
            Try LangSmith
          </Link>
        </div>
      </div>
      
      {/* Search Modal */}
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
```

### 7.3 Class Page Component

```tsx
// apps/web/components/reference/ClassPage.tsx

import type { SymbolRecord } from "@langchain/ir-schema";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { MethodSignature } from "./MethodSignature";
import { ParameterTable } from "./ParameterTable";
import { SourceLink } from "./SourceLink";

interface ClassPageProps {
  symbol: SymbolRecord;
}

export function ClassPage({ symbol }: ClassPageProps) {
  const methods = symbol.members?.filter(m => m.kind === "method") || [];
  const properties = symbol.members?.filter(m => m.kind === "property") || [];
  
  return (
    <div className="space-y-8">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: symbol.language === "python" ? "Python" : "JavaScript", href: `/${symbol.language}` },
          { label: symbol.packageId, href: `/${symbol.language}/${symbol.packageId}` },
          { label: "Classes", href: `/${symbol.language}/${symbol.packageId}/classes` },
          { label: symbol.name },
        ]}
      />
      
      {/* Header */}
      <header>
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800
                          dark:bg-purple-900/30 dark:text-purple-300">
            class
          </span>
          {symbol.tags.isAbstract && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
              abstract
            </span>
          )}
        </div>
        
        <h1 className="text-3xl font-bold font-heading text-text-primary">
          {symbol.name}
        </h1>
        
        {symbol.relations?.extends && (
          <p className="mt-2 text-text-secondary">
            extends{" "}
            <code className="text-primary">
              {symbol.relations.extends.join(", ")}
            </code>
          </p>
        )}
      </header>
      
      {/* Signature */}
      <div className="p-4 rounded-lg bg-bg-code">
        <CodeBlock 
          code={symbol.signature} 
          language={symbol.language}
        />
      </div>
      
      {/* Source Link */}
      <SourceLink source={symbol.source} />
      
      {/* Description */}
      {symbol.docs.summary && (
        <section>
          <p className="text-lg text-text-primary leading-relaxed">
            {symbol.docs.summary}
          </p>
          
          {symbol.docs.description && (
            <div 
              className="mt-4 prose prose-slate dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: symbol.docs.description }}
            />
          )}
        </section>
      )}
      
      {/* Deprecation Warning */}
      {symbol.docs.deprecated && (
        <div className="p-4 rounded-lg border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
          <p className="font-medium text-yellow-800 dark:text-yellow-200">
            ⚠️ Deprecated
          </p>
          {symbol.docs.deprecated.message && (
            <p className="mt-1 text-yellow-700 dark:text-yellow-300">
              {symbol.docs.deprecated.message}
            </p>
          )}
        </div>
      )}
      
      {/* Constructor / Init */}
      {symbol.params && symbol.params.length > 0 && (
        <section id="constructor">
          <h2 className="text-xl font-semibold font-heading mb-4">
            Constructor
          </h2>
          <ParameterTable params={symbol.params} />
        </section>
      )}
      
      {/* Properties */}
      {properties.length > 0 && (
        <section id="properties">
          <h2 className="text-xl font-semibold font-heading mb-4">
            Properties
          </h2>
          <div className="space-y-4">
            {properties.map(prop => (
              <PropertyCard key={prop.refId} property={prop} />
            ))}
          </div>
        </section>
      )}
      
      {/* Methods */}
      {methods.length > 0 && (
        <section id="methods">
          <h2 className="text-xl font-semibold font-heading mb-4">
            Methods
          </h2>
          <div className="space-y-6">
            {methods.map(method => (
              <MethodSignature key={method.refId} method={method} />
            ))}
          </div>
        </section>
      )}
      
      {/* Examples */}
      {symbol.docs.examples && symbol.docs.examples.length > 0 && (
        <section id="examples">
          <h2 className="text-xl font-semibold font-heading mb-4">
            Examples
          </h2>
          <div className="space-y-4">
            {symbol.docs.examples.map((example, i) => (
              <div key={i}>
                {example.title && (
                  <h3 className="text-sm font-medium text-text-secondary mb-2">
                    {example.title}
                  </h3>
                )}
                <CodeBlock 
                  code={example.code} 
                  language={example.language || symbol.language}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

### 7.4 Parameter Table Component

```tsx
// apps/web/components/reference/ParameterTable.tsx

interface Parameter {
  name: string;
  type: string;
  description?: string;
  default?: string;
  required: boolean;
}

interface ParameterTableProps {
  params: Parameter[];
}

export function ParameterTable({ params }: ParameterTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-light">
            <th className="text-left py-3 px-4 font-medium text-text-secondary">
              Parameter
            </th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">
              Type
            </th>
            <th className="text-left py-3 px-4 font-medium text-text-secondary">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr key={param.name} className="border-b border-border-light">
              <td className="py-3 px-4">
                <code className="text-primary font-mono">{param.name}</code>
                {param.required && (
                  <span className="ml-1 text-red-500">*</span>
                )}
              </td>
              <td className="py-3 px-4">
                <code className="text-text-secondary font-mono text-xs">
                  {param.type}
                </code>
              </td>
              <td className="py-3 px-4 text-text-secondary">
                {param.description || "—"}
                {param.default && (
                  <span className="block mt-1 text-xs text-text-muted">
                    Default: <code>{param.default}</code>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 8. Search Implementation

### 8.1 Search Client

```typescript
// apps/web/lib/search/client.ts

import MiniSearch from "minisearch";
import type { SearchRecord, SearchIndex } from "@langchain/ir-schema";

let pythonIndex: MiniSearch<SearchRecord> | null = null;
let typescriptIndex: MiniSearch<SearchRecord> | null = null;

async function loadIndex(language: "python" | "typescript"): Promise<MiniSearch<SearchRecord>> {
  const response = await fetch(`/api/search/index?language=${language}`);
  const data: SearchIndex = await response.json();
  
  const index = new MiniSearch<SearchRecord>({
    fields: ["title", "excerpt", "keywords"],
    storeFields: ["id", "url", "title", "breadcrumbs", "excerpt", "kind", "packageId"],
    searchOptions: {
      boost: { title: 3, keywords: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  
  index.addAll(data.records);
  
  return index;
}

export async function search(
  query: string,
  language: "python" | "typescript",
  options: { limit?: number; kind?: string } = {}
): Promise<SearchRecord[]> {
  const { limit = 20, kind } = options;
  
  // Load index on first search
  if (language === "python" && !pythonIndex) {
    pythonIndex = await loadIndex("python");
  } else if (language === "typescript" && !typescriptIndex) {
    typescriptIndex = await loadIndex("typescript");
  }
  
  const index = language === "python" ? pythonIndex! : typescriptIndex!;
  
  let results = index.search(query, { limit: limit * 2 });
  
  // Filter by kind if specified
  if (kind) {
    results = results.filter(r => r.kind === kind);
  }
  
  return results.slice(0, limit).map(r => ({
    id: r.id,
    url: r.url,
    title: r.title,
    breadcrumbs: r.breadcrumbs,
    excerpt: r.excerpt,
    kind: r.kind,
    language,
    packageId: r.packageId,
  }));
}
```

### 8.2 Search Modal Component

```tsx
// apps/web/components/search/SearchModal.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@radix-ui/react-dialog";
import { search } from "@/lib/search/client";
import type { SearchRecord } from "@langchain/ir-schema";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"python" | "typescript">("python");
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Toggle modal
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  
  // Search on query change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    
    const timer = setTimeout(async () => {
      setLoading(true);
      const searchResults = await search(query, language);
      setResults(searchResults);
      setSelectedIndex(0);
      setLoading(false);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [query, language]);
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          router.push(results[selectedIndex].url);
          onClose();
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  }, [results, selectedIndex, router, onClose]);
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50">
        <div className="bg-bg-secondary rounded-xl shadow-2xl border border-border-light overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 p-4 border-b border-border-light">
            <SearchIcon className="w-5 h-5 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation..."
              className="flex-1 bg-transparent text-lg outline-none text-text-primary
                       placeholder:text-text-muted"
              autoFocus
            />
            
            {/* Language Toggle */}
            <div className="flex rounded-lg border border-border-light overflow-hidden">
              <button
                onClick={() => setLanguage("python")}
                className={`px-3 py-1 text-sm ${
                  language === "python"
                    ? "bg-primary text-white"
                    : "bg-transparent text-text-secondary"
                }`}
              >
                Python
              </button>
              <button
                onClick={() => setLanguage("typescript")}
                className={`px-3 py-1 text-sm ${
                  language === "typescript"
                    ? "bg-primary text-white"
                    : "bg-transparent text-text-secondary"
                }`}
              >
                TypeScript
              </button>
            </div>
          </div>
          
          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-text-muted">
                Searching...
              </div>
            ) : results.length === 0 && query ? (
              <div className="p-8 text-center text-text-muted">
                No results found for "{query}"
              </div>
            ) : (
              <ul>
                {results.map((result, index) => (
                  <li
                    key={result.id}
                    className={`px-4 py-3 cursor-pointer border-b border-border-light
                              ${index === selectedIndex ? "bg-primary/10" : "hover:bg-bg-primary"}`}
                    onClick={() => {
                      router.push(result.url);
                      onClose();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <KindBadge kind={result.kind} />
                      <span className="font-medium text-text-primary">
                        {result.title}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-text-muted">
                      {result.breadcrumbs.join(" › ")}
                    </div>
                    <p className="mt-1 text-sm text-text-secondary line-clamp-1">
                      {result.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {/* Footer */}
          <div className="p-3 border-t border-border-light text-xs text-text-muted
                        flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border-light">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border-light ml-1">↓</kbd>
              to navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border-light">↵</kbd>
              to select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-primary border border-border-light">esc</kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

---

## 9. Build Pipeline

### 9.1 Build Orchestrator

```typescript
// scripts/build-ir.ts

import { program } from "commander";
import { fetchTarball } from "./fetch-tarball";
import { extractPython } from "./extract-python";
import { extractTypeScript } from "./extract-typescript";
import { transformToIR } from "./transform-ir";
import { uploadToBlob } from "./upload-ir";
import { updateKV } from "./update-kv";
import crypto from "crypto";

interface BuildConfig {
  language: "python" | "typescript";
  packages: Array<{
    name: string;
    repo: string;
    path: string;
  }>;
  sha?: string; // If not provided, use latest main
}

async function main() {
  program
    .option("--config <path>", "Build configuration file")
    .option("--dry-run", "Don't upload, just generate locally")
    .parse();

  const opts = program.opts();
  const config: BuildConfig = await import(opts.config);

  console.log("🔧 Starting IR build...");

  // 1. Fetch source tarballs
  console.log("📥 Fetching source tarballs...");
  const sources = await Promise.all(
    [...new Set(config.packages.map(p => p.repo))].map(async (repo) => {
      const sha = config.sha || await getLatestSha(repo);
      await fetchTarball(repo, sha);
      return { repo, sha };
    })
  );

  // 2. Generate build ID
  const buildId = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      sources: sources.sort(),
      packages: config.packages.map(p => p.name).sort(),
    }))
    .digest("hex")
    .slice(0, 16);

  console.log(`🔑 Build ID: ${buildId}`);

  // 3. Extract APIs
  console.log("🔍 Extracting APIs...");
  const extracted = await Promise.all(
    config.packages.map(async (pkg) => {
      if (config.language === "python") {
        return extractPython(pkg);
      } else {
        return extractTypeScript(pkg);
      }
    })
  );

  // 4. Transform to IR
  console.log("🔄 Transforming to IR...");
  const ir = await transformToIR(extracted, {
    buildId,
    sources,
    language: config.language,
  });

  // 5. Upload to Vercel Blob
  if (!opts.dryRun) {
    console.log("☁️ Uploading to Vercel Blob...");
    await uploadToBlob(buildId, ir);

    // 6. Update KV pointers
    console.log("🔗 Updating version pointers...");
    await updateKV(buildId, config);
  } else {
    console.log("🔍 Dry run - skipping upload");
    // Write to local filesystem instead
    await writeLocal(buildId, ir);
  }

  console.log("✅ Build complete!");
}

main().catch(console.error);
```

### 9.2 GitHub Actions Workflow

```yaml
# .github/workflows/build.yml

name: Build IR

on:
  workflow_dispatch:
    inputs:
      language:
        description: 'Language to build'
        required: true
        type: choice
        options:
          - python
          - typescript
          - both
      sha:
        description: 'Git SHA (leave empty for latest main)'
        required: false
        type: string

jobs:
  build-python:
    if: ${{ inputs.language == 'python' || inputs.language == 'both' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - uses: pnpm/action-setup@v2
        with:
          version: 9
          
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          
      - name: Install dependencies
        run: |
          pnpm install
          pip install griffe
          
      - name: Build Python IR
        run: pnpm build:ir --config configs/python.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
          KV_REST_API_URL: ${{ secrets.KV_REST_API_URL }}
          KV_REST_API_TOKEN: ${{ secrets.KV_REST_API_TOKEN }}

  build-typescript:
    if: ${{ inputs.language == 'typescript' || inputs.language == 'both' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - uses: pnpm/action-setup@v2
        with:
          version: 9
          
      - name: Install dependencies
        run: pnpm install
          
      - name: Build TypeScript IR
        run: pnpm build:ir --config configs/typescript.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
          KV_REST_API_URL: ${{ secrets.KV_REST_API_URL }}
          KV_REST_API_TOKEN: ${{ secrets.KV_REST_API_TOKEN }}
```

---

## 10. API Routes

### 10.1 Manual Build Trigger

```typescript
// apps/web/app/api/build/route.ts

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.BUILD_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const body = await request.json();
  const { language, packages, sha } = body;
  
  // Trigger GitHub Actions workflow
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/workflows/build.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          language,
          sha: sha || "",
        },
      }),
    }
  );
  
  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to trigger build" },
      { status: 500 }
    );
  }
  
  return NextResponse.json({ status: "triggered" });
}
```

### 10.2 Search Index Endpoint

```typescript
// apps/web/app/api/search/index/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getSearchIndex } from "@/lib/ir/loader";

export async function GET(request: NextRequest) {
  const language = request.nextUrl.searchParams.get("language") as "python" | "typescript";
  
  if (!language || !["python", "typescript"].includes(language)) {
    return NextResponse.json(
      { error: "Invalid language parameter" },
      { status: 400 }
    );
  }
  
  try {
    const index = await getSearchIndex(language);
    
    return NextResponse.json(index, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load search index" },
      { status: 500 }
    );
  }
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
// packages/extractor-typescript/src/__tests__/transformer.test.ts

import { describe, it, expect } from "vitest";
import { TypeDocTransformer } from "../transformer";

describe("TypeDocTransformer", () => {
  it("should transform a class reflection to SymbolRecord", () => {
    const mockProject = {
      name: "test",
      children: [
        {
          id: 1,
          name: "TestClass",
          kind: 128, // Class
          comment: {
            summary: [{ kind: "text", text: "A test class" }],
          },
          children: [],
          sources: [{ fileName: "test.ts", line: 1 }],
        },
      ],
    };
    
    const transformer = new TypeDocTransformer(
      mockProject as any,
      "@test/pkg",
      "owner/repo",
      "abc123"
    );
    
    const symbols = transformer.transform();
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      kind: "class",
      name: "TestClass",
      language: "typescript",
      docs: {
        summary: "A test class",
      },
    });
  });
  
  it("should extract method parameters", () => {
    // ...
  });
  
  it("should handle nested types", () => {
    // ...
  });
});
```

### 11.2 Integration Tests

```typescript
// apps/web/app/(ref)/python/__tests__/page.test.tsx

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PythonReferencePage from "../[...slug]/page";

vi.mock("@/lib/ir/loader", () => ({
  getRoutingMap: vi.fn().mockResolvedValue({
    slugs: {
      "classes/ChatOpenAI": {
        refId: "sym_py_class_ChatOpenAI",
        kind: "class",
        pageType: "class",
        title: "ChatOpenAI",
      },
    },
  }),
  getSymbol: vi.fn().mockResolvedValue({
    id: "sym_py_class_ChatOpenAI",
    name: "ChatOpenAI",
    kind: "class",
    language: "python",
    signature: "class ChatOpenAI(BaseChatModel)",
    docs: {
      summary: "Chat model for OpenAI.",
    },
    params: [],
    source: {
      repo: "langchain-ai/langchain",
      sha: "abc123",
      path: "libs/langchain/chat_models.py",
      line: 100,
    },
  }),
}));

describe("PythonReferencePage", () => {
  it("should render a class page", async () => {
    const params = Promise.resolve({ slug: ["langchain", "classes", "ChatOpenAI"] });
    
    render(await PythonReferencePage({ params }));
    
    expect(screen.getByText("ChatOpenAI")).toBeInTheDocument();
    expect(screen.getByText("class")).toBeInTheDocument();
    expect(screen.getByText("Chat model for OpenAI.")).toBeInTheDocument();
  });
});
```

### 11.3 E2E Tests

```typescript
// e2e/reference.spec.ts

import { test, expect } from "@playwright/test";

test.describe("Reference Documentation", () => {
  test("should navigate to a Python class page", async ({ page }) => {
    await page.goto("/python/langchain");
    
    // Click on a class link
    await page.click('text=ChatOpenAI');
    
    // Verify page loaded
    await expect(page).toHaveURL(/\/python\/langchain\/classes\/ChatOpenAI/);
    await expect(page.locator("h1")).toContainText("ChatOpenAI");
  });
  
  test("should search for a symbol", async ({ page }) => {
    await page.goto("/python/langchain");
    
    // Open search modal
    await page.keyboard.press("Meta+k");
    
    // Type search query
    await page.fill('input[placeholder*="Search"]', "invoke");
    
    // Wait for results
    await expect(page.locator('[role="listbox"]')).toBeVisible();
    
    // Click first result
    await page.click('[role="option"]:first-child');
    
    // Verify navigation
    await expect(page.locator("h1")).toContainText("invoke");
  });
  
  test("should toggle dark mode", async ({ page }) => {
    await page.goto("/python/langchain");
    
    // Click theme toggle
    await page.click('[aria-label="Toggle theme"]');
    
    // Verify dark mode applied
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
```

---

## 12. Acceptance Criteria

### 12.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Extract Python APIs from langchain packages using griffe | P0 |
| F2 | Extract TypeScript APIs from langchainjs packages using TypeDoc | P0 |
| F3 | Generate normalized IR for both languages | P0 |
| F4 | Store IR in Vercel Blob with sharded symbol files | P0 |
| F5 | Render class pages with signature, docs, methods, properties | P0 |
| F6 | Render function pages with signature, params, returns | P0 |
| F7 | Render module index pages with member listing | P0 |
| F8 | Implement language-specific search with ⌘K modal | P0 |
| F9 | Support light and dark themes matching Mintlify | P0 |
| F10 | Responsive layout for mobile devices | P1 |
| F11 | Source links to GitHub at exact SHA | P1 |
| F12 | Manual build trigger via API/GitHub Actions | P1 |

### 12.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF1 | Page load time (LCP) | < 2.5s |
| NF2 | Time to Interactive | < 3.5s |
| NF3 | Search response time | < 200ms |
| NF4 | Build time per package | < 2 minutes |
| NF5 | Lighthouse performance score | > 90 |
| NF6 | Lighthouse accessibility score | > 95 |

### 12.3 Definition of Done

- [ ] All P0 functional requirements implemented
- [ ] Unit test coverage > 80%
- [ ] E2E tests passing for critical paths
- [ ] Responsive design verified on mobile/tablet/desktop
- [ ] Dark mode fully functional
- [ ] Documentation for build pipeline
- [ ] Deployed to `reference.langchain.com`

---

## Appendix A: Visual Reference

The following assets are available in `assets/`:

1. **docs-light-mode.png** — Reference for light theme implementation
2. **docs-dark-mode.png** — Reference for dark theme implementation
3. **docs-responsive.png** — Reference for mobile responsive design

Key design elements to match:
- Golden/amber accent border on left edge
- Teal primary color (#2F6868) for links and highlights
- Manrope heading font, Inter body font, JetBrains Mono code font
- Collapsible left navigation with icons
- "On this page" right sidebar TOC
- Copy button on code blocks
- Floating chat assistant button (mobile)

---

## Appendix B: Package Paths

### Python (langchain-ai/langchain)

| Package | Path in Repo |
|---------|--------------|
| langchain | libs/langchain_v1/langchain |
| langchain-core | libs/core/langchain_core |
| langchain-text-splitters | libs/text-splitters/langchain_text_splitters |
| langchain-tests | libs/standard-tests/langchain_tests |
| langchain-classic | libs/langchain/langchain |

### TypeScript (langchain-ai/langchainjs)

| Package | Path in Repo |
|---------|--------------|
| @langchain/core | libs/langchain-core |
| @langchain/community | libs/langchain-community |
| @langchain/anthropic | libs/langchain-anthropic |
| @langchain/aws | libs/langchain-aws |
| @langchain/deepseek | libs/langchain-deepseek |
| @langchain/google-genai | libs/langchain-google-genai |
| @langchain/google-vertexai | libs/langchain-google-vertexai |
| @langchain/google-vertexai-web | libs/langchain-google-vertexai-web |
| @langchain/groq | libs/langchain-groq |

---

*End of Specification*



