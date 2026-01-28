/**
 * Java Extraction Configuration
 *
 * Defines the configuration options for Java API extraction.
 */

/**
 * Configuration for Java extraction.
 */
export interface JavaExtractorConfig {
  /** Package name (e.g., "langsmith") */
  packageName: string;

  /** Path to the Java source directory */
  packagePath: string;

  /** Repository (e.g., "langchain-ai/langsmith-java") */
  repo: string;

  /** Git commit SHA */
  sha: string;

  /** Output file path */
  outputPath?: string;

  /** Exclude private members */
  excludePrivate: boolean;

  /** Exclude package-private members */
  excludePackagePrivate: boolean;

  /** Source file patterns to include */
  includePatterns: string[];

  /** Source file patterns to exclude */
  excludePatterns: string[];
}

/**
 * Default configuration values.
 */
export const defaultConfig: Partial<JavaExtractorConfig> = {
  excludePrivate: true,
  excludePackagePrivate: true,
  includePatterns: ["**/*.java", "**/*.kt"],
  excludePatterns: [
    "**/test/**",
    "**/tests/**",
    "**/*Test.java",
    "**/*Tests.java",
    "**/*Test.kt",
    "**/*Tests.kt",
  ],
};

/**
 * Create a complete configuration with defaults.
 */
export function createConfig(
  partial: Partial<JavaExtractorConfig> & Pick<JavaExtractorConfig, "packageName" | "packagePath">,
): JavaExtractorConfig {
  return {
    ...defaultConfig,
    excludePrivate: true,
    excludePackagePrivate: true,
    includePatterns: ["**/*.java", "**/*.kt"],
    excludePatterns: [
      "**/test/**",
      "**/tests/**",
      "**/*Test.java",
      "**/*Tests.java",
      "**/*Test.kt",
      "**/*Tests.kt",
    ],
    repo: "",
    sha: "",
    ...partial,
  };
}

/**
 * Validate configuration.
 */
export function validateConfig(config: JavaExtractorConfig): void {
  if (!config.packageName) {
    throw new Error("packageName is required");
  }
  if (!config.packagePath) {
    throw new Error("packagePath is required");
  }
}
