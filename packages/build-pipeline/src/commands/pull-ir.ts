#!/usr/bin/env tsx
/**
 * Pull IR - Downloads the latest compiled IR from Vercel Blob storage
 *
 * This command fetches the latest build artifacts from Vercel Blob storage
 * and saves them to the local ir-output directory, allowing you to run the
 * dev environment with production data.
 *
 * With the package-level architecture, each package is stored independently:
 *   ir/packages/{packageId}/{buildId}/symbols.json
 *
 * Usage:
 *   # Pull all projects and languages
 *   pnpm pull-ir
 *
 *   # Pull specific project
 *   pnpm pull-ir --project langchain
 *
 *   # Pull specific language
 *   pnpm pull-ir --language python
 *
 *   # Pull specific project+language combination
 *   pnpm pull-ir --project langgraph --language typescript
 */

import path from "path";
import fs from "fs/promises";
import { program } from "commander";
import type { ProjectPackageIndex } from "../pointers.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROJECTS = ["langchain", "langgraph", "deepagent"] as const;
const LANGUAGES = ["python", "javascript"] as const;

type Project = (typeof PROJECTS)[number];
type Language = (typeof LANGUAGES)[number];

// =============================================================================
// BLOB FETCHING
// =============================================================================

/**
 * Get the Vercel Blob base URL from environment.
 */
function getBlobBaseUrl(): string | null {
  if (process.env.BLOB_BASE_URL) {
    return process.env.BLOB_BASE_URL;
  }

  if (process.env.BLOB_URL) {
    return process.env.BLOB_URL;
  }

  // Try to derive from BLOB_READ_WRITE_TOKEN
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const match = token.match(/^vercel_blob_rw_([^_]+)_/);
    if (match) {
      const storeId = match[1];
      return `https://${storeId}.public.blob.vercel-storage.com`;
    }
  }

  return null;
}

/**
 * Fetch JSON from Vercel Blob storage.
 */
async function fetchBlobJson<T>(relativePath: string): Promise<T | null> {
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "No BLOB_BASE_URL, BLOB_URL, or BLOB_READ_WRITE_TOKEN environment variable set",
    );
  }

  const url = `${baseUrl}/${relativePath}`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).message?.includes("404")) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetch raw content from Vercel Blob storage.
 */
async function fetchBlobRaw(relativePath: string): Promise<string | null> {
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "No BLOB_BASE_URL, BLOB_URL, or BLOB_READ_WRITE_TOKEN environment variable set",
    );
  }

  const url = `${baseUrl}/${relativePath}`;

  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    if ((error as Error).message?.includes("404")) {
      return null;
    }
    throw error;
  }
}

// =============================================================================
// PULL LOGIC
// =============================================================================

interface PullResult {
  project: Project;
  language: Language;
  packagesDownloaded: number;
  filesDownloaded: number;
  success: boolean;
  error?: string;
}

interface PackageInfo {
  buildId: string;
  version: string;
  sha: string;
}

/**
 * Pull IR for a specific project and language using package-level architecture.
 */
