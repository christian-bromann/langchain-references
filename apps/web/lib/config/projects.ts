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
  {
    id: "integrations",
    displayName: "Integrations",
    description: "Provider integrations for LangChain",
    slug: "integrations",
    order: 4,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/langchain",
        configPath: "configs/integrations-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/langchainjs",
        configPath: "configs/integrations-typescript.json",
        enabled: true,
      },
    ],
  },
  {
    id: "langsmith",
    displayName: "LangSmith",
    description: "Debug, evaluate, and monitor your language models",
    slug: "langsmith",
    order: 5,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/langsmith-sdk",
        configPath: "configs/langsmith-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/langsmith-sdk",
        configPath: "configs/langsmith-typescript.json",
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
 * Default package slugs for each project/language combination.
 * Used to redirect from project URLs to the first package.
 *
 * Maps: projectId -> language -> packageSlug
 */
const DEFAULT_PACKAGE_SLUGS: Record<string, Record<string, string>> = {
  langchain: {
    python: "langchain",
    javascript: "langchain",
  },
  langgraph: {
    python: "langgraph",
    javascript: "langchain-langgraph",
  },
  deepagent: {
    python: "deepagents",
    javascript: "deepagents",
  },
  integrations: {
    python: "langchain-anthropic",
    javascript: "langchain-community",
  },
  langsmith: {
    python: "langsmith",
    javascript: "langsmith",
  },
};

/**
 * Get the default package slug for a project.
 * This is the package that should be shown when navigating to a project.
 */
export function getDefaultPackageSlug(
  projectId: string,
  language: "python" | "javascript",
): string {
  return DEFAULT_PACKAGE_SLUGS[projectId]?.[language] || projectId;
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
  language: "python" | "javascript",
): boolean {
  return project.variants.some((v) => v.language === language && v.enabled);
}

/**
 * Package name patterns for each project.
 * Used to infer which project a package belongs to based on its name.
 * Patterns must match BOTH original names (@langchain/langgraph) AND
 * slugified URL versions (langchain-langgraph).
 *
 * IMPORTANT: Order matters! More specific patterns (langgraph, deepagent, integrations)
 * should be checked BEFORE the general langchain pattern.
 */
const PROJECT_PACKAGE_PATTERNS: Record<string, RegExp[]> = {
  // LangSmith: matches langsmith package
  langsmith: [/^langsmith$/i],
  // LangGraph: matches @langchain/langgraph* or langchain-langgraph*
  langgraph: [
    /^@langchain\/langgraph/i,
    /^langchain-langgraph/i, // Slugified URL version
    /^langgraph/i,
  ],
  // DeepAgent: matches deepagents or @langchain/deepagents
  deepagent: [/^@langchain\/deepagents?/i, /^deepagents?/i],
  // Integrations: matches provider packages
  // Python: langchain-anthropic, langchain-openai, langchain-aws, etc.
  // JavaScript: @langchain/anthropic, @langchain/openai, @langchain/aws, etc.
  integrations: [
    /^@langchain\/(anthropic|openai|aws|azure|google|groq|mistral|cohere|ollama|huggingface|fireworks|together|nvidia|pinecone|chroma|weaviate|qdrant|milvus|neo4j|mongodb|postgres|redis|elasticsearch|astradb|cerebras|deepseek|exa|ibm|nomic|perplexity|snowflake|sqlserver|tavily|unstructured|upstage|xai|sema4|prompty|db2|community)/i,
    /^langchain[-_](anthropic|openai|aws|azure|google|groq|mistral|cohere|ollama|huggingface|fireworks|together|nvidia|pinecone|chroma|weaviate|qdrant|milvus|neo4j|mongodb|postgres|redis|elasticsearch|astradb|cerebras|deepseek|exa|ibm|nomic|perplexity|snowflake|sqlserver|tavily|unstructured|upstage|xai|sema4|prompty|db2|community|parallel)/i,
  ],
  // LangChain: matches langchain* but NOT langgraph, deepagent, or integration providers
  // This must be LAST because it's the most general pattern
  langchain: [
    /^@langchain\/(?!langgraph|deepagent|anthropic|openai|aws|azure|google|groq|mistral|cohere|ollama|huggingface|fireworks|together|nvidia|pinecone|chroma|weaviate|qdrant|milvus|neo4j|mongodb|postgres|redis|elasticsearch|astradb|cerebras|deepseek|exa|ibm|nomic|perplexity|snowflake|sqlserver|tavily|unstructured|upstage|xai|sema4|prompty|db2|community)/i,
    /^langchain(?!-langgraph|-anthropic|-openai|-aws|-azure|-google|-groq|-mistral|-cohere|-ollama|-huggingface|-fireworks|-together|-nvidia|-pinecone|-chroma|-weaviate|-qdrant|-milvus|-neo4j|-mongodb|-postgres|-redis|-elasticsearch|-astradb|-cerebras|-deepseek|-exa|-ibm|-nomic|-perplexity|-snowflake|-sqlserver|-tavily|-unstructured|-upstage|-xai|-sema4|-prompty|-db2|-community|-parallel)/i,
  ],
};

/**
 * Infer which project a package belongs to based on its name.
 * Returns the project config or the default project if no match.
 *
 * IMPORTANT: Checks more specific projects (langgraph, deepagent) BEFORE
 * the general langchain pattern to avoid false matches.
 */
export function getProjectForPackage(packageName: string): ProjectConfig {
  // Check in order: specific projects first, then general langchain
  const checkOrder = ["langsmith", "langgraph", "deepagent", "integrations", "langchain"];

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
