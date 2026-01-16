#!/usr/bin/env tsx
/**
 * Pull IR - Downloads the latest compiled IR from Vercel Blob storage
 *
 * This command fetches the latest build artifacts from Vercel Blob storage
 * and saves them to the local ir-output directory, allowing you to run the
 * dev environment with production data.
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
import type { Manifest } from "@langchain/ir-schema";
import type { LatestBuildPointer } from "../pointers.js";

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
  buildId: string | null;
  filesDownloaded: number;
  success: boolean;
  error?: string;
}

/**
 * Pull IR for a specific project and language.
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
    buildId: null,
    filesDownloaded: 0,
    success: false,
  };

  try {
    // Fetch the latest build pointer
    if (verbose) {
      console.log(`   Fetching pointer: pointers/latest-${project}-${language}.json`);
    }

    const pointer = await fetchBlobJson<LatestBuildPointer>(
      `pointers/latest-${project}-${language}.json`,
    );

    if (!pointer) {
      result.error = "No build pointer found";
      return result;
    }

    result.buildId = pointer.buildId;
    if (verbose) {
      console.log(
        `   Found build: ${pointer.buildId} (updated ${pointer.updatedAt.split("T")[0]})`,
      );
    }

    const buildId = pointer.buildId;
    const buildDir = path.join(outputDir, buildId);

    // Check if we already have this build
    const manifestPath = path.join(buildDir, "reference.manifest.json");
    try {
      await fs.access(manifestPath);
      console.log(`   ✓ Already have build ${buildId}`);

      // Create/update symlink
      const irLanguage = language === "javascript" ? "javascript" : "python";
      await createSymlink(outputDir, buildId, project, irLanguage);

      result.success = true;
      return result;
    } catch {
      // Build doesn't exist locally, download it
    }

    // Create build directory
    await fs.mkdir(buildDir, { recursive: true });
    await fs.mkdir(path.join(buildDir, "packages"), { recursive: true });

    // Download manifest
    console.log(`   Downloading manifest...`);
    const manifestContent = await fetchBlobRaw(`ir/${buildId}/reference.manifest.json`);
    if (!manifestContent) {
      result.error = "Failed to download manifest";
      return result;
    }

    await fs.writeFile(manifestPath, manifestContent, "utf-8");
    result.filesDownloaded++;

    const manifest: Manifest = JSON.parse(manifestContent);

    // Download symbols for each package
    for (const pkg of manifest.packages) {
      const pkgDir = path.join(buildDir, "packages", pkg.packageId);
      await fs.mkdir(pkgDir, { recursive: true });

      // Download symbols.json
      if (verbose) {
        console.log(`   Downloading ${pkg.displayName} symbols...`);
      }

      const symbolsContent = await fetchBlobRaw(
        `ir/${buildId}/packages/${pkg.packageId}/symbols.json`,
      );

      if (symbolsContent) {
        await fs.writeFile(path.join(pkgDir, "symbols.json"), symbolsContent, "utf-8");
        result.filesDownloaded++;

        const parsed = JSON.parse(symbolsContent);
        const symbolCount = parsed.symbols?.length || 0;
        if (verbose) {
          console.log(`     ✓ ${symbolCount} symbols`);
        }
      } else {
        console.log(`     ⚠️  No symbols found for ${pkg.displayName}`);
      }

      // Try to download changelog.json if it exists
      const changelogContent = await fetchBlobRaw(
        `ir/${buildId}/packages/${pkg.packageId}/changelog.json`,
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
        `ir/${buildId}/packages/${pkg.packageId}/versions.json`,
      );

      if (versionsContent) {
        await fs.writeFile(path.join(pkgDir, "versions.json"), versionsContent, "utf-8");
        result.filesDownloaded++;
        if (verbose) {
          console.log(`     ✓ versions`);
        }
      }

      // Download sharded indices (lookup, catalog, changelog)
      // These are small files (<500KB each) used for optimized production lookups
      const shardedDirs = ["lookup", "catalog", "changelog"] as const;

      for (const shardDir of shardedDirs) {
        // First, try to fetch the index manifest to discover shards
        const indexContent = await fetchBlobRaw(
          `ir/${buildId}/packages/${pkg.packageId}/${shardDir}/index.json`,
        );

        if (indexContent) {
          // Create shard directory
          const shardDirPath = path.join(pkgDir, shardDir);
          await fs.mkdir(shardDirPath, { recursive: true });

          // Save the index
          await fs.writeFile(path.join(shardDirPath, "index.json"), indexContent, "utf-8");
          result.filesDownloaded++;

          // Parse index to get shard list
          try {
            const index = JSON.parse(indexContent) as { shards?: string[] };
            if (index.shards && Array.isArray(index.shards)) {
              // Download each shard in parallel (with concurrency limit)
              const BATCH_SIZE = 10;
              for (let i = 0; i < index.shards.length; i += BATCH_SIZE) {
                const batch = index.shards.slice(i, i + BATCH_SIZE);
                await Promise.all(
                  batch.map(async (shardKey) => {
                    const shardContent = await fetchBlobRaw(
                      `ir/${buildId}/packages/${pkg.packageId}/${shardDir}/${shardKey}.json`,
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
    }

    // Create symlink for latest
    const irLanguage = language === "javascript" ? "javascript" : "python";
    await createSymlink(outputDir, buildId, project, irLanguage);

    result.success = true;
    console.log(`   ✓ Downloaded ${result.filesDownloaded} files`);
  } catch (error) {
    result.error = (error as Error).message;
  }

  return result;
}

/**
 * Create a symlink for the latest build.
 */
async function createSymlink(
  outputDir: string,
  buildId: string,
  project: string,
  language: string,
): Promise<void> {
  const linkName = `latest-${project}-${language}`;
  const linkPath = path.join(outputDir, linkName);

  try {
    // Remove existing symlink if it exists
    await fs.unlink(linkPath).catch(() => {});

    // Create new symlink
    await fs.symlink(buildId, linkPath);
  } catch (error) {
    console.log(`   ⚠️  Could not create symlink: ${(error as Error).message}`);
  }
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
  let totalFiles = 0;

  for (const result of results) {
    if (result.success) {
      if (result.buildId) {
        console.log(`   ✅ ${result.project}/${result.language}: ${result.buildId.slice(0, 8)}`);
      } else {
        console.log(`   ✅ ${result.project}/${result.language}: (already up to date)`);
      }
      totalSuccess++;
      totalFiles += result.filesDownloaded;
    } else {
      console.log(`   ❌ ${result.project}/${result.language}: ${result.error}`);
      totalFailed++;
    }
  }

  console.log("─".repeat(40));
  console.log(`   Success: ${totalSuccess} | Failed: ${totalFailed} | Files: ${totalFiles}`);

  if (totalSuccess > 0) {
    console.log(`\n✅ IR data downloaded to ${outputDir}`);
    console.log("   You can now run: pnpm --filter @langchain/reference-web dev");
  }

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Pull failed:", error);
  process.exit(1);
});
