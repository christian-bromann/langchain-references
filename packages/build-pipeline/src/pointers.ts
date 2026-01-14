/**
 * Pointer Management
 *
 * Manages build pointers in Vercel Blob for build tracking and discovery.
 * Handles latest build pointers, build history, and package version tracking.
 */

import { put } from "@vercel/blob";
import type { Manifest } from "@langchain/ir-schema";

const POINTERS_PATH = "pointers";

export interface PointerUpdateOptions {
  buildId: string;
  manifest: Manifest | null;
  dryRun?: boolean;
  /** Enable package-level pointer update (new structure) */
  packageLevel?: boolean;
  /** Package pointer data for package-level updates */
  packagePointer?: PackagePointerData;
}

/**
 * Package pointer data for package-level builds.
 * This is the new pointer structure that allows independent package updates.
 */
export interface PackagePointerData {
  packageId: string;
  packageName: string;
  ecosystem: "python" | "javascript";
  project: string;
  buildId: string;
  version: string;
  sha: string;
  repo: string;
  stats: {
    total: number;
    classes?: number;
    functions?: number;
    types?: number;
  };
}

/**
 * Package pointer stored in blob storage.
 * Path: pointers/packages/{ecosystem}/{packageName}.json
 */
export interface PackagePointer {
  buildId: string;
  version: string;
  sha: string;
  repo: string;
  updatedAt: string;
  stats: {
    total: number;
    classes?: number;
    functions?: number;
    types?: number;
  };
}

/**
 * Project package index - aggregates all package pointers for a project/language.
 * Path: pointers/index-{project}-{language}.json
 */
export interface ProjectPackageIndex {
  project: string;
  language: "python" | "javascript";
  updatedAt: string;
  packages: Record<string, {
    buildId: string;
    version: string;
    sha: string;
  }>;
}

export interface BuildMetadata {
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
    language: "python" | "typescript";
    version: string;
  }>;
  status: "complete" | "failed";
  error?: string;
}

export interface LatestPointer {
  buildId: string;
  version: string;
  updatedAt: string;
}

export interface LatestBuildPointer {
  buildId: string;
  updatedAt: string;
  packages: number;
}

export interface BuildHistory {
  builds: string[];
  updatedAt: string;
}

/**
 * Upload a JSON pointer file to Vercel Blob
 */
async function uploadPointer(path: string, data: unknown, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`   [dry-run] Would upload ${path}`);
    return;
  }

  await put(path, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 60, // 1 minute cache for pointers
  });
}

/**
 * Fetch a pointer file from Vercel Blob
 */
async function fetchPointer<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(
      `${process.env.BLOB_URL || ""}/${path}`,
      { cache: "no-store" }
    );
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Update all pointers for a build using Vercel Blob.
 */
