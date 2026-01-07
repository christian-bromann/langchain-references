/**
 * Symbol Schema
 *
 * Defines the normalized symbol record structure that represents
 * any API element (class, function, method, etc.) in the IR.
 */

/**
 * All possible symbol kinds in the IR.
 */
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
  | "constructor"
  | "parameter";

/**
 * Source language of the symbol.
 */
export type Language = "python" | "typescript";

/**
 * Visibility level of the symbol.
 */
export type Visibility = "public" | "protected" | "private";

/**
 * Stability level of the symbol.
 */
export type Stability = "experimental" | "beta" | "stable" | "deprecated";

/**
 * The core symbol record that represents any API element.
 */
export interface SymbolRecord {
  /** Unique symbol identifier (e.g., "sym_py_class_langchain_core_ChatOpenAI") */
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
  display: SymbolDisplay;

  /** Signature string */
  signature: string;

  /** Documentation */
  docs: SymbolDocs;

  /** Function/method parameters */
  params?: SymbolParam[];

  /** Return type information */
  returns?: SymbolReturns;

  /** Type parameters (generics) */
  typeParams?: TypeParam[];

  /** Class members (for classes/interfaces) */
  members?: MemberReference[];

  /** Inheritance and implementation */
  relations?: SymbolRelations;

  /** Source location */
  source: SymbolSource;

  /** URL information */
  urls: SymbolUrls;

  /** Metadata tags */
  tags: SymbolTags;
}

/**
 * Display information for the symbol.
 */
export interface SymbolDisplay {
  /** Name for display (may include formatting) */
  name: string;

  /** Qualified path for breadcrumbs */
  qualified: string;
}

/**
 * Documentation for the symbol.
 */
export interface SymbolDocs {
  /** One-line summary */
  summary: string;

  /** Full description (markdown) */
  description?: string;

  /** Usage examples */
  examples?: SymbolExample[];

  /** Deprecation notice */
  deprecated?: DeprecationInfo;
}

/**
 * A usage example for a symbol.
 */
export interface SymbolExample {
  /** Optional title for the example */
  title?: string;

  /** The example code */
  code: string;

  /** Language for syntax highlighting */
  language?: string;
}

/**
 * Deprecation information.
 */
export interface DeprecationInfo {
  /** Whether the symbol is deprecated */
  isDeprecated: true;

  /** Deprecation message */
  message?: string;

  /** Version when deprecated */
  since?: string;

  /** Suggested replacement */
  replacement?: string;
}

/**
 * A function/method parameter.
 */
export interface SymbolParam {
  /** Parameter name */
  name: string;

  /** Type annotation */
  type: string;

  /** Description of the parameter */
  description?: string;

  /** Default value as string */
  default?: string;

  /** Whether the parameter is required */
  required: boolean;
}

/**
 * Return type information.
 */
export interface SymbolReturns {
  /** Return type annotation */
  type: string;

  /** Description of the return value */
  description?: string;
}

/**
 * A type parameter (generic).
 */
export interface TypeParam {
  /** Type parameter name (e.g., "T") */
  name: string;

  /** Type constraint (e.g., "extends BaseClass") */
  constraint?: string;

  /** Default type */
  default?: string;
}

/**
 * Reference to a member symbol.
 */
export interface MemberReference {
  /** Member name */
  name: string;

  /** Reference ID of the member symbol */
  refId: string;

  /** Member kind */
  kind: SymbolKind;

  /** Member visibility */
  visibility: Visibility;
}

/**
 * Symbol relationships (inheritance, implementation).
 */
export interface SymbolRelations {
  /** Base classes/interfaces */
  extends?: string[];

  /** Implemented interfaces */
  implements?: string[];

  /** Mixed-in classes */
  mixes?: string[];
}

/**
 * Source location information.
 */
export interface SymbolSource {
  /** Repository (e.g., "langchain-ai/langchain") */
  repo: string;

  /** Git commit SHA */
  sha: string;

  /** File path within the repository */
  path: string;

  /** Starting line number */
  line: number;

  /** Ending line number */
  endLine?: number;
}

/**
 * URL information for the symbol.
 */
export interface SymbolUrls {
  /** Canonical page URL */
  canonical: string;

  /** Anchor links for members */
  anchors?: Record<string, string>;
}

/**
 * Metadata tags for the symbol.
 */
export interface SymbolTags {
  /** Stability level */
  stability: Stability;

  /** Visibility level */
  visibility: Visibility;

  /** Whether the function is async */
  isAsync?: boolean;

  /** Whether the function is a generator */
  isGenerator?: boolean;

  /** Whether the class/method is abstract */
  isAbstract?: boolean;

  /** Whether the method is static */
  isStatic?: boolean;
}





