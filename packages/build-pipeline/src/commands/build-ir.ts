#!/usr/bin/env tsx
/**
 * Build IR - Orchestrates the IR generation pipeline
 *
 * This script:
 * 1. Loads configuration from JSON file
 * 2. Fetches source tarballs from GitHub
 * 3. Runs Python or TypeScript extractors
 * 4. Transforms output to IR format
 * 5. Uploads to Vercel Blob
 * 6. Updates build pointers in Vercel Blob
 *
 * Usage:
 *   # Build a specific config file
 *   pnpm build:ir --config ./configs/langchain-python.json
 *
 *   # Build all configs for a project
 *   pnpm build:ir --project langchain
 *
 *   # Build all configs for a language
 *   pnpm build:ir --language typescript
 *
 *   # Build a specific project+language combination
 *   pnpm build:ir --project langgraph --language typescript
 *
 *   # Build everything
 *   pnpm build:ir --all
 */
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { program } from "commander";
import semver from "semver";
import type {
  Manifest,
  SymbolRecord,
  VersioningConfig,
  PackageVersionIndex,
  PackageChangelog,
  VersionDelta,
  AddedSymbol,
  RemovedSymbol,
  ModifiedSymbol,
  SymbolSnapshot,
  MemberSnapshot,
  ParamSnapshot,
  TypeParamSnapshot,
  ChangeRecord,
  VersionStats,
  Language,
  SymbolLanguage,
} from "@langchain/ir-schema";
import {
  TypeScriptExtractor,
  TypeDocTransformer,
  createConfig,
  type TypeDocProject,
} from "@langchain/extractor-typescript";

import pLimit from "p-limit";

import { fetchTarball, getLatestSha, getCacheBaseDir, type FetchResult } from "../tarball.js";
import {
  uploadIR,
  generateCatalog,
  generateRoutingMap,
  generateLookupIndex,
  preRenderSymbolDocs,
} from "../upload.js";
import { updatePointers } from "../pointers.js";
import { checkForUpdates } from "./check-updates.js";
import { fetchDeployedChangelog, type DeployedChangelog } from "../changelog-fetcher.js";
import {
  processSubpages,
  clearFetchCache,
  transformRelativeImageUrlsWithBase,
  transformRelativeLinksToGitHub,
  type SubpageConfig,
  type ParsedSubpage,
} from "../subpage-processor.js";
import { PROJECTS, CONFIG_LANGUAGES } from "../constants.js";
import { buildRelatedDocs } from "../related-docs-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the configs directory */
const CONFIGS_DIR = path.resolve(__dirname, "../../../../configs");

/**
 * Find config files matching the given project and/or language filters.
 */
async function findConfigFiles(projectFilter?: string, languageFilter?: string): Promise<string[]> {
  const configDir = CONFIGS_DIR;
  const files = await fs.readdir(configDir);

  const configs: string[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "config-schema.json") continue;

    // Parse project and language from filename (e.g., "langchain-python.json", "langsmith-java.json")
    const match = file.match(/^(\w+)-(python|typescript|java|go)\.json$/);
    if (!match) continue;

    const [, project, language] = match;

    // Apply filters
    if (projectFilter && project !== projectFilter) continue;
    if (languageFilter && language !== languageFilter) continue;

    configs.push(path.join(configDir, file));
  }

  return configs.sort();
}

/**
 * Package configuration for extraction.
 */
interface PackageConfig {
  /** Package name (e.g., "langchain-core" or "@langchain/core") */
  name: string;
  /** Path within the repository to the package source */
  path: string;
  /** Entry points for TypeScript (optional) */
  entryPoints?: string[];
  /** Display name for the package */
  displayName?: string;
  /** Version tracking configuration */
  versioning?: VersioningConfig;
  /** GitHub raw URL for custom markdown content, or 'readme' to use package README.md */
  descriptionSource?: string;
  /** Optional curated subpages for domain-specific navigation */
  subpages?: SubpageConfig[];
  /** Patterns to exclude from extraction (e.g., '_internal' to skip internal modules) */
  excludePatterns?: string[];
}

/**
 * Build configuration loaded from JSON file.
 */
interface BuildConfig {
  /** Project identifier (langchain, langgraph, deepagent) */
  project?: string;
  /** Language to extract */
  language: SymbolLanguage;
  /** GitHub repository */
  repo: string;
  /** Packages to extract */
  packages: PackageConfig[];
}

/**
 * Generate a deterministic build ID for a single package.
 * Package-level build IDs allow independent package updates.
 */
function generatePackageBuildId(repo: string, sha: string, packageName: string): string {
  const data = JSON.stringify({ repo, sha, packageName });
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/**
 * Repository info for constructing GitHub raw URLs.
 */
interface RepoInfo {
  /** Repository owner (e.g., "langchain-ai") */
  owner: string;
  /** Repository name (e.g., "deepagents") */
  name: string;
  /** Git SHA or branch/tag */
  ref: string;
  /** Package path within repo (e.g., "libs/deepagents-cli") */
  packagePath: string;
}

/**
 * Build GitHub raw content base URL for image resolution.
 */
function buildGitHubRawBaseUrl(repoInfo: RepoInfo): string {
  return `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${repoInfo.ref}/${repoInfo.packagePath}/`;
}

/**
 * Fetch package description markdown content.
 *
 * Resolution order:
 * 1. If `descriptionSource` is set on the package config, use that URL
 * 2. If `descriptionBaseUrl` is set on the build config, generate URL from template
 * 3. Otherwise, try to read README.md from the package directory in the tarball
 *
 * @param pkgConfig - Package configuration
 * @param packagePath - Path to the extracted package directory
 * @param repoInfo - Repository info for constructing image URLs
 * @returns Markdown content or undefined if not found
 */
async function fetchPackageDescription(
  pkgConfig: PackageConfig,
  packagePath: string,
  repoInfo?: RepoInfo,
): Promise<string | undefined> {
  // Check if package has explicit descriptionSource
  if (!pkgConfig.descriptionSource || pkgConfig.descriptionSource === "readme") {
    // Use README.md from the package
    return readReadmeFromPackage(packagePath, repoInfo);
  }

  // Fetch from GitHub raw URL
  try {
    // Convert GitHub blob URLs to raw URLs if needed
    const rawUrl = pkgConfig.descriptionSource
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob/", "/");

    console.log(`      📄 Fetching description from: ${rawUrl}`);
    const response = await fetch(rawUrl);

    if (response.ok) {
      let content = await response.text();
      // Clean up the markdown - remove frontmatter and any MkDocs-specific syntax
      content = cleanMarkdownContent(content);
      // Transform relative image URLs to absolute GitHub raw URLs
      // and relative file links to absolute GitHub blob URLs
      if (repoInfo) {
        content = transformRelativeImageUrlsWithBase(content, buildGitHubRawBaseUrl(repoInfo));
        content = transformRelativeLinksToGitHub(content, repoInfo);
      }
      return content;
    } else if (response.status === 404) {
      // Try index.md for packages that have a directory structure
      const indexUrl = rawUrl.replace(/\.md$/, "/index.md");
      const indexResponse = await fetch(indexUrl);
      if (indexResponse.ok) {
        let content = await indexResponse.text();
        content = cleanMarkdownContent(content);
        if (repoInfo) {
          content = transformRelativeImageUrlsWithBase(content, buildGitHubRawBaseUrl(repoInfo));
          content = transformRelativeLinksToGitHub(content, repoInfo);
        }
        return content;
      }
      console.log(`      ⚠️  Description not found (404), falling back to README`);
      return readReadmeFromPackage(packagePath, repoInfo);
    } else {
      console.log(`      ⚠️  Failed to fetch description: ${response.status}`);
      return readReadmeFromPackage(packagePath, repoInfo);
    }
  } catch (error) {
    console.log(`      ⚠️  Error fetching description: ${error}`);
    return readReadmeFromPackage(packagePath, repoInfo);
  }
}

/**
 * Read README.md from a package directory.
 */
async function readReadmeFromPackage(
  packagePath: string,
  repoInfo?: RepoInfo,
): Promise<string | undefined> {
  const readmePaths = ["README.md", "readme.md", "Readme.md"];

  for (const readmeName of readmePaths) {
    const readmePath = path.join(packagePath, readmeName);
    try {
      let content = await fs.readFile(readmePath, "utf-8");
      console.log(`      📄 Using ${readmeName} from package`);
      content = cleanMarkdownContent(content);
      // Transform relative image URLs to absolute GitHub raw URLs
      // and relative file links to absolute GitHub blob URLs
      if (repoInfo) {
        content = transformRelativeImageUrlsWithBase(content, buildGitHubRawBaseUrl(repoInfo));
        content = transformRelativeLinksToGitHub(content, repoInfo);
      }
      return content;
    } catch {
      // Try next path
    }
  }

  return undefined;
}

/**
 * Clean markdown content by removing frontmatter and MkDocs-specific syntax.
 */
function cleanMarkdownContent(content: string): string {
  let cleaned = content;

  // Remove YAML frontmatter (--- ... ---)
  cleaned = cleaned.replace(/^---\n[\s\S]*?\n---\n/, "");

  // Remove MkDocs admonitions like !!! note "Title"
  // Keep the content but convert to a more standard format
  cleaned = cleaned.replace(
    /^!!! (\w+)(?: "([^"]*)")?\n((?:    .*\n)*)/gm,
    (_, type, title, content) => {
      const blockContent = content.replace(/^    /gm, "").trim();
      if (title) {
        return `> **${title}**\n> ${blockContent.replace(/\n/g, "\n> ")}\n\n`;
      }
      return `> ${blockContent.replace(/\n/g, "\n> ")}\n\n`;
    },
  );

  // Remove ::: directives (another MkDocs syntax)
  cleaned = cleaned.replace(/^::: .*$/gm, "");

  // Remove Material for MkDocs icons like :simple-claude:{ .lg .middle }
  cleaned = cleaned.replace(/:\w+[-\w]*:(?:\{[^}]*\})?/g, "");

  return cleaned.trim();
}

