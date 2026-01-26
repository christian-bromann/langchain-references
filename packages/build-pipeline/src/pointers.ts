/**
 * Pointer Management
 *
 * Manages build pointers in Vercel Blob for build tracking and discovery.
 * Handles latest build pointers, build history, and package version tracking.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { Manifest, Language, SymbolLanguage, Package } from "@langchain/ir-schema";
import { putWithRetry } from "./upload.js";
import { getBlobBaseUrl } from "./blob-utils.js";

const POINTERS_PATH = "pointers";

/** Local output directory for IR data */
const IR_OUTPUT_DIR = "ir-output";

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
  ecosystem: Language;
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
  language: Language;
  updatedAt: string;
  packages: Record<
    string,
    {
      buildId: string;
      version: string;
      sha: string;
    }
  >;
  /**
   * Ordered list of package names for display.
   * Packages with explicit `index` in config are sorted first by index value,
   * then remaining packages follow in their config array order.
   */
  packageOrder?: string[];
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
    language: SymbolLanguage;
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
 * Upload a JSON pointer file to Vercel Blob with rate limit retry
 */
async function uploadPointer(path: string, data: unknown, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`   [dry-run] Would upload ${path}`);
    return;
  }

  await putWithRetry(path, JSON.stringify(data, null, 2), {
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
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) {
    console.warn(`   ⚠️  No blob storage URL available for fetching ${path}`);
    return null;
  }

  // Ensure no double slashes in URL
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBaseUrl}/${path}`;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`   ⚠️  Failed to fetch ${path}: ${response.status} ${response.statusText}`);
      }
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`   ⚠️  Error fetching ${path}: ${(error as Error).message}`);
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
    // Map config language (typescript) to output language (javascript), others pass through
    const ecosystem: Language =
      pkg.language === "typescript" ? "javascript" : (pkg.language as Language);
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
    await uploadPointer(
      `${POINTERS_PATH}/latest-${projectId}-python.json`,
      { buildId, updatedAt: now },
      dryRun,
    );
    console.log(`   ✓ Uploaded latest-${projectId}-python.json`);
  }

  if (jsPackages.length > 0) {
    await uploadPointer(
      `${POINTERS_PATH}/latest-${projectId}-javascript.json`,
      { buildId, updatedAt: now },
      dryRun,
    );
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

    await uploadPointer(
      `${POINTERS_PATH}/build-history.json`,
      {
        builds: updatedBuilds,
        updatedAt: now,
      },
      dryRun,
    );
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
  packageName: string,
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
export async function markBuildFailed(buildId: string, error: string): Promise<void> {
  const existing = await getBuildMetadata(buildId);
  if (existing) {
    await uploadPointer(
      `${POINTERS_PATH}/builds/${buildId}.json`,
      {
        ...existing,
        status: "failed",
        error,
      },
      false,
    );
  }
}

/**
 * Update pointer for a single package (package-level builds).
 * This creates/updates the package-specific pointer file.
 */
async function updatePackagePointer(data: PackagePointerData, dryRun: boolean): Promise<void> {
  const { packageName, ecosystem, project, buildId, version, sha, repo, stats } = data;

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
  await updateProjectPackageIndex(
    project,
    ecosystem,
    packageName,
    { buildId, version, sha },
    dryRun,
  );

  console.log(`\n✅ Package pointer update complete!`);
}

/**
 * Update the project package index with new package info.
 * This merges the new package info with existing packages in the index.
 * Preserves existing packageOrder if present.
 */
async function updateProjectPackageIndex(
  project: string,
  language: Language,
  packageName: string,
  packageInfo: { buildId: string; version: string; sha: string },
  dryRun: boolean,
): Promise<void> {
  const indexPath = `${POINTERS_PATH}/index-${project}-${language}.json`;

  // Fetch existing index
  let existingIndex: ProjectPackageIndex | null = null;
  if (!dryRun) {
    existingIndex = await fetchPointer<ProjectPackageIndex>(indexPath);
  }

  const now = new Date().toISOString();

  // Create or update index, preserving existing packageOrder
  const updatedIndex: ProjectPackageIndex = {
    project,
    language,
    updatedAt: now,
    packages: {
      ...existingIndex?.packages,
      [packageName]: packageInfo,
    },
    // Preserve existing packageOrder if present
    ...(existingIndex?.packageOrder ? { packageOrder: existingIndex.packageOrder } : {}),
  };

  await uploadPointer(indexPath, updatedIndex, dryRun);
  console.log(
    `   ✓ Updated index-${project}-${language}.json (${Object.keys(updatedIndex.packages).length} packages)`,
  );
}

/**
 * Get the package pointer for a specific package.
 */
export async function getPackagePointer(
  ecosystem: Language,
  packageName: string,
): Promise<PackagePointer | null> {
  return fetchPointer<PackagePointer>(`${POINTERS_PATH}/packages/${ecosystem}/${packageName}.json`);
}

/**
 * Get the project package index.
 */
export async function getProjectPackageIndex(
  project: string,
  language: "python" | "javascript",
): Promise<ProjectPackageIndex | null> {
  return fetchPointer<ProjectPackageIndex>(`${POINTERS_PATH}/index-${project}-${language}.json`);
}

/**
 * Fetch a package.json file from blob storage.
 */
async function fetchPackageJson(packageId: string, buildId: string): Promise<Package | null> {
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) return null;

  const url = `${baseUrl}/ir/packages/${packageId}/${buildId}/package.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Package;
  } catch {
    return null;
  }
}

