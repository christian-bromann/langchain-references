/**
 * Code Block Component with Syntax Highlighting
 *
 * Uses Shiki for beautiful syntax highlighting of TypeScript and Python code.
 * Includes a copy button styled like Mintlify.
 */

import { codeToHtml } from "shiki";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  language: "typescript" | "python" | "javascript";
  className?: string;
  /** Hide the copy button */
  hideCopy?: boolean;
}

/**
 * Strip markdown code fences from content if present.
 * Handles formats like: ```typescript\ncode\n``` or ```python\ncode\n```
 */
function stripCodeFences(code: string): { code: string; detectedLang?: string } {
  const trimmed = code.trim();

  // Match opening fence with optional language: ```typescript, ```python, ```js, etc.
  const openFenceMatch = trimmed.match(/^```(\w*)\s*\n?/);
  if (!openFenceMatch) {
    return { code };
  }

  const detectedLang = openFenceMatch[1] || undefined;
  let stripped = trimmed.slice(openFenceMatch[0].length);

  // Remove closing fence
  if (stripped.endsWith("```")) {
    stripped = stripped.slice(0, -3).trimEnd();
  }

  return { code: stripped, detectedLang };
}

/**
 * Server component that renders syntax-highlighted code using Shiki
 */
export async function CodeBlock({ code, language, className, hideCopy = false }: CodeBlockProps) {
  // Strip markdown code fences if present
  const { code: cleanCode, detectedLang } = stripCodeFences(code);

  // Use detected language from fence, or fall back to provided language
  let lang = language;
  if (detectedLang) {
    if (detectedLang === "python" || detectedLang === "py") {
      lang = "python";
    } else if (detectedLang === "typescript" || detectedLang === "ts") {
      lang = "typescript";
    } else if (detectedLang === "javascript" || detectedLang === "js") {
      lang = "javascript";
    }
  }

  const html = await codeToHtml(cleanCode, {
    lang,
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
  });

  return (
    <div className={`relative group ${className || ""}`}>
      {!hideCopy && (
        <div className="absolute top-3 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={cleanCode} />
        </div>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/**
 * Inline code fallback for when highlighting isn't needed
 */
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-background-secondary font-mono text-sm">
      {children}
    </code>
  );
}