/**
 * Export path information extracted from package.json exports.
 */
interface ExportPathInfo {
  /** The export path (e.g., "./hub", "./load/serializable") */
  path: string;
  /** Display slug for navigation (e.g., "hub", "load/serializable") */
  slug: string;
  /** Title for display (derived from the path) */
  title: string;
}

/**
 * Extract export paths from a TypeScript/JavaScript package.json.
 *
 * Rules:
 * - Only includes exports with valid import/require fields (not just package.json)
 * - Ignores the root export "."
 * - Ignores "./package.json"
 * - Returns the export paths for navigation
 *
 * @param packagePath - Path to the package directory containing package.json
 * @returns Array of export path info, or empty if only root export exists
 */
async function extractExportPaths(packagePath: string): Promise<ExportPathInfo[]> {
  try {
    const packageJsonPath = path.join(packagePath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    if (!packageJson.exports || typeof packageJson.exports !== "object") {
      return [];
    }

    const exportPaths: ExportPathInfo[] = [];

    for (const [exportPath, exportConfig] of Object.entries(packageJson.exports)) {
      // Skip root export "."
      if (exportPath === ".") continue;

      // Skip package.json export
      if (exportPath === "./package.json") continue;

      // Check if it's a valid module export (has import or require)
      if (!isValidModuleExport(exportConfig)) continue;

      // Convert export path to slug (remove leading ./)
      const slug = exportPath.replace(/^\.\//, "");

      // Generate title from the path (last segment, formatted nicely)
      const title = generateTitleFromPath(slug);

      exportPaths.push({
        path: exportPath,
        slug,
        title,
      });
    }

    return exportPaths;
  } catch {
    return [];
  }
}

/**
 * Check if an export config represents a valid module export.
 * Valid exports have 'import', 'require', or 'input' fields.
 */
function isValidModuleExport(exportConfig: unknown): boolean {
  if (typeof exportConfig === "string") {
    // Direct string export like "./dist/index.js"
    return exportConfig.endsWith(".js") || exportConfig.endsWith(".ts");
  }

  if (typeof exportConfig === "object" && exportConfig !== null) {
    const config = exportConfig as Record<string, unknown>;

    // Check for common module export patterns
    if (config.import || config.require || config.input) {
      return true;
    }

    // Check nested conditions (e.g., { import: { types: ..., default: ... } })
    for (const value of Object.values(config)) {
      if (typeof value === "object" && value !== null) {
        const nested = value as Record<string, unknown>;
        if (nested.default || nested.types) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Generate a display title from an export path.
 * e.g., "load/serializable" -> "serializable"
 * e.g., "hub" -> "hub"
 */
function generateTitleFromPath(slug: string): string {
  // Take the last segment of the path
  const segments = slug.split("/");
  const lastSegment = segments[segments.length - 1] || slug;

  // Convert underscores/hyphens to spaces and capitalize
  return lastSegment.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Remove directories matching exclude patterns from the package path.
 * This prevents griffe from parsing modules that cause issues (e.g., _internal).
 */
async function removeExcludedDirectories(
  packagePath: string,
  packageName: string,
  excludePatterns: string[],
): Promise<void> {
  // The package module directory (e.g., .../python/langsmith)
  const packageModulePath = path.join(packagePath, packageName.replace(/-/g, "_"));

  try {
    await fs.access(packageModulePath);
    await removeMatchingDirectories(packageModulePath, excludePatterns);
  } catch {
    // Module directory doesn't exist, try the package path directly
    await removeMatchingDirectories(packagePath, excludePatterns);
  }
}

/**
 * Recursively find and remove directories/files matching patterns.
 */
async function removeMatchingDirectories(dirPath: string, patterns: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Directory doesn't exist or not accessible
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const nameWithoutExt = entry.name.replace(/\.py$/, "");

    // Check if this entry matches any exclude pattern
    const matches = patterns.some(
      (pattern) =>
        entry.name === pattern || entry.name.startsWith(pattern) || nameWithoutExt === pattern,
    );

    if (matches) {
      if (entry.isDirectory()) {
        console.log(`      🗑️  Removing excluded directory: ${entry.name}`);
      } else {
        console.log(`      🗑️  Removing excluded file: ${entry.name}`);
      }
      await fs.rm(fullPath, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      // Recurse into subdirectories
      await removeMatchingDirectories(fullPath, patterns);
    }
  }
}

/**
 * Run the Python extractor on a package.
 */
async function extractPython(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
  excludePatterns?: string[],
): Promise<void> {
  console.log(`   🐍 Extracting: ${packageName}`);

  // Remove excluded directories before extraction to prevent griffe from parsing them
  if (excludePatterns && excludePatterns.length > 0) {
    console.log(`      Applying exclude patterns: ${excludePatterns.join(", ")}`);
    await removeExcludedDirectories(packagePath, packageName, excludePatterns);
  }

  // Path to the Python extractor source
  const extractorSrcPath = path.resolve(__dirname, "../../../../packages/extractor-python/src");

  const args = [
    "-m",
    "langchain_extractor_python.cli",
    "--package",
    packageName.replace(/-/g, "_"),
    "--path",
    packagePath,
    "--output",
    outputPath,
    "--repo",
    repo,
    "--sha",
    sha,
  ];

  // Add exclude patterns if provided (still pass for filtering during walk)
  if (excludePatterns && excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      args.push("--exclude", pattern);
    }
  }

  // Add extractor source to PYTHONPATH
  const pythonPath = process.env.PYTHONPATH
    ? `${extractorSrcPath}:${process.env.PYTHONPATH}`
    : extractorSrcPath;

  await runCommand("python3", args, {
    env: { PYTHONPATH: pythonPath },
  });
}

/**
 * Run the TypeScript extractor on a package.
 * Uses the extractor as a library for reliability (no subprocess spawning).
 */
async function extractTypeScript(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
  entryPoints?: string[],
  sourcePathPrefix?: string,
  /** Package's relative path within the repo (e.g., "libs/langchain-core") */
  packageRepoPath?: string,
): Promise<void> {
  console.log(`   📘 Extracting: ${packageName}`);

  // Create configuration
  const config = createConfig({
    packageName,
    packagePath,
    entryPoints: entryPoints || ["auto"],
    repo,
    sha,
    excludePrivate: true,
    excludeInternal: true,
    excludeExternals: false,
  });

  // Run extraction
  const extractor = new TypeScriptExtractor(config);
  const packageInfo = await extractor.getPackageInfo();
  const rawJson = (await extractor.extractToJson()) as TypeDocProject;

  // Transform to IR format
  // TypeDocTransformer expects the raw JSON object from extractToJson
  const transformer = new TypeDocTransformer(
    rawJson,
    packageName,
    repo,
    sha,
    sourcePathPrefix,
    packagePath,
    packageRepoPath,
  );

  const symbols = transformer.transform();

  // Build output data
  const outputData = {
    package: {
      packageId: `pkg_js_${packageName.replace(/^@/, "").replace(/\//g, "_")}`,
      displayName: packageName,
      publishedName: packageName,
      language: "typescript",
      ecosystem: "javascript",
      version: packageInfo.version,
      repo: {
        owner: repo.split("/")[0] || "",
        name: repo.split("/")[1] || "",
        sha,
        path: packagePath,
      },
    },
    symbols,
  };

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Write output
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

  console.log(`   ✅ Extracted ${symbols.length} symbols`);
}

/**
 * Run the Java extractor on a package.
 */
async function extractJava(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
): Promise<void> {
  console.log(`   ☕ Extracting: ${packageName}`);

  const extractorPath = path.resolve(__dirname, "../../../../packages/extractor-java/src/cli.ts");

  const args = [
    extractorPath,
    "--package",
    packageName,
    "--path",
    packagePath,
    "--output",
    outputPath,
    "--repo",
    repo,
    "--sha",
    sha,
  ];

  await runCommand("npx", ["tsx", ...args]);
}

/**
 * Run the Go extractor on a package.
 */
async function extractGo(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
): Promise<void> {
  console.log(`   🐹 Extracting: ${packageName}`);

  const extractorPath = path.resolve(__dirname, "../../../../packages/extractor-go/src/cli.ts");

  const args = [
    extractorPath,
    "--package",
    packageName,
    "--path",
    packagePath,
    "--output",
    outputPath,
    "--repo",
    repo,
    "--sha",
    sha,
  ];

  await runCommand("npx", ["tsx", ...args]);
}

/**
 * Check if Java is installed and accessible.
 * Returns true if Java is available, false otherwise.
 */
async function checkJavaTools(): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("java", ["-version"], {
        stdio: "pipe",
        shell: true, // Use shell to inherit PATH
      });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`java -version exited with code ${code}`));
      });
      proc.on("error", reject);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Go is installed and accessible.
 * Returns true if Go is available, false otherwise.
 */
async function checkGoTools(): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("go", ["version"], {
        stdio: "pipe",
        shell: true, // Use shell to inherit PATH
      });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`go version exited with code ${code}`));
      });
      proc.on("error", reject);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and wait for completion.
 */
