/**
 * IR Loader - Utilities for loading IR data from Vercel Blob or local filesystem
 *
 * This module provides unified functions that automatically choose the right
 * data source based on the environment:
 * - Production (Vercel): Fetches from Vercel Blob storage (public blobs)
 * - Development: Reads from local ir-output directory
 */

import { unstable_cache } from "next/cache";
import type { Manifest, Package, SymbolRecord, RoutingMap } from "./types";

const IR_BASE_PATH = "ir";
const POINTERS_PATH = "pointers";

/**
 * Check if we should use blob storage (production) or local files.
 *
 * Set USE_LOCAL_IR=true to force local file reading even during production builds.
 * This is useful when running `pull-ir` before `next build` to avoid network issues.
 */
export function isProduction(): boolean {
  // Allow forcing local IR usage even in production
  const useLocalIr = process.env.USE_LOCAL_IR === "true" || process.env.USE_LOCAL_IR === "1";
  const isVercel = !!process.env.VERCEL;
  const isProd = process.env.NODE_ENV === "production";

  if (useLocalIr) {
    return false;
  }
  return isProd || isVercel;
}

/**
 * Get the Vercel Blob store base URL.
 * For public blobs, we access them directly via this URL.
 *
 * Checks for environment variables in order:
 * 1. BLOB_URL (explicit blob URL)
 * 2. BLOB_BASE_URL (used by CI/build pipeline)
 * 3. NEXT_PUBLIC_BLOB_URL (client-side accessible)
 *
 * Example: https://xxxxxx.public.blob.vercel-storage.com
 */
function getBlobUrl(path: string): string | null {
  const baseUrl =
    process.env.BLOB_URL || process.env.BLOB_BASE_URL || process.env.NEXT_PUBLIC_BLOB_URL;
  if (!baseUrl) {
    console.warn(
      "[loader] No blob URL configured. Set BLOB_URL, BLOB_BASE_URL, or NEXT_PUBLIC_BLOB_URL.",
    );
    return null;
  }
  return `${baseUrl}/${path}`;
}

/**
 * Symbol lookup index entry
 */
interface SymbolLookupEntry {
  id: string;
  kind: string;
  name: string;
}

/**
 * Symbol lookup index - maps qualifiedName to symbol info for efficient lookups
 */
interface SymbolLookupIndex {
  packageId: string;
  symbolCount: number;
  symbols: Record<string, SymbolLookupEntry>;
  knownSymbols: string[];
}

// =============================================================================
// SHARDED INDEX TYPES
// =============================================================================

/**
 * Single shard of the lookup index
 */
type LookupShard = Record<string, SymbolLookupEntry>;

/**
 * Catalog entry - lightweight symbol summary for package overview
 */
export interface CatalogEntry {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  summary?: string;
  signature?: string;
}

/**
 * Sharded catalog manifest
 */
interface ShardedCatalogIndex {
  packageId: string;
  symbolCount: number;
  shards: string[];
}

/**
 * Changelog entry for a single symbol
 */
export interface SymbolChangelogEntry {
  version: string;
  releaseDate: string;
  type: "added" | "modified" | "deprecated" | "removed";
}

/**
 * Single shard of the changelog
 */
type ChangelogShard = Record<string, SymbolChangelogEntry[]>;

/**
 * Cache for manifest data (in-memory for the request lifecycle)
 */
const manifestCache = new Map<string, Manifest>();
const routingCache = new Map<string, RoutingMap>();
const symbolShardCache = new Map<string, SymbolRecord[]>();
const pointerCache = new Map<string, unknown>();
const lookupIndexCache = new Map<string, SymbolLookupIndex>();
const individualSymbolCache = new Map<string, SymbolRecord>();

// Sharded index caches
const lookupShardCache = new Map<string, LookupShard>();
const shardedCatalogIndexCache = new Map<string, ShardedCatalogIndex>();
const catalogShardCache = new Map<string, CatalogEntry[]>();
const changelogShardCache = new Map<string, ChangelogShard>();

/**
 * Compute a shard key from a qualified name using MD5 hash.
 * Returns first 2 hex characters (00-ff = 256 possible shards).
 * Must match the algorithm in packages/build-pipeline/src/upload.ts
 */
function computeShardKey(qualifiedName: string): string {
  // Use Node's crypto module (available in Next.js server components)
  const crypto = require("crypto");
  const hash = crypto.createHash("md5").update(qualifiedName).digest("hex");
  return hash.substring(0, 2);
}

/**
 * Pointer types stored in Blob
 */
interface LatestBuildPointer {
  buildId: string;
  updatedAt: string;
  packages: number;
}

interface LatestLanguagePointer {
  buildId: string;
  updatedAt: string;
}

/**
 * Package pointer for package-level builds.
 * Path: pointers/packages/{ecosystem}/{packageName}.json
 */
interface PackagePointer {
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
interface ProjectPackageIndex {
  project: string;
  language: "python" | "javascript";
  updatedAt: string;
  packages: Record<
    string,
    {
      buildId: string;
      version: string;
      sha: string;
    }
  >;
}

// Cache for package-level data
const packagePointerCache = new Map<string, PackagePointer>();
const projectPackageIndexCache = new Map<string, ProjectPackageIndex>();
const packageSymbolsCacheV2 = new Map<string, { symbols: SymbolRecord[]; total: number }>();

/**
 * Fetch a pointer JSON from Vercel Blob (public access) with retry logic
 *
 * Uses in-memory cache for deduplication. Pointers are small files
 * that indicate the latest build ID for each language.
 */
async function fetchPointer<T>(pointerName: string): Promise<T | null> {
  const cacheKey = `pointer:${pointerName}`;
  if (pointerCache.has(cacheKey)) {
    return pointerCache.get(cacheKey) as T;
  }

  const url = getBlobUrl(`${POINTERS_PATH}/${pointerName}.json`);
  if (!url) {
    return null;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await withBlobFetchLimit(() =>
        fetch(url, {
          // Use time-based revalidation instead of force-cache
          // This prevents 404s from being cached indefinitely when new projects are added
          // 60 seconds is short enough to detect new builds quickly during deployments
          next: { revalidate: 60 },
        }),
      );

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      pointerCache.set(cacheKey, data);
      return data;
    } catch (error) {
      lastError = error;

      const errorMessage = String(error);
      const isRetryable =
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("socket hang up") ||
        errorMessage.includes("HTTP 5");

      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        break;
      }

      const delay = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500,
        MAX_RETRY_DELAY_MS,
      );

      await sleep(delay);
    }
  }

  console.error(`Failed to fetch pointer: ${pointerName}`, lastError);
  return null;
}

/**
 * Get the latest build ID from Vercel Blob
 */
export async function getLatestBuildId(): Promise<string | null> {
  try {
    const pointer = await fetchPointer<LatestBuildPointer>("latest-build");
    return pointer?.buildId || null;
  } catch (error) {
    console.error("Failed to get latest build ID:", error);
    return null;
  }
}

/**
 * Get the latest build ID for a specific language and project
 */
export async function getLatestBuildIdForLanguage(
  language: "python" | "javascript",
  project: string = "langchain",
): Promise<string | null> {
  try {
    const pointerName = `latest-${project}-${language}`;
    const pointer = await fetchPointer<LatestLanguagePointer>(pointerName);
    return pointer?.buildId || null;
  } catch (error) {
    console.error(`Failed to get latest ${project} ${language} build ID:`, error);
    return null;
  }
}

// =============================================================================
// PACKAGE-LEVEL BUILD SUPPORT
// =============================================================================

/**
 * Get the package pointer for a specific package.
 * This is the new package-level pointer that allows independent package updates.
 *
 * Path: pointers/packages/{ecosystem}/{packageName}.json
 */
