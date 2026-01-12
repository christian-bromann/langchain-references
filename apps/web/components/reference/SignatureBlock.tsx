/**
 * Signature Block Component with Type Cross-Linking
 *
 * Renders function/method signatures with syntax highlighting and
 * clickable links for types that exist in the documentation.
 */

import Link from "next/link";
import { CopyButton } from "./CopyButton";
import type { TypeReference } from "@langchain/ir-schema";

interface SignatureBlockProps {
  /** The signature string to render */
  signature: string;
  /** Programming language for styling */
  language: "python" | "typescript" | "javascript";
  /** Type references that can be linked */
  typeRefs?: TypeReference[];
  /** Set of known symbol names in the package */
  knownSymbols: Set<string>;
  /** Package name for generating URLs */
  packageName: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Slugify a package name for URL paths.
 */
function slugifyPackageName(name: string): string {
  return name.replace(/^@/, "").replace(/\//g, "_").replace(/-/g, "_");
}

/**
 * Token types for syntax highlighting
 */
type TokenType =
  | "keyword"
  | "type"
  | "type-link"
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
 * Built-in Python types that shouldn't be linked
 */
const PYTHON_BUILTINS = new Set([
  "str", "int", "float", "bool", "None", "bytes", "object",
  "list", "dict", "set", "tuple", "type", "Any", "Optional",
  "Union", "List", "Dict", "Set", "Tuple", "Type", "Callable",
  "Iterable", "Iterator", "Generator", "Sequence", "Mapping",
  "Literal", "TypeVar", "Generic", "Protocol", "ClassVar",
  "Awaitable", "Coroutine", "AsyncIterator", "AsyncGenerator",
  "Self", "NoReturn", "Never", "Final", "Annotated",
]);

/**
 * Python keywords
 */
const PYTHON_KEYWORDS = new Set([
  "self", "cls", "async", "await", "def", "class", "return",
  "if", "else", "elif", "for", "while", "try", "except",
  "finally", "with", "as", "import", "from", "pass", "break",
  "continue", "raise", "yield", "lambda", "and", "or", "not",
  "in", "is", "True", "False",
]);

/**
 * Tokenize a signature string for rendering with syntax highlighting and links.
 */
function tokenizeSignature(
  signature: string,
  language: "python" | "typescript" | "javascript",
  knownSymbols: Set<string>,
  packageName: string
): Token[] {
  const tokens: Token[] = [];
  const langPath = language === "python" ? "python" : "javascript";
  const pkgSlug = slugifyPackageName(packageName);

  // Regex patterns for different token types
  // Match: identifiers, operators, punctuation, strings, numbers
  const tokenPattern = /([A-Za-z_][A-Za-z0-9_]*)|(\*\*|\*|->|:|\||=|,|\(|\)|\[|\]|\{|\})|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|(\s+)/g;

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
      // Check if it's a built-in type
      else if (PYTHON_BUILTINS.has(identifier)) {
        tokens.push({ type: "builtin", value: identifier });
      }
      // Check if it's a known symbol that can be linked
      else if (knownSymbols.has(identifier)) {
        const href = `/${langPath}/${pkgSlug}/${identifier}`;
        tokens.push({ type: "type-link", value: identifier, href });
      }
      // Check if it looks like a type (PascalCase)
      else if (/^[A-Z]/.test(identifier)) {
        tokens.push({ type: "type", value: identifier });
      }
      // Otherwise it's a parameter or plain identifier
      else {
        tokens.push({ type: "parameter", value: identifier });
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

  return <span className={classes}>{token.value}</span>;
}

/**
 * SignatureBlock - renders a signature with syntax highlighting and type links
 */
export function SignatureBlock({
  signature,
  language,
  typeRefs,
  knownSymbols,
  packageName,
  className,
}: SignatureBlockProps) {
  const tokens = tokenizeSignature(signature, language, knownSymbols, packageName);

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
