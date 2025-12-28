/**
 * IR Loader - Utilities for loading IR data from Vercel Blob/KV
 */

import { kv } from "@vercel/kv";
import { list, getDownloadUrl } from "@vercel/blob";
import type { Manifest, Package, SymbolRecord, RoutingMap } from "./types";

const IR_BASE_PATH = "ir";

/**
 * Cache for manifest data (in-memory for the request lifecycle)
 */
const manifestCache = new Map<string, Manifest>();
const routingCache = new Map<string, RoutingMap>();
const symbolShardCache = new Map<string, SymbolRecord[]>();

/**
 * Get the latest build ID from Vercel KV
 */
export async function getLatestBuildId(): Promise<string | null> {
  try {
    const buildId = await kv.get<string>("latest:build");
    return buildId;
  } catch (error) {
    console.error("Failed to get latest build ID from KV:", error);
    return null;
  }
}

/**
 * Get the latest build ID for a specific language
 */
export async function getLatestBuildIdForLanguage(
  language: "python" | "javascript"
): Promise<string | null> {
  try {
    const buildId = await kv.get<string>(`latest:${language}`);
    return buildId;
  } catch (error) {
    console.error(`Failed to get latest ${language} build ID:`, error);
    return null;
  }
}

/**
 * Fetch JSON from Vercel Blob
 */
async function fetchBlobJson<T>(path: string): Promise<T | null> {
  try {
    const url = await getDownloadUrl(path);
    if (!url) {
      return null;
    }
    const response = await fetch(url, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });
    if (!response.ok) {
      return null;
    }
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
 * Get the routing map for a package
 */
export async function getRoutingMap(
  buildId: string,
  packageId: string
): Promise<RoutingMap | null> {
  const cacheKey = `${buildId}:${packageId}`;

  if (routingCache.has(cacheKey)) {
    return routingCache.get(cacheKey)!;
  }

  const path = `${IR_BASE_PATH}/${buildId}/routing/${packageId}.json`;
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
 */
export async function getSymbolByPath(
  buildId: string,
  packageId: string,
  symbolPath: string
): Promise<SymbolRecord | null> {
  // For now, we need to load all symbols for the package
  // In production, this would use a routing map or index
  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/symbols.json`;
  const response = await fetchBlobJson<{ symbols: SymbolRecord[] }>(path);

  if (!response?.symbols) {
    return null;
  }

  return response.symbols.find((s) => s.qualifiedName === symbolPath) || null;
}

/**
 * Get all symbols for a package (paginated)
 */
export async function getPackageSymbols(
  buildId: string,
  packageId: string,
  options: { offset?: number; limit?: number } = {}
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
  const { offset = 0, limit = 100 } = options;

  const path = `${IR_BASE_PATH}/${buildId}/packages/${packageId}/symbols.json`;
  const response = await fetchBlobJson<{ symbols: SymbolRecord[] }>(path);

  if (!response?.symbols) {
    return null;
  }

  const total = response.symbols.length;
  const symbols = response.symbols.slice(offset, offset + limit);

  return { symbols, total };
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
 * Get the latest build ID for a language from local symlinks
 */
export async function getLocalLatestBuildId(
  language: "python" | "javascript"
): Promise<string | null> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const basePath = getLocalIrBasePath();
    const latestLink = path.join(
      basePath,
      language === "python" ? "latest-python" : "latest-javascript"
    );

    // Read the symlink target to get the build ID
    const target = await fs.readlink(latestLink);
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
 * Get local symbols for development
 */
export async function getLocalPackageSymbols(
  buildId: string,
  packageId: string
): Promise<{ symbols: SymbolRecord[]; total: number } | null> {
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
    return { symbols, total: symbols.length };
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

