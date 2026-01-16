#!/usr/bin/env tsx
/**
 * Upload Pointers Command
 *
 * Scans the local ir-output/packages/ directory and uploads package pointers
 * and project indexes to Vercel Blob storage.
 *
 * This is useful when you've already uploaded package data but the pointers
 * weren't created (e.g., build ran with --skip-pointers).
 *
 * Usage:
 *   pnpm upload-pointers
 *   pnpm upload-pointers --project langchain --language python
 *   pnpm upload-pointers --dry-run
 */

import path from "path";
import fs from "fs/promises";
import { program } from "commander";
import { put } from "@vercel/blob";

// =============================================================================
// CONFIGURATION
// =============================================================================

const PROJECTS = ["langchain", "langgraph", "deepagent", "integrations"] as const;
const LANGUAGES = ["python", "javascript"] as const;
const POINTERS_PATH = "pointers";

type Project = (typeof PROJECTS)[number];
type Language = (typeof LANGUAGES)[number];

interface PackageJson {
  packageId: string;
  displayName: string;
  publishedName: string;
  language: string;
  ecosystem: string;
  version: string;
  buildId: string;
  project: string;
  repo: { owner: string; name: string; sha: string; path: string };
  stats: { total: number };
  createdAt: string;
}

interface PackagePointer {
  buildId: string;
  version: string;
  sha: string;
  repo: string;
  updatedAt: string;
  stats?: { total: number };
}

interface ProjectPackageIndex {
  project: string;
  language: "python" | "javascript";
  updatedAt: string;
  packages: Record<string, { buildId: string; version: string; sha: string }>;
}

// =============================================================================
// UPLOAD HELPERS
// =============================================================================

async function uploadPointer(
  blobPath: string,
  data: object,
  dryRun: boolean,
): Promise<void> {
  const content = JSON.stringify(data, null, 2);

  if (dryRun) {
    console.log(`   [DRY-RUN] Would upload: ${blobPath}`);
    return;
  }

  await put(blobPath, content, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

// =============================================================================
// MAIN LOGIC
// =============================================================================

async function main() {
  program
    .name("upload-pointers")
    .description("Upload package pointers from local ir-output to Vercel Blob")
    .option("--project <name>", `Project to process (${PROJECTS.join(", ")})`)
    .option("--language <lang>", `Language to process (${LANGUAGES.join(", ")})`)
    .option("--output <path>", "Path to ir-output directory", "./ir-output")
    .option("--dry-run", "Print what would be uploaded without making changes")
    .parse();

  const opts = program.opts();
  const irOutputPath = path.resolve(opts.output);
  const packagesDir = path.join(irOutputPath, "packages");
  const dryRun = opts.dryRun || false;

  console.log("📤 Upload Pointers - Create pointers from local packages");
  console.log("=".repeat(56));
  console.log(`   Source: ${packagesDir}`);
  if (dryRun) {
    console.log("   Mode: DRY-RUN (no actual uploads)");
  }

  // Check if packages directory exists
  try {
    await fs.access(packagesDir);
  } catch {
    console.error(`\n❌ Packages directory not found: ${packagesDir}`);
    console.error("   Run a build first or specify the correct --output path.");
    process.exit(1);
  }

  // Scan packages directory
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });
  const packageDirs = entries.filter((e) => e.isDirectory());

  console.log(`\n📦 Found ${packageDirs.length} package directories`);

  // Group packages by project and language
  const projectIndexes: Map<string, ProjectPackageIndex> = new Map();
  let packagesProcessed = 0;
  let pointersUploaded = 0;

  for (const packageDir of packageDirs) {
    const packageId = packageDir.name;
    const packagePath = path.join(packagesDir, packageId);

    // Determine language from packageId prefix
    let language: Language;
    if (packageId.startsWith("pkg_py_")) {
      language = "python";
    } else if (packageId.startsWith("pkg_js_")) {
      language = "javascript";
    } else {
      console.log(`   ⚠️  Skipping ${packageId}: unknown prefix`);
      continue;
    }

    // Filter by language if specified
    if (opts.language && opts.language !== language) {
      continue;
    }

    // Find the build directory (there should be one subdirectory with the buildId)
    const buildDirs = await fs.readdir(packagePath, { withFileTypes: true });
    const buildDir = buildDirs.find((d) => d.isDirectory());

    if (!buildDir) {
      console.log(`   ⚠️  Skipping ${packageId}: no build directory found`);
      continue;
    }

    const buildId = buildDir.name;
    const buildPath = path.join(packagePath, buildId);

    // Read package.json to get metadata
    const packageJsonPath = path.join(buildPath, "package.json");
    let packageJson: PackageJson;

    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      packageJson = JSON.parse(content);
    } catch {
      console.log(`   ⚠️  Skipping ${packageId}: no package.json found`);
      continue;
    }

    // Filter by project if specified
    const project = packageJson.project || "langchain";
    if (opts.project && opts.project !== project) {
      continue;
    }

    const ecosystem = language;
    const packageName = packageJson.publishedName || packageId.replace(/^pkg_(py|js)_/, "").replace(/_/g, "-");

    console.log(`\n   Processing: ${packageName} (${project}/${language})`);
    console.log(`     Build: ${buildId.slice(0, 8)}... v${packageJson.version}`);

    // Create package pointer
    const pointer: PackagePointer = {
      buildId,
      version: packageJson.version,
      sha: packageJson.repo?.sha || "unknown",
      repo: `${packageJson.repo?.owner}/${packageJson.repo?.name}`,
      updatedAt: new Date().toISOString(),
      stats: packageJson.stats,
    };

    // Upload package pointer
    const pointerPath = `${POINTERS_PATH}/packages/${ecosystem}/${packageName}.json`;
    await uploadPointer(pointerPath, pointer, dryRun);
    console.log(`     ✓ Uploaded ${pointerPath}`);
    pointersUploaded++;

    // Add to project index
    const indexKey = `${project}-${language}`;
    if (!projectIndexes.has(indexKey)) {
      projectIndexes.set(indexKey, {
        project,
        language,
        updatedAt: new Date().toISOString(),
        packages: {},
      });
    }

    const index = projectIndexes.get(indexKey)!;
    index.packages[packageName] = {
      buildId,
      version: packageJson.version,
      sha: packageJson.repo?.sha || "unknown",
    };

    packagesProcessed++;
  }

  // Upload project indexes
  console.log("\n📋 Uploading project indexes...");

  for (const [key, index] of projectIndexes) {
    const indexPath = `${POINTERS_PATH}/index-${index.project}-${index.language}.json`;
    await uploadPointer(indexPath, index, dryRun);
    console.log(`   ✓ ${indexPath} (${Object.keys(index.packages).length} packages)`);
    pointersUploaded++;
  }

  // Summary
  console.log("\n" + "=".repeat(56));
  console.log("\n📊 Summary:");
  console.log(`   Packages processed: ${packagesProcessed}`);
  console.log(`   Pointers uploaded: ${pointersUploaded}`);

  if (dryRun) {
    console.log("\n   (DRY-RUN: No actual uploads were made)");
  } else {
    console.log("\n✅ Pointers uploaded successfully!");
    console.log("   You can now run: pnpm pull-ir");
  }
}

main().catch((error) => {
  console.error("\n❌ Upload failed:", error);
  process.exit(1);
});
