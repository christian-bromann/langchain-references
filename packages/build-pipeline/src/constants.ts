/**
 * Build Pipeline Constants
 *
 * Central configuration for all projects and languages in the LangChain
 * ecosystem. This ensures consistency across all build pipeline commands.
 */

// =============================================================================
// PROJECTS
// =============================================================================

/**
 * All projects in the LangChain ecosystem.
 *
 * Each project has its own configuration file(s) in /configs and
 * generates separate IR output and pointer files.
 *
 * - langchain: Core LangChain library for building context-aware applications
 * - langgraph: Library for building resilient language agents as graphs
 * - deepagent: Framework for building advanced autonomous agents
 * - integrations: Provider integrations (Anthropic, OpenAI, etc.)
 * - langsmith: SDK for debugging, evaluating, and monitoring language models
 */
export const PROJECTS = [
  "langchain",
  "langgraph",
  "deepagent",
  "integrations",
  "langsmith",
] as const;

/** Type representing valid project identifiers */
export type Project = (typeof PROJECTS)[number];

// =============================================================================
// LANGUAGES
// =============================================================================

/**
 * Languages as specified in config file names.
 *
 * Config files are named `{project}-{language}.json`, e.g.:
 * - langchain-python.json
 * - langchain-typescript.json
 * - langsmith-java.json
 * - langsmith-go.json
 *
 * Used by: build-ir command when finding config files.
 */
export const CONFIG_LANGUAGES = ["python", "typescript", "java", "go"] as const;

/** Type for config file language identifiers */
export type ConfigLanguage = (typeof CONFIG_LANGUAGES)[number];

/**
 * Languages as used in output paths and pointer files.
 *
 * IR output and pointer files use "javascript" instead of "typescript"
 * to represent the JS/TS ecosystem consistently:
 * - pointers/index-langchain-javascript.json
 * - pointers/packages/javascript/langchain-core.json
 * - pointers/index-langsmith-java.json
 * - pointers/index-langsmith-go.json
 *
 * Used by: pull-ir, upload-pointers, update-indexes commands.
 */
export const OUTPUT_LANGUAGES = ["python", "javascript", "java", "go"] as const;

/** Type for output/storage language identifiers */
export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert a config language to its output equivalent.
 * TypeScript -> JavaScript for JS ecosystem consistency.
 * Java and Go pass through unchanged.
 */
export function configToOutputLanguage(lang: ConfigLanguage): OutputLanguage {
  if (lang === "typescript") return "javascript";
  return lang;
}

/**
 * Convert an output language to its config equivalent.
 * JavaScript -> TypeScript for config file matching.
 * Java and Go pass through unchanged.
 */
export function outputToConfigLanguage(lang: OutputLanguage): ConfigLanguage {
  if (lang === "javascript") return "typescript";
  return lang;
}