async function pullProjectLanguage(
  project: Project,
  language: Language,
  outputDir: string,
  verbose: boolean,
): Promise<PullResult> {
  const result: PullResult = {
    project,
    language,
    packagesDownloaded: 0,
    filesDownloaded: 0,
    success: false,
  };

  try {
    // Fetch the project package index (new architecture)
    const indexPath = `pointers/index-${project}-${language}.json`;
    if (verbose) {
      console.log(`   Fetching index: ${indexPath}`);
    }

    const packageIndex = await fetchBlobJson<ProjectPackageIndex>(indexPath);

    if (!packageIndex || !packageIndex.packages || Object.keys(packageIndex.packages).length === 0) {
      result.error = "No package index found";
      return result;
    }

    const packageCount = Object.keys(packageIndex.packages).length;
    console.log(`   Found ${packageCount} packages (updated ${packageIndex.updatedAt.split("T")[0]})`);

    // Create output directory structure
    const packagesDir = path.join(outputDir, "packages");
    await fs.mkdir(packagesDir, { recursive: true });

    // Download each package
    for (const [packageName, packageInfo] of Object.entries(packageIndex.packages) as [string, PackageInfo][]) {
      const { buildId } = packageInfo;

      // Generate packageId from package name
      const packageId = normalizePackageId(packageName, language);
      const pkgDir = path.join(packagesDir, packageId, buildId);

      // Check if we already have this build
      const symbolsPath = path.join(pkgDir, "symbols.json");
      try {
        await fs.access(symbolsPath);
        if (verbose) {
          console.log(`   ✓ ${packageName}: already have build ${buildId.slice(0, 8)}`);
        }
        result.packagesDownloaded++;
        continue;
      } catch {
        // Package doesn't exist locally, download it
      }

      // Create package directory
      await fs.mkdir(pkgDir, { recursive: true });

      if (verbose) {
        console.log(`   Downloading ${packageName}...`);
      }

      // Download package.json (package info)
      const packageJsonContent = await fetchBlobRaw(
        `ir/packages/${packageId}/${buildId}/package.json`,
      );
      if (packageJsonContent) {
        await fs.writeFile(path.join(pkgDir, "package.json"), packageJsonContent, "utf-8");
        result.filesDownloaded++;
      }

      // Download symbols.json
      const symbolsContent = await fetchBlobRaw(
        `ir/packages/${packageId}/${buildId}/symbols.json`,
      );

      if (symbolsContent) {
        await fs.writeFile(symbolsPath, symbolsContent, "utf-8");
        result.filesDownloaded++;

        const parsed = JSON.parse(symbolsContent);
        const symbolCount = parsed.symbols?.length || 0;
        if (verbose) {
          console.log(`     ✓ ${symbolCount} symbols`);
        }
      } else {
        console.log(`     ⚠️  No symbols found for ${packageName}`);
        continue;
      }

      // Download routing.json
      const routingContent = await fetchBlobRaw(
        `ir/packages/${packageId}/${buildId}/routing.json`,
      );
      if (routingContent) {
        await fs.writeFile(path.join(pkgDir, "routing.json"), routingContent, "utf-8");
        result.filesDownloaded++;
      }

      // Try to download changelog.json if it exists
      const changelogContent = await fetchBlobRaw(
        `ir/packages/${packageId}/${buildId}/changelog.json`,
      );

      if (changelogContent) {
        await fs.writeFile(path.join(pkgDir, "changelog.json"), changelogContent, "utf-8");
        result.filesDownloaded++;
        if (verbose) {
          console.log(`     ✓ changelog`);
        }
      }

      // Try to download versions.json if it exists
      const versionsContent = await fetchBlobRaw(
        `ir/packages/${packageId}/${buildId}/versions.json`,
      );

      if (versionsContent) {
        await fs.writeFile(path.join(pkgDir, "versions.json"), versionsContent, "utf-8");
        result.filesDownloaded++;
        if (verbose) {
          console.log(`     ✓ versions`);
        }
      }

      // Download sharded indices (lookup, catalog, changelog)
      const shardedDirs = ["lookup", "catalog", "changelog"] as const;

      for (const shardDir of shardedDirs) {
        const indexContent = await fetchBlobRaw(
          `ir/packages/${packageId}/${buildId}/${shardDir}/index.json`,
        );

        if (indexContent) {
          const shardDirPath = path.join(pkgDir, shardDir);
          await fs.mkdir(shardDirPath, { recursive: true });

          await fs.writeFile(path.join(shardDirPath, "index.json"), indexContent, "utf-8");
          result.filesDownloaded++;

          try {
            const index = JSON.parse(indexContent) as { shards?: string[] };
            if (index.shards && Array.isArray(index.shards)) {
              const BATCH_SIZE = 10;
              for (let i = 0; i < index.shards.length; i += BATCH_SIZE) {
                const batch = index.shards.slice(i, i + BATCH_SIZE);
                await Promise.all(
                  batch.map(async (shardKey) => {
                    const shardContent = await fetchBlobRaw(
                      `ir/packages/${packageId}/${buildId}/${shardDir}/${shardKey}.json`,
                    );
                    if (shardContent) {
                      await fs.writeFile(
                        path.join(shardDirPath, `${shardKey}.json`),
                        shardContent,
                        "utf-8",
                      );
                      result.filesDownloaded++;
                    }
                  }),
                );
              }

              if (verbose) {
                console.log(`     ✓ ${shardDir} (${index.shards.length} shards)`);
              }
            }
          } catch {
            // Index parsing failed, skip shards
          }
        }
      }

      result.packagesDownloaded++;
    }

    result.success = true;
    console.log(`   ✓ Downloaded ${result.packagesDownloaded} packages (${result.filesDownloaded} files)`);
  } catch (error) {
    result.error = (error as Error).message;
  }

  return result;
}

