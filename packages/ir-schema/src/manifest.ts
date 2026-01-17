/**
 * Manifest Schema
 *
 * Defines the build manifest structure that contains metadata about
 * the IR build, source repositories, and included packages.
 */

/**
 * The root manifest for a reference documentation build.
 */
export interface Manifest {
  /** IR schema version */
  irVersion: "1.0";

  /** Build metadata */
  build: BuildInfo;

  /** Project identifier (optional for backwards compatibility) */
  project?: string;

  /** Source repositories used in this build */
  sources: SourceInfo[];

  /** Packages included in this build */
  packages: Package[];
}

/**
 * Build information and metadata.
 */
export interface BuildInfo {
  /** Unique build identifier (hash-based) */
  buildId: string;

  /** ISO timestamp of build creation */
  createdAt: string;

  /** Base URL for the reference site */
  baseUrl: string;
}

/**
 * Source repository information.
 */
export interface SourceInfo {
  /** Full repo path (e.g., "langchain-ai/langchain") */
  repo: string;

  /** Git commit SHA */
  sha: string;

  /** When the tarball was fetched */
  fetchedAt: string;
}

/**
 * Package information within the manifest.
 */
export interface Package {
  /** Unique package identifier (e.g., "pkg_py_langchain_core") */
  packageId: string;

  /** Human-readable display name */
  displayName: string;

  /** Package name as published (npm/PyPI) */
  publishedName: string;

  /** Programming language */
  language: "python" | "typescript";

  /** Package ecosystem */
  ecosystem: "python" | "javascript";

  /** Version string */
  version: string;

  /** Source repository details */
  repo: PackageRepo;

  /** Entry point for navigation */
  entry: PackageEntry;

  /** Navigation structure hints */
  nav: PackageNav;

  /** Symbol counts by kind */
  stats: PackageStats;

  /** Optional markdown description to display on package page */
  description?: string;

  /** Optional curated subpages for domain-specific navigation */
  subpages?: PackageSubpage[];
}

/**
 * Subpage metadata for navigation (stored in manifest).
 * Full subpage content is stored in separate JSON files.
 */
export interface PackageSubpage {
  /** URL slug for the subpage (e.g., "agents", "middleware") */
  slug: string;

  /** Display title for navigation */
  title: string;
}

/**
 * Repository information for a package.
 */
export interface PackageRepo {
  /** Repository owner */
  owner: string;

  /** Repository name */
  name: string;

  /** Git commit SHA */
  sha: string;

  /** Path within the repository */
  path: string;
}

/**
 * Entry point for package navigation.
 */
export interface PackageEntry {
  /** Kind of the entry point */
  kind: "module";

  /** Reference ID of the entry point symbol */
  refId: string;
}

/**
 * Navigation hints for the package.
 */
export interface PackageNav {
  /** Root groups for navigation structure */
  rootGroups: string[];
}

/**
 * Statistics about symbols in the package.
 */
export interface PackageStats {
  /** Number of classes */
  classes: number;

  /** Number of functions */
  functions: number;

  /** Number of modules */
  modules: number;

  /** Number of types (interfaces, type aliases, enums) */
  types: number;

  /** Total symbol count */
  total: number;
}
