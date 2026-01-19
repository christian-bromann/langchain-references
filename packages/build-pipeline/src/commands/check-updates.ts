#!/usr/bin/env tsx
/**
 * Check Updates - Determines if a build is needed by comparing versions
 *
 * This module provides both a CLI and a library API for checking if a build
 * is needed. It compares:
 * 1. The cached versions from *-versions.json (latest releases from git tags)
 * 2. The current build metadata from Vercel Blob (what's already uploaded)
 *
 * The primary check is date-based: if the uploaded build was created after
 * the latest release, no update is needed.
 *
 * CLI Exit codes:
 * - 0: Updates available (build needed)
 * - 1: No updates (build can be skipped)
 * - 2: Error occurred
 *
 * Usage (CLI):
 *   pnpm check-updates --config ./configs/langchain-python.json
 *
 * Usage (Library):
 *   import { checkForUpdates } from "./check-updates.js";
 *   const result = await checkForUpdates(configPath);
 *   if (result.needsUpdate) { ... }
 */

import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { program } from "commander";

import type { Language, SymbolLanguage } from "@langchain/ir-schema";

import { getBlobBaseUrl } from "../blob-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// TYPES
// =============================================================================

interface VersionEntry {
  version: string;
  sha: string;
  tag: string;
  releaseDate: string;
}

interface PackageVersions {
  packageName: string;
  tagPattern: string;
  versions: VersionEntry[];
  lastUpdated: string;
}

interface ProjectVersionsFile {
  project: string;
  language: string;
  repo: string;
  lastSynced: string;
  packages: PackageVersions[];
}

interface PackageConfig {
  name: string;
  path: string;
  displayName?: string;
  versioning?: {
    tagPattern: string;
    maxVersions?: number;
    alwaysInclude?: string[];
    minVersion?: string;
    enabled?: boolean;
  };
}

interface BuildConfig {
  project?: string;
  language: string;
  repo: string;
  packages: PackageConfig[];
}

/** Pointer to the latest build for a project+language */
interface LatestLanguagePointer {
  buildId: string;
  updatedAt: string;
}

/** Build metadata stored per build */
interface BuildMetadata {
  buildId: string;
  createdAt: string;
  irVersion: string;
  sources: Array<{
    repo: string;
    sha: string;
  }>;
  packages: Array<{
    packageId: string;
    displayName: string;
    language: SymbolLanguage;
    version: string;
  }>;
  status: "complete" | "failed";
  error?: string;
}

export interface UpdateCheckResult {
  configPath: string;
  project: string;
  language: string;
  needsUpdate: boolean;
  reason: string;
  /** Source comparison */
  source: {
    latestReleaseSha: string | null;
    latestReleaseDate: string | null;
    uploadedSha: string | null;
    buildCreatedAt: string | null;
    isUpToDate: boolean;
  };
  packages: {
    name: string;
    currentVersion: string | null;
    uploadedVersion: string | null;
    needsUpdate: boolean;
  }[];
}

// =============================================================================
// BLOB FETCHING
// =============================================================================

/**
 * Fetch JSON from Vercel Blob storage.
 */
