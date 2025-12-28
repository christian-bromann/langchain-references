/**
 * Extraction Configuration
 *
 * Defines the configuration options for TypeScript/JavaScript API extraction.
 */

/**
 * Configuration for TypeScript extraction.
 */
export interface ExtractionConfig {
  /** Package name (e.g., "@langchain/core") */
  packageName: string;

  /** Path to the package source directory */
  packagePath: string;

  /** Entry points for TypeDoc (relative to packagePath) */
  entryPoints: string[];

  /** Path to tsconfig.json (optional) */
  tsconfig?: string;

  /** Exclude private members */
  excludePrivate: boolean;

  /** Exclude @internal members */
  excludeInternal: boolean;

  /** Exclude external/node_modules dependencies */
  excludeExternals: boolean;

  /** Repository (e.g., "langchain-ai/langchainjs") */
  repo: string;

  /** Git commit SHA */
  sha: string;
}

/**
 * Default configuration values.
 */
export const defaultConfig: Partial<ExtractionConfig> = {
  excludePrivate: true,
  excludeInternal: true,
  excludeExternals: true,
  entryPoints: ["src/index.ts"],
};

/**
 * Create a complete configuration with defaults.
 */
export function createConfig(
  partial: Partial<ExtractionConfig> & Pick<ExtractionConfig, "packageName" | "packagePath">
): ExtractionConfig {
  return {
    ...defaultConfig,
    entryPoints: ["src/index.ts"],
    excludePrivate: true,
    excludeInternal: true,
    excludeExternals: true,
    repo: "",
    sha: "",
    ...partial,
  };
}

/**
 * Validate configuration.
 */
export function validateConfig(config: ExtractionConfig): void {
  if (!config.packageName) {
    throw new Error("packageName is required");
  }
  if (!config.packagePath) {
    throw new Error("packagePath is required");
  }
  if (!config.entryPoints || config.entryPoints.length === 0) {
    throw new Error("At least one entry point is required");
  }
}

