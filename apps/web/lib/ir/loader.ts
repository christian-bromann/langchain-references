/**
 * IR Loader - Utilities for loading IR data from Vercel Blob or local filesystem
 *
 * This module provides unified functions that automatically choose the right
 * data source based on the environment:
 * - Production (Vercel): Fetches from Vercel Blob storage (public blobs)
 * - Development: Reads from local ir-output directory
 */

import type { Manifest, Package, SymbolRecord, RoutingMap } from "./types";

const IR_BASE_PATH = "ir";
const POINTERS_PATH = "pointers";

/**
 * Check if we're running in production (Vercel)
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL;
}

/**
 * Get the Vercel Blob store base URL.
 * For public blobs, we access them directly via this URL.
 *
 * The BLOB_URL can be set explicitly, or derived from NEXT_PUBLIC_BLOB_URL.
 * Example: https://xxxxxx.public.blob.vercel-storage.com
 */
function getBlobUrl(path: string): string | null {
  const baseUrl = process.env.BLOB_URL || process.env.NEXT_PUBLIC_BLOB_URL;
  if (!baseUrl) {
    // Only log in production to avoid noise during development
    if (isProduction()) {
      console.error("[getBlobUrl] BLOB_URL environment variable is not set - static generation will be skipped");
    }
    return null;
  }
  const fullUrl = `${baseUrl}/${path}`;
  console.error(`[getBlobUrl] Generated URL: ${fullUrl}`);
  return fullUrl;
}

/**
 * Cache for manifest data (in-memory for the request lifecycle)
 */
const manifestCache = new Map<string, Manifest>();
const routingCache = new Map<string, RoutingMap>();
const symbolShardCache = new Map<string, SymbolRecord[]>();
const pointerCache = new Map<string, unknown>();

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
 * Fetch a pointer JSON from Vercel Blob (public access)
 *
 * Uses in-memory cache for deduplication. Pointers are small files
 * that indicate the latest build ID for each language.
 */