async function fetchBlobJson<T>(relativePath: string): Promise<T | null> {
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) {
    console.error("No BLOB_URL environment variable set");
    return null;
  }

  const url = `${baseUrl}/${relativePath}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Get the latest build pointer for a project+language.
 */
async function getLatestBuildPointer(
  project: string,
  language: Language,
): Promise<LatestLanguagePointer | null> {
  const pointerPath = `pointers/latest-${project}-${language}.json`;
  return fetchBlobJson<LatestLanguagePointer>(pointerPath);
}

/**
 * Get build metadata for a specific build ID.
 */
async function getBuildMetadata(buildId: string): Promise<BuildMetadata | null> {
  const metadataPath = `pointers/builds/${buildId}.json`;
  return fetchBlobJson<BuildMetadata>(metadataPath);
}

// =============================================================================
// CHECK LOGIC
// =============================================================================

/**
 * Load cached versions from the *-versions.json file.
 */
async function loadCachedVersions(
  project: string,
  language: string,
): Promise<ProjectVersionsFile | null> {
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
 * Check if a specific config needs updating.
 *
 * The primary check is SHA-based: if the uploaded build was created from the
 * same source SHA as the latest release, no update is needed.
 *
 * This is more reliable than version comparison because:
 * - Version numbers in package.json may not match git tag versions
 * - Some packages don't have consistent git tag patterns
 * - The SHA definitively identifies the source code state
 */
async function checkConfig(configPath: string, verbose: boolean): Promise<UpdateCheckResult> {
  const configContent = await fs.readFile(configPath, "utf-8");
  const config: BuildConfig = JSON.parse(configContent);

  const project = config.project || "langchain";
  const language = config.language;
  // Map config language (typescript) to output language (javascript), others pass through
  const ecosystem: Language = language === "typescript" ? "javascript" : language as Language;

  const result: UpdateCheckResult = {
    configPath,
    project,
    language,
    needsUpdate: false,
    reason: "",
    source: {
      latestReleaseSha: null,
      latestReleaseDate: null,
      uploadedSha: null,
      buildCreatedAt: null,
      isUpToDate: false,
    },
    packages: [],
  };

  // Load cached versions
  const cachedVersions = await loadCachedVersions(project, language);
  if (!cachedVersions) {
    result.needsUpdate = true;
    result.reason = "No cached versions file found - first build needed";
    return result;
  }

  // Get the latest release SHA and date from any versioned package
  // All packages in a config share the same repo, so any package's latest release works
  let latestReleaseSha: string | null = null;
  let latestReleaseDate: string | null = null;
  for (const pkgConfig of config.packages) {
    if (!pkgConfig.versioning?.tagPattern) continue;
    const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);
    if (cachedPkg?.versions[0]) {
      const latestVersion = cachedPkg.versions[0];
      latestReleaseSha = latestVersion.sha;
      latestReleaseDate = latestVersion.releaseDate;
      if (verbose) {
        console.log(
          `   Latest release: ${latestVersion.version} (${latestReleaseSha.slice(0, 7)}) from ${latestReleaseDate.split("T")[0]}`,
        );
      }
      break;
    }
  }

  result.source.latestReleaseSha = latestReleaseSha;
  result.source.latestReleaseDate = latestReleaseDate;

  // Fetch the latest build pointer for this project+language
  if (verbose) {
    console.log(`   Fetching pointer: pointers/latest-${project}-${ecosystem}.json`);
  }

  const latestPointer = await getLatestBuildPointer(project, ecosystem);
  if (!latestPointer) {
    result.needsUpdate = true;
    result.reason = "No build pointer found - first build needed";
    // Mark all packages as needing update
    for (const pkgConfig of config.packages) {
      const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);
      result.packages.push({
        name: pkgConfig.name,
        currentVersion: cachedPkg?.versions[0]?.version || null,
        uploadedVersion: null,
        needsUpdate: true,
      });
    }
    return result;
  }

  if (verbose) {
    console.log(`   Found build: ${latestPointer.buildId}`);
  }

  // Fetch build metadata to get source SHA and package versions
  const buildMetadata = await getBuildMetadata(latestPointer.buildId);
  if (!buildMetadata) {
    result.needsUpdate = true;
    result.reason = "Build metadata not found - rebuild needed";
    for (const pkgConfig of config.packages) {
      const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);
      result.packages.push({
        name: pkgConfig.name,
        currentVersion: cachedPkg?.versions[0]?.version || null,
        uploadedVersion: null,
        needsUpdate: true,
      });
    }
    return result;
  }

  if (verbose) {
    console.log(`   Build metadata: ${buildMetadata.packages.length} packages`);
  }

  // Get the source SHA and build creation date from the build metadata
  const uploadedSha = buildMetadata.sources[0]?.sha || null;
  const buildCreatedAt = buildMetadata.createdAt || null;
  result.source.uploadedSha = uploadedSha;
  result.source.buildCreatedAt = buildCreatedAt;

  if (verbose) {
    if (uploadedSha) {
      console.log(
        `   Uploaded build: SHA ${uploadedSha.slice(0, 7)}, created ${buildCreatedAt?.split("T")[0] || "unknown"}`,
      );
    }
  }

  // PRIMARY CHECK: Compare source SHA and dates
  // The build is up-to-date if:
  // 1. The uploaded SHA matches the latest release SHA, OR
  // 2. The build was created AFTER the latest release date (meaning it includes that release)
  if (latestReleaseSha && uploadedSha) {
    const shaMatches = latestReleaseSha === uploadedSha;
    const buildIsNewer =
      latestReleaseDate && buildCreatedAt
        ? new Date(buildCreatedAt) >= new Date(latestReleaseDate)
        : false;

    if (shaMatches || buildIsNewer) {
      result.source.isUpToDate = true;
      result.needsUpdate = false;

      if (shaMatches) {
        result.reason = "Build is from latest release SHA - up to date";
      } else {
        result.reason = `Build created after latest release (${buildCreatedAt?.split("T")[0]} >= ${latestReleaseDate?.split("T")[0]}) - up to date`;
      }

      // Still populate package info for verbose output
      const uploadedVersions = new Map<string, string>();
      for (const pkg of buildMetadata.packages) {
        uploadedVersions.set(pkg.displayName, pkg.version);
      }

      for (const pkgConfig of config.packages) {
        const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);
        result.packages.push({
          name: pkgConfig.name,
          currentVersion: cachedPkg?.versions[0]?.version || null,
          uploadedVersion: uploadedVersions.get(pkgConfig.name) || null,
          needsUpdate: false,
        });
      }

      return result;
    } else {
      // Build is older than the latest release - needs update
      result.needsUpdate = true;
      result.reason = `New release available (${latestReleaseDate?.split("T")[0]}) after build (${buildCreatedAt?.split("T")[0]})`;

      // Populate package info
      const uploadedVersions = new Map<string, string>();
      for (const pkg of buildMetadata.packages) {
        uploadedVersions.set(pkg.displayName, pkg.version);
      }

      for (const pkgConfig of config.packages) {
        const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);
        result.packages.push({
          name: pkgConfig.name,
          currentVersion: cachedPkg?.versions[0]?.version || null,
          uploadedVersion: uploadedVersions.get(pkgConfig.name) || null,
          needsUpdate: true,
        });
      }

      return result;
    }
  }

  // FALLBACK: If we can't compare SHAs, fall back to version comparison
  if (verbose) {
    console.log(`   Falling back to version comparison (no SHA available)`);
  }

  // Create a map of uploaded package versions
  const uploadedVersions = new Map<string, string>();
  for (const pkg of buildMetadata.packages) {
    uploadedVersions.set(pkg.displayName, pkg.version);
  }

  // Check each package
  for (const pkgConfig of config.packages) {
    const pkgResult = {
      name: pkgConfig.name,
      currentVersion: null as string | null,
      uploadedVersion: null as string | null,
      needsUpdate: false,
    };

    // Get current version from cached versions
    const cachedPkg = cachedVersions.packages.find((p) => p.packageName === pkgConfig.name);

    if (!cachedPkg || cachedPkg.versions.length === 0) {
      // No versions tracked - check if versioning is even enabled
      if (!pkgConfig.versioning?.tagPattern) {
        // Package doesn't have versioning, assume it needs update if not uploaded
        if (!uploadedVersions.has(pkgConfig.name)) {
          pkgResult.needsUpdate = true;
        }
        result.packages.push(pkgResult);
        continue;
      }
      pkgResult.needsUpdate = true;
      result.packages.push(pkgResult);
      continue;
    }

    // Get latest cached version
    const latestVersion = cachedPkg.versions[0];
    pkgResult.currentVersion = latestVersion.version;

    // Get uploaded version from build metadata
    const uploadedVersion = uploadedVersions.get(pkgConfig.name);
    if (!uploadedVersion) {
      // Never uploaded - needs update
      pkgResult.needsUpdate = true;
      result.packages.push(pkgResult);
      continue;
    }

    pkgResult.uploadedVersion = uploadedVersion;

    // Compare versions
    if (latestVersion.version !== uploadedVersion) {
      pkgResult.needsUpdate = true;
    }

    result.packages.push(pkgResult);
  }

  // Determine overall result
  const packagesNeedingUpdate = result.packages.filter((p) => p.needsUpdate);
  if (packagesNeedingUpdate.length > 0) {
    result.needsUpdate = true;
    const names = packagesNeedingUpdate.map((p) => p.name).join(", ");
    result.reason = `${packagesNeedingUpdate.length} package(s) need update: ${names}`;
  } else {
    result.reason = "All packages are up to date";
  }

  return result;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if a config needs updating.
 *
 * This is the main entry point for programmatic use. It compares the latest
 * release date against the build creation date to determine if an update
 * is needed.
 *
 * @param configPath - Path to the config file to check
 * @param verbose - Whether to print verbose output (default: false)
 * @returns UpdateCheckResult with needsUpdate boolean and reason
 */
export async function checkForUpdates(
  configPath: string,
  verbose: boolean = false,
): Promise<UpdateCheckResult> {
  return checkConfig(configPath, verbose);
}

// =============================================================================
// CLI MAIN
// =============================================================================

async function main() {
  program
    .name("check-updates")
    .description("Check if a build is needed by comparing versions")
    .requiredOption("--config <path>", "Path to the config file to check")
    .option("--json", "Output result as JSON")
    .option("-v, --verbose", "Show detailed output")
    .parse();

  const opts = program.opts();
  const configPath = path.resolve(opts.config);

  try {
    const result = await checkConfig(configPath, opts.verbose);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n🔍 Checking: ${path.basename(configPath)}`);
      console.log(`   Project: ${result.project}`);
      console.log(`   Language: ${result.language}`);
      console.log("");

      // Show source comparison (primary check)
      if (result.source.latestReleaseSha || result.source.uploadedSha) {
        console.log("   Source comparison:");
        const latestInfo = result.source.latestReleaseSha
          ? `${result.source.latestReleaseSha.slice(0, 7)} (${result.source.latestReleaseDate?.split("T")[0] || "?"})`
          : "(unknown)";
        const uploadedInfo = result.source.uploadedSha
          ? `${result.source.uploadedSha.slice(0, 7)} (built ${result.source.buildCreatedAt?.split("T")[0] || "?"})`
          : "(no build)";
        const status = result.source.isUpToDate ? "✅" : "❌";
        console.log(`     ${status} Latest release: ${latestInfo}`);
        console.log(`     ${status} Uploaded build: ${uploadedInfo}`);
        console.log("");
      }

      if (opts.verbose) {
        console.log("   Packages:");
        for (const pkg of result.packages) {
          const status = pkg.needsUpdate ? "❌" : "✅";
          const current = pkg.currentVersion || "(none)";
          const uploaded = pkg.uploadedVersion || "(never uploaded)";
          console.log(`     ${status} ${pkg.name}: ${current} → ${uploaded}`);
        }
        console.log("");
      }

      if (result.needsUpdate) {
        console.log(`   📦 Update needed: ${result.reason}`);
        console.log("");
        process.exit(0); // 0 = updates available
      } else {
        console.log(`   ✅ ${result.reason}`);
        console.log("");
        process.exit(1); // 1 = no updates (skip build)
      }
    }

    // For JSON output, use exit code based on needsUpdate
    if (opts.json) {
      process.exit(result.needsUpdate ? 0 : 1);
    }
  } catch (error) {
    console.error(`\n❌ Error checking updates: ${error}`);
    process.exit(2);
  }
}

// Only run main() when this file is executed directly (not imported)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-updates.ts") ||
  process.argv[1]?.endsWith("check-updates.js");

if (isMainModule) {
  main();
}
