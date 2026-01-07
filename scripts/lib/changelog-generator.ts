/**
 * Changelog Generator Module
 *
 * Generates version changelogs with incremental and parallel support.
 */

import type {
  PackageChangelog,
  PackageVersionIndex,
  VersionDelta,
  VersionInfo,
  VersionStats,
  DiscoveredVersion,
  VersioningConfig,
  SymbolRecord,
  SymbolVersionInfo,
} from "@langchain/ir-schema";

import { computeVersionDelta, MinimalIR } from "./diff-engine.js";
import { fetchDeployedChangelog, DeployedChangelog } from "./changelog-fetcher.js";
import {
  discoverVersions,
  createDiscoveryOptions,
} from "./version-discovery.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ChangelogBuildResult {
  changelog: PackageChangelog;
  versions: PackageVersionIndex;
}

export interface IncrementalBuildOptions {
  /** Repository in owner/repo format */
  repo: string;

  /** Project identifier */
  project: string;

  /** Language */
  language: string;

  /** Package identifier */
  packageId: string;

  /** Package display name */
  packageName: string;

  /** Versioning configuration */
  config: VersioningConfig;

  /** GitHub token for API access */
  githubToken?: string;

  /** Function to extract minimal IR for a version */
  extractIR: (sha: string) => Promise<MinimalIR>;

  /** Force full rebuild */
  forceFullRebuild?: boolean;
}

// =============================================================================
// PARALLEL VERSION EXTRACTION
// =============================================================================

/**
 * Extract minimal IR for multiple versions in parallel.
 * Significantly faster than sequential extraction.
 *
 * @param versions - Versions to extract
 * @param extractIR - Function to extract IR for a single version
 * @param concurrency - Maximum parallel extractions (default: 4)
 * @returns Map of version to MinimalIR
 */
export async function extractVersionsParallel(
  versions: DiscoveredVersion[],
  extractIR: (sha: string) => Promise<MinimalIR>,
  concurrency = 4
): Promise<Map<string, MinimalIR>> {
  const results = new Map<string, MinimalIR>();

  // Process in batches to limit parallel extractions
  for (let i = 0; i < versions.length; i += concurrency) {
    const batch = versions.slice(i, i + concurrency);

    console.log(
      `Extracting batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(versions.length / concurrency)} ` +
        `(${batch.map((v) => v.version).join(", ")})...`
    );

    const batchResults = await Promise.all(
      batch.map(async (version) => {
        console.log(`  Extracting ${version.version} (${version.sha.slice(0, 7)})...`);
        const startTime = Date.now();
        const ir = await extractIR(version.sha);
        const elapsed = Date.now() - startTime;
        console.log(`  ✓ ${version.version} extracted in ${elapsed}ms`);
        return { version: version.version, ir };
      })
    );

    for (const { version, ir } of batchResults) {
      results.set(version, ir);
    }
  }

  return results;
}

// =============================================================================
// INCREMENTAL BUILD
// =============================================================================

/**
 * Build changelog incrementally by downloading existing changelog
 * and only processing new versions.
 *
 * @param options - Build options
 * @returns Changelog and version index
 */
