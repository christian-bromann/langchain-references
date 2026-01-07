/**
 * Project Schema
 *
 * Defines project configuration types for multi-project support.
 * Allows the reference documentation platform to support multiple
 * LangChain ecosystem projects (LangChain, LangGraph, DeepAgent).
 */

/**
 * Configuration for a project in the LangChain ecosystem.
 */
export interface ProjectConfig {
  /** Unique project identifier (e.g., "langchain", "langgraph", "deepagent") */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Short description */
  description: string;

  /** URL slug for routing (e.g., "langchain", "langgraph", "deepagents") */
  slug: string;

  /** Available language variants */
  variants: ProjectVariant[];

  /** Navigation order (lower = first) */
  order: number;

  /** Whether project is enabled */
  enabled: boolean;
}

/**
 * Language variant configuration for a project.
 */
export interface ProjectVariant {
  /** Language identifier */
  language: "python" | "javascript";

  /** GitHub repository (e.g., "langchain-ai/langchain") */
  repo: string;

  /** Path to configuration file */
  configPath: string;

  /** Whether this variant is enabled */
  enabled: boolean;
}


