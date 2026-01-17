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

import url from "url";
import path from "path";
import fs from "fs/promises";
import { program } from "commander";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROJECTS = ["langchain", "langgraph", "deepagent", "integrations"] as const;
const LANGUAGES = ["python", "javascript"] as const;

type Project = (typeof PROJECTS)[number];
type Language = (typeof LANGUAGES)[number];

interface ConfigFile {
  project: string;
  language: string;
  packages: Array<{ name: string; displayName?: string }>;
}

interface PackagePointer {
  buildId: string;
  version: string;
  sha: string;
  repo: string;
  updatedAt: string;
  stats?: { total: number };
}

/**
 * Sanitize a package name for use as a filename.
 * Scoped npm packages like @langchain/core become langchain__core
 */
function sanitizePackageNameForPath(packageName: string): string {
  return packageName
    .replace(/^@/, "") // Remove leading @
    .replace(/\//g, "__"); // Replace / with __
}

// =============================================================================
// BLOB FETCHING
// =============================================================================

/**
 * Get the Vercel Blob base URL from environment.
 *
 * For pull-ir, we need to fetch from the production blob storage, not a local server.
 * So we prioritize BLOB_READ_WRITE_TOKEN (production) over BLOB_URL (which may be localhost).
 */
function getBlobBaseUrl(): string | null {
  // First, try to derive from BLOB_READ_WRITE_TOKEN (this is always production)
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const match = token.match(/^vercel_blob_rw_([^_]+)_/);
    if (match) {
      const storeId = match[1];
      return `https://${storeId}.public.blob.vercel-storage.com`;
    }
  }

  // Fall back to BLOB_URL only if it's not localhost (for CI or other non-local environments)
  if (process.env.BLOB_URL && !process.env.BLOB_URL.includes("localhost")) {
    return process.env.BLOB_URL;
  }

  return null;
}

/**
 * Fetch JSON from Vercel Blob storage.
 */
