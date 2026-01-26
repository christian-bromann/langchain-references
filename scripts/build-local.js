#!/usr/bin/env node
/**
 * Build Local - Generates all necessary files for local development
 *
 * This script wraps the build-ir command and generates all the additional
 * files needed for local development (catalog, routing, pointers).
 *
 * Usage:
 *   node scripts/build-local.js --config ./configs/langchain-python.json --package langchain_tests
 *   node scripts/build-local.js --config ./configs/langchain-python.json  # all packages
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Parse command line arguments
const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const packageIndex = args.indexOf("--package");

if (configIndex === -1) {
  console.error("Usage: node scripts/build-local.js --config <path> [--package <name>]");
  process.exit(1);
}

const configPath = args[configIndex + 1];
const packageFilter = packageIndex !== -1 ? args[packageIndex + 1] : null;

// Read config
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const packages = packageFilter
  ? config.packages.filter((p) => p.name === packageFilter)
  : config.packages;

if (packages.length === 0) {
  console.error(`Package '${packageFilter}' not found in config`);
  process.exit(1);
}

const irOutputBase = path.resolve(import.meta.dirname, "../ir-output");
const language = config.language === "python" ? "python" : "javascript";
const ecosystem = language;
const project = config.project || "langchain";

console.log("🔧 Building packages locally with full indexing...\n");

// Step 1: Run build-ir
console.log("📦 Step 1: Running build-ir...");
const buildCmd = packageFilter
  ? `pnpm build:ir --local --config ${configPath} --package ${packageFilter}`
  : `pnpm build:ir --local --config ${configPath}`;

try {
  execSync(buildCmd, { stdio: "inherit", cwd: path.resolve(import.meta.dirname, "..") });
} catch (error) {
  console.error(`Build failed: ${error}`);
  process.exit(1);
}

// Step 2: Process each built package
for (const pkg of packages) {
  const pkgName = pkg.name;
  const ecosystemPrefix = language === "python" ? "py" : "js";
  const packageId = `pkg_${ecosystemPrefix}_${pkgName.replace(/@/g, "").replace(/\//g, "_").replace(/-/g, "_")}`;

  console.log(`\n📋 Processing ${pkgName} (${packageId})...`);

  // Find the build directory
  const pkgOutputDir = path.join(irOutputBase, "packages", packageId);
  if (!fs.existsSync(pkgOutputDir)) {
    console.log(`   ⚠️  Package output not found at ${pkgOutputDir}, skipping`);
    continue;
  }

  // Find the buildId (subdirectory name) - use the newest one by modification time
  const buildIds = fs
    .readdirSync(pkgOutputDir)
    .filter((f) => fs.statSync(path.join(pkgOutputDir, f)).isDirectory())
    .sort((a, b) => {
      const aTime = fs.statSync(path.join(pkgOutputDir, a)).mtimeMs;
      const bTime = fs.statSync(path.join(pkgOutputDir, b)).mtimeMs;
      return bTime - aTime; // Newest first
    });

  if (buildIds.length === 0) {
    console.log(`   ⚠️  No build found for ${pkgName}, skipping`);
    continue;
  }

  const buildId = buildIds[0]; // Use the newest build
  const buildDir = path.join(pkgOutputDir, buildId);
  const symbolsPath = path.join(buildDir, "symbols.json");

  if (!fs.existsSync(symbolsPath)) {
    console.log(`   ⚠️  No symbols.json found, skipping`);
    continue;
  }

  // Read symbols
  const data = JSON.parse(fs.readFileSync(symbolsPath, "utf8"));
  const symbols = data.symbols || [];
  console.log(`   Found ${symbols.length} symbols`);

  // Step 2a: Copy to ir/packages/ (where IR server expects it)
  const irPkgDir = path.join(irOutputBase, "ir", "packages", packageId, buildId);
  fs.mkdirSync(irPkgDir, { recursive: true });

  // Copy all files and directories from build dir
  function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const child of fs.readdirSync(src)) {
        copyRecursive(path.join(src, child), path.join(dest, child));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  for (const file of fs.readdirSync(buildDir)) {
    const src = path.join(buildDir, file);
    const dest = path.join(irPkgDir, file);
    copyRecursive(src, dest);
  }
  console.log(`   ✓ Copied to ir/packages/`);

  // Step 2b: Generate catalog
  const catalogSymbols = symbols.filter((s) => {
    const isPublic = s.tags?.visibility === "public";
    const isTopLevel = ["class", "function", "interface", "module", "typeAlias", "enum"].includes(
      s.kind,
    );
    return isPublic && isTopLevel;
  });

  const catalogEntries = catalogSymbols.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    qualifiedName: s.qualifiedName,
    summary: s.docs?.summary?.substring(0, 200),
    signature: s.signature?.substring(0, 300),
  }));

  const catalogDir = path.join(irPkgDir, "catalog");
  fs.mkdirSync(catalogDir, { recursive: true });

  const catalogIndex = {
    packageId,
    symbolCount: symbols.length,
    shards: ["0"],
  };
  fs.writeFileSync(path.join(catalogDir, "index.json"), JSON.stringify(catalogIndex, null, 2));
  fs.writeFileSync(path.join(catalogDir, "0.json"), JSON.stringify(catalogEntries, null, 2));
  console.log(`   ✓ Generated catalog (${catalogEntries.length} entries)`);

  // Step 2c: Generate routing.json
  const slugs = {};
  for (const s of symbols) {
    if (s.tags?.visibility !== "public") continue;
    slugs[s.qualifiedName] = { id: s.id, kind: s.kind };
  }
  const routing = { packageId, slugs };
  fs.writeFileSync(path.join(irPkgDir, "routing.json"), JSON.stringify(routing, null, 2));
  console.log(`   ✓ Generated routing.json (${Object.keys(slugs).length} entries)`);

  // Step 2d: Create package pointer
  const pointerDir = path.join(irOutputBase, "pointers", "packages", ecosystem);
  fs.mkdirSync(pointerDir, { recursive: true });

  // Read package.json for metadata
  const pkgInfoPath = path.join(irPkgDir, "package.json");
  const pkgInfo = fs.existsSync(pkgInfoPath)
    ? JSON.parse(fs.readFileSync(pkgInfoPath, "utf8"))
    : {};

  const pointer = {
    packageId,
    packageName: pkgName,
    ecosystem,
    project,
    buildId,
    version: pkgInfo.version || "unknown",
    sha: pkgInfo.repo?.sha || "unknown",
    repo: config.repo,
    stats: { total: symbols.length },
  };

  fs.writeFileSync(path.join(pointerDir, `${pkgName}.json`), JSON.stringify(pointer, null, 2));
  console.log(`   ✓ Created package pointer`);

  // Step 2e: Update project index
  const indexPath = path.join(irOutputBase, "pointers", `index-${project}-${ecosystem}.json`);
  let index = { project, language: ecosystem, updatedAt: new Date().toISOString(), packages: {} };

  if (fs.existsSync(indexPath)) {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  }

  index.packages[pkgName] = {
    buildId,
    version: pointer.version,
    sha: pointer.sha,
  };
  index.updatedAt = new Date().toISOString();

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`   ✓ Updated project index`);
}

console.log("\n✅ Build complete! Restart the dev server to see changes.");
console.log("   pnpm dev");