export async function incrementalBuild(
  options: IncrementalBuildOptions
): Promise<ChangelogBuildResult> {
  const {
    repo,
    project,
    language,
    packageId,
    packageName,
    config,
    githubToken,
    extractIR,
    forceFullRebuild,
  } = options;

  // Step 1: Fetch existing deployed changelog (unless forcing full rebuild)
  let existing: DeployedChangelog | null = null;
  if (!forceFullRebuild) {
    existing = await fetchDeployedChangelog(project, language, packageId);
  } else {
    console.log("Force full rebuild - skipping existing changelog fetch");
  }

  // Step 2: Discover current versions from git tags
  const discoveryOptions = createDiscoveryOptions(config);
  const discoveredVersions = await discoverVersions(
    repo,
    config.tagPattern,
    discoveryOptions,
    githubToken
  );

  if (discoveredVersions.length === 0) {
    throw new Error(`No versions found for ${packageId} with pattern ${config.tagPattern}`);
  }

  // Step 3: If no existing changelog, do full build
  if (!existing) {
    console.log(
      `First build for ${packageId} - extracting all ${discoveredVersions.length} versions`
    );
    return fullChangelogBuild({
      packageId,
      packageName,
      versions: discoveredVersions,
      extractIR,
    });
  }

  // Step 4: Find versions not already in changelog
  const existingVersionSet = new Set(
    existing.changelog.history.map((h) => h.version)
  );
  const newVersions = discoveredVersions.filter(
    (v) => !existingVersionSet.has(v.version)
  );

  if (newVersions.length === 0) {
    console.log(`No new versions for ${packageId} - using existing changelog`);
    return existing;
  }

  console.log(
    `Found ${newVersions.length} new version(s) for ${packageId}: ` +
      newVersions.map((v) => v.version).join(", ")
  );

  // Step 5: Only extract and diff new versions (using parallel extraction)
  const newIRs = await extractVersionsParallel(newVersions, extractIR);

  // Get the most recent existing version as diff base
  const mostRecentExisting = existing.changelog.history[0];

  // We need the IR of the most recent existing version to diff against
  // If the new versions are consecutive, we diff each against its predecessor
  const newDeltas: VersionDelta[] = [];

  // Sort new versions oldest to newest for diffing
  const sortedNewVersions = [...newVersions].reverse();

  for (let i = 0; i < sortedNewVersions.length; i++) {
    const newerVersion = sortedNewVersions[i];
    const newerIR = newIRs.get(newerVersion.version)!;

    let olderIR: MinimalIR;
    if (i === 0) {
      // First new version diffs against the most recent existing
      // We need to extract or reconstruct the IR from the existing changelog
      // For now, we'll need the previous version's IR
      console.log(
        `  Diffing ${newerVersion.version} against existing latest ${mostRecentExisting.version}`
      );
      olderIR = await extractIR(mostRecentExisting.sha);
    } else {
      // Subsequent versions diff against the previous new version
      const olderVersion = sortedNewVersions[i - 1];
      console.log(`  Diffing ${newerVersion.version} against ${olderVersion.version}`);
      olderIR = newIRs.get(olderVersion.version)!;
    }

    const delta = computeVersionDelta(olderIR, newerIR);
    newDeltas.push(delta);
  }

  // Step 6: Merge new deltas into existing changelog
  // New deltas are in oldest-to-newest order, reverse for history
  const mergedChangelog: PackageChangelog = {
    ...existing.changelog,
    generatedAt: new Date().toISOString(),
    history: [...newDeltas.reverse(), ...existing.changelog.history],
  };

  // Update version index
  const latestVersion = discoveredVersions[0]; // Already sorted newest first
  const mergedVersions: PackageVersionIndex = {
    ...existing.versions,
    latest: {
      version: latestVersion.version,
      sha: latestVersion.sha,
      tag: latestVersion.tag,
      releaseDate: latestVersion.releaseDate,
      extractedAt: new Date().toISOString(),
      stats: computeVersionStats(newDeltas[0]),
    },
    versions: [
      ...newVersions.map((v) => ({
        version: v.version,
        sha: v.sha,
        tag: v.tag,
        releaseDate: v.releaseDate,
        stats: computeVersionStats(newDeltas.find((d) => d.version === v.version)!),
      })),
      ...existing.versions.versions,
    ],
  };

  console.log(
    `✓ Incremental build complete: added ${newVersions.length} version(s)`
  );

  return { changelog: mergedChangelog, versions: mergedVersions };
}

// =============================================================================
// FULL BUILD
// =============================================================================

interface FullBuildOptions {
  packageId: string;
  packageName: string;
  versions: DiscoveredVersion[];
  extractIR: (sha: string) => Promise<MinimalIR>;
}

/**
 * Build a complete changelog from scratch.
 *
 * @param options - Build options
 * @returns Changelog and version index
 */
