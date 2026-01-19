/**
 * Go Extraction Configuration
 *
 * Defines the configuration options for Go API extraction.
 */

/**
 * Configuration for Go extraction.
 */
export interface GoExtractorConfig {
  /** Package name (e.g., "langsmith") */
  packageName: string;

  /** Path to the Go source directory */
  packagePath: string;

  /** Repository (e.g., "langchain-ai/langsmith-go") */
  repo: string;

  /** Git commit SHA */
  sha: string;

  /** Output file path */
  outputPath?: string;

  /** Only extract exported symbols */
  exportedOnly: boolean;

  /** Source file patterns to include */
  includePatterns: string[];

  /** Source file patterns to exclude */
  excludePatterns: string[];
}

/**
 * Default configuration values.
 */
export const defaultConfig: Partial<GoExtractorConfig> = {
  exportedOnly: true,
  includePatterns: ["**/*.go"],
  excludePatterns: ["**/*_test.go", "**/vendor/**", "**/testdata/**"],
};

/**
 * Create a complete configuration with defaults.
 */
export function createConfig(
  partial: Partial<GoExtractorConfig> & Pick<GoExtractorConfig, "packageName" | "packagePath">,
): GoExtractorConfig {
  return {
    ...defaultConfig,
    exportedOnly: true,
    includePatterns: ["**/*.go"],
    excludePatterns: ["**/*_test.go", "**/vendor/**", "**/testdata/**"],
    repo: "",
    sha: "",
    ...partial,
  };
}

/**
 * Validate configuration.
 */
export function validateConfig(config: GoExtractorConfig): void {
  if (!config.packageName) {
    throw new Error("packageName is required");
  }
  if (!config.packagePath) {
    throw new Error("packagePath is required");
  }
}
