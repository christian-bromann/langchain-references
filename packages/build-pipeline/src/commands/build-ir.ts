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
  Package,
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
} from "@langchain/ir-schema";
import {
  TypeScriptExtractor,
  TypeDocTransformer,
  createConfig,
  type TypeDocProject
} from "@langchain/extractor-typescript";

import {
  fetchTarball,
  getLatestSha,
  getCacheBaseDir,
  type FetchResult,
} from "../tarball.js";
import { uploadIR } from "../upload.js";
import { updatePointers } from "../pointers.js";
import { checkForUpdates, type UpdateCheckResult } from "./check-updates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Available projects */
const PROJECTS = ["langchain", "langgraph", "deepagent"] as const;

/** Available languages */
const LANGUAGES = ["python", "typescript"] as const;

/**
 * Find config files matching the given project and/or language filters.
 */
async function findConfigFiles(
  projectFilter?: string,
  languageFilter?: string
): Promise<string[]> {
  const configDir = path.resolve(__dirname, "../../../../configs");
  const files = await fs.readdir(configDir);

  const configs: string[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "config-schema.json") continue;

    // Parse project and language from filename (e.g., "langchain-python.json")
    const match = file.match(/^(\w+)-(python|typescript)\.json$/);
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
}

/**
 * Build configuration loaded from JSON file.
 */
interface BuildConfig {
  /** Project identifier (langchain, langgraph, deepagent) */
  project?: string;
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
    "../../../../packages/extractor-python/src"
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
  packageRepoPath?: string
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
  const rawJson = await extractor.extractToJson() as TypeDocProject;

