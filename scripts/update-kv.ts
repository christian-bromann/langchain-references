#!/usr/bin/env tsx
/**
 * Update KV - Updates Vercel KV pointers for the latest build
 *
 * This script updates:
 * - latest:build - Global latest build pointer
 * - latest:python:{package} - Per-package latest for Python
 * - latest:javascript:{package} - Per-package latest for JavaScript
 * - build:{buildId} - Build metadata
 */

import { kv } from "@vercel/kv";
import type { Manifest } from "@langchain/ir-schema";

export interface KVUpdateOptions {
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
}

export interface LatestPointer {
  buildId: string;
  version: string;
  updatedAt: string;
}

/**
 * Update all KV pointers for a build.
 */
export async function updateKV(options: KVUpdateOptions): Promise<void> {
  const { buildId, manifest, dryRun = false } = options;

  console.log(`\n🔗 Updating KV pointers for build ${buildId}`);
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

  if (dryRun) {
    console.log(`   [dry-run] Would set build:${buildId}`);
  } else {
    await kv.set(`build:${buildId}`, buildMetadata);
    console.log(`   ✓ Set build:${buildId}`);
  }

  // 2. Update per-package latest pointers
  for (const pkg of manifest.packages) {
    const ecosystem = pkg.language === "python" ? "python" : "javascript";
    const key = `latest:${ecosystem}:${pkg.publishedName}`;

    const pointer: LatestPointer = {
      buildId,
      version: pkg.version,
      updatedAt: now,
    };

    if (dryRun) {
      console.log(`   [dry-run] Would set ${key}`);
    } else {
      await kv.set(key, pointer);
      console.log(`   ✓ Set ${key} → ${pkg.version}`);
    }
  }

  // 3. Update global latest pointer
  const globalPointer = {
    buildId,
    updatedAt: now,
    packages: manifest.packages.length,
  };

  if (dryRun) {
    console.log(`   [dry-run] Would set latest:build`);
  } else {
    await kv.set("latest:build", globalPointer);
    console.log(`   ✓ Set latest:build`);
  }

  // 4. Add to build history (keep last 10 builds)
  if (!dryRun) {
    await kv.lpush("build:history", buildId);
    await kv.ltrim("build:history", 0, 9);
    console.log(`   ✓ Added to build:history`);
  }

  console.log(`\n✅ KV update complete!`);
}

/**
 * Get the latest build ID.
 */
export async function getLatestBuildId(): Promise<string | null> {
  const result = await kv.get<{ buildId: string }>("latest:build");
  return result?.buildId || null;
}

/**
 * Get build metadata.
 */
export async function getBuildMetadata(buildId: string): Promise<BuildMetadata | null> {
  return kv.get<BuildMetadata>(`build:${buildId}`);
}

/**
 * Get latest version for a package.
 */
export async function getLatestPackageVersion(
  ecosystem: "python" | "javascript",
  packageName: string
): Promise<LatestPointer | null> {
  return kv.get<LatestPointer>(`latest:${ecosystem}:${packageName}`);
}

/**
 * Get build history.
 */
export async function getBuildHistory(limit = 10): Promise<string[]> {
  return kv.lrange("build:history", 0, limit - 1);
}

/**
 * Mark a build as failed.
 */
export async function markBuildFailed(
  buildId: string,
  error: string
): Promise<void> {
  const existing = await getBuildMetadata(buildId);
  if (existing) {
    await kv.set(`build:${buildId}`, {
      ...existing,
      status: "failed",
      error,
    });
  }
}