async function fetchPointer<T>(pointerName: string): Promise<T | null> {
  const cacheKey = `pointer:${pointerName}`;
  if (pointerCache.has(cacheKey)) {
    console.error(`[fetchPointer] Cache hit for ${pointerName}`);
    return pointerCache.get(cacheKey) as T;
  }

  try {
    const url = getBlobUrl(`${POINTERS_PATH}/${pointerName}.json`);
    if (!url) {
      console.error(`[fetchPointer] No BLOB_URL configured for ${pointerName}`);
      return null;
    }

    console.error(`[fetchPointer] Fetching: ${url}`);
    const response = await fetch(url, {
      // Use force-cache to enable static generation
      // In-memory pointerCache handles deduplication during builds
      cache: "force-cache",
    });

    if (!response.ok) {
      console.error(`[fetchPointer] Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.error(`[fetchPointer] Got data for ${pointerName}: ${JSON.stringify(data)}`);
    pointerCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error(`Failed to fetch pointer: ${pointerName}`, error);
    return null;
  }
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
  project: string = "langchain"
): Promise<string | null> {
  try {
    const pointerName = `latest-${project}-${language}`;
    console.error(`[getLatestBuildIdForLanguage] Fetching pointer: ${pointerName}`);
    const pointer = await fetchPointer<LatestLanguagePointer>(pointerName);
    const buildId = pointer?.buildId || null;
    console.error(`[getLatestBuildIdForLanguage] ${pointerName} -> buildId: ${buildId}`);
    return buildId;
  } catch (error) {
    console.error(`[getLatestBuildIdForLanguage] Failed to get latest ${project} ${language} build ID:`, error);
    return null;
  }
}

/**
 * Fetch JSON from Vercel Blob (public access)
 *
 * Uses force-cache to enable static generation. Large files (>2MB) will
 * show warnings about not being cached, but this is informational only -
 * the fetch still works and static generation proceeds normally.
 * The in-memory caches handle deduplication during the build process.
 */
async function fetchBlobJson<T>(path: string): Promise<T | null> {
  try {
    const url = getBlobUrl(path);
    if (!url) return null;

    const response = await fetch(url, {
      // Use force-cache to enable static generation
      // Large files (>2MB) will show cache warnings but still work
      cache: "force-cache",
    });
    if (!response.ok) return null;

    return response.json();
  } catch (error) {
    console.error(`Failed to fetch blob: ${path}`, error);
    return null;
  }
}

/**
 * Get the manifest for a build
 */
export async function getManifest(buildId: string): Promise<Manifest | null> {
  // Check cache first
  if (manifestCache.has(buildId)) {
    return manifestCache.get(buildId)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/reference.manifest.json`;
  const manifest = await fetchBlobJson<Manifest>(path);

  if (manifest) {
    manifestCache.set(buildId, manifest);
  }

  return manifest;
}

/**
 * Get the routing map for a package from Vercel Blob.
 * Routing maps are much smaller than full symbols and contain only
 * the slug → kind mapping needed for static generation.
 */
export async function getRoutingMap(
  buildId: string,
  packageId: string,
  language: "python" | "typescript"
): Promise<RoutingMap | null> {
  const cacheKey = `${buildId}:${packageId}`;

  if (routingCache.has(cacheKey)) {
    return routingCache.get(cacheKey)!;
  }

  // Routing maps are stored at ir/{buildId}/routing/{language}/{packageId}.json
  const path = `${IR_BASE_PATH}/${buildId}/routing/${language}/${packageId}.json`;
  const routingMap = await fetchBlobJson<RoutingMap>(path);

  if (routingMap) {
    routingCache.set(cacheKey, routingMap);
  }

  return routingMap;
}

/**
 * Get the shard prefix for a symbol ID
 */
function getShardPrefix(symbolId: string): string {
  // Use first 2 characters of the hash part of the symbol ID
  // Format: sym_{kind}_{hash}
  const parts = symbolId.split("_");
  if (parts.length >= 3) {
    return parts[2].substring(0, 2);
  }
  return "00";
}

/**
 * Get symbols from a shard
 */
export async function getSymbolShard(
  buildId: string,
  packageId: string,
  shardPrefix: string
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
 * Get a specific symbol by ID
 */
export async function getSymbol(
  buildId: string,
  packageId: string,
  symbolId: string
): Promise<SymbolRecord | null> {
  const shardPrefix = getShardPrefix(symbolId);
  const symbols = await getSymbolShard(buildId, packageId, shardPrefix);

  if (!symbols) {
    return null;
  }

  return symbols.find((s) => s.id === symbolId) || null;
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
  symbolPath: string
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
  packageId: string
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

/**
 * Get package info from manifest
 */
export async function getPackageInfo(
  buildId: string,
  packageId: string
): Promise<Package | null> {
  const manifest = await getManifest(buildId);

  if (!manifest) {
    return null;
  }

  return manifest.packages.find((p) => p.packageId === packageId) || null;
}

/**
 * Get all packages for a language
 */
export async function getPackagesForLanguage(
  buildId: string,
  language: "python" | "javascript"
): Promise<Package[]> {
  const manifest = await getManifest(buildId);

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
 * Get the latest build ID for a language and project from local symlinks
 */
export async function getLocalLatestBuildId(
  language: "python" | "javascript",
  project: string = "langchain"
): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const basePath = getLocalIrBasePath();
    const languageId = language === "python" ? "python" : "javascript";

    const symlink = path.join(basePath, `latest-${project}-${languageId}`);
    const target = await fs.readlink(symlink);
    return target;
  } catch {
    return null;
  }
}

/**
 * Local file-based loader for development
 * Falls back to reading from ir-output directory
 */
export async function getLocalManifest(buildId: string): Promise<Manifest | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const manifestPath = path.join(
      getLocalIrBasePath(),
      buildId,
      "reference.manifest.json"
    );
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
 * Get local symbols for development
 *
 * OPTIMIZATION: Uses in-memory cache to prevent duplicate file reads.
 */
export async function getLocalPackageSymbols(
  buildId: string,
  packageId: string
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
  const cacheKey = `local:${buildId}:${packageId}`;

  // Check cache first
  if (localPackageSymbolsCache.has(cacheKey)) {
    return localPackageSymbolsCache.get(cacheKey)!;
  }

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const symbolsPath = path.join(
      getLocalIrBasePath(),
      buildId,
      "packages",
      packageId,
      "symbols.json"
    );
    const content = await fs.readFile(symbolsPath, "utf-8");
    const data = JSON.parse(content);
    const symbols = data.symbols || data;
    const result = { symbols, total: symbols.length };
    localPackageSymbolsCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Get symbol by path from local storage
 */
export async function getLocalSymbolByPath(
  buildId: string,
  packageId: string,
  symbolPath: string
): Promise<SymbolRecord | null> {
  const result = await getLocalPackageSymbols(buildId, packageId);
  if (!result?.symbols) {
    return null;
  }
  return result.symbols.find((s) => s.qualifiedName === symbolPath) || null;
}

/**
 * Generate a lightweight routing map from local symbols for development.
 * This mimics what upload-ir.ts generates for production.
 */
export async function getLocalRoutingMap(
  buildId: string,
  packageId: string,
  displayName: string,
  language: "python" | "typescript"
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
    if (!["class", "function", "interface", "module", "typeAlias", "enum", "method"].includes(symbol.kind)) {
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
  project: string = "langchain"
): Promise<string | null> {
  const isProd = isProduction();
  console.log(`[getBuildIdForLanguage] isProduction=${isProd}, NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}`);
  return isProd
    ? getLatestBuildIdForLanguage(language, project)
    : getLocalLatestBuildId(language, project);
}

/**
 * Get the manifest for a build (unified - works in prod and dev)
 */
export async function getManifestData(buildId: string): Promise<Manifest | null> {
  return isProduction()
    ? getManifest(buildId)
    : getLocalManifest(buildId);
}

/**
 * Get all symbols for a package (unified - works in prod and dev)
 */
export async function getSymbols(
  buildId: string,
  packageId: string
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
  symbolPath: string
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
  language: "python" | "typescript"
): Promise<RoutingMap | null> {
  return isProduction()
    ? getRoutingMap(buildId, packageId, language)
    : getLocalRoutingMap(buildId, packageId, displayName, language);
}

// =============================================================================
// Static Generation Helpers
// =============================================================================
// These functions help generate static params for Next.js static generation

/**
 * Symbol kinds to include in static generation.
 * Limited to reduce build time on Vercel - other pages render on-demand.
 * - Packages: always included (handled separately)
 * - Modules: important for navigation and discovery
 * - Functions: commonly accessed, standalone pages
 * - Classes: core API elements, frequently accessed
 * - Methods: class methods, important for API usage
 */
const STATIC_GENERATION_KINDS = new Set(["module", "function", "class", "method"]);

/**
 * Slugify a package name for URLs
 * @example "@langchain/core" -> "langchain-core"
 * @example "langchain_core" -> "langchain-core"
 */
function slugifyPackageName(packageName: string): string {
  return packageName
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/_/g, "-")
    .toLowerCase();
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
  project: string = "langchain"
): Promise<{ slug: string[] }[]> {
  console.error(`[getStaticParamsForLanguage] Starting for ${project} ${language}`);
  const buildId = await getBuildIdForLanguage(language, project);
  if (!buildId) {
    console.error(`[getStaticParamsForLanguage] No build ID found for ${project} ${language}`);
    return [];
  }
  console.error(`[getStaticParamsForLanguage] Got buildId: ${buildId} for ${project} ${language}`);

  const manifest = await getManifestData(buildId);
  if (!manifest) {
    console.error(`[getStaticParamsForLanguage] No manifest found for build ${buildId}`);
    return [];
  }
  console.error(`[getStaticParamsForLanguage] Got manifest with ${manifest.packages.length} packages for ${project} ${language}`);

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
        pathSegments = symbolPath.includes("/")
          ? symbolPath.split("/")
          : symbolPath.split(".");
      }

      if (pathSegments.length > 0 && pathSegments[0]) {
        params.push({ slug: [packageSlug, ...pathSegments] });
      }
    }
  }

  console.log(`Generated ${params.length} static params for ${project} ${language} (using routing maps)`);
  return params;
}