export async function getPackagePointer(
  ecosystem: "python" | "javascript",
  packageName: string,
): Promise<PackagePointer | null> {
  const cacheKey = `${ecosystem}:${packageName}`;
  if (packagePointerCache.has(cacheKey)) {
    return packagePointerCache.get(cacheKey)!;
  }

  try {
    const pointerName = `packages/${ecosystem}/${packageName}`;
    const pointer = await fetchPointer<PackagePointer>(pointerName);
    if (pointer) {
      packagePointerCache.set(cacheKey, pointer);
    }
    return pointer;
  } catch (error) {
    console.error(`Failed to get package pointer for ${ecosystem}/${packageName}:`, error);
    return null;
  }
}

/**
 * Get the build ID for a specific package.
 * Uses the new package-level pointer system.
 */
export async function getPackageBuildId(
  ecosystem: "python" | "javascript",
  packageName: string,
): Promise<string | null> {
  const pointer = await getPackagePointer(ecosystem, packageName);
  return pointer?.buildId || null;
}

/**
 * Get the project package index.
 * This aggregates all package pointers for a project/language.
 *
 * Path: pointers/index-{project}-{language}.json
 */
export async function getProjectPackageIndex(
  project: string,
  language: "python" | "javascript",
): Promise<ProjectPackageIndex | null> {
  const cacheKey = `${project}:${language}`;
  if (projectPackageIndexCache.has(cacheKey)) {
    return projectPackageIndexCache.get(cacheKey)!;
  }

  try {
    const pointerName = `index-${project}-${language}`;
    const index = await fetchPointer<ProjectPackageIndex>(pointerName);
    if (index) {
      projectPackageIndexCache.set(cacheKey, index);
    }
    return index;
  } catch (error) {
    console.error(`Failed to get project package index for ${project}-${language}:`, error);
    return null;
  }
}

/**
 * Get package symbols using the package-level path structure.
 *
 * Path: ir/packages/{packageId}/{buildId}/symbols.json
 */
export async function getPackageSymbolsV2(
  packageId: string,
  buildId?: string,
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
  // If no buildId provided, try to get it from the package pointer
  let actualBuildId = buildId;
  if (!actualBuildId) {
    const ecosystem = packageId.startsWith("pkg_py_") ? "python" : "javascript";
    // Extract package name from packageId (e.g., pkg_py_langchain_openai -> langchain_openai)
    const packageName = packageId.replace(/^pkg_(py|js)_/, "").replace(/_/g, "-");
    actualBuildId = (await getPackageBuildId(ecosystem, packageName)) || undefined;
  }

  if (!actualBuildId) {
    return null;
  }

  const cacheKey = `${packageId}:${actualBuildId}`;
  if (packageSymbolsCacheV2.has(cacheKey)) {
    return packageSymbolsCacheV2.get(cacheKey)!;
  }

  const blobPath = `${IR_BASE_PATH}/packages/${packageId}/${actualBuildId}/symbols.json`;
  const response = await fetchBlobJson<{ symbols: SymbolRecord[] }>(blobPath);

  if (!response?.symbols) {
    return null;
  }

  const result = { symbols: response.symbols, total: response.symbols.length };
  packageSymbolsCacheV2.set(cacheKey, result);
  return result;
}

/**
 * Package info cache for V2 path structure.
 */
const packageInfoCacheV2 = new Map<string, Package>();

/**
 * Extended package info that includes the description field.
 */
interface ExtendedPackageInfo extends Package {
  description?: string;
}

/**
 * Get package info using the package-level path structure.
 * This fetches the package.json file which may include the markdown description.
 *
 * Path: ir/packages/{packageId}/{buildId}/package.json
 */
export async function getPackageInfoV2(
  packageId: string,
  buildId?: string,
): Promise<ExtendedPackageInfo | null> {
  // If no buildId provided, try to get it from the package pointer
  let actualBuildId = buildId;
  if (!actualBuildId) {
    const ecosystem = packageId.startsWith("pkg_py_") ? "python" : "javascript";
    const packageName = packageId.replace(/^pkg_(py|js)_/, "").replace(/_/g, "-");
    actualBuildId = (await getPackageBuildId(ecosystem, packageName)) || undefined;
  }

  if (!actualBuildId) {
    return null;
  }

  const cacheKey = `${packageId}:${actualBuildId}`;
  if (packageInfoCacheV2.has(cacheKey)) {
    return packageInfoCacheV2.get(cacheKey)!;
  }

  const blobPath = `${IR_BASE_PATH}/packages/${packageId}/${actualBuildId}/package.json`;
  const response = await fetchBlobJson<ExtendedPackageInfo>(blobPath);

  if (!response) {
    return null;
  }

  packageInfoCacheV2.set(cacheKey, response);
  return response;
}

/**
 * Get package description markdown for display on package pages.
 * Fetches from the package.json file in the package-level storage.
 *
 * @param packageId - The package ID (e.g., "pkg_py_langchain_openai")
 * @param buildId - Optional build ID (will look up from pointers if not provided)
 * @returns Markdown description string or null if not available
 */
export async function getPackageDescription(
  packageId: string,
  buildId?: string,
): Promise<string | null> {
  if (isProduction()) {
    const packageInfo = await getPackageInfoV2(packageId, buildId);
    return packageInfo?.description || null;
  } else {
    // In development, read from local package.json
    return getLocalPackageDescription(packageId, buildId);
  }
}

/**
 * Get local package description for development.
 */
