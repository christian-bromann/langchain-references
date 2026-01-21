/**
 * Language Configuration
 *
 * Utilities for working with language variants across projects.
 */

import { PROJECTS } from "./projects";

/**
 * All supported languages with their metadata.
 */
export const LANGUAGE_CONFIG = {
  python: {
    id: "python",
    name: "Python",
    fileExtension: ".py",
    ecosystem: "Python",
  },
  javascript: {
    id: "javascript",
    name: "JavaScript",
    fileExtension: ".ts",
    ecosystem: "JavaScript/TypeScript",
  },
  java: {
    id: "java",
    name: "Java",
    fileExtension: ".java",
    ecosystem: "JVM",
  },
  go: {
    id: "go",
    name: "Go",
    fileExtension: ".go",
    ecosystem: "Go",
  },
} as const;

export type Language = keyof typeof LANGUAGE_CONFIG;

/**
 * Get available languages for a project.
 */
export function getAvailableLanguages(projectId: string): Language[] {
  const project = PROJECTS.find((p) => p.id === projectId);
  if (!project) return ["python", "javascript"];

  return project.variants.filter((v) => v.enabled).map((v) => v.language as Language);
}

/**
 * Check if a language is available for a project.
 */
export function isLanguageAvailable(projectId: string, language: string): boolean {
  return getAvailableLanguages(projectId).includes(language as Language);
}

/**
 * Get language metadata by ID.
 */
export function getLanguageConfig(language: string) {
  return LANGUAGE_CONFIG[language as Language] || LANGUAGE_CONFIG.python;
}

/**
 * Get all languages that have any packages available.
 */
export function getAllAvailableLanguages(): Language[] {
  const languages = new Set<Language>();
  for (const project of PROJECTS) {
    for (const variant of project.variants) {
      if (variant.enabled) {
        languages.add(variant.language as Language);
      }
    }
  }
  return Array.from(languages);
}