/**
 * Normalize a package name to a packageId.
 */
function normalizePackageId(packageName: string, language: Language): string {
  const prefix = language === "python" ? "pkg_py_" : "pkg_js_";
  const normalized = packageName
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_")
    .toLowerCase();
  return `${prefix}${normalized}`;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  program
    .name("pull-ir")
    .description("Download the latest compiled IR from Vercel Blob storage")
    .option("--project <name>", `Project to pull (${PROJECTS.join(", ")})`)
    .option("--language <lang>", `Language to pull (${LANGUAGES.join(", ")})`)
    .option("--output <path>", "Output directory", "./ir-output")
    .option("-v, --verbose", "Show detailed output")
    .parse();

  const opts = program.opts();
  const outputDir = path.resolve(opts.output);

  console.log("📥 Pull IR - Download compiled symbols from Vercel Blob");
  console.log("========================================================");

  // Check for blob access
  const blobUrl = getBlobBaseUrl();
  if (!blobUrl) {
    console.error("\n❌ No blob storage access configured.");
    console.error("   Set one of: BLOB_BASE_URL, BLOB_URL, or BLOB_READ_WRITE_TOKEN");
    process.exit(1);
  }

  console.log(`   Blob URL: ${blobUrl.substring(0, 50)}...`);
  console.log(`   Output: ${outputDir}`);

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  // Determine what to pull
  const projectsToPull: Project[] = opts.project ? [opts.project as Project] : [...PROJECTS];
  const languagesToPull: Language[] = opts.language ? [opts.language as Language] : [...LANGUAGES];

  const results: PullResult[] = [];

  for (const project of projectsToPull) {
    for (const language of languagesToPull) {
      console.log(`\n📦 ${project} (${language})`);

      const result = await pullProjectLanguage(project, language, outputDir, opts.verbose);
      results.push(result);

      if (!result.success && result.error) {
        console.log(`   ❌ ${result.error}`);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(56));
  console.log("\n📊 Pull Summary:");
  console.log("─".repeat(40));

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalPackages = 0;
  let totalFiles = 0;

  for (const result of results) {
    if (result.success) {
      console.log(`   ✅ ${result.project}/${result.language}: ${result.packagesDownloaded} packages`);
      totalSuccess++;
      totalPackages += result.packagesDownloaded;
      totalFiles += result.filesDownloaded;
    } else {
      console.log(`   ❌ ${result.project}/${result.language}: ${result.error}`);
      totalFailed++;
    }
  }

  console.log("─".repeat(40));
  console.log(`   Success: ${totalSuccess} | Failed: ${totalFailed} | Packages: ${totalPackages} | Files: ${totalFiles}`);

  if (totalSuccess > 0) {
    console.log(`\n✅ IR data downloaded to ${outputDir}`);
    console.log("   You can now run: pnpm --filter @langchain/reference-web dev");
  }

  if (totalFailed > 0 && totalSuccess === 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Pull failed:", error);
  process.exit(1);
});
