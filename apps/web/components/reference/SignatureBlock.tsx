/**
 * Signature Block Component with Type Cross-Linking
 *
 * Renders function/method signatures with syntax highlighting and
 * clickable links for types that exist in the documentation.
 * Supports cross-project linking (e.g., linking to langchain-core types from deepagents).
 */

import Link from "next/link";
import { CopyButton } from "./CopyButton";
import type { TypeReference } from "@langchain/ir-schema";
import { getBuiltinTypeDocUrl } from "@/lib/constants/builtin-types";

interface SignatureBlockProps {
  /** The signature string to render */
  signature: string;
  /** Programming language for styling */
  language: "python" | "typescript" | "javascript";
  /** Type references that can be linked (includes qualifiedName for cross-project linking) */
  typeRefs?: TypeReference[];
  /** Map of symbol names to their URL paths in the current package */
  knownSymbols: Map<string, string>;
  /** Current package name for generating URLs */
  packageName: string;
  /** Map of type names to their resolved URLs (for cross-project linking) */
  typeUrlMap?: Map<string, string>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Slugify a package name for URL paths.
 * @example "@langchain/core" -> "langchain-core"
 * @example "langchain_core" -> "langchain-core"
 */
function slugifyPackageName(name: string): string {
  return name.replace(/^@/, "").replace(/\//g, "-").replace(/_/g, "-").toLowerCase();
}

/**
 * Slugify a symbol path for URLs, optionally stripping the package prefix.
 * @example "langchain_core.messages.BaseMessage" -> "messages/BaseMessage" (with prefix)
 * @example "runnables.RunnableConfig" -> "runnables/RunnableConfig" (without prefix)
 */
function slugifySymbolPath(symbolPath: string, hasPackagePrefix = true): string {
  const parts = symbolPath.split(".");

  // If only one part, it's just the symbol name (no package prefix)
  if (parts.length === 1) {
    return parts[0];
  }

  // Skip the package name (first part) if it has a package prefix
  if (hasPackagePrefix) {
    return parts.slice(1).join("/");
  }

  return parts.join("/");
}

/**
 * Token types for syntax highlighting
 */
type TokenType =
  | "keyword"
  | "type"
  | "type-link"
  | "type-external"
  | "parameter"
  | "operator"
  | "punctuation"
  | "string"
  | "number"
  | "builtin"
  | "plain";

interface Token {
  type: TokenType;
  value: string;
  href?: string;
}

/**
 * Python keywords (not linked)
 */
const PYTHON_KEYWORDS = new Set([
  "self",
  "cls",
  "async",
  "await",
  "def",
  "class",
  "return",
  "if",
  "else",
  "elif",
  "for",
  "while",
  "try",
  "except",
  "finally",
  "with",
  "as",
  "import",
  "from",
  "pass",
  "break",
  "continue",
  "raise",
  "yield",
  "lambda",
  "and",
  "or",
  "not",
  "in",
  "is",
  "True",
  "False",
  "None",
]);

/**
 * Tokenize a signature string for rendering with syntax highlighting and links.
 */
function tokenizeSignature(
  signature: string,
  language: "python" | "typescript" | "javascript",
  knownSymbols: Map<string, string>,
  packageName: string,
  typeUrlMap?: Map<string, string>,
): Token[] {
  const tokens: Token[] = [];
  const langPath = language === "python" ? "python" : "javascript";
  const pkgSlug = slugifyPackageName(packageName);

  // Regex patterns for different token types
  // Match: identifiers, operators, punctuation (including angle brackets for generics, dots for member access), strings, numbers
  const tokenPattern =
    /([A-Za-z_][A-Za-z0-9_]*)|(\*\*|\*|->|:|\||=|,|\(|\)|\[|\]|\{|\}|<|>|\.)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|(\s+)/g;

  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(signature)) !== null) {
    const [fullMatch, identifier, operator, stringLit, numberLit, whitespace] = match;

    if (whitespace) {
      tokens.push({ type: "plain", value: whitespace });
    } else if (stringLit) {
      tokens.push({ type: "string", value: stringLit });
    } else if (numberLit) {
      tokens.push({ type: "number", value: numberLit });
    } else if (operator) {
      if (operator === "->" || operator === ":" || operator === "|" || operator === "=") {
        tokens.push({ type: "operator", value: operator });
      } else if (operator === "*" || operator === "**") {
        tokens.push({ type: "operator", value: operator });
      } else {
        tokens.push({ type: "punctuation", value: operator });
      }
    } else if (identifier) {
      // Check if it's a keyword
      if (PYTHON_KEYWORDS.has(identifier)) {
        tokens.push({ type: "keyword", value: identifier });
      }
      // Check if we have a pre-computed URL for this type (cross-project linking)
      else if (typeUrlMap?.has(identifier)) {
        tokens.push({ type: "type-link", value: identifier, href: typeUrlMap.get(identifier)! });
      }
      // Check if it's a known symbol in the current package
      else if (knownSymbols.has(identifier)) {
        const symbolPath = knownSymbols.get(identifier)!;
        // Use slugifySymbolPath to properly strip package prefix for Python
        const hasPackagePrefix = language === "python" && symbolPath.includes("_");
        const urlPath = slugifySymbolPath(symbolPath, hasPackagePrefix);
        const href = `/${langPath}/${pkgSlug}/${urlPath}`;
        tokens.push({ type: "type-link", value: identifier, href });
      }
      // Check if it's a built-in type with external documentation
      else {
        const builtinUrl = getBuiltinTypeDocUrl(identifier, language);
        if (builtinUrl) {
          tokens.push({ type: "type-external", value: identifier, href: builtinUrl });
        }
        // Check if it looks like a type (PascalCase)
        else if (/^[A-Z]/.test(identifier)) {
          tokens.push({ type: "type", value: identifier });
        }
        // Otherwise it's a parameter or plain identifier
        else {
          tokens.push({ type: "parameter", value: identifier });
        }
      }
    } else {
      // Fallback for any unmatched characters
      tokens.push({ type: "plain", value: fullMatch });
    }
  }

