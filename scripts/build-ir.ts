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
 * 6. Updates Vercel KV pointers
 */

import { program } from "commander";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import type { Manifest, Package, SymbolRecord } from "@langchain/ir-schema";
import { fetchTarball, getLatestSha, type FetchResult } from "./fetch-tarball.js";
import { uploadIR } from "./upload-ir.js";
import { updateKV } from "./update-kv.js";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

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
}

/**
 * Build configuration loaded from JSON file.
 */
interface BuildConfig {
  /** Language to extract */
  language: "python" | "typescript";
  /** GitHub repository */
  repo: string;
  /** Packages to extract */
  packages: PackageConfig[];
}

/**
 * Generate a deterministic build ID from configuration and sources.
 */
function generateBuildId(
  config: BuildConfig,
  sha: string,
  extractorVersions: { python: string; typescript: string }
): string {
  const data = JSON.stringify({
    repo: config.repo,
    sha,
    language: config.language,
    packages: config.packages.map((p) => p.name).sort(),
    extractors: extractorVersions,
  });

  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/**
 * Run the Python extractor on a package.
 */
async function extractPython(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string
): Promise<void> {
  console.log(`   🐍 Extracting: ${packageName}`);

  // Path to the Python extractor source
  const extractorSrcPath = path.resolve(
    __dirname,
    "../packages/extractor-python/src"
  );

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
 */
async function extractTypeScript(
  packagePath: string,
  packageName: string,
  outputPath: string,
  repo: string,
  sha: string,
  entryPoints?: string[],
  sourcePathPrefix?: string
): Promise<void> {
  console.log(`   📘 Extracting: ${packageName}`);

  // Use tsx to run TypeScript directly instead of requiring a build step
  const extractorPath = path.resolve(
    __dirname,
    "../packages/extractor-typescript/src/cli.ts"
  );

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
    "--verbose",
  ];

  if (entryPoints && entryPoints.length > 0) {
    args.push("--entry-points", ...entryPoints);
  }

  if (sourcePathPrefix) {
    args.push("--source-path-prefix", sourcePathPrefix);
  }

  await runCommand("tsx", args);
}

/**
 * Run a command and wait for completion.
 */
interface RunCommandOptions {
  env?: Record<string, string>;
  cwd?: string;
}

function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Create the manifest from extracted packages.
 */
async function createManifest(
  buildId: string,
  config: BuildConfig,
  fetchResult: FetchResult,
  irOutputPath: string
): Promise<Manifest> {
  const packages: Package[] = [];

  for (const pkgConfig of config.packages) {
    const pkgOutputPath = path.join(irOutputPath, "packages", normalizePackageId(pkgConfig.name));

    try {
      const symbolsPath = path.join(pkgOutputPath, "symbols.json");
      const symbolsContent = await fs.readFile(symbolsPath, "utf-8");
      const data = JSON.parse(symbolsContent);
      const symbols: SymbolRecord[] = data.symbols || [];

      // Count by kind
      const stats = {
        classes: symbols.filter((s) => s.kind === "class").length,
        functions: symbols.filter((s) => s.kind === "function").length,
        modules: symbols.filter((s) => s.kind === "module").length,
        types: symbols.filter((s) => ["interface", "typeAlias", "enum"].includes(s.kind)).length,
        total: symbols.length,
      };

      const [owner, repoName] = config.repo.split("/");

      packages.push({
        packageId: normalizePackageId(pkgConfig.name),
        displayName: pkgConfig.name,
        publishedName: pkgConfig.name,
        language: config.language,
        ecosystem: config.language === "python" ? "python" : "javascript",
        version: data.package?.version || "unknown",
        repo: {
          owner,
          name: repoName,
          sha: fetchResult.sha,
          path: pkgConfig.path,
        },
        entry: {
          kind: "module",
          refId: symbols[0]?.id || "",
        },
        nav: {
          rootGroups: ["Classes", "Functions", "Types"],
        },
        stats,
      });
    } catch (error) {
      console.warn(`   ⚠️  Failed to process ${pkgConfig.name}: ${error}`);
    }
  }

  return {
    irVersion: "1.0",
    build: {
      buildId,
      createdAt: new Date().toISOString(),
      baseUrl: "https://reference.langchain.com",
    },
    sources: [
      {
        repo: config.repo,
        sha: fetchResult.sha,
        fetchedAt: fetchResult.fetchedAt,
      },
    ],
    packages,
  };
}

/**
 * Normalize package name to a valid ID.
 */
function normalizePackageId(name: string): string {
  const ecosystem = name.startsWith("@") ? "js" : "py";
  const normalized = name
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_");
  return `pkg_${ecosystem}_${normalized}`;
}

/**
 * Main build pipeline.
 */
async function main() {
  program
    .name("build-ir")
    .description("Build IR artifacts from source repositories")
    .requiredOption("--config <path>", "Build configuration file path")
    .option("--sha <sha>", "Git SHA to use (defaults to latest main)")
    .option("--output <path>", "Output directory for IR artifacts", "./ir-output")
    .option("--cache <path>", "Cache directory for tarballs", "./cache")
    .option("--dry-run", "Generate locally without uploading")
    .option("--local", "Local-only mode (skip all cloud uploads)")
    .option("--skip-upload", "Skip upload to Vercel Blob")
    .option("--skip-kv", "Skip Vercel KV updates")
    .option("-v, --verbose", "Enable verbose output")
    .parse();

  const opts = program.opts();

  // --local is a convenience flag that sets both --skip-upload and --skip-kv
  if (opts.local) {
    opts.skipUpload = true;
    opts.skipKv = true;
  }

  console.log("🔧 LangChain Reference Docs - IR Build Pipeline");
  console.log("================================================\n");

  // Load configuration
  const configPath = path.resolve(opts.config);
  console.log(`📄 Loading config: ${configPath}`);

  const configContent = await fs.readFile(configPath, "utf-8");
  const config: BuildConfig = JSON.parse(configContent);

  console.log(`   Language: ${config.language}`);
  console.log(`   Repository: ${config.repo}`);
  console.log(`   Packages: ${config.packages.map((p) => p.name).join(", ")}`);

  // Resolve SHA
  const sha = opts.sha || (await getLatestSha(config.repo));
  console.log(`\n📌 Target SHA: ${sha.substring(0, 7)}`);

  // Generate build ID
  const buildId = generateBuildId(config, sha, {
    python: "0.1.0",
    typescript: "0.1.0",
  });
  console.log(`🔑 Build ID: ${buildId}`);

  // Create output directories
  const irOutputPath = path.resolve(opts.output, buildId);
  await fs.mkdir(irOutputPath, { recursive: true });
  await fs.mkdir(path.join(irOutputPath, "packages"), { recursive: true });

  // Fetch source tarball
  console.log("\n📥 Fetching source...");
  const fetchResult = await fetchTarball({
    repo: config.repo,
    sha,
    output: opts.cache,
  });

  // Extract each package
  console.log("\n🔍 Extracting APIs...");

  for (const pkgConfig of config.packages) {
    const packagePath = path.join(fetchResult.extractedPath, pkgConfig.path);
    const pkgOutputDir = path.join(irOutputPath, "packages", normalizePackageId(pkgConfig.name));
    await fs.mkdir(pkgOutputDir, { recursive: true });
    const outputPath = path.join(pkgOutputDir, "symbols.json");

    try {
      if (config.language === "python") {
        await extractPython(packagePath, pkgConfig.name, outputPath, config.repo, sha);
      } else {
        await extractTypeScript(
          packagePath,
          pkgConfig.name,
          outputPath,
          config.repo,
          sha,
          pkgConfig.entryPoints,
          fetchResult.extractedPath
        );
      }
      console.log(`   ✓ ${pkgConfig.name}`);
    } catch (error) {
      console.error(`   ✗ ${pkgConfig.name}: ${error}`);
    }
  }

  // Create manifest
  console.log("\n📋 Creating manifest...");
  const manifest = await createManifest(buildId, config, fetchResult, irOutputPath);

  const manifestPath = path.join(irOutputPath, "reference.manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`   ✓ ${manifest.packages.length} packages in manifest`);

  // Upload to Vercel Blob
  if (!opts.dryRun && !opts.skipUpload) {
    try {
      await uploadIR({
        buildId,
        irOutputPath,
        dryRun: opts.dryRun,
      });
    } catch (error) {
      console.error(`\n❌ Upload failed: ${error}`);
      if (!opts.skipKv) {
        console.log("   Skipping KV update due to upload failure");
      }
      process.exit(1);
    }
  } else if (opts.dryRun) {
    console.log("\n🔍 Dry run mode - skipping upload");
  } else {
    console.log("\n⏭️  Skipping upload (--skip-upload)");
  }

  // Update Vercel KV
  if (!opts.dryRun && !opts.skipKv) {
    try {
      await updateKV({
        buildId,
        manifest,
        dryRun: opts.dryRun,
      });
    } catch (error) {
      console.error(`\n❌ KV update failed: ${error}`);
      process.exit(1);
    }
  } else if (opts.dryRun) {
    console.log("\n🔍 Dry run mode - skipping KV update");
  } else {
    console.log("\n⏭️  Skipping KV update (--skip-kv)");
  }

  // Create language-specific "latest" symlink
  const latestLinkName = config.language === "python" ? "latest-python" : "latest-javascript";
  const latestLinkPath = path.resolve(opts.output, latestLinkName);
  try {
    // Remove existing symlink if it exists
    await fs.unlink(latestLinkPath).catch(() => {});
    // Create relative symlink pointing to the build directory
    await fs.symlink(buildId, latestLinkPath);
    console.log(`\n🔗 Created symlink: ${latestLinkName} -> ${buildId}`);
  } catch (error) {
    console.warn(`   ⚠️  Failed to create symlink: ${error}`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ Build complete!");
  console.log(`   Build ID: ${buildId}`);
  console.log(`   Output: ${irOutputPath}`);
  console.log(`   Packages: ${manifest.packages.length}`);
  console.log(
    `   Total symbols: ${manifest.packages.reduce((acc, p) => acc + p.stats.total, 0)}`
  );
}

main().catch((error) => {
  console.error("\n❌ Build failed:", error);
  process.exit(1);
});
