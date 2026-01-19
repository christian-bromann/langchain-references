/**
 * Language Utilities
 *
 * Utility functions for converting between Language (URL/output) and
 * SymbolLanguage (source code) types.
 *
 * Language: "python" | "javascript" | "java" | "go" - Used in URLs and output paths
 * SymbolLanguage: "python" | "typescript" | "java" | "go" - Used in symbol records (source language)
 *
 * The main difference is "javascript" (URL) vs "typescript" (source).
 */

export const LANGUAGE = ["python", "javascript", "java", "go"] as const;
export type Language = (typeof LANGUAGE)[number];

export const SYMBOL_LANGUAGE = ["python", "typescript", "java", "go"] as const;
export type SymbolLanguage = (typeof SYMBOL_LANGUAGE)[number];

/**
 * Convert a Language (URL/output) to SymbolLanguage (source).
 *
 * @param language - The URL/output language
 * @returns The corresponding source language
 *
 * @example
 * languageToSymbolLanguage("javascript") // => "typescript"
 * languageToSymbolLanguage("python") // => "python"
 */
export function languageToSymbolLanguage(language: Language): SymbolLanguage {
  if (language === "javascript") {
    return "typescript";
  }
  return language;
}

/**
 * Convert a SymbolLanguage (source) to Language (URL/output).
 *
 * @param symbolLanguage - The source language
 * @returns The corresponding URL/output language
 *
 * @example
 * symbolLanguageToLanguage("typescript") // => "javascript"
 * symbolLanguageToLanguage("python") // => "python"
 */
export function symbolLanguageToLanguage(symbolLanguage: SymbolLanguage): Language {
  if (symbolLanguage === "typescript") {
    return "javascript";
  }
  return symbolLanguage;
}

/**
 * Check if a string is a valid Language.
 */
export function isLanguage(value: string): value is Language {
  return LANGUAGE.includes(value as Language);
}

/**
 * Check if a string is a valid SymbolLanguage.
 */
export function isSymbolLanguage(value: string): value is SymbolLanguage {
  return SYMBOL_LANGUAGE.includes(value as SymbolLanguage);
}

/**
 * Parse a string to a Language, defaulting to "javascript" if invalid.
 */
export function parseLanguage(value: string): Language {
  if (isLanguage(value)) {
    return value;
  }
  // Handle "typescript" as an alias for "javascript" in URLs
  if (value === "typescript") {
    return "javascript";
  }
  return "javascript";
}

/**
 * Parse a string to a SymbolLanguage, defaulting to "typescript" if invalid.
 */
export function parseSymbolLanguage(value: string): SymbolLanguage {
  if (isSymbolLanguage(value)) {
    return value;
  }
  // Handle "javascript" as an alias for "typescript" in symbols
  if (value === "javascript") {
    return "typescript";
  }
  return "typescript";
}
