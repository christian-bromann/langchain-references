#!/usr/bin/env node
/**
 * Update Package Indexes Command
 *
 * Regenerates the project package index files from individual package pointers.
 * This is used after batch package builds to ensure the index is complete and
 * up-to-date.
 *
 * The project package index aggregates all package pointers for a project/language
 * into a single file for efficient loading by the web app.
 *
 * Usage:
 *   update-indexes --project langchain --language python
 *   update-indexes --all
 *   update-indexes --all --local   # Local mode: reads/writes only local files
 *
 * Example:
 *   # Update index for langchain Python packages
 *   pnpm update-indexes --project langchain --language python
 *
 *   # Update all project indexes
 *   pnpm update-indexes --all
 *
 *   # Update all indexes from local ir-output (no blob storage needed)
 *   pnpm update-indexes --all --local
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import url from "node:url";

import { Command } from "commander";
import type { Language, SymbolLanguage } from "@langchain/ir-schema";
import { regenerateProjectPackageIndex, generateGlobalManifest } from "../pointers.js";
import { PROJECTS, OUTPUT_LANGUAGES } from "../constants.js";

/** Local output directory for IR data */
const IR_OUTPUT_DIR = "ir-output";
const POINTERS_PATH = "pointers";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

interface ConfigFile {
  project?: string;
  language: SymbolLanguage;
  packages: Array<{ name: string; index?: number }>;
}

/**
 * Package with ordering info extracted from config
 */
interface PackageOrderInfo {
  name: string;
  index?: number;
  configPosition: number;
}

/**
 * Compute ordered package names from config.
 * Packages with explicit `index` are sorted first by index value,
 * then packages without index follow in their config array order.
 */
function computePackageOrder(packages: Array<{ name: string; index?: number }>): string[] {
  const packagesWithOrder: PackageOrderInfo[] = packages.map((pkg, i) => ({
    name: pkg.name,
    index: pkg.index,
    configPosition: i,
  }));

  // Separate packages with and without explicit index
  const withIndex = packagesWithOrder.filter((p) => p.index !== undefined);
  const withoutIndex = packagesWithOrder.filter((p) => p.index === undefined);

  // Sort packages with index by their index value
  withIndex.sort((a, b) => (a.index as number) - (b.index as number));

  // Packages without index keep their config array order
  withoutIndex.sort((a, b) => a.configPosition - b.configPosition);

  // Combine: indexed packages first, then non-indexed
  return [...withIndex, ...withoutIndex].map((p) => p.name);
}

/**
 * Load package names and order from a config file.
 */
async function loadPackageInfoFromConfig(
  project: string,
  language: string,
): Promise<{ packageNames: string[]; packageOrder: string[] }> {
  const configDir = path.resolve(__dirname, "../../../../configs");
  const configFile = path.join(configDir, `${project}-${language}.json`);

  try {
    const content = await fs.readFile(configFile, "utf-8");
    const config: ConfigFile = JSON.parse(content);
    const packageNames = config.packages.map((p) => p.name);
    const packageOrder = computePackageOrder(config.packages);
    return { packageNames, packageOrder };
  } catch {
    console.warn(`   ⚠️  Could not load config: ${configFile}`);
    return { packageNames: [], packageOrder: [] };
  }
}

/**
 * Normalize a package name to a packageId.
 */
function normalizePackageId(packageName: string, language: Language): string {
  const prefix =
    language === "python"
      ? "pkg_py_"
      : language === "java"
        ? "pkg_java_"
        : language === "go"
          ? "pkg_go_"
          : "pkg_js_";
  const normalized = packageName
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_")
    .replace(/\./g, "_")
    .toLowerCase();
  return `${prefix}${normalized}`;
}

/**
 * Get the latest build directory for a package from local ir-output.
 * Returns the build with the most recently modified package.json.
 */
function getLatestLocalBuild(packageId: string): string | null {
  const pkgPath = path.join(process.cwd(), IR_OUTPUT_DIR, "ir", "packages", packageId);

  if (!fsSync.existsSync(pkgPath)) {
    return null;
  }

  const builds = fsSync.readdirSync(pkgPath).filter((b) => {
    const buildPath = path.join(pkgPath, b);
    const pkgJsonPath = path.join(buildPath, "package.json");
    return fsSync.statSync(buildPath).isDirectory() && fsSync.existsSync(pkgJsonPath);
  });

  if (builds.length === 0) {
    return null;
  }

  // Sort by mtime descending to get latest
  builds.sort((a, b) => {
    const aTime = fsSync.statSync(path.join(pkgPath, a, "package.json")).mtimeMs;
    const bTime = fsSync.statSync(path.join(pkgPath, b, "package.json")).mtimeMs;
    return bTime - aTime;
  });

  return builds[0];
}