async function getLocalPackageDescription(
  packageId: string,
  buildId?: string,
): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    // Find the build directory for this package
    const basePath = getLocalIrBasePath();
    let packageDir: string | null = null;

    if (buildId) {
      packageDir = path.join(basePath, buildId, "packages", packageId);
    } else {
      // Try to find the latest build with this package
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink() && entry.name.startsWith("latest-")) {
          const linkPath = path.join(basePath, entry.name);
          const realPath = await fs.realpath(linkPath);
          const candidateDir = path.join(realPath, "packages", packageId);
          try {
            await fs.access(candidateDir);
            packageDir = candidateDir;
            break;
          } catch {
            continue;
          }
        }
      }
    }

    if (!packageDir) {
      return null;
    }

    // Look for package.json in the package directory or its build subdirectory
    const packageJsonPaths = [
      path.join(packageDir, "package.json"),
      // Also try looking in subdirectories (build ID directories)
    ];

    // Find build subdirectories
    try {
      const subdirs = await fs.readdir(packageDir, { withFileTypes: true });
      for (const subdir of subdirs) {
        if (subdir.isDirectory()) {
          packageJsonPaths.push(path.join(packageDir, subdir.name, "package.json"));
        }
      }
    } catch {
      // Directory might not exist
    }

    for (const pkgJsonPath of packageJsonPaths) {
      try {
        const content = await fs.readFile(pkgJsonPath, "utf-8");
        const data = JSON.parse(content);
        if (data.description) {
          return data.description;
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Retry configuration for blob fetches
 */
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10000;

/**
 * Limit concurrent blob fetches per worker process.
 * This helps reduce connection resets/rate limiting during parallel SSG.
 *
 * Lower values = fewer concurrent connections = less likely to hit ECONNRESET
 * Higher values = faster builds (if blob can handle it)
 *
 * Default is 3 to be conservative. Can be tuned via BLOB_FETCH_CONCURRENCY env var.
 */
const MAX_CONCURRENT_BLOB_FETCHES = Number(process.env.BLOB_FETCH_CONCURRENCY ?? 3);
let activeBlobFetches = 0;
let totalBlobFetches = 0;
let failedBlobFetches = 0;
const blobFetchWaiters: Array<() => void> = [];

async function withBlobFetchLimit<T>(fn: () => Promise<T>): Promise<T> {
  // Wait if we're at the concurrency limit
  if (activeBlobFetches >= MAX_CONCURRENT_BLOB_FETCHES) {
    const waitStart = Date.now();
    await new Promise<void>((resolve) => blobFetchWaiters.push(resolve));
    const waitTime = Date.now() - waitStart;
    if (waitTime > 5000) {
      console.log(`[blob] waited ${waitTime}ms for fetch slot (queue=${blobFetchWaiters.length})`);
    }
  }

  activeBlobFetches++;
  totalBlobFetches++;
  try {
    return await fn();
  } finally {
    activeBlobFetches--;
    const next = blobFetchWaiters.shift();
    next?.();
  }
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch JSON from Vercel Blob (public access) with retry logic
 *
 * For large files (>2MB) like symbols.json, uses no-store to avoid Next.js
 * cache issues. For smaller files (manifests, routing maps), uses force-cache.
 * The in-memory caches handle deduplication during the build process.
 *
 * Includes retry logic with exponential backoff for connection resets
 * and rate limit errors, which can occur during parallel static generation.
 */
async function fetchBlobJson<T>(path: string): Promise<T | null> {
  const url = getBlobUrl(path);
  if (!url) return null;

  // Use no-store for large files (symbols.json) to avoid Next.js cache issues
  // Use time-based revalidation for smaller files (manifests, routing maps, catalogs)
  // This prevents 404s from being cached indefinitely when new data is added
  const isLargeFile = path.endsWith("/symbols.json");
  const maxRetries = isLargeFile ? 10 : MAX_RETRIES;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const startTime = Date.now();
    let phase = "init";

    try {
      phase = "fetch";
      const response = await withBlobFetchLimit(() =>
        fetch(
          url,
          isLargeFile ? { cache: "no-store" } : { next: { revalidate: 3600 } }, // 1 hour for small files, prevents 404s from being cached forever
        ),
      );

      if (!response.ok) {
        // Don't retry 404s or client errors
        if (response.status >= 400 && response.status < 500) {
          return null;
        }
        // Retry server errors
        throw new Error(`HTTP ${response.status}`);
      }

      phase = "json";
      const data = await response.json();

      // Log successful large file fetches for debugging
      if (isLargeFile && attempt > 0) {
        const elapsed = Date.now() - startTime;
        console.log(`[blob] ✓ ${path} succeeded on attempt ${attempt + 1} (${elapsed}ms)`);
      }

      return data;
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - startTime;

      // Extract detailed error info
      const err = error as Error & {
        cause?: Error & { code?: string; syscall?: string; errno?: number };
      };
      const causeCode = err.cause?.code || "unknown";
      const causeSyscall = err.cause?.syscall || "unknown";
      const causeErrno = err.cause?.errno;

      // Check if this is a retryable error
      const errorMessage = String(error);
      const isRetryable =
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("socket hang up") ||
        errorMessage.includes("HTTP 5") ||
        errorMessage.includes("terminated") ||
        errorMessage.includes("aborted") ||
        causeCode === "ECONNRESET" ||
        causeCode === "UND_ERR_SOCKET";

      if (!isRetryable || attempt === maxRetries - 1) {
        // Log detailed failure info
        console.error(
          `[blob] ✗ ${path} FAILED after ${attempt + 1} attempts, phase=${phase}, elapsed=${elapsed}ms, ` +
            `code=${causeCode}, syscall=${causeSyscall}, errno=${causeErrno}, ` +
            `activeFetches=${activeBlobFetches}, waiters=${blobFetchWaiters.length}`,
        );
        break;
      }

      // Exponential backoff with jitter - use longer delays for large files
      const baseDelay = isLargeFile ? 2000 : INITIAL_RETRY_DELAY_MS;
      const maxDelay = isLargeFile ? 60000 : MAX_RETRY_DELAY_MS;
      const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);

      console.warn(
        `[blob] ⟳ ${path} retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms, ` +
          `phase=${phase}, code=${causeCode}, elapsed=${elapsed}ms`,
      );

      await sleep(delay);
    }
  }

  failedBlobFetches++;
  console.error(
    `[blob] ✗ ${path} EXHAUSTED after ${maxRetries} attempts ` +
      `(total=${totalBlobFetches}, failed=${failedBlobFetches})`,
    lastError,
  );
  return null;
}

/**
 * Internal function to fetch manifest.
 * Wrapped with unstable_cache for persistence across invocations.
 */
async function fetchManifest(buildId: string): Promise<Manifest | null> {
  const path = `${IR_BASE_PATH}/${buildId}/reference.manifest.json`;
  return fetchBlobJson<Manifest>(path);
}

/**
 * Cached version of fetchManifest.
 * Uses Next.js unstable_cache to persist data across function invocations.
 */
const getCachedManifest = unstable_cache(fetchManifest, ["manifest"], {
  revalidate: 3600, // 1 hour
  tags: ["manifest"],
});

/**
 * Get the manifest for a build
 *
 * OPTIMIZATION: Uses Next.js unstable_cache to persist manifests
 * across serverless function invocations.
 */
export async function getManifest(buildId: string): Promise<Manifest | null> {
  // Check in-memory cache first (fastest path for same-request reuse)
  if (manifestCache.has(buildId)) {
    return manifestCache.get(buildId)!;
  }

  // Fetch from Next.js data cache (persists across invocations)
  const manifest = await getCachedManifest(buildId);

  if (manifest) {
    manifestCache.set(buildId, manifest);
  }

  return manifest;
}

/**
 * Internal function to fetch routing map.
 * Wrapped with unstable_cache for persistence across invocations.
 */
async function fetchRoutingMap(
  buildId: string,
  packageId: string,
  language: "python" | "typescript",
): Promise<RoutingMap | null> {
  // Routing maps are stored at ir/{buildId}/routing/{language}/{packageId}.json
  const path = `${IR_BASE_PATH}/${buildId}/routing/${language}/${packageId}.json`;
  return fetchBlobJson<RoutingMap>(path);
}

/**
 * Cached version of fetchRoutingMap.
 * Uses Next.js unstable_cache to persist data across function invocations.
 */
const getCachedRoutingMap = unstable_cache(fetchRoutingMap, ["routing-map"], {
  revalidate: 3600, // 1 hour
  tags: ["routing-map"],
});

/**
 * Get the routing map for a package from Vercel Blob.
 * Routing maps are much smaller than full symbols and contain only
 * the slug → kind mapping needed for static generation.
 *
 * OPTIMIZATION: Uses Next.js unstable_cache to persist routing maps
 * across serverless function invocations.
 */
export async function getRoutingMap(
  buildId: string,
  packageId: string,
  language: "python" | "typescript",
): Promise<RoutingMap | null> {
  const cacheKey = `${buildId}:${packageId}`;

  // Check in-memory cache first (fastest path for same-request reuse)
  if (routingCache.has(cacheKey)) {
    return routingCache.get(cacheKey)!;
  }

  // Fetch from Next.js data cache (persists across invocations)
  const routingMap = await getCachedRoutingMap(buildId, packageId, language);

  if (routingMap) {
    routingCache.set(cacheKey, routingMap);
  }

  return routingMap;
}

/**
 * Get symbols from a shard
 */
export async function getSymbolShard(
  buildId: string,
  packageId: string,
  shardPrefix: string,
): Promise<SymbolRecord[] | null> {
  const cacheKey = `${buildId}:${packageId}:${shardPrefix}`;

  if (symbolShardCache.has(cacheKey)) {
    return symbolShardCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/symbols/${packageId}/${shardPrefix}.json`;
  const symbols = await fetchBlobJson<SymbolRecord[]>(path);

  if (symbols) {
    symbolShardCache.set(cacheKey, symbols);
  }

  return symbols;
}

/**
 * Get a symbol by its path (e.g., "langchain_core.messages.BaseMessage")
 *
 * OPTIMIZATION: Uses getPackageSymbols which has in-memory caching
 * to prevent duplicate fetches of large symbol files.
 */
export async function getSymbolByPath(
  buildId: string,
  packageId: string,
  symbolPath: string,
): Promise<SymbolRecord | null> {
  // Use cached getPackageSymbols instead of direct fetch
  const response = await getPackageSymbols(buildId, packageId);

  if (!response?.symbols) {
    return null;
  }

  return response.symbols.find((s) => s.qualifiedName === symbolPath) || null;
}

/**
 * Cache for package symbols (in-memory for the build lifecycle)
 * This prevents duplicate fetches within the same worker process.
 */
const packageSymbolsCache = new Map<string, { symbols: SymbolRecord[]; total: number }>();

/**
 * Get all symbols for a package (paginated)
 *
 * OPTIMIZATION: Uses in-memory cache to prevent duplicate fetches within
 * the same worker. Since these files are >2MB, Next.js can't cache them,
 * so this is critical for build performance.
 */
export async function getPackageSymbols(
  buildId: string,
  packageId: string,
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
  const cacheKey = `${buildId}:${packageId}`;

  // Check in-memory cache first
  if (packageSymbolsCache.has(cacheKey)) {
    return packageSymbolsCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/symbols.json`;
  const response = await fetchBlobJson<{ symbols: SymbolRecord[] }>(path);

  if (!response?.symbols) {
    return null;
  }

  const result = { symbols: response.symbols, total: response.symbols.length };
  packageSymbolsCache.set(cacheKey, result);
  return result;
}

// =============================================================================
// Optimized Symbol Loading (for fast page renders)
// =============================================================================

/**
 * Internal function to fetch symbol lookup index.
 * Wrapped with unstable_cache for persistence across invocations.
 */
async function fetchSymbolLookupIndex(
  buildId: string,
  packageId: string,
): Promise<SymbolLookupIndex | null> {
  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/lookup.json`;
  return fetchBlobJson<SymbolLookupIndex>(path);
}

/**
 * Cached version of fetchSymbolLookupIndex.
 * Uses Next.js unstable_cache to persist data across function invocations.
 */
const getCachedSymbolLookupIndex = unstable_cache(fetchSymbolLookupIndex, ["symbol-lookup-index"], {
  revalidate: 3600, // 1 hour
  tags: ["symbol-lookup-index"],
});

/**
 * Get the symbol lookup index for a package.
 * This is a small file (~50-100KB) that maps qualifiedName -> symbolId.
 * Much faster than loading the full symbols.json (11MB+).
 *
 * OPTIMIZATION: Uses Next.js unstable_cache to persist lookup indexes
 * across serverless function invocations.
 */
export async function getSymbolLookupIndex(
  buildId: string,
  packageId: string,
): Promise<SymbolLookupIndex | null> {
  const cacheKey = `${buildId}:${packageId}`;

  // Check in-memory cache first (fastest path for same-request reuse)
  if (lookupIndexCache.has(cacheKey)) {
    return lookupIndexCache.get(cacheKey)!;
  }

  // Fetch from Next.js data cache (persists across invocations)
  const index = await getCachedSymbolLookupIndex(buildId, packageId);

  if (index) {
    lookupIndexCache.set(cacheKey, index);
  }

  return index;
}

/**
 * Get list of known symbol names for type linking.
 * Uses the lightweight lookup index instead of full symbols.
 */
export async function getKnownSymbolNames(buildId: string, packageId: string): Promise<string[]> {
  const index = await getSymbolLookupIndex(buildId, packageId);
  return index?.knownSymbols || [];
}

/**
 * Fetch an individual symbol by ID from blob storage.
 * Individual symbol files are stored at ir/{buildId}/symbols/{shardKey}/{symbolId}.json
 *
 * Note: This may return null if individual symbol files weren't uploaded
 * (e.g., for packages merged from existing blob data). Callers should
 * fall back to getPackageSymbols/getSymbolByPath if this returns null.
 */
export async function getIndividualSymbol(
  buildId: string,
  symbolId: string,
): Promise<SymbolRecord | null> {
  const cacheKey = `${buildId}:${symbolId}`;

  if (individualSymbolCache.has(cacheKey)) {
    return individualSymbolCache.get(cacheKey)!;
  }

  // Shard key is first 2 characters of symbol ID
  const shardKey = symbolId.substring(0, 2);
  const blobPath = `${IR_BASE_PATH}/${buildId}/symbols/${shardKey}/${symbolId}.json`;

  // Use a simpler fetch without retry for individual symbols since we have a fallback
  try {
    const url = getBlobUrl(blobPath);
    if (!url) return null;

    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;

    const symbol = await response.json();
    if (symbol) {
      individualSymbolCache.set(cacheKey, symbol);
    }
    return symbol;
  } catch {
    // Silently fail - caller should fall back to symbols.json
    return null;
  }
}

/**
 * Get a symbol by its qualified name using the optimized lookup index.
 * This fetches only the specific symbol (~1-5KB) instead of all symbols (11MB+).
 *
 * If individual symbol files aren't available, falls back to loading from
 * the full symbols.json file (slower but more reliable).
 */
export async function getSymbolByQualifiedName(
  buildId: string,
  packageId: string,
  qualifiedName: string,
): Promise<SymbolRecord | null> {
  // First, get the lookup index
  const index = await getSymbolLookupIndex(buildId, packageId);
  if (!index) {
    console.log(
      `[loader] getSymbolByQualifiedName: No lookup index for ${packageId}, falling back to symbols.json`,
    );
    // Fall back to full symbols.json search
    return getSymbolByPath(buildId, packageId, qualifiedName);
  }
  console.log(
    `[loader] getSymbolByQualifiedName: Found index for ${packageId} with ${Object.keys(index.symbols || {}).length} symbols`,
  );

  // Look up the symbol ID
  const entry = index.symbols[qualifiedName];
  let symbolId: string | null = null;

  if (entry) {
    symbolId = entry.id;
  } else {
    // Try some variations
    const variations = [qualifiedName.replace(/\//g, "."), qualifiedName.replace(/\./g, "/")];

    for (const variation of variations) {
      const found = index.symbols[variation];
      if (found) {
        symbolId = found.id;
        break;
      }
    }
  }

  if (!symbolId) {
    console.log(
      `[loader] getSymbolByQualifiedName: Symbol "${qualifiedName}" not found in index for ${packageId}`,
    );
    return null;
  }

  // Try to fetch the individual symbol file first (fast path)
  const individualSymbol = await getIndividualSymbol(buildId, symbolId);
  if (individualSymbol) {
    return individualSymbol;
  }

  // Fall back to full symbols.json search (slow path but more reliable)
  // This handles cases where individual symbol files weren't uploaded
  return getSymbolByPath(buildId, packageId, qualifiedName);
}

/**
 * Get package info from manifest (unified - works in prod and dev)
 */
export async function getPackageInfo(buildId: string, packageId: string): Promise<Package | null> {
  // Use unified getManifestData to support both blob and local
  const manifest = await getManifestData(buildId);

  if (!manifest) {
    return null;
  }

  return manifest.packages.find((p) => p.packageId === packageId) || null;
}

/**
 * Get all packages for a language (unified - works in prod and dev)
 */
export async function getPackagesForLanguage(
  buildId: string,
  language: "python" | "javascript",
): Promise<Package[]> {
  // Use unified getManifestData to support both blob and local
  const manifest = await getManifestData(buildId);

  if (!manifest) {
    return [];
  }

  return manifest.packages.filter((p) => p.language === language);
}

/**
 * Get the local IR output path
 */
function getLocalIrBasePath(): string {
  // From apps/web, go up to the root and into ir-output
  const path = require("path");
  return path.join(process.cwd(), "..", "..", "ir-output");
}

/**
 * Cache for local package index
 */
const localPackageIndexCache = new Map<string, ProjectPackageIndex>();

/**
 * Get the local package index for a project/language
 * With the new architecture, there are no build IDs at the project level.
 * Instead, we need to scan the packages directory to find available packages.
 */
export async function getLocalPackageIndex(
  language: "python" | "javascript",
  project: string = "langchain",
): Promise<ProjectPackageIndex | null> {
  const cacheKey = `${project}-${language}`;
  if (localPackageIndexCache.has(cacheKey)) {
    return localPackageIndexCache.get(cacheKey)!;
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const basePath = getLocalIrBasePath();
    const packagesDir = path.join(basePath, "packages");

    // Check if packages directory exists
    try {
      await fs.access(packagesDir);
    } catch {
      console.log(`[loader] No local packages directory found at ${packagesDir}`);
      return null;
    }

    // Scan for packages matching the language prefix
    const prefix = language === "python" ? "pkg_py_" : "pkg_js_";
    const entries = await fs.readdir(packagesDir, { withFileTypes: true });
    
    const packages: ProjectPackageIndex["packages"] = {};

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(prefix)) {
        continue;
      }

      const packageId = entry.name;
      const packageDir = path.join(packagesDir, packageId);

      // Find the latest build for this package (first directory found)
      const buildDirs = await fs.readdir(packageDir, { withFileTypes: true });
      const buildDir = buildDirs.find((d) => d.isDirectory());
      
      if (!buildDir) continue;

      const buildId = buildDir.name;
      
      // Try to read package.json for version info
      const packageJsonPath = path.join(packageDir, buildId, "package.json");
      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(packageJsonContent);
        
        // Convert packageId back to package name
        const packageName = packageJson.publishedName || packageId.replace(prefix, "").replace(/_/g, "-");
        
        packages[packageName] = {
          buildId,
          version: packageJson.version || "unknown",
          sha: packageJson.repo?.sha || "unknown",
        };
      } catch {
        // If no package.json, still include the package with unknown version
        const packageName = packageId.replace(prefix, "").replace(/_/g, "-");
        packages[packageName] = {
          buildId,
          version: "unknown",
          sha: "unknown",
        };
      }
    }

    if (Object.keys(packages).length === 0) {
      return null;
    }

    const index: ProjectPackageIndex = {
      project,
      language,
      updatedAt: new Date().toISOString(),
      packages,
    };

    localPackageIndexCache.set(cacheKey, index);
    return index;
  } catch (error) {
    console.error(`[loader] getLocalPackageIndex ERROR for ${project}/${language}:`, error);
    return null;
  }
}

/**
 * Get the latest build ID for a language and project.
 * With package-level architecture, this returns the first available build ID
 * from the package index (for backward compatibility with code that expects a single build ID).
 * 
 * @deprecated Use getLocalPackageIndex instead for new code
 */
let localBuildIdLoggedOnce = false;
export async function getLocalLatestBuildId(
  language: "python" | "javascript",
  project: string = "langchain",
): Promise<string | null> {
  try {
    // First try the old symlink approach for backward compatibility
    const fs = await import("fs/promises");
    const path = await import("path");
    const basePath = getLocalIrBasePath();
    const languageId = language === "python" ? "python" : "javascript";

    const symlink = path.join(basePath, `latest-${project}-${languageId}`);

    // Log once to debug path issues
    if (!localBuildIdLoggedOnce) {
      localBuildIdLoggedOnce = true;
      try {
        await fs.readdir(basePath);
      } catch (e) {
        console.log(`[loader] ir-output not found or not readable: ${e}`);
      }
    }

    try {
      const target = await fs.readlink(symlink);
      return target;
    } catch {
      // No symlink, try to get from package index
      const index = await getLocalPackageIndex(language, project);
      if (index && Object.keys(index.packages).length > 0) {
        // Return the first package's build ID
        return Object.values(index.packages)[0].buildId;
      }
      return null;
    }
  } catch (error) {
    console.error(`[loader] getLocalLatestBuildId ERROR for ${project}/${language}:`, error);
    return null;
  }
}

/**
 * Local file-based loader for development
 * Falls back to reading from ir-output directory
 * 
 * @deprecated With package-level architecture, there's no project-level manifest.
 * Use getLocalPackageIndex instead to get package information.
 */
export async function getLocalManifest(buildId: string): Promise<Manifest | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const manifestPath = path.join(getLocalIrBasePath(), buildId, "reference.manifest.json");
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Cache for local package symbols (in-memory for the dev server lifecycle)
 */
const localPackageSymbolsCache = new Map<string, { symbols: SymbolRecord[]; total: number }>();

/**
 * Get local symbols for development using package-level structure
 *
 * New path: ir-output/packages/{packageId}/{buildId}/symbols.json
 * Fallback: ir-output/{buildId}/packages/{packageId}/symbols.json (old structure)
 *
 * OPTIMIZATION: Uses in-memory cache to prevent duplicate file reads.
 */
export async function getLocalPackageSymbols(
  buildId: string,
  packageId: string,
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
  const cacheKey = `local:${buildId}:${packageId}`;

  // Check cache first
  if (localPackageSymbolsCache.has(cacheKey)) {
    return localPackageSymbolsCache.get(cacheKey)!;
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const basePath = getLocalIrBasePath();
    
    // Try new path first: ir-output/packages/{packageId}/{buildId}/symbols.json
    let symbolsPath = path.join(basePath, "packages", packageId, buildId, "symbols.json");
    
    try {
      await fs.access(symbolsPath);
    } catch {
      // Fallback to old path: ir-output/{buildId}/packages/{packageId}/symbols.json
      symbolsPath = path.join(basePath, buildId, "packages", packageId, "symbols.json");
    }
    
    const content = await fs.readFile(symbolsPath, "utf-8");
    const data = JSON.parse(content);
    const symbols = data.symbols || data;
    const result = { symbols, total: symbols.length };
    localPackageSymbolsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`[loader] getLocalPackageSymbols ERROR for ${buildId}/${packageId}:`, error);
    return null;
  }
}

/**
 * Get symbol by path from local storage
 */
export async function getLocalSymbolByPath(
  buildId: string,
  packageId: string,
  symbolPath: string,
): Promise<SymbolRecord | null> {
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (!result?.symbols) {
    return null;
  }
  return result.symbols.find((s) => s.qualifiedName === symbolPath) || null;
}

/**
 * Get local symbol lookup index (generates from symbols for development)
 */
export async function getLocalSymbolLookupIndex(
  buildId: string,
  packageId: string,
): Promise<SymbolLookupIndex | null> {
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (!result?.symbols) {
    return null;
  }

  const symbolMap: Record<string, SymbolLookupEntry> = {};
  const knownSymbols: string[] = [];
  const linkableKinds = ["class", "interface", "typeAlias", "enum"];

  for (const symbol of result.symbols) {
    symbolMap[symbol.qualifiedName] = {
      id: symbol.id,
      kind: symbol.kind,
      name: symbol.name,
    };

    if (linkableKinds.includes(symbol.kind)) {
      knownSymbols.push(symbol.name);
    }
  }

  return {
    packageId,
    symbolCount: result.symbols.length,
    symbols: symbolMap,
    knownSymbols: [...new Set(knownSymbols)],
  };
}

/**
 * Get local known symbol names for type linking
 */
export async function getLocalKnownSymbolNames(
  buildId: string,
  packageId: string,
): Promise<string[]> {
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (!result?.symbols) {
    return [];
  }

  const linkableKinds = ["class", "interface", "typeAlias", "enum"];
  const names = result.symbols.filter((s) => linkableKinds.includes(s.kind)).map((s) => s.name);

  return [...new Set(names)];
}

/**
 * Get local individual symbol by ID (for development)
 * This matches the behavior of getIndividualSymbol for blob storage.
 */
export async function getLocalIndividualSymbol(
  buildId: string,
  symbolId: string,
  packageId?: string,
): Promise<SymbolRecord | null> {
  // If we have a packageId, look up in that package's symbols
  if (packageId) {
    const result = await getLocalPackageSymbols(buildId, packageId);
    if (result?.symbols) {
      const symbol = result.symbols.find((s) => s.id === symbolId);
      if (symbol) return symbol;
    }
    return null;
  }

  // Without packageId, we'd need to scan all packages which is expensive
  // For local dev, this is rarely used - just return null and let caller fall back
  return null;
}

/**
 * Get local symbol by qualified name (for development)
 */
export async function getLocalSymbolByQualifiedName(
  buildId: string,
  packageId: string,
  qualifiedName: string,
): Promise<SymbolRecord | null> {
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (!result?.symbols) {
    return null;
  }

  // Try exact match
  let symbol = result.symbols.find((s) => s.qualifiedName === qualifiedName);
  if (symbol) return symbol;

  // Try variations
  const variations = [qualifiedName.replace(/\//g, "."), qualifiedName.replace(/\./g, "/")];

  for (const variation of variations) {
    symbol = result.symbols.find((s) => s.qualifiedName === variation);
    if (symbol) return symbol;
  }

  return null;
}

/**
 * Generate a lightweight routing map from local symbols for development.
 * This mimics what upload-ir.ts generates for production.
 */
export async function getLocalRoutingMap(
  buildId: string,
  packageId: string,
  displayName: string,
  language: "python" | "typescript",
): Promise<RoutingMap | null> {
  const cacheKey = `local:${buildId}:${packageId}`;
  if (routingCache.has(cacheKey)) {
    return routingCache.get(cacheKey)!;
  }

  const result = await getLocalPackageSymbols(buildId, packageId);
  if (!result?.symbols) {
    return null;
  }

  // Generate routing map from symbols (same logic as upload-ir.ts)
  const slugs: RoutingMap["slugs"] = {};
  for (const symbol of result.symbols) {
    // Only include routable symbol kinds
    if (
      !["class", "function", "interface", "module", "typeAlias", "enum", "method"].includes(
        symbol.kind,
      )
    ) {
      continue;
    }

    // Only include public symbols
    if (symbol.tags?.visibility !== "public") {
      continue;
    }

    slugs[symbol.qualifiedName] = {
      refId: symbol.id,
      kind: symbol.kind,
      pageType: mapKindToPageType(symbol.kind),
      title: symbol.name,
    };
  }

  const routingMap: RoutingMap = {
    packageId,
    displayName,
    language,
    slugs,
  };

  routingCache.set(cacheKey, routingMap);
  return routingMap;
}

/**
 * Map symbol kind to page type for routing.
 */
function mapKindToPageType(kind: string): RoutingMap["slugs"][string]["pageType"] {
  switch (kind) {
    case "class":
      return "class";
    case "function":
    case "method":
      return "function";
    case "interface":
      return "interface";
    case "typeAlias":
      return "type";
    case "enum":
      return "enum";
    case "variable":
      return "variable";
    default:
      return "module";
  }
}

// =============================================================================
// Unified Environment-Aware Functions
// =============================================================================
// These functions automatically choose the right data source based on environment

/**
 * Get the latest build ID for a language and project (unified - works in prod and dev)
 */
export async function getBuildIdForLanguage(
  language: "python" | "javascript",
  project: string = "langchain",
): Promise<string | null> {
  const buildId = await (isProduction()
    ? getLatestBuildIdForLanguage(language, project)
    : getLocalLatestBuildId(language, project));

  if (!buildId) {
    console.log(
      `[loader] getBuildIdForLanguage: No build ID found for ${project}/${language} (isProduction=${isProduction()})`,
    );
  }
  return buildId;
}

/**
 * Get the manifest for a build (unified - works in prod and dev)
 */
export async function getManifestData(buildId: string): Promise<Manifest | null> {
  return isProduction() ? getManifest(buildId) : getLocalManifest(buildId);
}

/**
 * Get all symbols for a package (unified - works in prod and dev)
 */
export async function getSymbols(
  buildId: string,
  packageId: string,
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
  return isProduction()
    ? getPackageSymbols(buildId, packageId)
    : getLocalPackageSymbols(buildId, packageId);
}

/**
 * Get a symbol by its path (unified - works in prod and dev)
 */
export async function getSymbolData(
  buildId: string,
  packageId: string,
  symbolPath: string,
): Promise<SymbolRecord | null> {
  return isProduction()
    ? getSymbolByPath(buildId, packageId, symbolPath)
    : getLocalSymbolByPath(buildId, packageId, symbolPath);
}

/**
 * Get routing map for a package (unified - works in prod and dev)
 * Uses lightweight routing maps (~100KB) instead of full symbols (~14MB)
 * for efficient static generation.
 */
export async function getRoutingMapData(
  buildId: string,
  packageId: string,
  displayName: string,
  language: "python" | "typescript",
): Promise<RoutingMap | null> {
  return isProduction()
    ? getRoutingMap(buildId, packageId, language)
    : getLocalRoutingMap(buildId, packageId, displayName, language);
}

/**
 * Get known symbol names for type linking (unified - works in prod and dev)
 * Uses lightweight lookup index (~50KB) instead of full symbols (~14MB)
 */
export async function getKnownSymbolNamesData(
  buildId: string,
  packageId: string,
): Promise<string[]> {
  return isProduction()
    ? getKnownSymbolNames(buildId, packageId)
    : getLocalKnownSymbolNames(buildId, packageId);
}

/**
 * Get the symbol lookup index (unified - works in prod and dev)
 */
export async function getSymbolLookupIndexData(
  buildId: string,
  packageId: string,
): Promise<SymbolLookupIndex | null> {
  return isProduction()
    ? getSymbolLookupIndex(buildId, packageId)
    : getLocalSymbolLookupIndex(buildId, packageId);
}

/**
 * Get a symbol by qualified name using optimized lookup (unified - works in prod and dev)
 * Fetches only the specific symbol (~1-5KB) instead of all symbols (~14MB)
 */
export async function getSymbolOptimized(
  buildId: string,
  packageId: string,
  qualifiedName: string,
): Promise<SymbolRecord | null> {
  return isProduction()
    ? getSymbolByQualifiedName(buildId, packageId, qualifiedName)
    : getLocalSymbolByQualifiedName(buildId, packageId, qualifiedName);
}

/**
 * Get an individual symbol by ID (unified - works in prod and dev)
 * In production, fetches from blob. In dev, looks up in local symbols.
 *
 * Note: For local mode without packageId, this may return null.
 * Callers should fall back to other methods if needed.
 */
export async function getIndividualSymbolData(
  buildId: string,
  symbolId: string,
  packageId?: string,
): Promise<SymbolRecord | null> {
  return isProduction()
    ? getIndividualSymbol(buildId, symbolId)
    : getLocalIndividualSymbol(buildId, symbolId, packageId);
}

// =============================================================================
// SHARDED INDEX FETCHERS
// =============================================================================
// These functions fetch from the new sharded index structure for better performance.
// Each shard is <500KB and can be CDN-cached, avoiding the 2MB Next.js cache limit.

/**
 * Get a specific lookup shard.
 */
async function getLookupShard(
  buildId: string,
  packageId: string,
  shardKey: string,
): Promise<LookupShard | null> {
  const cacheKey = `${buildId}:${packageId}:lookup:${shardKey}`;
  if (lookupShardCache.has(cacheKey)) {
    return lookupShardCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/lookup/${shardKey}.json`;
  const shard = await fetchBlobJson<LookupShard>(path);

  if (shard) {
    lookupShardCache.set(cacheKey, shard);
  }

  return shard;
}

/**
 * Look up a symbol by qualified name using the sharded lookup index.
 * Only fetches the specific shard needed (~50-200KB).
 */
export async function getSymbolFromShardedLookup(
  buildId: string,
  packageId: string,
  qualifiedName: string,
): Promise<SymbolLookupEntry | null> {
  const shardKey = computeShardKey(qualifiedName);
  const shard = await getLookupShard(buildId, packageId, shardKey);

  if (!shard) {
    return null;
  }

  return shard[qualifiedName] || null;
}

/**
 * Get the sharded catalog index manifest for a package.
 */
async function getShardedCatalogIndexManifest(
  buildId: string,
  packageId: string,
): Promise<ShardedCatalogIndex | null> {
  const cacheKey = `${buildId}:${packageId}:catalog-index`;
  if (shardedCatalogIndexCache.has(cacheKey)) {
    return shardedCatalogIndexCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/catalog/index.json`;
  const index = await fetchBlobJson<ShardedCatalogIndex>(path);

  if (index) {
    shardedCatalogIndexCache.set(cacheKey, index);
  }

  return index;
}

/**
 * Get a specific catalog shard.
 */
async function getCatalogShard(
  buildId: string,
  packageId: string,
  shardKey: string,
): Promise<CatalogEntry[] | null> {
  const cacheKey = `${buildId}:${packageId}:catalog:${shardKey}`;
  if (catalogShardCache.has(cacheKey)) {
    return catalogShardCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/catalog/${shardKey}.json`;
  const shard = await fetchBlobJson<CatalogEntry[]>(path);

  if (shard) {
    catalogShardCache.set(cacheKey, shard);
  }

  return shard;
}

/**
 * Get all catalog entries for a package by fetching all shards in parallel.
 * Each shard is <500KB and CDN-cacheable.
 */
export async function getCatalogEntries(
  buildId: string,
  packageId: string,
): Promise<CatalogEntry[]> {
  if (isProduction()) {
    const manifest = await getShardedCatalogIndexManifest(buildId, packageId);
    if (!manifest?.shards) {
      return [];
    }

    // Fetch all shards in parallel
    const shardPromises = manifest.shards.map((shardKey) =>
      getCatalogShard(buildId, packageId, shardKey),
    );
    const shards = await Promise.all(shardPromises);

    // Flatten results
    const entries: CatalogEntry[] = [];
    for (const shard of shards) {
      if (shard) {
        entries.push(...shard);
      }
    }

    return entries;
  } else {
    // In development, generate catalog from local symbols
    const result = await getLocalPackageSymbols(buildId, packageId);
    if (!result?.symbols) {
      return [];
    }

    return result.symbols
      .filter((s) => s.tags?.visibility === "public")
      .filter((s) =>
        ["class", "function", "interface", "module", "typeAlias", "enum"].includes(s.kind),
      )
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        name: s.name,
        qualifiedName: s.qualifiedName,
        summary: s.docs?.summary?.substring(0, 200),
        signature: s.signature?.substring(0, 300),
      }));
  }
}

/**
 * Get a specific changelog shard.
 */
async function getChangelogShard(
  buildId: string,
  packageId: string,
  shardKey: string,
): Promise<ChangelogShard | null> {
  const cacheKey = `${buildId}:${packageId}:changelog:${shardKey}`;
  if (changelogShardCache.has(cacheKey)) {
    return changelogShardCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/changelog/${shardKey}.json`;
  const shard = await fetchBlobJson<ChangelogShard>(path);

  if (shard) {
    changelogShardCache.set(cacheKey, shard);
  }

  return shard;
}

/**
 * Get changelog entries for a specific symbol using the sharded changelog.
 * Only fetches the specific shard needed (~50-200KB).
 */
export async function getSymbolChangelog(
  buildId: string,
  packageId: string,
  qualifiedName: string,
): Promise<SymbolChangelogEntry[]> {
  const shardKey = computeShardKey(qualifiedName);
  const shard = await getChangelogShard(buildId, packageId, shardKey);

  if (!shard) {
    return [];
  }

  return shard[qualifiedName] || [];
}

/**
 * Get symbol by qualified name using sharded lookup + individual symbol fetch.
 * This is the optimized path that avoids loading symbols.json entirely.
 */
export async function getSymbolViaShardedLookup(
  buildId: string,
  packageId: string,
  qualifiedName: string,
): Promise<SymbolRecord | null> {
  // First, look up the symbol ID from the sharded lookup index
  const entry = await getSymbolFromShardedLookup(buildId, packageId, qualifiedName);

  if (!entry) {
    return null;
  }

  // Then fetch the individual symbol file
  return getIndividualSymbolData(buildId, entry.id, packageId);
}

// =============================================================================
// Static Generation Helpers
// =============================================================================
// These functions help generate static params for Next.js static generation

/**
 * Symbol kinds to include in static generation.
 *
 * To stay within Vercel's build size limits (~75MB), we only pre-render
 * the most commonly accessed symbol types. Everything else is generated
 * on-demand using ISR.
 *
 * Pre-rendered (most important for SEO and direct linking):
 * - Packages: always included (handled separately)
 * - Classes: core API elements, most frequently accessed
 * - Functions: commonly accessed, standalone pages
 *
 * On-demand (generated via ISR when first accessed):
 * - Interfaces: TypeScript interfaces
 * - Type Aliases: custom type definitions
 * - Enums: enumeration types
 * - Methods: class methods (many per class)
 * - Properties: class properties
 * - Attributes: Python class attributes
 * - Modules: navigation pages
 */
const STATIC_GENERATION_KINDS = new Set(["class", "function"]);

/**
 * Slugify a package name for URLs
 * @example "@langchain/core" -> "langchain-core"
 * @example "langchain_core" -> "langchain-core"
 */
function slugifyPackageName(packageName: string): string {
  return packageName.replace(/^@/, "").replace(/\//g, "-").replace(/_/g, "-").toLowerCase();
}

/**
 * Get all static params for a language and project (for Next.js generateStaticParams)
 *
 * OPTIMIZATION: Uses lightweight routing maps (~100KB each) instead of full
 * symbol files (~14MB each). Routing maps contain only the slug → kind mapping
 * needed for static generation, and are small enough to be cached by Next.js.
 *
 * Returns an array of slug arrays for packages and selected symbol types.
 * Other symbol types are rendered on-demand via dynamicParams.
 */
export async function getStaticParamsForLanguage(
  language: "python" | "javascript",
  project: string = "langchain",
): Promise<{ slug: string[] }[]> {
  const buildId = await getBuildIdForLanguage(language, project);
  if (!buildId) {
    return [];
  }

  const manifest = await getManifestData(buildId);
  if (!manifest) {
    return [];
  }

  const params: { slug: string[] }[] = [];
  const ecosystem = language === "python" ? "python" : "javascript";
  const irLanguage = language === "python" ? "python" : "typescript";

  // Filter packages by ecosystem
  const packages = manifest.packages.filter((p) => p.ecosystem === ecosystem);

  for (const pkg of packages) {
    const packageSlug = slugifyPackageName(pkg.publishedName);

    // Add package-level route (e.g., /javascript/langchain-core)
    params.push({ slug: [packageSlug] });

    // Use routing map instead of full symbols (~100KB vs ~14MB)
    // Routing maps are small enough to be cached by Next.js data cache
    const routingMap = await getRoutingMapData(buildId, pkg.packageId, pkg.displayName, irLanguage);
    if (!routingMap?.slugs) continue;

    // Add symbol routes from routing map
    for (const [symbolPath, entry] of Object.entries(routingMap.slugs)) {
      // Only include selected kinds for static generation
      if (!STATIC_GENERATION_KINDS.has(entry.kind)) continue;

      // Convert to URL path segments
      // For Python: "langchain_core.messages.BaseMessage" -> ["langchain-core", "messages", "BaseMessage"]
      // For JavaScript: "ChatDeepSeek" -> ["langchain-deepseek", "ChatDeepSeek"]
      let pathSegments: string[];

      if (language === "python") {
        // Python: skip the package prefix (first part of qualifiedName)
        const parts = symbolPath.split(".");
        if (parts.length > 1) {
          pathSegments = parts.slice(1); // Skip package name
        } else {
          pathSegments = parts;
        }
      } else {
        // JavaScript: just use the qualified name as-is
        // For modules with paths like "agents/toolkits/aws_sfn", split by /
        pathSegments = symbolPath.includes("/") ? symbolPath.split("/") : symbolPath.split(".");
      }

      if (pathSegments.length > 0 && pathSegments[0]) {
        params.push({ slug: [packageSlug, ...pathSegments] });
      }
    }
  }

  return params;
}

/**
 * Cross-project package info for type linking
 */
export interface CrossProjectPackage {
  /** URL slug for the package (e.g., "langchain_core") */
  slug: string;
  /** Language of the package */
  language: "python" | "javascript";
  /** Map of symbol names to their URL paths in this package */
  knownSymbols: Map<string, string>;
}

/**
 * Cache for cross-project packages (in-memory, per-worker)
 */
const crossProjectPackageCache = new Map<string, Map<string, CrossProjectPackage>>();

/**
 * Serializable version of CrossProjectPackage for Next.js data cache.
 * Maps cannot be cached, so we use arrays of [key, value] pairs.
 */
interface SerializableCrossProjectPackage {
  slug: string;
  language: "python" | "javascript";
  /** Array of [symbolName, urlPath] pairs (serializable form of knownSymbols Map) */
  knownSymbols: [string, string][];
}

/**
 * Internal function to fetch cross-project packages data.
 * Returns serializable data structure for caching.
 */
async function fetchCrossProjectPackagesData(
  language: "python" | "javascript",
): Promise<[string, SerializableCrossProjectPackage][]> {
  const packages: [string, SerializableCrossProjectPackage][] = [];

  // Import projects dynamically to avoid circular dependencies
  const { getEnabledProjects } = await import("@/lib/config/projects");
  const enabledProjects = getEnabledProjects();

  // Load packages from all enabled projects
  for (const project of enabledProjects) {
    const variant = project.variants.find((v) => v.language === language && v.enabled);
    if (!variant) continue;

    const buildId = await getBuildIdForLanguage(language, project.id);
    if (!buildId) continue;

    const manifest = await getManifestData(buildId);
    if (!manifest) continue;

    const ecosystem = language === "python" ? "python" : "javascript";
    const irLanguage = language === "python" ? "python" : "typescript";

    for (const pkg of manifest.packages) {
      if (pkg.ecosystem !== ecosystem) continue;

      // Get the module prefix (e.g., "langchain_core" from package name)
      const modulePrefix = pkg.publishedName
        .replace(/-/g, "_")
        .replace(/^@/, "")
        .replace(/\//g, "_");

      // Load known symbols for this package.
      //
      // IMPORTANT:
      // We intentionally avoid `lookup.json` here because some packages can
      // exceed Next.js' 2MB data cache limit (leading to cache failures and
      // slow navigations). The routing map is significantly smaller and still
      // contains enough info for type-linking (public, routable symbols).
      const routingMap = await getRoutingMapData(
        buildId,
        pkg.packageId,
        pkg.displayName,
        irLanguage,
      );
      const knownSymbols: [string, string][] = [];
      if (routingMap?.slugs) {
        for (const [slug, entry] of Object.entries(routingMap.slugs)) {
          if (["class", "interface", "typeAlias", "enum"].includes(entry.kind)) {
            // Map symbol name to its URL path (slug)
            knownSymbols.push([entry.title, slug]);
          }
        }
      }

      const serializedPackage: SerializableCrossProjectPackage = {
        slug: modulePrefix,
        language,
        knownSymbols,
      };

      packages.push([modulePrefix, serializedPackage]);

      // Also add the original published name as a key for lookups
      if (pkg.publishedName !== modulePrefix) {
        packages.push([pkg.publishedName, serializedPackage]);
      }
    }
  }

  return packages;
}

/**
 * Cached version of fetchCrossProjectPackagesData.
 * Uses Next.js unstable_cache to persist data across function invocations.
 * Revalidates every hour to pick up new builds.
 */
const getCachedCrossProjectPackagesData = unstable_cache(
  fetchCrossProjectPackagesData,
  ["cross-project-packages"],
  {
    revalidate: 3600, // 1 hour
    tags: ["cross-project-packages"],
  },
);

/**
 * Get all packages across all projects for cross-referencing.
 * Returns a map of module prefixes to package info.
 *
 * For Python: maps "langchain_core" -> { slug: "langchain_core", language: "python", knownSymbols }
 * For JS: maps "@langchain/core" -> { slug: "langchain_core", language: "javascript", knownSymbols }
 *
 * OPTIMIZATION: Uses Next.js unstable_cache to persist cross-project data
 * across serverless function invocations, eliminating repeated blob fetches
 * on cold starts.
 */
export async function getCrossProjectPackages(
  language: "python" | "javascript",
): Promise<Map<string, CrossProjectPackage>> {
  // Check in-memory cache first (fastest path for same-request reuse)
  const cacheKey = language;
  if (crossProjectPackageCache.has(cacheKey)) {
    return crossProjectPackageCache.get(cacheKey)!;
  }

  // Fetch from Next.js data cache (persists across invocations)
  const cachedData = await getCachedCrossProjectPackagesData(language);

  // Convert serialized data back to Map structure
  const packages = new Map<string, CrossProjectPackage>();
  for (const [key, serialized] of cachedData) {
    packages.set(key, {
      slug: serialized.slug,
      language: serialized.language,
      knownSymbols: new Map(serialized.knownSymbols),
    });
  }

  // Store in in-memory cache for same-request reuse
  crossProjectPackageCache.set(cacheKey, packages);
  return packages;
}

/**
 * Resolve a type reference to its URL if it exists in any package.
 *
 * @param typeName - The simple type name (e.g., "BaseChatModel")
 * @param qualifiedName - The fully qualified name (e.g., "langchain_core.language_models.BaseChatModel")
 * @param language - The language of the current page
 * @returns The URL path to the type, or null if not found
 */
export async function resolveTypeReferenceUrl(
  typeName: string,
  qualifiedName: string | undefined,
  language: "python" | "javascript",
): Promise<string | null> {
  if (!qualifiedName) return null;

  const packages = await getCrossProjectPackages(language);

  // Extract the package prefix from the qualified name
  // e.g., "langchain_core.language_models.BaseChatModel" -> "langchain_core"
  const parts = qualifiedName.split(".");
  if (parts.length < 2) return null;

  // Try progressively longer prefixes to find the package
  // This handles nested modules like "langgraph.checkpoint.base.Checkpointer"
  for (let i = 1; i <= Math.min(parts.length - 1, 3); i++) {
    const prefix = parts.slice(0, i).join("_");
    const pkg = packages.get(prefix);

    if (pkg && pkg.knownSymbols.has(typeName)) {
      const langPath = language === "python" ? "python" : "javascript";
      const symbolPath = pkg.knownSymbols.get(typeName)!;
      return `/${langPath}/${pkg.slug}/${symbolPath}`;
    }
  }

  return null;
}
