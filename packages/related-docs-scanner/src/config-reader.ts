/**
 * Config reader utility
 *
 * Reads package names from the config files to determine which packages
 * should be scanned for related documentation.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";

export interface PackageConfig {
  name: string;
  // Other fields exist but we only need name
}

export interface Config {
  project: string;
  language: "python" | "typescript" | "go" | "java";
  packages?: PackageConfig[];
  externalPackages?: PackageConfig[];
}

export interface PackageLists {
  /** Python package names (e.g., "langchain_core", "langchain_anthropic") */
  python: Set<string>;

  /** JavaScript/TypeScript package names (e.g., "@langchain/core", "langchain") */
  javascript: Set<string>;
}

/**
 * Read all config files and extract package names by language.
 *
 * @param configsDir - Path to the configs directory
 * @returns Package lists grouped by language
 */
export async function readPackageNamesFromConfigs(configsDir: string): Promise<PackageLists> {
  const result: PackageLists = {
    python: new Set(),
    javascript: new Set(),
  };

  // Find all JSON config files (exclude version files and schema)
  const configFiles = await glob(["*.json"], {
    cwd: configsDir,
    ignore: ["*-versions.json", "config-schema.json"],
  });

  for (const file of configFiles) {
    const filePath = path.join(configsDir, file);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const config: Config = JSON.parse(content);

      // Determine target set based on language
      const targetSet = config.language === "python" ? result.python : result.javascript;

      // Add package names from packages array
      if (config.packages) {
        for (const pkg of config.packages) {
          if (pkg.name) {
            targetSet.add(pkg.name);
          }
        }
      }

      // Add package names from externalPackages array
      if (config.externalPackages) {
        for (const pkg of config.externalPackages) {
          if (pkg.name) {
            targetSet.add(pkg.name);
          }
        }
      }
    } catch (error) {
      // Skip invalid config files
      console.warn(`[config-reader] Failed to read ${file}:`, error);
    }
  }

  return result;
}

/**
 * Check if a Python package name matches any known package.
 *
 * Handles submodule imports like "langchain_core.messages" matching "langchain_core".
 *
 * @param packageName - The package name from an import statement
 * @param knownPackages - Set of known package names
 * @returns True if the package matches a known package
 */
export function matchesPythonPackage(packageName: string, knownPackages: Set<string>): boolean {
  // Direct match
  if (knownPackages.has(packageName)) {
    return true;
  }

  // Check if it's a submodule of a known package
  // e.g., "langchain_core.messages" should match "langchain_core"
  for (const known of knownPackages) {
    if (packageName.startsWith(`${known}.`)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a JavaScript/TypeScript package name matches any known package.
 *
 * Handles subpath imports like "@langchain/core/messages" matching "@langchain/core".
 *
 * @param packageName - The package name from an import statement
 * @param knownPackages - Set of known package names
 * @returns True if the package matches a known package
 */
export function matchesJavaScriptPackage(packageName: string, knownPackages: Set<string>): boolean {
  // Direct match
  if (knownPackages.has(packageName)) {
    return true;
  }

  // Check if it's a subpath of a known package
  // e.g., "@langchain/core/messages" should match "@langchain/core"
  for (const known of knownPackages) {
    if (packageName.startsWith(`${known}/`)) {
      return true;
    }
  }

  return false;
}