async function fetchBlobJson<T>(relativePath: string): Promise<T | null> {
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) {
    throw new Error("No BLOB_URL or BLOB_READ_WRITE_TOKEN environment variable set");
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
    throw new Error("No BLOB_URL or BLOB_READ_WRITE_TOKEN environment variable set");
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
// CONFIG LOADING
// =============================================================================

/**
 * Load package names from config files for a project/language.
 */
async function loadPackageNamesFromConfigs(
  project: Project,
  language: Language,
): Promise<string[]> {
  const configDir = path.resolve(__dirname, "../../../../configs");
  const irLanguage = language === "javascript" ? "typescript" : "python";
  const configFile = path.join(configDir, `${project}-${irLanguage}.json`);

  try {
    const content = await fs.readFile(configFile, "utf-8");
    const config: ConfigFile = JSON.parse(content);
    return config.packages.map((p) => p.name);
  } catch {
    return [];
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

/**
 * Pull IR for a specific project and language.
 * Uses individual package pointers instead of project indexes.
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
    // Load package names from config files
    const packageNames = await loadPackageNamesFromConfigs(project, language);

    if (packageNames.length === 0) {
      result.error = "No packages found in config";
      return result;
    }

    if (verbose) {
      console.log(`   Found ${packageNames.length} packages in config`);
    }

    // Create output directory structure
    // Use ir/packages/ to match blob URL structure
    const packagesDir = path.join(outputDir, "ir", "packages");
    const pointersDir = path.join(outputDir, "pointers", "packages", language);
    await fs.mkdir(packagesDir, { recursive: true });
    await fs.mkdir(pointersDir, { recursive: true });

    const ecosystem = language;

    // Download each package using its individual pointer
    for (const packageName of packageNames) {
      // Fetch the package pointer directly
      const pointerPath = `pointers/packages/${ecosystem}/${packageName}.json`;
      const pointer = await fetchBlobJson<PackagePointer>(pointerPath);

      if (!pointer) {
        if (verbose) {
          console.log(`   ⚠️  ${packageName}: no pointer found`);
        }
        continue;
      }

      // Save the pointer locally for the local server
      // Use sanitized name for file path (e.g., @langchain/core -> langchain__core)
      const sanitizedName = sanitizePackageNameForPath(packageName);
      const pointerLocalPath = path.join(pointersDir, `${sanitizedName}.json`);
      await fs.writeFile(pointerLocalPath, JSON.stringify(pointer, null, 2), "utf-8");

      const { buildId } = pointer;
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
        if (verbose) {
          console.log(`     ⚠️  No symbols found for ${packageName}`);
        }
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

      // Try to download subpages if package.json indicates they exist
      if (packageJsonContent) {
        try {
          const packageInfo = JSON.parse(packageJsonContent);
          if (packageInfo.subpages && Array.isArray(packageInfo.subpages)) {
            const subpagesDir = path.join(pkgDir, "subpages");
            await fs.mkdir(subpagesDir, { recursive: true });

            let subpagesDownloaded = 0;
            for (const subpage of packageInfo.subpages) {
              const subpageContent = await fetchBlobRaw(
                `ir/packages/${packageId}/${buildId}/subpages/${subpage.slug}.json`,
              );
              if (subpageContent) {
                await fs.writeFile(
                  path.join(subpagesDir, `${subpage.slug}.json`),
                  subpageContent,
                  "utf-8",
                );
                result.filesDownloaded++;
                subpagesDownloaded++;
              }
            }

            if (verbose && subpagesDownloaded > 0) {
              console.log(`     ✓ subpages (${subpagesDownloaded})`);
            }
          }
        } catch {
          // Package info parsing failed or no subpages
        }
      }

      result.packagesDownloaded++;
    }

    result.success = result.packagesDownloaded > 0;
    if (result.packagesDownloaded > 0) {
      console.log(`   ✓ Downloaded ${result.packagesDownloaded} packages (${result.filesDownloaded} files)`);

      // Build the project-level index only from packages that have actual data downloaded
      // This ensures the index only includes packages with symbols.json (not just pointers)
      const packagePointers: Record<string, { buildId: string; version: string; sha: string }> = {};

      for (const packageName of packageNames) {
        // Use sanitized name when reading the pointer file
        const sanitizedName = sanitizePackageNameForPath(packageName);
        const pointerLocalPath = path.join(pointersDir, `${sanitizedName}.json`);
        try {
          const content = await fs.readFile(pointerLocalPath, "utf-8");
          const pointer = JSON.parse(content) as PackagePointer;

          // Only add to index if we have actual package data (symbols.json exists)
          const packageId = normalizePackageId(packageName, language);
          const symbolsPath = path.join(packagesDir, packageId, pointer.buildId, "symbols.json");
          try {
            await fs.access(symbolsPath);
            // Package has data, add to index
            packagePointers[packageName] = {
              buildId: pointer.buildId,
              version: pointer.version,
              sha: pointer.sha,
            };
          } catch {
            // Package data doesn't exist, skip this package from index
            if (verbose) {
              console.log(`   ⚠️  ${packageName}: pointer exists but no data downloaded`);
            }
          }
        } catch {
          // Pointer not found, skip
        }
      }

      if (Object.keys(packagePointers).length > 0) {
        const localIndex = {
          project,
          language,
          updatedAt: new Date().toISOString(),
          packages: packagePointers,
        };

        const indexLocalDir = path.join(outputDir, "pointers");
        await fs.mkdir(indexLocalDir, { recursive: true });
        await fs.writeFile(
          path.join(indexLocalDir, `index-${project}-${language}.json`),
          JSON.stringify(localIndex, null, 2),
          "utf-8",
        );
        console.log(
          `   ✓ Created project index with ${Object.keys(packagePointers).length} packages`,
        );
      } else {
        console.log(`   ⚠️  No package pointers found to create index`);
      }
    } else {
      result.error = "No packages with pointers found";
    }
  } catch (error) {
    result.error = (error as Error).message;
  }

  return result;
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
    console.error("   Set BLOB_URL or BLOB_READ_WRITE_TOKEN environment variable");
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

  if (totalPackages > 0) {
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