  return tokens;
}

/**
 * Get CSS classes for a token type
 */
function getTokenClasses(type: TokenType): string {
  const baseClasses = "font-mono";

  switch (type) {
    case "keyword":
      return `${baseClasses} text-[#d73a49] dark:text-[#f97583]`; // Red
    case "type":
    case "builtin":
      return `${baseClasses} text-[#005cc5] dark:text-[#79b8ff]`; // Blue
    case "type-link":
      return `${baseClasses} text-primary hover:text-primary/80 underline decoration-dashed decoration-primary/50 underline-offset-2 cursor-pointer`;
    case "type-external":
      // External links (Python docs, MDN, TypeScript docs) - dotted underline to differentiate
      return `${baseClasses} text-[#005cc5] dark:text-[#79b8ff] hover:text-[#0366d6] dark:hover:text-[#58a6ff] underline decoration-dotted decoration-[#005cc5]/50 dark:decoration-[#79b8ff]/50 underline-offset-2 cursor-pointer`;
    case "parameter":
      return `${baseClasses} text-[#e36209] dark:text-[#ffab70]`; // Orange
    case "operator":
      return `${baseClasses} text-[#d73a49] dark:text-[#f97583]`; // Red
    case "string":
      return `${baseClasses} text-[#032f62] dark:text-[#9ecbff]`; // Blue-ish
    case "number":
      return `${baseClasses} text-[#005cc5] dark:text-[#79b8ff]`; // Blue
    case "punctuation":
    case "plain":
    default:
      return `${baseClasses} text-[#24292e] dark:text-[#e1e4e8]`; // Default
  }
}

/**
 * Render a single token
 */
function TokenSpan({ token }: { token: Token }) {
  const classes = getTokenClasses(token.type);

  if (token.type === "type-link" && token.href) {
    return (
      <Link href={token.href} className={classes}>
        {token.value}
      </Link>
    );
  }

  if (token.type === "type-external" && token.href) {
    return (
      <a href={token.href} target="_blank" rel="noopener noreferrer" className={classes}>
        {token.value}
      </a>
    );
  }

  return <span className={classes}>{token.value}</span>;
}

/**
 * SignatureBlock - renders a signature with syntax highlighting and type links
 */
export function SignatureBlock({
  signature,
  language,
  knownSymbols,
  packageName,
  typeUrlMap,
  className,
}: SignatureBlockProps) {
  const tokens = tokenizeSignature(signature, language, knownSymbols, packageName, typeUrlMap);

  return (
    <div className={`relative group ${className || ""}`}>
      <div className="absolute top-3 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={signature} />
      </div>
      <pre className="shiki shiki-themes github-light github-dark bg-white dark:bg-[#24292e] p-4 m-0 text-sm overflow-x-auto rounded-lg">
        <code>
          {tokens.map((token, index) => (
            <TokenSpan key={index} token={token} />
          ))}
        </code>
      </pre>
    </div>
  );
}