interface RunCommandOptions {
  env?: Record<string, string>;
  cwd?: string;
  /** Timeout in milliseconds (default: 10 minutes) */
  timeout?: number;
}

/** Default timeout for extraction commands: 10 minutes */
const DEFAULT_EXTRACTION_TIMEOUT = 10 * 60 * 1000;

/**
 * Run a shell command and wait for completion.
 * Used for running the Python extractor.
 */
function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout ?? DEFAULT_EXTRACTION_TIMEOUT;
    let killed = false;

    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    // Set up timeout to kill long-running processes
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      // Force kill after 5 seconds if still running
      setTimeout(() => proc.kill("SIGKILL"), 5000);
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (killed) {
        reject(new Error(`Command timed out after ${timeout / 1000}s`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

/**
 * Normalize package name to a valid ID.
 */
function normalizePackageId(name: string, language: SymbolLanguage): string {
  const ecosystemMap: Record<SymbolLanguage, string> = {
    python: "py",
    typescript: "js",
    java: "java",
    go: "go",
  };
  const ecosystem = ecosystemMap[language] || language;
  const normalized = name.replace(/^@/, "").replace(/\//g, "_").replace(/-/g, "_");
  return `pkg_${ecosystem}_${normalized}`;
}

/**
 * Cached version entry from *-versions.json files
 */
interface CachedVersionEntry {
  version: string;
  sha: string;
  tag: string;
  releaseDate: string;
}

interface CachedPackageVersions {
  packageName: string;
  tagPattern: string;
  versions: CachedVersionEntry[];
  lastUpdated: string;
}

interface CachedProjectVersions {
  project: string;
  language: string;
  repo: string;
  lastSynced: string;
  packages: CachedPackageVersions[];
}

/**
 * Load cached versions from the *-versions.json file.
 */
async function loadCachedVersions(
  project: string,
  language: SymbolLanguage,
): Promise<CachedProjectVersions | null> {
  const versionsFile = path.resolve(
    __dirname,
    `../../../../configs/${project}-${language}-versions.json`,
  );

  try {
    const content = await fs.readFile(versionsFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Validate if a string looks like a valid semantic version.
 * Python packages using dynamic versioning like `__version__ = metadata.version(__package__)`
 * will have the source code expression extracted instead of the actual version.
 *
 * @param version - The version string to validate
 * @returns True if the version looks valid (e.g., "1.2.3"), false if it looks like source code
 */
function isValidVersionString(version: string): boolean {
  if (!version || version === "unknown") {
    return false;
  }

  // Common patterns that indicate source code rather than a version
  const invalidPatterns = [
    /metadata\.version/i, // metadata.version(__package__)
    /importlib/i, // importlib.metadata.version(...)
    /\(__\w+__\)/, // (__package__), (__name__), etc.
    /VERSION\b/, // VERSION constant reference
    /pkg_resources/, // pkg_resources.get_distribution(...)
    /get_distribution/i,
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(version)) {
      return false;
    }
  }

  // A valid version should roughly match semver-like patterns
  // e.g., "1.2.3", "0.1.0", "2.0.0-beta.1"
  // This is a loose check - just ensure it starts with a number and has reasonable format
  const versionPattern = /^\d+(\.\d+)*(-[\w.]+)?(\+[\w.]+)?$/;
  return versionPattern.test(version);
}

/**
 * Get the latest version for a package from cached versions.
 *
 * @param cachedVersions - The cached versions data
 * @param packageName - The package name to look up
 * @returns The latest version string, or null if not found
 */
function getLatestCachedVersion(
  cachedVersions: CachedProjectVersions | null,
  packageName: string,
): string | null {
  if (!cachedVersions?.packages) {
    return null;
  }

  const cachedPkg = cachedVersions.packages.find((p) => p.packageName === packageName);
  if (!cachedPkg?.versions?.length) {
    return null;
  }

  // Versions are sorted newest first
  return cachedPkg.versions[0].version;
}

/**
 * Get the package path for a specific version, handling pathOverrides.
 */
function getPackagePathForVersion(pkgConfig: PackageConfig, version: string): string {
  // Access pathOverrides from the versioning config (may not be in types yet)
  const pathOverrides = (pkgConfig.versioning as Record<string, unknown> | undefined)
    ?.pathOverrides as Record<string, string> | undefined;
  if (!pathOverrides) {
    return pkgConfig.path;
  }

  // Check for matching override (e.g., "0.x" matches "0.3.79")
  for (const [pattern, overridePath] of Object.entries(pathOverrides)) {
    if (pattern.endsWith(".x")) {
      // Match major.x or major.minor.x patterns
      const prefix = pattern.slice(0, -1); // "0." from "0.x"
      if (version.startsWith(prefix)) {
        return overridePath;
      }
    } else if (version === pattern) {
      return overridePath;
    }
  }

  return pkgConfig.path;
}

/**
 * Extract symbols for a specific package at a specific SHA.
 * Returns the path to the extracted symbols.json file.
 */
async function extractHistoricalVersion(
  config: BuildConfig,
  pkgConfig: PackageConfig,
  sha: string,
  version: string,
  cacheDir: string,
): Promise<{ symbolsPath: string; symbolCount: number } | null> {
  const packageId = normalizePackageId(pkgConfig.name, config.language);
  const versionCacheDir = path.join(cacheDir, "version-cache", packageId, sha);
  const symbolsPath = path.join(versionCacheDir, "symbols.json");

  // Check if already cached
  try {
    const existing = await fs.readFile(symbolsPath, "utf-8");
    const data = JSON.parse(existing);
    console.log(`      ✓ ${version} (cached, ${data.symbols?.length ?? 0} symbols)`);
    return { symbolsPath, symbolCount: data.symbols?.length ?? 0 };
  } catch {
    // Not cached, need to extract
  }

  console.log(`      Extracting ${version} (${sha.slice(0, 7)})...`);

  // Fetch tarball for this SHA with filtered build for just this package
  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchTarball({
      repo: config.repo,
      sha,
      output: cacheDir,
      targetPackages: [pkgConfig.name],
    });
  } catch (error) {
    console.warn(`      ⚠️ Failed to fetch ${version}: ${error}`);
    return null;
  }

  // Create output directory
  await fs.mkdir(versionCacheDir, { recursive: true });

  // Get version-specific path (handles pathOverrides for v0.x etc.)
  const versionPath = getPackagePathForVersion(pkgConfig, version);
  const packagePath = path.join(fetchResult.extractedPath, versionPath);

  // Check if path exists
  try {
    await fs.access(packagePath);
  } catch {
    console.warn(`      ⚠️ Path not found for ${version}: ${versionPath}`);
    return null;
  }

  try {
    if (config.language === "python") {
      await extractPython(
        packagePath,
        pkgConfig.name,
        symbolsPath,
        config.repo,
        sha,
        pkgConfig.excludePatterns,
      );
    } else if (config.language === "typescript") {
      await extractTypeScript(
        packagePath,
        pkgConfig.name,
        symbolsPath,
        config.repo,
        sha,
        pkgConfig.entryPoints,
        fetchResult.extractedPath,
        versionPath, // Package's relative path in the repo
      );
    } else if (config.language === "java") {
      await extractJava(packagePath, pkgConfig.name, symbolsPath, config.repo, sha);
    } else if (config.language === "go") {
      await extractGo(packagePath, pkgConfig.name, symbolsPath, config.repo, sha);
    }

    const data = JSON.parse(await fs.readFile(symbolsPath, "utf-8"));

    // Clean up extracted tarball to save disk space (especially in CI)
    // Keep only the small symbols.json in version-cache
    if (process.env.CI) {
      await cleanupExtractedRepo(fetchResult.extractedPath);
    }

    return { symbolsPath, symbolCount: data.symbols?.length ?? 0 };
  } catch (error) {
    console.warn(`      ⚠️ Failed to extract ${version}: ${error}`);
    // Still try to clean up on failure
    if (process.env.CI) {
      await cleanupExtractedRepo(fetchResult.extractedPath).catch(() => {});
    }
    return null;
  }
}

/**
 * Clean up an extracted repository directory to save disk space.
 * Removes the entire extracted directory including node_modules.
 */
async function cleanupExtractedRepo(extractedPath: string): Promise<void> {
  try {
    // Get the parent directory (which contains both extracted/ and source.tar.gz)
    const parentDir = path.dirname(extractedPath);
    await fs.rm(parentDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Load symbol names from a symbols.json file for diffing.
 */
async function loadSymbolNames(symbolsPath: string): Promise<Map<string, SymbolRecord>> {
  const content = await fs.readFile(symbolsPath, "utf-8");
  const data = JSON.parse(content);
  const symbols = new Map<string, SymbolRecord>();

  for (const sym of data.symbols || []) {
    symbols.set(sym.qualifiedName, sym);
  }

  return symbols;
}

/**
 * Compute when each symbol was introduced by comparing versions.
 */
function computeSymbolIntroductions(
  versionSymbols: Map<string, Map<string, SymbolRecord>>, // version -> qualifiedName -> symbol
  versions: CachedVersionEntry[], // newest first
): Map<string, string> {
  const introductions = new Map<string, string>(); // qualifiedName -> version introduced

  // Process from oldest to newest
  const reversedVersions = [...versions].reverse();

  for (let i = 0; i < reversedVersions.length; i++) {
    const version = reversedVersions[i].version;
    const symbols = versionSymbols.get(version);
    if (!symbols) continue;

    for (const qualifiedName of symbols.keys()) {
      // If we haven't seen this symbol yet, it was introduced in this version
      if (!introductions.has(qualifiedName)) {
        introductions.set(qualifiedName, version);
      }
    }
  }

  return introductions;
}

// =============================================================================
// SNAPSHOT & DIFF FUNCTIONS
// =============================================================================

/**
 * Normalize a source path by extracting the relative path within the package.
 * Handles various path formats from TypeDoc including:
 * - Absolute paths: /tmp/.../extracted/libs/pkg/src/file.ts
 * - Relative paths: ../../../../../tmp/.../extracted/libs/pkg/src/file.ts
 * - Already normalized: src/file.ts
 */
function normalizeSourcePath(sourcePath: string): string {
  if (!sourcePath) return "";

  // Handle paths that contain the build cache directory (relative or absolute)
  // Match pattern: .../extracted/libs/{package-dir}/{path} or .../extracted/{path}
  const extractedMatch = sourcePath.match(/\/extracted\/(?:libs\/)?([^/]+)\/(.+)$/);
  if (extractedMatch) {
    // Return the path within the package (e.g., "src/documents/document.ts")
    return extractedMatch[2];
  }

  // Handle paths that go through tmp directory with ../
  const tmpMatch = sourcePath.match(
    /(?:^|\/|\.\.\/)tmp\/.*?\/extracted\/(?:libs\/)?([^/]+)\/(.+)$/,
  );
  if (tmpMatch) {
    return tmpMatch[2];
  }

  // Handle paths that already start with src/
  const srcMatch = sourcePath.match(/^(?:\.\.\/)*src\/(.+)$/);
  if (srcMatch) {
    return `src/${srcMatch[1]}`;
  }

  // Handle simple src/ paths within the file
  const srcInPathMatch = sourcePath.match(/\/src\/(.+)$/);
  if (srcInPathMatch) {
    return `src/${srcInPathMatch[1]}`;
  }

  // If path doesn't start with / or .., assume it's already normalized
  if (!sourcePath.startsWith("/") && !sourcePath.startsWith("..")) {
    return sourcePath;
  }

  // Last resort: just take the filename
  const lastSlash = sourcePath.lastIndexOf("/");
  return lastSlash >= 0 ? sourcePath.slice(lastSlash + 1) : sourcePath;
}

/**
 * Create a compact snapshot from a full SymbolRecord.
 */
function createSnapshot(symbol: SymbolRecord): SymbolSnapshot {
  const snapshot: SymbolSnapshot = {
    qualifiedName: symbol.qualifiedName,
    kind: symbol.kind,
    signature: symbol.signature,
    sourcePath: normalizeSourcePath(symbol.source?.path || ""),
    sourceLine: symbol.source?.line || 0,
  };

  if (symbol.members && symbol.members.length > 0) {
    snapshot.members = symbol.members
      .filter((m) => m.visibility === "public")
      .map(
        (m): MemberSnapshot => ({
          name: m.name,
          kind: m.kind,
          signature: m.name,
          visibility: m.visibility || "public",
        }),
      );
  }

  if (symbol.params && symbol.params.length > 0) {
    snapshot.params = symbol.params.map(
      (p): ParamSnapshot => ({
        name: p.name,
        type: p.type,
        required: p.required !== false,
        default: p.default,
      }),
    );
  }

  if (symbol.returns?.type) {
    snapshot.returnType = symbol.returns.type;
  }

  if (symbol.typeParams && symbol.typeParams.length > 0) {
    snapshot.typeParams = symbol.typeParams.map(
      (tp): TypeParamSnapshot => ({
        name: tp.name,
        constraint: tp.constraint,
        default: tp.default,
      }),
    );
  }

  if (symbol.relations?.extends && symbol.relations.extends.length > 0) {
    snapshot.extends = symbol.relations.extends;
  }

  if (symbol.relations?.implements && symbol.relations.implements.length > 0) {
    snapshot.implements = symbol.relations.implements;
  }

  return snapshot;
}

/**
 * Compare two symbols and detect changes.
 */
function compareSymbols(before: SymbolRecord, after: SymbolRecord): ChangeRecord[] {
  const changes: ChangeRecord[] = [];

  if (before.signature !== after.signature) {
    changes.push({
      type: "signature-changed",
      description: "Signature changed",
      breaking: false,
      before: { signature: before.signature },
      after: { signature: after.signature },
    });
  }

  if (before.returns?.type !== after.returns?.type) {
    changes.push({
      type: "return-type-changed",
      description: `Return type changed from ${before.returns?.type || "void"} to ${after.returns?.type || "void"}`,
      breaking: true,
      before: { type: before.returns?.type || "void" },
      after: { type: after.returns?.type || "void" },
    });
  }

  const beforeExtends = [...(before.relations?.extends || [])].sort();
  const afterExtends = [...(after.relations?.extends || [])].sort();
  if (JSON.stringify(beforeExtends) !== JSON.stringify(afterExtends)) {
    changes.push({
      type: "extends-changed",
      description: "Inheritance changed",
      breaking: true,
      before: { types: beforeExtends },
      after: { types: afterExtends },
    });
  }

  if (before.members || after.members) {
    const beforeMembers = new Map((before.members || []).map((m) => [m.name, m]));
    const afterMembers = new Map((after.members || []).map((m) => [m.name, m]));

    for (const [name, member] of beforeMembers) {
      if (!afterMembers.has(name) && member.visibility === "public") {
        changes.push({
          type: "member-removed",
          description: `Member '${name}' was removed`,
          breaking: true,
          memberName: name,
        });
      }
    }

    for (const [name, member] of afterMembers) {
      if (!beforeMembers.has(name) && member.visibility === "public") {
        changes.push({
          type: "member-added",
          description: `Member '${name}' was added`,
          breaking: false,
          memberName: name,
        });
      }
    }

    for (const [name, afterMember] of afterMembers) {
      const beforeMember = beforeMembers.get(name);
      if (beforeMember && afterMember.visibility === "public") {
        if (beforeMember.kind !== afterMember.kind) {
          changes.push({
            type: "member-type-changed",
            description: `Member '${name}' kind changed from ${beforeMember.kind} to ${afterMember.kind}`,
            breaking: true,
            memberName: name,
          });
        }
        if (beforeMember.visibility !== afterMember.visibility) {
          changes.push({
            type: "member-visibility-changed",
            description: `Member '${name}' visibility changed`,
            breaking: afterMember.visibility !== "public",
            memberName: name,
            before: { visibility: beforeMember.visibility },
            after: { visibility: afterMember.visibility },
          });
        }
      }
    }
  }

  if (before.params || after.params) {
    const beforeParams = before.params || [];
    const afterParams = after.params || [];

    if (beforeParams.length !== afterParams.length) {
      const addedCount = Math.max(0, afterParams.length - beforeParams.length);
      const removedCount = Math.max(0, beforeParams.length - afterParams.length);
      if (addedCount > 0) {
        changes.push({
          type: "param-added",
          description: `${addedCount} parameter(s) added`,
          breaking: false,
        });
      }
      if (removedCount > 0) {
        changes.push({
          type: "param-removed",
          description: `${removedCount} parameter(s) removed`,
          breaking: true,
        });
      }
    } else {
      for (let i = 0; i < beforeParams.length; i++) {
        const bp = beforeParams[i];
        const ap = afterParams[i];
        if (bp.type !== ap.type) {
          changes.push({
            type: "param-type-changed",
            description: `Parameter '${bp.name}' type changed from ${bp.type} to ${ap.type}`,
            breaking: true,
            memberName: bp.name,
            before: { type: bp.type },
            after: { type: ap.type },
          });
        }
      }
    }
  }

  return changes;
}

/**
 * Compute version deltas (changelog) between consecutive versions.
 */
function computeVersionDeltas(
  versionSymbols: Map<string, Map<string, SymbolRecord>>,
  versions: CachedVersionEntry[],
): { deltas: VersionDelta[]; versionStats: Map<string, VersionStats> } {
  const deltas: VersionDelta[] = [];
  const versionStats = new Map<string, VersionStats>();

  for (let i = 0; i < versions.length; i++) {
    const current = versions[i];
    const previous = i < versions.length - 1 ? versions[i + 1] : null;

    const currentSymbols = versionSymbols.get(current.version);
    const previousSymbols = previous ? versionSymbols.get(previous.version) : null;

    if (!currentSymbols) continue;

    const added: AddedSymbol[] = [];
    const removed: RemovedSymbol[] = [];
    const modified: ModifiedSymbol[] = [];

    if (previousSymbols) {
      for (const [name, symbol] of currentSymbols) {
        if (!previousSymbols.has(name)) {
          added.push({
            qualifiedName: name,
            snapshot: createSnapshot(symbol),
          });
        }
      }

      for (const [name, symbol] of previousSymbols) {
        if (!currentSymbols.has(name)) {
          removed.push({
            qualifiedName: name,
            kind: symbol.kind,
          });
        }
      }

      for (const [name, currentSymbol] of currentSymbols) {
        const previousSymbol = previousSymbols.get(name);
        if (previousSymbol) {
          const changes = compareSymbols(previousSymbol, currentSymbol);
          if (changes.length > 0) {
            modified.push({
              qualifiedName: name,
              changes,
              snapshotBefore: createSnapshot(previousSymbol),
              snapshotAfter: createSnapshot(currentSymbol),
            });
          }
        }
      }
    } else {
      for (const [name, symbol] of currentSymbols) {
        added.push({
          qualifiedName: name,
          snapshot: createSnapshot(symbol),
        });
      }
    }

    const breakingCount =
      modified.reduce((count, m) => count + m.changes.filter((c) => c.breaking).length, 0) +
      removed.length;

    const stats: VersionStats = {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      breaking: breakingCount,
      totalSymbols: currentSymbols.size,
    };

    versionStats.set(current.version, stats);

    if (added.length > 0 || removed.length > 0 || modified.length > 0 || !previous) {
      deltas.push({
        version: current.version,
        previousVersion: previous?.version ?? null,
        sha: current.sha,
        releaseDate: current.releaseDate,
        added,
        removed,
        modified,
        deprecated: [],
      });
    }
  }

  return { deltas, versionStats };
}

/**
 * Build version history for a single package with package-level build structure.
 * This is used when building a single package with --package flag.
 *
 * Unlike buildVersionHistory, this function expects:
 * - symbols.json to be directly in irOutputPath (not in packages/{packageId}/)
 * - changelog.json and versions.json to be written directly to irOutputPath
 */
async function buildVersionHistoryForPackage(
  config: BuildConfig,
  fetchResult: FetchResult,
  irOutputPath: string,
  forceFullRebuild: boolean | undefined,
  pkgConfig: PackageConfig,
): Promise<void> {
  // Check versioning config first before loading cached versions
  if (!pkgConfig.versioning?.tagPattern) {
    console.log(`   ⚠️  ${pkgConfig.name}: No versioning config. Skipping.`);
    return;
  }

  if (pkgConfig.versioning.enabled === false) {
    console.log(`   ⚠️  ${pkgConfig.name}: Versioning disabled. Skipping.`);
    return;
  }

  const cachedVersions = await loadCachedVersions(config.project || "langchain", config.language);

  if (!cachedVersions || !cachedVersions.lastSynced) {
    console.log(`   ⚠️  No cached versions found. Run 'pnpm sync-versions' first.`);
    return;
  }

  console.log(`   Using cached versions from ${cachedVersions.lastSynced.split("T")[0]}`);

  const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);

  if (!cachedPkg || cachedPkg.versions.length === 0) {
    console.log(`   ⚠️  ${pkgConfig.name}: No cached versions. Run 'pnpm sync-versions'.`);
    return;
  }

  const minVersion = pkgConfig.versioning.minVersion;
  const versions = minVersion
    ? cachedPkg.versions.filter((v) => semver.gte(v.version, minVersion))
    : cachedPkg.versions;

  if (versions.length === 0) {
    console.log(`   ⚠️  ${pkgConfig.name}: No versions >= ${minVersion}. Skipping.`);
    return;
  }

  const cacheDir = getCacheBaseDir();
  const project = config.project || "langchain";
  const languageMap: Record<SymbolLanguage, Language> = {
    python: "python",
    typescript: "javascript",
    java: "java",
    go: "go",
  };
  const language = languageMap[config.language] || config.language;
  const packageId = normalizePackageId(pkgConfig.name, config.language);

  // For package-level builds, symbols.json is directly in irOutputPath
  const latestSymbolsPath = path.join(irOutputPath, "symbols.json");

  // Check if latest extraction succeeded
  try {
    await fs.access(latestSymbolsPath);
  } catch {
    console.log(`      ⚠️ Skipping (latest extraction failed or package path not found)`);
    return;
  }

  // Check for existing changelog in blob storage (incremental build)
  let existingChangelog: DeployedChangelog | null = null;
  let versionsToProcess: CachedVersionEntry[] = versions;

  if (!forceFullRebuild) {
    try {
      existingChangelog = await fetchDeployedChangelog(project, language, packageId);

      if (existingChangelog) {
        const existingVersionSet = new Set(
          existingChangelog.changelog.history.map((h) => h.version),
        );

        const newVersions = versions.filter((v) => !existingVersionSet.has(v.version));

        if (newVersions.length === 0) {
          console.log(
            `\n   📦 ${pkgConfig.name}: ⏭️  SKIPPED - changelog already exists in blob storage`,
          );
          console.log(
            `      Found ${existingChangelog.changelog.history.length} versions in existing changelog (latest: ${existingChangelog.versions.latest.version})`,
          );

          await annotateSymbolsFromChangelog(
            latestSymbolsPath,
            existingChangelog.changelog,
            versions,
          );

          await fs.writeFile(
            path.join(irOutputPath, "changelog.json"),
            JSON.stringify(existingChangelog.changelog, null, 2),
          );
          await fs.writeFile(
            path.join(irOutputPath, "versions.json"),
            JSON.stringify(existingChangelog.versions, null, 2),
          );

          console.log(`      ✓ Reused existing changelog, no extraction needed`);
          return;
        }

        console.log(
          `\n   📦 ${pkgConfig.name}: Found ${newVersions.length} new version(s) to process (existing: ${existingVersionSet.size})`,
        );
        versionsToProcess = newVersions;
      } else {
        console.log(
          `\n   📦 ${pkgConfig.name}: No existing changelog found, building full history (${versions.length} versions)`,
        );
      }
    } catch (error) {
      console.log(
        `\n   📦 ${pkgConfig.name}: Failed to fetch existing changelog (${error}), building full history`,
      );
    }
  } else {
    console.log(
      `\n   📦 ${pkgConfig.name}: Force full rebuild requested, processing ${versions.length} version(s)`,
    );
  }

  const versionSymbols = new Map<string, Map<string, SymbolRecord>>();

  // Load latest symbols
  console.log(`      ✓ ${versions[0].version} (latest, already extracted)`);
  try {
    const latestSymbols = await loadSymbolNames(latestSymbolsPath);
    versionSymbols.set(versions[0].version, latestSymbols);
  } catch (error) {
    console.warn(`      ⚠️ Failed to load latest symbols: ${error}`);
    return;
  }

  // Handle incremental build bridging
  let bridgeVersion: CachedVersionEntry | null = null;
  if (
    existingChangelog &&
    versionsToProcess.length > 0 &&
    versionsToProcess.length < versions.length
  ) {
    const oldestNewVersion = versionsToProcess[versionsToProcess.length - 1];
    const oldestNewIdx = versions.findIndex((v) => v.version === oldestNewVersion.version);
    if (oldestNewIdx < versions.length - 1) {
      const previousVersion = versions[oldestNewIdx + 1];
      bridgeVersion = previousVersion;

      const result = await extractHistoricalVersion(
        config,
        pkgConfig,
        previousVersion.sha,
        previousVersion.version,
        cacheDir,
      );
      if (result) {
        console.log(
          `      ✓ ${previousVersion.version} (previous version for diff, ${result.symbolCount} symbols)`,
        );
        const symbols = await loadSymbolNames(result.symbolsPath);
        versionSymbols.set(previousVersion.version, symbols);
      }
    }
  }

  // Extract historical versions in parallel for faster builds
  // Use concurrency of 3 to balance speed vs GitHub rate limits and disk I/O
  const versionsToExtract = versionsToProcess.filter(
    (v) => v.version !== versions[0].version && !versionSymbols.has(v.version),
  );

  if (versionsToExtract.length > 0) {
    console.log(
      `      Extracting ${versionsToExtract.length} historical version(s) in parallel (concurrency: 3)...`,
    );

    const limit = pLimit(3);
    const extractionResults = await Promise.all(
      versionsToExtract.map((v) =>
        limit(async () => {
          const result = await extractHistoricalVersion(
            config,
            pkgConfig,
            v.sha,
            v.version,
            cacheDir,
          );
          return { version: v.version, result };
        }),
      ),
    );

    // Process results after all extractions complete
    for (const { version, result } of extractionResults) {
      if (result) {
        console.log(`      ✓ ${version} (${result.symbolCount} symbols)`);
        const symbols = await loadSymbolNames(result.symbolsPath);
        versionSymbols.set(version, symbols);
      }
    }
  }

  // Compute deltas
  let finalDeltas: VersionDelta[];
  let allVersionStats: Map<string, VersionStats>;

  if (existingChangelog && versionsToProcess.length < versions.length) {
    const versionsForDelta = bridgeVersion
      ? [...versionsToProcess, bridgeVersion]
      : versionsToProcess;

    const { deltas: newDeltas, versionStats: newStats } = computeVersionDeltas(
      versionSymbols,
      versionsForDelta,
    );

    const filteredDeltas = bridgeVersion
      ? newDeltas.filter((d) => d.version !== bridgeVersion?.version)
      : newDeltas;

    finalDeltas = [...filteredDeltas, ...existingChangelog.changelog.history];

    allVersionStats = new Map<string, VersionStats>();
    for (const [v, stats] of newStats) {
      allVersionStats.set(v, stats);
    }
    for (const vInfo of existingChangelog.versions.versions) {
      if (!allVersionStats.has(vInfo.version)) {
        allVersionStats.set(vInfo.version, vInfo.stats);
      }
    }

    console.log(
      `      ✓ Merged ${filteredDeltas.length} new delta(s) with ${existingChangelog.changelog.history.length} existing`,
    );
  } else {
    const { deltas, versionStats } = computeVersionDeltas(versionSymbols, versions);
    finalDeltas = deltas;
    allVersionStats = versionStats;
  }

  // Compute introductions and annotate
  const introductions = computeSymbolIntroductions(versionSymbols, versions);

  try {
    const symbolsContent = await fs.readFile(latestSymbolsPath, "utf-8");
    const symbolsData = JSON.parse(symbolsContent);

    const modifiedInMap = new Map<string, string[]>();
    for (const delta of finalDeltas) {
      for (const mod of delta.modified) {
        const modVersions = modifiedInMap.get(mod.qualifiedName) || [];
        modVersions.push(delta.version);
        modifiedInMap.set(mod.qualifiedName, modVersions);
      }
    }

    let annotatedCount = 0;
    if (symbolsData.symbols && Array.isArray(symbolsData.symbols)) {
      for (const symbol of symbolsData.symbols) {
        const since = introductions.get(symbol.qualifiedName);
        const modifiedIn = modifiedInMap.get(symbol.qualifiedName);

        symbol.versionInfo = {
          since: since || versions[0].version,
          ...(modifiedIn && modifiedIn.length > 0 ? { modifiedIn } : {}),
        };
        annotatedCount++;
      }

      await fs.writeFile(latestSymbolsPath, JSON.stringify(symbolsData, null, 2));
      console.log(`      ✓ Annotated ${annotatedCount} symbols with version info`);
    }
  } catch (error) {
    console.warn(`      ⚠️ Failed to annotate symbols: ${error}`);
  }

  // Write changelog directly to build dir
  const changelog: PackageChangelog = {
    packageId,
    packageName: pkgConfig.displayName || pkgConfig.name,
    generatedAt: new Date().toISOString(),
    history: finalDeltas,
  };

  await fs.writeFile(path.join(irOutputPath, "changelog.json"), JSON.stringify(changelog, null, 2));

  const totalAdded = finalDeltas.reduce((sum, d) => sum + d.added.length, 0);
  const totalRemoved = finalDeltas.reduce((sum, d) => sum + d.removed.length, 0);
  const totalModified = finalDeltas.reduce((sum, d) => sum + d.modified.length, 0);
  console.log(
    `      ✓ Generated changelog: +${totalAdded} added, -${totalRemoved} removed, ~${totalModified} modified`,
  );

  // Write versions index directly to build dir
  const latestStats = allVersionStats.get(versions[0].version) || {
    added: 0,
    removed: 0,
    modified: 0,
    breaking: 0,
    totalSymbols: versionSymbols.get(versions[0].version)?.size ?? 0,
  };

  const versionsIndex: PackageVersionIndex = {
    packageId,
    packageName: pkgConfig.displayName || pkgConfig.name,
    latest: {
      version: versions[0].version,
      sha: versions[0].sha,
      tag: versions[0].tag,
      releaseDate: versions[0].releaseDate,
      extractedAt: new Date().toISOString(),
      stats: latestStats,
    },
    versions: versions.map((v) => ({
      version: v.version,
      sha: v.sha,
      tag: v.tag,
      releaseDate: v.releaseDate,
      stats: allVersionStats.get(v.version) || {
        added: 0,
        removed: 0,
        modified: 0,
        breaking: 0,
        totalSymbols: versionSymbols.get(v.version)?.size ?? 0,
      },
    })),
  };

  await fs.writeFile(
    path.join(irOutputPath, "versions.json"),
    JSON.stringify(versionsIndex, null, 2),
  );
}

/**
 * Annotate symbols with version info from an existing changelog.
 * Used when we skip extraction because the changelog is already complete.
 */
async function annotateSymbolsFromChangelog(
  latestSymbolsPath: string,
  changelog: PackageChangelog,
  versions: CachedVersionEntry[],
): Promise<void> {
  try {
    const symbolsContent = await fs.readFile(latestSymbolsPath, "utf-8");
    const symbolsData = JSON.parse(symbolsContent);

    // Build introduction map from changelog history
    const introductionMap = new Map<string, string>();
    const modifiedInMap = new Map<string, string[]>();

    // Process from oldest to newest
    const sortedHistory = [...changelog.history].reverse();
    for (const delta of sortedHistory) {
      for (const added of delta.added) {
        if (!introductionMap.has(added.qualifiedName)) {
          introductionMap.set(added.qualifiedName, delta.version);
        }
      }
      for (const modified of delta.modified) {
        const existing = modifiedInMap.get(modified.qualifiedName) || [];
        existing.push(delta.version);
        modifiedInMap.set(modified.qualifiedName, existing);
      }
    }

    let annotatedCount = 0;
    const oldestVersion = versions[versions.length - 1]?.version || versions[0].version;

    if (symbolsData.symbols && Array.isArray(symbolsData.symbols)) {
      for (const symbol of symbolsData.symbols) {
        const since = introductionMap.get(symbol.qualifiedName);
        const modifiedIn = modifiedInMap.get(symbol.qualifiedName);

        symbol.versionInfo = {
          since: since || oldestVersion,
          ...(modifiedIn && modifiedIn.length > 0 ? { modifiedIn } : {}),
        };
        annotatedCount++;
      }

      await fs.writeFile(latestSymbolsPath, JSON.stringify(symbolsData, null, 2));
      console.log(
        `      ✓ Annotated ${annotatedCount} symbols with version info (from existing changelog)`,
      );
    }
  } catch (error) {
    console.warn(`      ⚠️ Failed to annotate symbols from changelog: ${error}`);
  }
}

/**
 * Build a single configuration file.
 */
async function buildConfig(
  configPath: string,
  opts: {
    sha?: string;
    output: string;
    cache?: string;
    skipUpload?: boolean;
    skipPointers?: boolean;
    withVersions?: boolean;
    fullRebuild?: boolean;
    force?: boolean;
    verbose?: boolean;
    /** Filter to build only a specific package by name */
    packageFilter?: string;
    /** Path to cloned docs repository for related docs scanning */
    docsRepo?: string;
    /** Enable related docs scanning */
    scanRelatedDocs?: boolean;
  },
): Promise<{ buildId: string; success: boolean; skipped?: boolean }> {
  console.log(`\n📄 Loading config: ${configPath}`);

  const configContent = await fs.readFile(configPath, "utf-8");
  const config: BuildConfig = JSON.parse(configContent);

  // Check if update is needed (unless --force is specified)
  // We can check updates even in local mode - we just need read access to blob storage
  const hasBlobAccess = process.env.BLOB_URL || process.env.BLOB_READ_WRITE_TOKEN;

  if (!opts.force && hasBlobAccess) {
    console.log(`\n🔍 Checking for updates...`);
    try {
      const updateCheck = await checkForUpdates(configPath, opts.verbose);

      if (!updateCheck.needsUpdate) {
        console.log(`\n⏭️  Skipping build: ${updateCheck.reason}`);
        if (
          opts.verbose &&
          updateCheck.source.latestReleaseDate &&
          updateCheck.source.buildCreatedAt
        ) {
          console.log(`   Latest release: ${updateCheck.source.latestReleaseDate.split("T")[0]}`);
          console.log(`   Build created:  ${updateCheck.source.buildCreatedAt.split("T")[0]}`);
        }
        return { buildId: "(skipped)", success: true, skipped: true };
      }

      console.log(`   📦 ${updateCheck.reason}`);
    } catch (error) {
      // If update check fails, continue with the build
      console.log(`   ⚠️  Update check failed: ${error}. Proceeding with build.`);
    }
  } else if (opts.force) {
    console.log(`\n🔨 Force build requested - skipping update check`);
  }

  // Filter to a specific package if requested
  let packagesToProcess = config.packages;
  if (opts.packageFilter) {
    const filtered = config.packages.filter((p) => p.name === opts.packageFilter);
    if (filtered.length === 0) {
      console.error(`\n❌ Package '${opts.packageFilter}' not found in config.`);
      console.error(`   Available packages: ${config.packages.map((p) => p.name).join(", ")}`);
      return { buildId: "(invalid-package)", success: false };
    }
    packagesToProcess = filtered;
    console.log(`   📦 Filtering to package: ${opts.packageFilter}`);
  }

  console.log(`   Project: ${config.project || "langchain"}`);
  console.log(`   Language: ${config.language}`);
  console.log(`   Repository: ${config.repo}`);
  console.log(`   Packages: ${packagesToProcess.map((p) => p.name).join(", ")}`);

  // Check for required language tools
  if (config.language === "java") {
    const hasJava = await checkJavaTools();
    if (!hasJava) {
      console.warn(`\n⚠️  Java is not installed or not accessible. Skipping Java extraction.`);
      console.warn(`   Install Java and ensure 'java' is in your PATH to build Java docs.`);
      return { buildId: "(tools-missing)", success: false };
    }
  } else if (config.language === "go") {
    const hasGo = await checkGoTools();
    if (!hasGo) {
      console.warn(`\n⚠️  Go is not installed or not accessible. Skipping Go extraction.`);
      console.warn(`   Install Go and ensure 'go' is in your PATH to build Go docs.`);
      return { buildId: "(tools-missing)", success: false };
    }
  }

  const sha = opts.sha || (await getLatestSha(config.repo));
  console.log(`\n📌 Target SHA: ${sha.substring(0, 7)}`);

  // All builds are now package-level builds
  // This allows independent package updates without affecting other packages
  const isSinglePackageBuild = packagesToProcess.length === 1;

  // For single package builds, we set the build ID upfront
  // For multi-package builds, each package will get its own build ID
  let buildId: string;
  let irOutputPath: string;

  if (isSinglePackageBuild) {
    // Single package build: ir-output/ir/packages/{packageId}/{buildId}/
    // The "ir/" prefix matches the blob storage path structure used by the loader
    const pkgConfig = packagesToProcess[0];
    const packageId = normalizePackageId(pkgConfig.name, config.language);
    buildId = generatePackageBuildId(config.repo, sha, pkgConfig.name);
    console.log(`🔑 Package Build ID: ${buildId} (for ${pkgConfig.name})`);

    irOutputPath = path.resolve(opts.output, "ir", "packages", packageId, buildId);
    await fs.mkdir(irOutputPath, { recursive: true });
  } else {
    // Multi-package build: each package gets its own directory
    // We'll create directories per-package during processing
    buildId = generatePackageBuildId(config.repo, sha, "multi");
    console.log(`🔑 Multi-package build (each package will have its own build ID)`);

    irOutputPath = path.resolve(opts.output, "ir", "packages");
    await fs.mkdir(irOutputPath, { recursive: true });
  }

  const cacheDir = opts.cache || getCacheBaseDir();
  console.log(`\n📥 Fetching source to: ${cacheDir}`);

  // Get target package names for filtered builds (improves build performance)
  const targetPackageNames = packagesToProcess.map((p) => p.name);

  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchTarball({
      repo: config.repo,
      sha,
      output: cacheDir,
      targetPackages: targetPackageNames,
    });
  } catch (error) {
    console.error(`\n❌ Failed to fetch source: ${error}`);
    return { buildId, success: false };
  }

  console.log("\n🔍 Extracting APIs...");

  const failedPackages = new Set<string>();

  // Track package build info for package-level builds
  const packageBuildInfo: Map<
    string,
    { packageId: string; buildId: string; outputDir: string; packagePath: string }
  > = new Map();

  for (const pkgConfig of packagesToProcess) {
    const packagePath = path.join(fetchResult.extractedPath, pkgConfig.path);
    const packageId = normalizePackageId(pkgConfig.name, config.language);

    let pkgOutputDir: string;
    let pkgBuildId: string;

    if (isSinglePackageBuild) {
      // Single package: symbols.json goes directly in the build dir
      pkgOutputDir = irOutputPath;
      pkgBuildId = buildId;
    } else {
      // Multi-package: each package gets its own build ID and directory
      pkgBuildId = generatePackageBuildId(config.repo, sha, pkgConfig.name);
      pkgOutputDir = path.join(irOutputPath, packageId, pkgBuildId);
    }

    await fs.mkdir(pkgOutputDir, { recursive: true });
    const outputPath = path.join(pkgOutputDir, "symbols.json");

    // Store build info for later use
    packageBuildInfo.set(pkgConfig.name, {
      packageId,
      buildId: pkgBuildId,
      outputDir: pkgOutputDir,
      packagePath,
    });

    // Check if package path exists before extraction
    try {
      await fs.access(packagePath);
    } catch {
      console.error(`   ✗ ${pkgConfig.name}: Package path not found: ${pkgConfig.path}`);
      failedPackages.add(pkgConfig.name);
      continue;
    }

    try {
      if (config.language === "python") {
        await extractPython(
          packagePath,
          pkgConfig.name,
          outputPath,
          config.repo,
          sha,
          pkgConfig.excludePatterns,
        );
      } else if (config.language === "typescript") {
        await extractTypeScript(
          packagePath,
          pkgConfig.name,
          outputPath,
          config.repo,
          sha,
          pkgConfig.entryPoints,
          fetchResult.extractedPath,
          pkgConfig.path, // Package's relative path in the repo
        );
      } else if (config.language === "java") {
        await extractJava(packagePath, pkgConfig.name, outputPath, config.repo, sha);
      } else if (config.language === "go") {
        await extractGo(packagePath, pkgConfig.name, outputPath, config.repo, sha);
      }
      console.log(`   ✓ ${pkgConfig.name}`);
    } catch (error) {
      console.error(`   ✗ ${pkgConfig.name}: ${error}`);
      failedPackages.add(pkgConfig.name);
    }
  }

  if (failedPackages.size > 0) {
    console.warn(`\n   ⚠️  ${failedPackages.size} package(s) failed extraction`);
  }

  const [owner, repoName] = config.repo.split("/");

  // Load cached versions for fallback when extracted version is invalid
  // (e.g., Python packages with dynamic versioning like `metadata.version(__package__)`)
  const cachedVersions = await loadCachedVersions(config.project || "langchain", config.language);

  // Create package info files for each package
  console.log("\n📋 Creating package info files...");

  for (const pkgConfig of packagesToProcess) {
    const pkgInfo = packageBuildInfo.get(pkgConfig.name);
    if (!pkgInfo) continue;

    // Read symbols to get stats
    const symbolsPath = path.join(pkgInfo.outputDir, "symbols.json");
    let symbolCount = 0;
    let version = "unknown";
    try {
      const symbolsContent = await fs.readFile(symbolsPath, "utf-8");
      const data = JSON.parse(symbolsContent);
      symbolCount = data.symbols?.length || 0;
      const extractedVersion = data.package?.version || "unknown";

      // Validate the extracted version - Python packages with dynamic versioning
      // (e.g., `__version__ = metadata.version(__package__)`) may have source code
      // extracted instead of the actual version string
      if (isValidVersionString(extractedVersion)) {
        version = extractedVersion;
      } else {
        // Fall back to the latest cached version from git tags
        const cachedVersion = getLatestCachedVersion(cachedVersions, pkgConfig.name);
        if (cachedVersion) {
          version = cachedVersion;
          console.log(
            `      ℹ️  ${pkgConfig.name}: Using cached version ${version} (extracted: "${extractedVersion}")`,
          );
        } else {
          console.warn(
            `      ⚠️  ${pkgConfig.name}: Invalid version "${extractedVersion}" and no cached version available`,
          );
        }
      }
    } catch {
      // Ignore errors
    }

    // Fetch package description markdown
    const repoInfo: RepoInfo = {
      owner,
      name: repoName,
      ref: sha,
      packagePath: pkgConfig.path,
    };
    const description = await fetchPackageDescription(pkgConfig, pkgInfo.packagePath, repoInfo);

    // Create package info file
    const packageInfo: Record<string, unknown> = {
      packageId: pkgInfo.packageId,
      displayName: pkgConfig.displayName || pkgConfig.name,
      publishedName: pkgConfig.name,
      language: config.language,
      ecosystem:
        { python: "python", typescript: "javascript", java: "java", go: "go" }[config.language] ||
        config.language,
      version,
      buildId: pkgInfo.buildId,
      project: config.project || "langchain",
      repo: { owner, name: repoName, sha, path: pkgConfig.path },
      stats: { total: symbolCount },
      createdAt: new Date().toISOString(),
    };

    // Add description if available
    if (description) {
      packageInfo.description = description;
    }

    // Process subpages if configured
    let processedSubpages: ParsedSubpage[] = [];
    if (pkgConfig.subpages && pkgConfig.subpages.length > 0) {
      console.log(`      📄 Processing ${pkgConfig.subpages.length} subpages...`);
      processedSubpages = await processSubpages(pkgConfig.subpages);

      if (processedSubpages.length > 0) {
        // Add subpage metadata to package info
        packageInfo.subpages = processedSubpages.map((s) => ({
          slug: s.slug,
          title: s.title,
        }));

        // Write individual subpage JSON files
        const subpagesDir = path.join(pkgInfo.outputDir, "subpages");
        await fs.mkdir(subpagesDir, { recursive: true });

        for (const subpage of processedSubpages) {
          const subpagePath = path.join(subpagesDir, `${subpage.slug}.json`);
          await fs.writeFile(subpagePath, JSON.stringify(subpage, null, 2));
        }
        console.log(`      ✓ ${processedSubpages.length} subpages processed`);
      } else {
        console.log(`      ⚠️  No subpages successfully processed`);
      }
    }

    // Extract export paths for TypeScript/JavaScript packages (if no subpages defined)
    if (config.language === "typescript" && !pkgConfig.subpages?.length) {
      const exportPaths = await extractExportPaths(pkgInfo.packagePath);
      if (exportPaths.length > 0) {
        packageInfo.exportPaths = exportPaths.map((ep) => ({
          slug: ep.slug,
          title: ep.title,
        }));
        console.log(`      📦 Found ${exportPaths.length} export paths`);
      }
    }

    const packageInfoPath = path.join(pkgInfo.outputDir, "package.json");
    await fs.writeFile(packageInfoPath, JSON.stringify(packageInfo, null, 2));

    // Generate catalog, routing, and lookup files for local builds
    try {
      const symbolsContent = await fs.readFile(symbolsPath, "utf-8");
      const symbolsData = JSON.parse(symbolsContent);
      if (symbolsData.symbols) {
        // Pre-render markdown to HTML for symbol docs (summary and description)
        // This avoids expensive runtime Shiki processing on the frontend
        const renderStats = await preRenderSymbolDocs(symbolsData.symbols);
        if (renderStats.summariesRendered > 0 || renderStats.descriptionsRendered > 0) {
          // Write back the updated symbols with HTML fields
          await fs.writeFile(symbolsPath, JSON.stringify(symbolsData, null, 2));
        }

        const ecosystemMap: Record<string, Language> = {
          python: "python",
          typescript: "javascript",
          java: "java",
          go: "go",
        };
        const ecosystem: Language = ecosystemMap[config.language] || "python";

        // Generate and write routing map
        const routingMap = generateRoutingMap(
          pkgInfo.packageId,
          pkgConfig.displayName || pkgConfig.name,
          ecosystem,
          symbolsData.symbols,
        );
        await fs.writeFile(
          path.join(pkgInfo.outputDir, "routing.json"),
          JSON.stringify(routingMap, null, 2),
        );

        // Generate and write single lookup file
        const lookupIndex = generateLookupIndex(pkgInfo.packageId, symbolsData.symbols);
        await fs.writeFile(
          path.join(pkgInfo.outputDir, "lookup.json"),
          JSON.stringify(lookupIndex, null, 2),
        );

        // Generate and write single catalog file (with pre-rendered HTML summaries)
        const catalogEntries = await generateCatalog(pkgInfo.packageId, symbolsData.symbols);
        await fs.writeFile(
          path.join(pkgInfo.outputDir, "catalog.json"),
          JSON.stringify(catalogEntries, null, 2),
        );
      }
    } catch (catalogError) {
      // Non-fatal: these files are optional for local builds with fallback
      console.log(`      ℹ️  Index generation skipped: ${catalogError}`);
    }

    console.log(
      `   ✓ ${pkgInfo.packageId} (${symbolCount} symbols${description ? ", with description" : ""}${processedSubpages.length > 0 ? `, ${processedSubpages.length} subpages` : ""})`,
    );
  }

  // Clear the subpage fetch cache after processing all packages
  clearFetchCache();

  if (opts.withVersions) {
    console.log("\n📜 Building version history...");
    for (const pkgConfig of packagesToProcess) {
      const pkgInfo = packageBuildInfo.get(pkgConfig.name);
      if (!pkgInfo) continue;

      // Version history goes directly in each package's build dir
      await buildVersionHistoryForPackage(
        config,
        fetchResult,
        pkgInfo.outputDir,
        opts.fullRebuild,
        pkgConfig,
      );
    }
  }

  // Clean up main extracted repository to save disk space in CI
  if (process.env.CI) {
    console.log("\n🧹 Cleaning up extracted sources...");
    await cleanupExtractedRepo(fetchResult.extractedPath);
  }

  // Build related docs if docs repo is provided
  if (opts.docsRepo && opts.scanRelatedDocs) {
    console.log("\n📚 Scanning for related documentation...");
    const scanLanguage = config.language === "python" ? "python" : "javascript";

    for (const pkgConfig of packagesToProcess) {
      const pkgInfo = packageBuildInfo.get(pkgConfig.name);
      if (!pkgInfo) continue;

      try {
        const result = await buildRelatedDocs({
          docsRepoPath: opts.docsRepo,
          packageId: pkgInfo.packageId,
          outputDir: pkgInfo.outputDir,
          language: scanLanguage,
          configsDir: CONFIGS_DIR,
        });
        console.log(`   ✓ ${pkgConfig.name}: ${result.symbolCount} symbols with related docs`);
      } catch (error) {
        console.warn(`   ⚠️  ${pkgConfig.name}: Failed to build related docs: ${error}`);
      }
    }
  } else if (opts.docsRepo && !opts.scanRelatedDocs) {
    console.log(
      "\n⏭️  Skipping related docs scan (--docs-repo provided but --scan-related-docs not set)",
    );
  }

  if (!opts.skipUpload) {
    console.log("\n☁️  Uploading to Vercel Blob...");
    // Upload each package individually (all builds are now package-level)
    for (const pkgConfig of packagesToProcess) {
      const pkgInfo = packageBuildInfo.get(pkgConfig.name);
      if (!pkgInfo) continue;

      console.log(`   Uploading ${pkgConfig.name}...`);
      await uploadIR({
        buildId: pkgInfo.buildId,
        irOutputPath: pkgInfo.outputDir,
        dryRun: false,
        packageLevel: true,
        packageId: pkgInfo.packageId,
      });
    }
  } else {
    console.log("\n⏭️  Skipping upload (--skip-upload)");
  }

  if (!opts.skipPointers) {
    console.log("\n🔄 Updating build pointers...");
    const ecosystemMap: Record<SymbolLanguage, Language> = {
      python: "python",
      typescript: "javascript",
      java: "java",
      go: "go",
    };
    const ecosystem: Language = ecosystemMap[config.language] || config.language;

    // Update pointers for each package individually (all builds are now package-level)
    for (const pkgConfig of packagesToProcess) {
      const pkgInfo = packageBuildInfo.get(pkgConfig.name);
      if (!pkgInfo) continue;

      // Read package info for pointer data
      const packageInfoPath = path.join(pkgInfo.outputDir, "package.json");
      try {
        const packageInfo = JSON.parse(await fs.readFile(packageInfoPath, "utf-8"));

        await updatePointers({
          buildId: pkgInfo.buildId,
          manifest: null as unknown as Manifest,
          dryRun: false,
          packageLevel: true,
          packagePointer: {
            packageId: pkgInfo.packageId,
            packageName: pkgConfig.name,
            ecosystem,
            project: config.project || "langchain",
            buildId: pkgInfo.buildId,
            version: packageInfo.version,
            sha,
            repo: config.repo,
            stats: packageInfo.stats,
          },
        });
      } catch (error) {
        console.warn(`   ⚠️  Could not update pointer for ${pkgConfig.name}: ${error}`);
      }
    }
  } else {
    console.log("\n⏭️  Skipping pointer update (--skip-pointers)");
  }

  console.log(`\n✅ Build complete: ${buildId}`);
  return { buildId, success: true };
}

/**
 * Main build pipeline.
 */
async function main() {
  program
    .name("build-ir")
    .description("Build IR artifacts from source repositories")
    .option("--config <path>", "Build a specific configuration file")
    .option("--project <name>", `Build all configs for a project (${PROJECTS.join(", ")})`)
    .option(
      "--language <lang>",
      `Build all configs for a language (${CONFIG_LANGUAGES.join(", ")})`,
    )
    .option("--package <name>", "Build only a specific package within a config (for parallel CI)")
    .option("--all", "Build all project/language combinations")
    .option("--sha <sha>", "Git SHA to use (defaults to latest main)")
    .option("--output <path>", "Output directory for IR artifacts", "./ir-output")
    .option("--cache <path>", "Cache directory for tarballs (defaults to system temp)")
    .option("--dry-run", "Generate locally without uploading")
    .option("--local", "Local-only mode (skip all cloud uploads)")
    .option("--skip-upload", "Skip upload to Vercel Blob")
    .option("--skip-pointers", "Skip updating build pointers")
    .option("--with-versions", "Enable version history tracking (incremental by default)")
    .option("--full", "Force full rebuild of version history (ignore existing changelogs)")
    .option("--force", "Force build even if no new releases detected")
    .option("--docs-repo <path>", "Path to cloned docs repository for related docs scanning")
    .option("--scan-related-docs", "Enable related docs scanning (requires --docs-repo)")
    .option("-v, --verbose", "Enable verbose output")
    .parse();

  const opts = program.opts();

  if (opts.local) {
    opts.skipUpload = true;
    opts.skipPointers = true;
  }

  console.log("🔧 LangChain Reference Docs - IR Build Pipeline");
  console.log("================================================");

  let configPaths: string[];

  if (opts.config) {
    configPaths = [path.resolve(opts.config)];
  } else if (opts.all || opts.project || opts.language) {
    configPaths = await findConfigFiles(opts.project, opts.language);

    if (configPaths.length === 0) {
      console.error("\n❌ No matching configuration files found.");
      console.error(`   Project filter: ${opts.project || "(none)"}`);
      console.error(`   Language filter: ${opts.language || "(none)"}`);
      process.exit(1);
    }

    console.log(`\n📦 Found ${configPaths.length} configuration(s) to build:`);
    for (const p of configPaths) {
      console.log(`   - ${path.basename(p)}`);
    }
  } else {
    console.error("\n❌ No build target specified.");
    console.error("   Use one of:");
    console.error("     --config <path>     Build a specific config file");
    console.error("     --project <name>    Build all configs for a project");
    console.error("     --language <lang>   Build all configs for a language");
    console.error("     --all               Build all configurations");
    process.exit(1);
  }

  const results: { config: string; buildId: string; success: boolean; skipped?: boolean }[] = [];

  for (const configPath of configPaths) {
    console.log("\n" + "=".repeat(60));
    const result = await buildConfig(configPath, {
      sha: opts.sha,
      output: opts.output,
      cache: opts.cache,
      skipUpload: opts.skipUpload,
      skipPointers: opts.skipPointers,
      withVersions: opts.withVersions,
      fullRebuild: opts.full,
      force: opts.force,
      verbose: opts.verbose,
      packageFilter: opts.package,
      docsRepo: opts.docsRepo,
      scanRelatedDocs: opts.scanRelatedDocs,
    });
    results.push({ config: path.basename(configPath), ...result });
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Build Summary:");
  console.log("─".repeat(40));

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const result of results) {
    if (result.skipped) {
      console.log(`   ⏭️  ${result.config} (skipped - up to date)`);
      totalSkipped++;
    } else if (result.success) {
      console.log(`   ✅ ${result.config}`);
      console.log(`      Build ID: ${result.buildId}`);
      totalSuccess++;
    } else {
      console.log(`   ❌ ${result.config}`);
      console.log(`      Build ID: ${result.buildId}`);
      totalFailed++;
    }
  }

  console.log("─".repeat(40));
  console.log(
    `   Total: ${results.length} | Built: ${totalSuccess} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`,
  );

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Build failed:", error);
  process.exit(1);
});
