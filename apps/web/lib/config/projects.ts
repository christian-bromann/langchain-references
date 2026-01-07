/**
 * Project Registry
 *
 * Central configuration for all projects in the LangChain ecosystem.
 * This registry defines which projects are available, their language
 * variants, and their configuration paths.
 */

import type { ProjectConfig } from "@langchain/ir-schema";

/**
 * All projects in the LangChain ecosystem.
 */
export const PROJECTS: ProjectConfig[] = [
  {
    id: "langchain",
    displayName: "LangChain",
    description: "Build context-aware reasoning applications",
    slug: "langchain",
    order: 1,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/langchain",
        configPath: "configs/langchain-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/langchainjs",
        configPath: "configs/langchain-typescript.json",
        enabled: true,
      },
    ],
  },
  {
    id: "langgraph",
    displayName: "LangGraph",
    description: "Build resilient language agents as graphs",
    slug: "langgraph",
    order: 2,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/langgraph",
        configPath: "configs/langgraph-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/langgraphjs",
        configPath: "configs/langgraph-typescript.json",
        enabled: true,
      },
    ],
  },
  {
    id: "deepagent",
    displayName: "Deep Agents",
    description: "Build advanced autonomous agents",
    slug: "deepagents",
    order: 3,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/deepagents",
        configPath: "configs/deepagent-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/deepagentsjs",
        configPath: "configs/deepagent-typescript.json",
        enabled: true,
      },
    ],
  },
];

/**
 * Get all enabled projects, sorted by order.
 */
export function getEnabledProjects(): ProjectConfig[] {
  return PROJECTS.filter((p) => p.enabled).sort((a, b) => a.order - b.order);
}

/**
 * Get a project by its URL slug.
 */
export function getProjectBySlug(slug: string): ProjectConfig | undefined {
  return PROJECTS.find((p) => p.slug === slug && p.enabled);
}

/**
 * Get a project by its unique ID.
 */
export function getProjectById(id: string): ProjectConfig | undefined {
  return PROJECTS.find((p) => p.id === id && p.enabled);
}

/**
 * Get the default project (first enabled project).
 */
export function getDefaultProject(): ProjectConfig {
  const projects = getEnabledProjects();
  if (projects.length === 0) {
    throw new Error("No enabled projects found");
  }
  return projects[0];
}

/**
 * Check if a project has a specific language variant enabled.
 */
export function hasLanguageVariant(
  project: ProjectConfig,
  language: "python" | "javascript"
): boolean {
  return project.variants.some((v) => v.language === language && v.enabled);
}

/**
 * Package name patterns for each project.
 * Used to infer which project a package belongs to based on its name.
 */
/**
 * Package name patterns for each project.
 * Used to infer which project a package belongs to based on its name.
 * Patterns must match BOTH original names (@langchain/langgraph) AND
 * slugified URL versions (langchain-langgraph).
 *
 * IMPORTANT: Order matters! More specific patterns (langgraph, deepagent)
 * should be checked BEFORE the general langchain pattern.
 */
const PROJECT_PACKAGE_PATTERNS: Record<string, RegExp[]> = {
  // LangGraph: matches @langchain/langgraph* or langchain-langgraph*
  langgraph: [
    /^@langchain\/langgraph/i,
    /^langchain-langgraph/i,  // Slugified URL version
    /^langgraph/i,
  ],
  // DeepAgent: matches deepagents or @langchain/deepagents
  deepagent: [
    /^@langchain\/deepagents?/i,
    /^deepagents?/i,
  ],
  // LangChain: matches langchain* but NOT langgraph or deepagent
  // This must be LAST because it's the most general pattern
  langchain: [
    /^@langchain\/(?!langgraph|deepagent)/i,
    /^langchain(?!-langgraph)/i, // Matches langchain but not langchain-langgraph
  ],
};

/**
 * Check if a package name belongs to a specific project.
 */
export function packageBelongsToProject(packageName: string, projectId: string): boolean {
  const patterns = PROJECT_PACKAGE_PATTERNS[projectId];
  if (!patterns) return false;

  return patterns.some((pattern) => pattern.test(packageName));
}

/**
 * Infer which project a package belongs to based on its name.
 * Returns the project config or the default project if no match.
 *
 * IMPORTANT: Checks more specific projects (langgraph, deepagent) BEFORE
 * the general langchain pattern to avoid false matches.
 */
export function getProjectForPackage(packageName: string): ProjectConfig {
  // Check in order: specific projects first, then general langchain
  const checkOrder = ["langgraph", "deepagent", "langchain"];

  for (const projectId of checkOrder) {
    const patterns = PROJECT_PACKAGE_PATTERNS[projectId];
    if (!patterns) continue;

    for (const pattern of patterns) {
      if (pattern.test(packageName)) {
        const project = getProjectById(projectId);
        if (project) return project;
      }
    }
  }

  // Default to LangChain
  return getDefaultProject();
}

/**
 * Get project from URL pathname.
 * Extracts the project slug from the pathname if present,
 * or infers from the package name in the URL.
 */
export function getProjectFromPathname(pathname: string): ProjectConfig | null {
  const segments = pathname.split("/").filter(Boolean);

  // At minimum need: /language/something
  if (segments.length < 2) {
    return getDefaultProject();
  }

  const [, secondSegment] = segments;

  // Check if second segment is a known project slug
  const projectBySlug = getProjectBySlug(secondSegment);
  if (projectBySlug) {
    return projectBySlug;
  }

  // Otherwise, try to infer from the package name in the URL
  // The second segment might be a package slug like "langchain-core" or "langchain-langgraph"
  // Try both the original slug (with dashes) and converted version (with underscores)
  const packageSlug = secondSegment;

  // First try with original slug (handles langchain-langgraph -> LangGraph)
  const projectFromSlug = getProjectForPackage(packageSlug);
  if (projectFromSlug.id !== "langchain") {
    // Found a specific project match (not the default)
    return projectFromSlug;
  }

  // Also try with underscores (handles langchain_core -> LangChain)
  const packageName = packageSlug.replace(/-/g, "_");
  return getProjectForPackage(packageName);
}