export async function updatePointers(options: PointerUpdateOptions): Promise<void> {
  const { buildId, manifest, dryRun = false, packageLevel = false, packagePointer } = options;

  // Use package-level pointer update for single package builds
  if (packageLevel && packagePointer) {
    return updatePackagePointer(packagePointer, dryRun);
  }

  if (!manifest) {
    throw new Error("manifest is required for project-level pointer updates");
  }

  console.log(`\n🔗 Updating Blob pointers for build ${buildId}`);
  if (dryRun) {
    console.log("   (dry-run mode - no actual updates)\n");
  }

  const now = new Date().toISOString();

  // 1. Store build metadata
  const buildMetadata: BuildMetadata = {
    buildId,
    createdAt: manifest.build.createdAt,
    irVersion: manifest.irVersion,
    sources: manifest.sources.map((s) => ({
      repo: s.repo,
      sha: s.sha,
    })),
    packages: manifest.packages.map((p) => ({
      packageId: p.packageId,
      displayName: p.displayName,
      language: p.language,
      version: p.version,
    })),
    status: "complete",
  };

  await uploadPointer(`${POINTERS_PATH}/builds/${buildId}.json`, buildMetadata, dryRun);
  console.log(`   ✓ Uploaded builds/${buildId}.json`);

  // 2. Update per-package latest pointers
  for (const pkg of manifest.packages) {
    const ecosystem = pkg.language === "python" ? "python" : "javascript";
    const pointer: LatestPointer = {
      buildId,
      version: pkg.version,
      updatedAt: now,
    };

    const path = `${POINTERS_PATH}/packages/${ecosystem}/${pkg.publishedName}.json`;
    await uploadPointer(path, pointer, dryRun);
    console.log(`   ✓ Uploaded packages/${ecosystem}/${pkg.publishedName}.json → ${pkg.version}`);
  }

  // 3. Update per-project + language latest pointers
  const projectId = manifest.project || "langchain";
  const pythonPackages = manifest.packages.filter((p) => p.language === "python");
  const jsPackages = manifest.packages.filter((p) => p.language === "typescript");

  if (pythonPackages.length > 0) {
    await uploadPointer(`${POINTERS_PATH}/latest-${projectId}-python.json`, { buildId, updatedAt: now }, dryRun);
    console.log(`   ✓ Uploaded latest-${projectId}-python.json`);
  }

  if (jsPackages.length > 0) {
    await uploadPointer(`${POINTERS_PATH}/latest-${projectId}-javascript.json`, { buildId, updatedAt: now }, dryRun);
    console.log(`   ✓ Uploaded latest-${projectId}-javascript.json`);
  }

  // 4. Update global latest pointer
  const globalPointer: LatestBuildPointer = {
    buildId,
    updatedAt: now,
    packages: manifest.packages.length,
  };

  await uploadPointer(`${POINTERS_PATH}/latest-build.json`, globalPointer, dryRun);
  console.log(`   ✓ Uploaded latest-build.json`);

  // 5. Update build history (keep last 10 builds)
  if (!dryRun) {
    const existingHistory = await fetchPointer<BuildHistory>(`${POINTERS_PATH}/build-history.json`);
    const builds = existingHistory?.builds || [];

    // Add new build at the front, keep only last 10
    const updatedBuilds = [buildId, ...builds.filter((b) => b !== buildId)].slice(0, 10);

    await uploadPointer(`${POINTERS_PATH}/build-history.json`, {
      builds: updatedBuilds,
      updatedAt: now,
    }, dryRun);
    console.log(`   ✓ Uploaded build-history.json`);
  }

  console.log(`\n✅ Pointer update complete!`);
}

/**
 * Get the latest build ID from Blob.
 */
export async function getLatestBuildId(): Promise<string | null> {
  const pointer = await fetchPointer<LatestBuildPointer>(`${POINTERS_PATH}/latest-build.json`);
  return pointer?.buildId || null;
}

/**
 * Get build metadata from Blob.
 */
export async function getBuildMetadata(buildId: string): Promise<BuildMetadata | null> {
  return fetchPointer<BuildMetadata>(`${POINTERS_PATH}/builds/${buildId}.json`);
}

/**
 * Get latest version for a package from Blob.
 */
export async function getLatestPackageVersion(
  ecosystem: "python" | "javascript",
  packageName: string
): Promise<LatestPointer | null> {
  return fetchPointer<LatestPointer>(`${POINTERS_PATH}/packages/${ecosystem}/${packageName}.json`);
}

/**
 * Get build history from Blob.
 */
export async function getBuildHistory(limit = 10): Promise<string[]> {
  const history = await fetchPointer<BuildHistory>(`${POINTERS_PATH}/build-history.json`);
  return history?.builds.slice(0, limit) || [];
}

/**
 * Mark a build as failed in Blob.
 */
export async function markBuildFailed(
  buildId: string,
  error: string
): Promise<void> {
  const existing = await getBuildMetadata(buildId);
  if (existing) {
    await uploadPointer(`${POINTERS_PATH}/builds/${buildId}.json`, {
      ...existing,
      status: "failed",
      error,
    }, false);
  }
}