/**
 * Normalize a package name to a packageId.
 */
function normalizePackageId(packageName: string, language: Language): string {
  const prefix =
    language === "python"
      ? "pkg_py_"
      : language === "javascript"
        ? "pkg_js_"
        : language === "java"
          ? "pkg_java_"
          : "pkg_go_";
  const normalized = packageName.replace(/^@/, "").replace(/[./-]/g, "_");
  return `${prefix}${normalized}`;
}

/**
 * Generate a global manifest from all project package indexes.
 * This creates a single file that can be loaded at runtime instead of
 * fetching 20+ individual index files.
 *
 * Fetches each package's package.json to build a complete Manifest with
 * all package details (repo, entry, nav, stats).
 *
 * @param projects - List of project identifiers
 * @param languages - List of languages to include
 * @param dryRun - If true, don't actually upload
 */
export async function generateGlobalManifest(
  projects: readonly string[],
  languages: readonly Language[],
  dryRun: boolean = false,
): Promise<void> {
  console.log(`\n📦 Generating global manifest from project indexes`);
  if (dryRun) {
    console.log("   (dry-run mode - no actual updates)\n");
  }

  // Collect all package info from indexes
  const packageInfos: Array<{
    packageName: string;
    packageId: string;
    buildId: string;
    project: string;
    language: Language;
    version: string;
  }> = [];

  // Fetch all project indexes
  for (const project of projects) {
    for (const language of languages) {
      const index = await fetchPointer<ProjectPackageIndex>(
        `${POINTERS_PATH}/index-${project}-${language}.json`,
      );

      if (!index?.packages) {
        // Silently skip missing indexes (expected for some project/language combos)
        continue;
      }

      console.log(
        `   ✓ Found ${Object.keys(index.packages).length} packages in ${project}-${language}`,
      );

      // Collect package info
      for (const [packageName, pkgInfo] of Object.entries(index.packages)) {
        const packageId = normalizePackageId(packageName, language);
        packageInfos.push({
          packageName,
          packageId,
          buildId: pkgInfo.buildId,
          project,
          language,
          version: pkgInfo.version,
        });
      }
    }
  }

  if (packageInfos.length === 0) {
    console.warn("   ⚠️  No packages found in any index");
    return;
  }

  console.log(`\n   📥 Fetching ${packageInfos.length} package.json files...`);

  // Fetch all package.json files in parallel
  const packagePromises = packageInfos.map(async (info) => {
    const pkg = await fetchPackageJson(info.packageId, info.buildId);
    if (!pkg) {
      console.warn(`   ⚠️  Could not fetch package.json for ${info.packageId}`);
      return null;
    }
    // Ensure project and buildId are set (might not be in older package.json files)
    return {
      ...pkg,
      project: (pkg as { project?: string }).project ?? info.project,
      buildId: (pkg as { buildId?: string }).buildId ?? info.buildId,
    } as Package & { project?: string; buildId?: string };
  });

  const packages = (await Promise.all(packagePromises)).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );

  console.log(`   ✓ Fetched ${packages.length} packages`);

  const now = new Date().toISOString();
  const manifest: Manifest = {
    irVersion: "1.0",
    project: "all-packages",
    build: {
      buildId: packages[0]?.buildId ?? "",
      createdAt: now,
      baseUrl: "",
    },
    sources: [],
    packages: packages as Package[],
  };

  // Write to local ir-output directory
  const localManifestPath = path.join(process.cwd(), IR_OUTPUT_DIR, POINTERS_PATH, "manifest.json");
  if (!dryRun) {
    await fs.mkdir(path.dirname(localManifestPath), { recursive: true });
    await fs.writeFile(localManifestPath, JSON.stringify(manifest, null, 2));
    console.log(`   ✅ Wrote ${localManifestPath}`);
  } else {
    console.log(`   [dry-run] Would write ${localManifestPath}`);
  }

  // Upload to blob storage
  await uploadPointer(`${POINTERS_PATH}/manifest.json`, manifest, dryRun);
  console.log(`   ✅ Uploaded ${POINTERS_PATH}/manifest.json with ${packages.length} packages`);
}