  // Transform to IR format
  // TypeDocTransformer expects the raw JSON object from extractToJson
  const transformer = new TypeDocTransformer(
    rawJson,
    packageName,
    repo,
    sha,
    sourcePathPrefix,
    packagePath,
    packageRepoPath
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
 * Run a command and wait for completion.
 */
interface RunCommandOptions {
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Run a shell command and wait for completion.
 * Used for running the Python extractor.
 */
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
    const pkgOutputPath = path.join(irOutputPath, "packages", normalizePackageId(pkgConfig.name, config.language));

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
        packageId: normalizePackageId(pkgConfig.name, config.language),
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
    project: config.project || "langchain",
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
function normalizePackageId(name: string, language: "python" | "typescript"): string {
  const ecosystem = language === "python" ? "py" : "js";
  const normalized = name
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_");
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
  language: string
): Promise<CachedProjectVersions | null> {
  const versionsFile = path.resolve(
    __dirname,
    `../../../../configs/${project}-${language}-versions.json`
  );

  try {
    const content = await fs.readFile(versionsFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get the package path for a specific version, handling pathOverrides.
 */
function getPackagePathForVersion(
  pkgConfig: PackageConfig,
  version: string
): string {
  // Access pathOverrides from the versioning config (may not be in types yet)
  const pathOverrides = (pkgConfig.versioning as Record<string, unknown> | undefined)?.pathOverrides as Record<string, string> | undefined;
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
  cacheDir: string
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

  // Fetch tarball for this SHA
  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchTarball({
      repo: config.repo,
      sha,
      output: cacheDir,
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
      await extractPython(packagePath, pkgConfig.name, symbolsPath, config.repo, sha);
    } else {
      await extractTypeScript(
        packagePath,
        pkgConfig.name,
        symbolsPath,
        config.repo,
        sha,
        pkgConfig.entryPoints,
        fetchResult.extractedPath,
        versionPath  // Package's relative path in the repo
      );
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
  versions: CachedVersionEntry[] // newest first
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
  const tmpMatch = sourcePath.match(/(?:^|\/|\.\.\/)tmp\/.*?\/extracted\/(?:libs\/)?([^/]+)\/(.+)$/);
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
      .map((m): MemberSnapshot => ({
        name: m.name,
        kind: m.kind,
        signature: m.name,
        visibility: m.visibility || "public",
      }));
  }

  if (symbol.params && symbol.params.length > 0) {
    snapshot.params = symbol.params.map((p): ParamSnapshot => ({
      name: p.name,
      type: p.type,
      required: p.required !== false,
      default: p.default,
    }));
  }

  if (symbol.returns?.type) {
    snapshot.returnType = symbol.returns.type;
  }

  if (symbol.typeParams && symbol.typeParams.length > 0) {
    snapshot.typeParams = symbol.typeParams.map((tp): TypeParamSnapshot => ({
      name: tp.name,
      constraint: tp.constraint,
      default: tp.default,
    }));
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
  versions: CachedVersionEntry[]
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

    const breakingCount = modified.reduce(
      (count, m) => count + m.changes.filter((c) => c.breaking).length,
      0
    ) + removed.length;

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
 * Build version history for packages using cached version data.
 */
async function buildVersionHistory(
  config: BuildConfig,
  fetchResult: FetchResult,
  irOutputPath: string,
  forceFullRebuild?: boolean
): Promise<void> {
  const cachedVersions = await loadCachedVersions(
    config.project || "langchain",
    config.language === "python" ? "python" : "typescript"
  );

  if (!cachedVersions) {
    console.log(`   ⚠️  No cached versions found. Run 'pnpm sync-versions' first.`);
    return;
  }

  console.log(`   Using cached versions from ${cachedVersions.lastSynced.split("T")[0]}`);

  const cacheDir = getCacheBaseDir();

  for (const pkgConfig of config.packages) {
    if (!pkgConfig.versioning?.tagPattern) {
      continue;
    }

    if (pkgConfig.versioning.enabled === false) {
      continue;
    }

    const cachedPkg = cachedVersions.packages.find(
      (p) => p.packageName === pkgConfig.name
    );

    if (!cachedPkg || cachedPkg.versions.length === 0) {
      console.log(`   ⚠️  ${pkgConfig.name}: No cached versions. Run 'pnpm sync-versions'.`);
      continue;
    }

    const minVersion = pkgConfig.versioning.minVersion;
    const versions = minVersion
      ? cachedPkg.versions.filter((v) => semver.gte(v.version, minVersion))
      : cachedPkg.versions;

    if (versions.length === 0) {
      console.log(`   ⚠️  ${pkgConfig.name}: No versions >= ${minVersion}. Skipping.`);
      continue;
    }

    console.log(`\n   📦 ${pkgConfig.name}: Processing ${versions.length} version(s)${minVersion ? ` (minVersion: ${minVersion})` : ""}`);

    const packageId = normalizePackageId(pkgConfig.name, config.language);
    const pkgOutputDir = path.join(irOutputPath, "packages", packageId);
    const latestSymbolsPath = path.join(pkgOutputDir, "symbols.json");

    // Check if latest extraction succeeded before trying to build version history
    try {
      await fs.access(latestSymbolsPath);
    } catch {
      console.log(`      ⚠️ Skipping (latest extraction failed or package path not found)`);
      continue;
    }

    const versionSymbols = new Map<string, Map<string, SymbolRecord>>();

    console.log(`      ✓ ${versions[0].version} (latest, already extracted)`);
    try {
      const latestSymbols = await loadSymbolNames(latestSymbolsPath);
      versionSymbols.set(versions[0].version, latestSymbols);
    } catch (error) {
      console.warn(`      ⚠️ Failed to load latest symbols: ${error}`);
      continue;
    }

    for (let i = 1; i < versions.length; i++) {
      const v = versions[i];
      const result = await extractHistoricalVersion(
        config,
        pkgConfig,
        v.sha,
        v.version,
        cacheDir
      );

      if (result) {
        console.log(`      ✓ ${v.version} (${result.symbolCount} symbols)`);
        const symbols = await loadSymbolNames(result.symbolsPath);
        versionSymbols.set(v.version, symbols);
      }
    }

    const introductions = computeSymbolIntroductions(versionSymbols, versions);
    const { deltas, versionStats } = computeVersionDeltas(versionSymbols, versions);

    try {
      const symbolsContent = await fs.readFile(latestSymbolsPath, "utf-8");
      const symbolsData = JSON.parse(symbolsContent);

      const modifiedInMap = new Map<string, string[]>();
      for (const delta of deltas) {
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

    const changelog: PackageChangelog = {
      packageId,
      packageName: pkgConfig.displayName || pkgConfig.name,
      generatedAt: new Date().toISOString(),
      history: deltas,
    };

    await fs.writeFile(
      path.join(pkgOutputDir, "changelog.json"),
      JSON.stringify(changelog, null, 2)
    );

    const totalAdded = deltas.reduce((sum, d) => sum + d.added.length, 0);
    const totalRemoved = deltas.reduce((sum, d) => sum + d.removed.length, 0);
    const totalModified = deltas.reduce((sum, d) => sum + d.modified.length, 0);
    console.log(`      ✓ Generated changelog: +${totalAdded} added, -${totalRemoved} removed, ~${totalModified} modified`);

    const latestStats = versionStats.get(versions[0].version) || {
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
        stats: versionStats.get(v.version) || {
          added: 0,
          removed: 0,
          modified: 0,
          breaking: 0,
          totalSymbols: versionSymbols.get(v.version)?.size ?? 0,
        },
      })),
    };

    await fs.writeFile(
      path.join(pkgOutputDir, "versions.json"),
      JSON.stringify(versionsIndex, null, 2)
    );
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
  }
): Promise<{ buildId: string; success: boolean; skipped?: boolean }> {
  console.log(`\n📄 Loading config: ${configPath}`);

  const configContent = await fs.readFile(configPath, "utf-8");
  const config: BuildConfig = JSON.parse(configContent);

  // Check if update is needed (unless --force is specified)
  // We can check updates even in local mode - we just need read access to blob storage
  const hasBlobAccess = process.env.BLOB_BASE_URL || process.env.BLOB_URL || process.env.BLOB_READ_WRITE_TOKEN;

  if (!opts.force && hasBlobAccess) {
    console.log(`\n🔍 Checking for updates...`);
    try {
      const updateCheck = await checkForUpdates(configPath, opts.verbose);

      if (!updateCheck.needsUpdate) {
        console.log(`\n⏭️  Skipping build: ${updateCheck.reason}`);
        if (opts.verbose && updateCheck.source.latestReleaseDate && updateCheck.source.buildCreatedAt) {
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

  console.log(`   Project: ${config.project || "langchain"}`);
  console.log(`   Language: ${config.language}`);
  console.log(`   Repository: ${config.repo}`);
  console.log(`   Packages: ${config.packages.map((p) => p.name).join(", ")}`);

  const sha = opts.sha || (await getLatestSha(config.repo));
  console.log(`\n📌 Target SHA: ${sha.substring(0, 7)}`);

  const buildId = generateBuildId(config, sha, {
    python: "0.1.0",
    typescript: "0.1.0",
  });
  console.log(`🔑 Build ID: ${buildId}`);

  const irOutputPath = path.resolve(opts.output, buildId);
  await fs.mkdir(irOutputPath, { recursive: true });
  await fs.mkdir(path.join(irOutputPath, "packages"), { recursive: true });

  const cacheDir = opts.cache || getCacheBaseDir();
  console.log(`\n📥 Fetching source to: ${cacheDir}`);

  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchTarball({
      repo: config.repo,
      sha,
      output: cacheDir,
    });
  } catch (error) {
    console.error(`\n❌ Failed to fetch source: ${error}`);
    return { buildId, success: false };
  }

  console.log("\n🔍 Extracting APIs...");

  const failedPackages = new Set<string>();

  for (const pkgConfig of config.packages) {
    const packagePath = path.join(fetchResult.extractedPath, pkgConfig.path);
    const pkgOutputDir = path.join(irOutputPath, "packages", normalizePackageId(pkgConfig.name, config.language));
    await fs.mkdir(pkgOutputDir, { recursive: true });
    const outputPath = path.join(pkgOutputDir, "symbols.json");

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
        await extractPython(packagePath, pkgConfig.name, outputPath, config.repo, sha);
      } else {
        await extractTypeScript(
          packagePath,
          pkgConfig.name,
          outputPath,
          config.repo,
          sha,
          pkgConfig.entryPoints,
          fetchResult.extractedPath,
          pkgConfig.path  // Package's relative path in the repo
        );
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

  console.log("\n📋 Creating manifest...");
  const manifest = await createManifest(buildId, config, fetchResult, irOutputPath);
  const manifestPath = path.join(irOutputPath, "reference.manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`   ✓ ${manifest.packages.length} packages in manifest`);

  if (opts.withVersions) {
    console.log("\n📜 Building version history...");
    await buildVersionHistory(config, fetchResult, irOutputPath, opts.fullRebuild);
  }

  // Clean up main extracted repository to save disk space in CI
  if (process.env.CI) {
    console.log("\n🧹 Cleaning up extracted sources...");
    await cleanupExtractedRepo(fetchResult.extractedPath);
  }

  if (!opts.skipUpload) {
    console.log("\n☁️  Uploading to Vercel Blob...");
    await uploadIR({ buildId, irOutputPath, dryRun: false });
  } else {
    console.log("\n⏭️  Skipping upload (--skip-upload)");
  }

  if (!opts.skipPointers) {
    console.log("\n🔄 Updating build pointers...");
    await updatePointers({ buildId, manifest, dryRun: false });
  } else {
    console.log("\n⏭️  Skipping pointer update (--skip-pointers)");
  }

  const latestLinkName = `latest-${config.project || "langchain"}-${config.language === "python" ? "python" : "javascript"}`;
  const latestLinkPath = path.resolve(opts.output, latestLinkName);
  try {
    await fs.unlink(latestLinkPath).catch(() => {});
    await fs.symlink(buildId, latestLinkPath);
    console.log(`\n🔗 Created symlink: ${latestLinkName} -> ${buildId}`);
  } catch (error) {
    console.warn(`   ⚠️  Failed to create symlink: ${error}`);
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
    .option("--language <lang>", `Build all configs for a language (${LANGUAGES.join(", ")})`)
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
  console.log(`   Total: ${results.length} | Built: ${totalSuccess} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Build failed:", error);
  process.exit(1);
});