/**
 * Update pointer for a single package (package-level builds).
 * This creates/updates the package-specific pointer file.
 */
async function updatePackagePointer(data: PackagePointerData, dryRun: boolean): Promise<void> {
  const { packageId, packageName, ecosystem, project, buildId, version, sha, repo, stats } = data;

  console.log(`\n🔗 Updating package pointer for ${packageName}`);
  if (dryRun) {
    console.log("   (dry-run mode - no actual updates)\n");
  }

  const now = new Date().toISOString();

  // Create package pointer
  const pointer: PackagePointer = {
    buildId,
    version,
    sha,
    repo,
    updatedAt: now,
    stats,
  };

  // Upload package pointer
  const pointerPath = `${POINTERS_PATH}/packages/${ecosystem}/${packageName}.json`;
  await uploadPointer(pointerPath, pointer, dryRun);
  console.log(`   ✓ Uploaded packages/${ecosystem}/${packageName}.json → ${version}`);

  // Update the project package index
  await updateProjectPackageIndex(project, ecosystem, packageName, { buildId, version, sha }, dryRun);

  console.log(`\n✅ Package pointer update complete!`);
}

/**
 * Update the project package index with new package info.
 * This merges the new package info with existing packages in the index.
 */
async function updateProjectPackageIndex(
  project: string,
  language: "python" | "javascript",
  packageName: string,
  packageInfo: { buildId: string; version: string; sha: string },
  dryRun: boolean
): Promise<void> {
  const indexPath = `${POINTERS_PATH}/index-${project}-${language}.json`;

  // Fetch existing index
  let existingIndex: ProjectPackageIndex | null = null;
  if (!dryRun) {
    existingIndex = await fetchPointer<ProjectPackageIndex>(indexPath);
  }

  const now = new Date().toISOString();

  // Create or update index
  const updatedIndex: ProjectPackageIndex = {
    project,
    language,
    updatedAt: now,
    packages: {
      ...(existingIndex?.packages || {}),
      [packageName]: packageInfo,
    },
  };

  await uploadPointer(indexPath, updatedIndex, dryRun);
  console.log(`   ✓ Updated index-${project}-${language}.json (${Object.keys(updatedIndex.packages).length} packages)`);
}

/**
 * Get the package pointer for a specific package.
 */
export async function getPackagePointer(
  ecosystem: "python" | "javascript",
  packageName: string
): Promise<PackagePointer | null> {
  return fetchPointer<PackagePointer>(`${POINTERS_PATH}/packages/${ecosystem}/${packageName}.json`);
}

/**
 * Get the project package index.
 */
export async function getProjectPackageIndex(
  project: string,
  language: "python" | "javascript"
): Promise<ProjectPackageIndex | null> {
  return fetchPointer<ProjectPackageIndex>(`${POINTERS_PATH}/index-${project}-${language}.json`);
}

/**
 * Regenerate the project package index from all individual package pointers.
 * This is used after batch updates to ensure the index is complete.
 */
export async function regenerateProjectPackageIndex(
  project: string,
  language: "python" | "javascript",
  packageNames: string[],
  dryRun: boolean = false
): Promise<void> {
  const ecosystem = language;
  const now = new Date().toISOString();

  const packages: Record<string, { buildId: string; version: string; sha: string }> = {};

  // Fetch each package pointer
  for (const packageName of packageNames) {
    const pointer = await getPackagePointer(ecosystem, packageName);
    if (pointer) {
      packages[packageName] = {
        buildId: pointer.buildId,
        version: pointer.version,
        sha: pointer.sha,
      };
    }
  }

  const index: ProjectPackageIndex = {
    project,
    language,
    updatedAt: now,
    packages,
  };

  const indexPath = `${POINTERS_PATH}/index-${project}-${language}.json`;
  await uploadPointer(indexPath, index, dryRun);
  console.log(`   ✓ Regenerated index-${project}-${language}.json (${Object.keys(packages).length} packages)`);
}