/**
 * Regenerate the project package index from all individual package pointers.
 * This is used after batch updates to ensure the index is complete.
 *
 * @param project - Project identifier
 * @param language - Language/ecosystem
 * @param packageNames - List of package names to include
 * @param dryRun - If true, don't actually upload
 * @param packageOrder - Optional ordered list of package names for display ordering
 */
export async function regenerateProjectPackageIndex(
  project: string,
  language: Language,
  packageNames: string[],
  dryRun: boolean = false,
  packageOrder?: string[],
): Promise<void> {
  const ecosystem = language;
  const now = new Date().toISOString();

  // Check if blob storage is configured
  const baseUrl = getBlobBaseUrl();
  if (!baseUrl) {
    console.error(`   ❌ Cannot regenerate index: No blob storage URL configured`);
    console.error(`      Set BLOB_URL or BLOB_READ_WRITE_TOKEN environment variable`);
    return;
  }

  const packages: Record<string, { buildId: string; version: string; sha: string }> = {};
  const missingPackages: string[] = [];

  // Fetch each package pointer
  for (const packageName of packageNames) {
    const pointer = await getPackagePointer(ecosystem, packageName);
    if (pointer) {
      packages[packageName] = {
        buildId: pointer.buildId,
        version: pointer.version,
        sha: pointer.sha,
      };
    } else {
      missingPackages.push(packageName);
    }
  }

  // Log missing packages if any
  if (missingPackages.length > 0 && missingPackages.length === packageNames.length) {
    console.warn(`   ⚠️  No pointers found in blob storage for any packages`);
    console.warn(
      `      Searched: ${missingPackages.slice(0, 3).join(", ")}${missingPackages.length > 3 ? `, ... (${missingPackages.length} total)` : ""}`,
    );
    console.warn(`      URL base: ${baseUrl}`);
  } else if (missingPackages.length > 0) {
    console.warn(`   ⚠️  Missing pointers for: ${missingPackages.join(", ")}`);
  }

  // Filter packageOrder to only include packages that exist in the index
  const existingPackageNames = Object.keys(packages);
  const filteredPackageOrder = packageOrder
    ? packageOrder.filter((name) => existingPackageNames.includes(name))
    : undefined;

  const index: ProjectPackageIndex = {
    project,
    language,
    updatedAt: now,
    packages,
    ...(filteredPackageOrder && filteredPackageOrder.length > 0
      ? { packageOrder: filteredPackageOrder }
      : {}),
  };

  const indexPath = `${POINTERS_PATH}/index-${project}-${language}.json`;
  await uploadPointer(indexPath, index, dryRun);
  console.log(
    `   ✓ Regenerated index-${project}-${language}.json (${Object.keys(packages).length} packages${filteredPackageOrder ? `, ordered` : ``})`,
  );
}
