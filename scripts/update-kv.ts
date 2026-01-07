#!/usr/bin/env tsx
/**
 * Update Pointers - Updates Vercel Blob pointers for the latest build
 *
 * This script updates pointer files in Vercel Blob:
 * - pointers/latest-build.json - Global latest build pointer
 * - pointers/latest-python.json - Latest Python build pointer
 * - pointers/latest-javascript.json - Latest JavaScript build pointer
 * - pointers/builds/{buildId}.json - Build metadata
 * - pointers/packages/{ecosystem}/{packageName}.json - Per-package latest
 * - pointers/build-history.json - Recent build history
 */

import { put } from "@vercel/blob";
import type { Manifest } from "@langchain/ir-schema";

const POINTERS_PATH = "pointers";

export interface PointerUpdateOptions {
  buildId: string;
  manifest: Manifest;
  dryRun?: boolean;
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
  const { buildId, manifest, dryRun = false } = options;

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

// Keep old function name as alias for backwards compatibility
export const updateKV = updatePointers;

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: update-kv.ts <buildId> <manifestPath>");
    console.error("");
    console.error("Arguments:");
    console.error("  buildId       The build ID to update pointers for");
    console.error("  manifestPath  Path to the reference.manifest.json file");
    process.exit(1);
  }

  const [buildId, manifestPath] = args;
  
  // Load manifest
  const fs = await import("fs/promises");
  const manifestContent = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent);
  
  console.log(`\n🔧 Updating pointers for build: ${buildId}`);
  console.log(`   Manifest: ${manifestPath}`);
  
  await updatePointers({
    buildId,
    manifest,
    dryRun: false,
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("\n❌ Pointer update failed:", error);
    process.exit(1);
  });
}