/**
 * Read package.json from local ir-output for a specific package.
 */
async function readLocalPackageJson(
  packageId: string,
  buildId: string,
): Promise<Record<string, unknown> | null> {
  const pkgJsonPath = path.join(
    process.cwd(),
    IR_OUTPUT_DIR,
    "ir",
    "packages",
    packageId,
    buildId,
    "package.json",
  );

  try {
    const content = await fs.readFile(pkgJsonPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Generate project package index from local ir-output files.
 * This is the local-only version that doesn't require blob storage.
 */
async function generateLocalProjectIndex(
  language: Language,
  packageNames: string[],
): Promise<{ packages: Record<string, { buildId: string; version: string }> }> {
  const packages: Record<string, { buildId: string; version: string }> = {};

  for (const packageName of packageNames) {
    const packageId = normalizePackageId(packageName, language);
    const buildId = getLatestLocalBuild(packageId);

    if (!buildId) {
      console.log(`   ⚠️  No local build found for ${packageName}`);
      continue;
    }

    const pkgJson = await readLocalPackageJson(packageId, buildId);
    if (!pkgJson) {
      console.log(`   ⚠️  Could not read package.json for ${packageName}`);
      continue;
    }

    packages[packageName] = {
      buildId,
      version: (pkgJson.version as string) || "0.0.0",
    };
  }

  return { packages };
}

/**
 * Write project index to local ir-output/pointers directory.
 */
async function writeLocalProjectIndex(
  project: string,
  language: Language,
  packages: Record<string, { buildId: string; version: string }>,
  packageOrder?: string[],
): Promise<void> {
  const indexPath = path.join(
    process.cwd(),
    IR_OUTPUT_DIR,
    POINTERS_PATH,
    `index-${project}-${language}.json`,
  );

  const index = {
    project,
    language,
    updatedAt: new Date().toISOString(),
    packages,
    ...(packageOrder ? { packageOrder } : {}),
  };

  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log(`   ✓ Wrote ${indexPath} (${Object.keys(packages).length} packages)`);
}

/**
 * Generate global manifest from local ir-output files.
 * Reads all package.json files from local builds and creates a unified manifest.
 */
async function generateLocalManifest(): Promise<void> {
  console.log(`\n📦 Generating local manifest from ir-output`);

  const packagesDir = path.join(process.cwd(), IR_OUTPUT_DIR, "ir", "packages");
  const manifestPath = path.join(process.cwd(), IR_OUTPUT_DIR, POINTERS_PATH, "manifest.json");

  // Read existing manifest for base structure
  let manifest: Record<string, unknown>;
  try {
    const existing = await fs.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(existing);
  } catch {
    manifest = {
      irVersion: "1.0",
      project: "all-packages",
      build: {
        buildId: "",
        createdAt: new Date().toISOString(),
        baseUrl: "",
      },
      sources: [],
      packages: [],
    };
  }

  // Scan all package directories
  const updatedPackages: Record<string, unknown>[] = [];
  let packageDirs: string[];

  try {
    packageDirs = await fs.readdir(packagesDir);
  } catch {
    console.error(`   ❌ Could not read packages directory: ${packagesDir}`);
    return;
  }

  for (const pkgDir of packageDirs) {
    const pkgPath = path.join(packagesDir, pkgDir);
    const stat = await fs.stat(pkgPath);
    if (!stat.isDirectory()) continue;

    const buildId = getLatestLocalBuild(pkgDir);
    if (!buildId) continue;

    const pkgJson = await readLocalPackageJson(pkgDir, buildId);
    if (pkgJson) {
      updatedPackages.push(pkgJson);
    }
  }

  manifest.packages = updatedPackages;

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  // Count packages with subpages
  const withSubpages = updatedPackages.filter(
    (p) => Array.isArray(p.subpages) && (p.subpages as unknown[]).length > 0,
  );

  console.log(`   ✅ Wrote ${manifestPath}`);
  console.log(
    `   📊 ${updatedPackages.length} packages total, ${withSubpages.length} with subpages`,
  );
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("update-indexes")
    .description("Regenerate project package indexes from individual package pointers")
    .option("--project <name>", `Project to update (${PROJECTS.join(", ")})`)
    .option("--language <lang>", `Language to update (${OUTPUT_LANGUAGES.join(", ")})`)
    .option("--all", "Update indexes for all project/language combinations")
    .option("--dry-run", "Print what would be updated without making changes")
    .option("--local", "Local mode: read/write only local ir-output files (no blob storage)")
    .action(
      async (options: {
        project?: string;
        language?: string;
        all?: boolean;
        dryRun?: boolean;
        local?: boolean;
      }) => {
        console.log(`\n🔄 Regenerating project package indexes`);

        if (options.dryRun) {
          console.log("   (dry-run mode - no actual updates)\n");
        }

        if (options.local) {
          console.log("   (local mode - reading/writing only local files)\n");
        }

        // Determine which project/language combinations to update
        const combinations: { project: string; language: Language }[] = [];

        if (options.all) {
          for (const project of PROJECTS) {
            for (const language of OUTPUT_LANGUAGES) {
              combinations.push({ project, language });
            }
          }
        } else if (options.project && options.language) {
          // Map typescript to javascript for the pointer system
          const lang = options.language === "typescript" ? "javascript" : options.language;
          combinations.push({
            project: options.project,
            language: lang as Language,
          });
        } else if (options.project) {
          // Update all languages for the project
          for (const language of OUTPUT_LANGUAGES) {
            combinations.push({ project: options.project, language });
          }
        } else if (options.language) {
          // Update all projects for the language
          const lang = options.language === "typescript" ? "javascript" : options.language;
          for (const project of PROJECTS) {
            combinations.push({ project, language: lang as Language });
          }
        } else {
          console.error("❌ Must specify --project, --language, or --all");
          process.exit(1);
        }

        console.log(`\n📦 Updating ${combinations.length} index(es):`);
        for (const { project, language } of combinations) {
          console.log(`   - ${project}-${language}`);
        }
        console.log("");

        let successCount = 0;
        let failCount = 0;

        for (const { project, language } of combinations) {
          // Map javascript back to typescript for config file lookup
          // Java and Go are pass-through (same in config and output)
          const configLanguage = language === "javascript" ? "typescript" : language;

          console.log(`\n📋 ${project}-${language}:`);

          // Load package names and order from config
          const { packageNames, packageOrder } = await loadPackageInfoFromConfig(
            project,
            configLanguage,
          );

          if (packageNames.length === 0) {
            console.log(`   ⚠️  No packages found, skipping`);
            continue;
          }

          console.log(`   Found ${packageNames.length} packages in config`);

          try {
            if (options.local) {
              // Local mode: read from local files, write to local files only
              if (!options.dryRun) {
                const { packages } = await generateLocalProjectIndex(language, packageNames);
                await writeLocalProjectIndex(project, language, packages, packageOrder);
              } else {
                console.log(`   [dry-run] Would generate local index for ${project}-${language}`);
              }
            } else {
              // Standard mode: use blob storage
              await regenerateProjectPackageIndex(
                project,
                language,
                packageNames,
                options.dryRun ?? false,
                packageOrder,
              );
            }
            successCount++;
          } catch (error) {
            console.error(`   ❌ Failed to update index: ${error}`);
            failCount++;
          }
        }

        console.log(`\n${"─".repeat(40)}`);
        console.log(`📊 Summary: ${successCount} succeeded, ${failCount} failed`);

        // Generate global manifest after updating all indexes
        if (successCount > 0 && options.all) {
          if (options.local) {
            // Local mode: generate manifest from local files
            if (!options.dryRun) {
              await generateLocalManifest();
            } else {
              console.log(`\n[dry-run] Would generate local manifest`);
            }
          } else {
            // Standard mode: use blob storage
            await generateGlobalManifest(PROJECTS, OUTPUT_LANGUAGES, options.dryRun ?? false);
          }
        }

        if (failCount > 0) {
          process.exit(1);
        }
      },
    );

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("❌ Update indexes failed:", error);
  process.exit(1);
});

export { main as updateIndexesMain };