export async function fullChangelogBuild(
  options: FullBuildOptions
): Promise<ChangelogBuildResult> {
  const { packageId, packageName, versions, extractIR } = options;

  console.log(`Full build for ${packageId} - extracting ${versions.length} versions...`);

  // Extract all versions in parallel
  const allIRs = await extractVersionsParallel(versions, extractIR);

  // Compute deltas between consecutive versions
  // Versions are sorted newest first, so we iterate oldest to newest
  const sortedVersions = [...versions].reverse();
  const deltas: VersionDelta[] = [];

  for (let i = 0; i < sortedVersions.length; i++) {
    const newerVersion = sortedVersions[i];
    const newerIR = allIRs.get(newerVersion.version)!;

    if (i === 0) {
      // First version - create an "added" delta for all symbols
      console.log(`  ${newerVersion.version}: Initial version (all symbols added)`);
      deltas.push(createInitialDelta(newerIR));
    } else {
      const olderVersion = sortedVersions[i - 1];
      const olderIR = allIRs.get(olderVersion.version)!;
      console.log(`  Diffing ${newerVersion.version} against ${olderVersion.version}`);
      deltas.push(computeVersionDelta(olderIR, newerIR));
    }
  }

  // Reverse to get newest first for history
  const history = deltas.reverse();

  const changelog: PackageChangelog = {
    packageId,
    packageName,
    generatedAt: new Date().toISOString(),
    history,
  };

  const latestVersion = versions[0];
  const versionIndex: PackageVersionIndex = {
    packageId,
    packageName,
    latest: {
      version: latestVersion.version,
      sha: latestVersion.sha,
      tag: latestVersion.tag,
      releaseDate: latestVersion.releaseDate,
      extractedAt: new Date().toISOString(),
      stats: computeVersionStats(history[0]),
    },
    versions: versions.map((v) => ({
      version: v.version,
      sha: v.sha,
      tag: v.tag,
      releaseDate: v.releaseDate,
      stats: computeVersionStats(history.find((h) => h.version === v.version)!),
    })),
  };

  console.log(`✓ Full build complete: ${versions.length} versions processed`);

  return { changelog, versions: versionIndex };
}

// =============================================================================
// LATEST IR ANNOTATION
// =============================================================================

/**
 * Add version information to symbols in the latest IR.
 *
 * @param symbols - Latest symbol records
 * @param changelog - Package changelog
 */
export function annotateLatestIR(
  symbols: SymbolRecord[],
  changelog: PackageChangelog
): void {
  // Build maps for lookup
  const introductionMap = new Map<string, string>();
  const modificationMap = new Map<string, string[]>();
  const deprecationMap = new Map<
    string,
    { since: string; message?: string; replacement?: string }
  >();

  // Process changelog from oldest to newest
  const sortedHistory = [...changelog.history].reverse();

  for (const delta of sortedHistory) {
    // Track introductions
    for (const added of delta.added) {
      if (!introductionMap.has(added.qualifiedName)) {
        introductionMap.set(added.qualifiedName, delta.version);
      }
    }

    // Track modifications
    for (const modified of delta.modified) {
      const existing = modificationMap.get(modified.qualifiedName) ?? [];
      existing.push(delta.version);
      modificationMap.set(modified.qualifiedName, existing);
    }

    // Track deprecations
    for (const deprecated of delta.deprecated) {
      if (!deprecationMap.has(deprecated.qualifiedName)) {
        deprecationMap.set(deprecated.qualifiedName, {
          since: delta.version,
          message: deprecated.message,
          replacement: deprecated.replacement?.qualifiedName,
        });
      }
    }
  }

  // Apply to symbols
  const oldestVersion =
    sortedHistory[0]?.version ?? changelog.history[0]?.version ?? "unknown";

  for (const symbol of symbols) {
    const versionInfo: SymbolVersionInfo = {
      since: introductionMap.get(symbol.qualifiedName) ?? oldestVersion,
    };

    const modifications = modificationMap.get(symbol.qualifiedName);
    if (modifications && modifications.length > 0) {
      versionInfo.modifiedIn = modifications;
    }

    const deprecation = deprecationMap.get(symbol.qualifiedName);
    if (deprecation) {
      versionInfo.deprecation = deprecation;
    }

    symbol.versionInfo = versionInfo;
  }

  console.log(
    `Annotated ${symbols.length} symbols with version info ` +
      `(${introductionMap.size} since, ${deprecationMap.size} deprecated)`
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create an initial delta for the first version (all symbols are "added").
 */
function createInitialDelta(ir: MinimalIR): VersionDelta {
  const { createSnapshot } = require("./snapshot.js");

  return {
    version: ir.version,
    previousVersion: null,
    sha: ir.sha,
    releaseDate: ir.releaseDate,
    added: ir.symbols.map((s: SymbolRecord) => ({
      qualifiedName: s.qualifiedName,
      snapshot: createSnapshot(s),
    })),
    removed: [],
    modified: [],
    deprecated: [],
  };
}

/**
 * Compute statistics for a version delta.
 */
function computeVersionStats(delta: VersionDelta): VersionStats {
  return {
    added: delta.added.length,
    removed: delta.removed.length,
    modified: delta.modified.length,
    breaking: delta.modified.filter((m) =>
      m.changes.some((c) => c.breaking)
    ).length,
    totalSymbols: 0, // Will be filled in later with actual count
  };
}

