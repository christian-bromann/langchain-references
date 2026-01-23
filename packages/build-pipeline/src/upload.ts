/**
 * Upload Utilities
 *
 * Uploads IR artifacts to Vercel Blob storage.
 * Handles sharding, routing maps, and search indices.
 */

import {
  put,
  list,
  del,
  BlobServiceRateLimited,
  BlobUnknownError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
} from "@vercel/blob";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { SymbolRecord, RoutingMap, PackageChangelog, Language } from "@langchain/ir-schema";
import { renderMarkdown } from "./markdown-renderer.js";

// Maximum concurrent uploads to avoid overwhelming the Vercel Blob API
// Vercel Blob has strict rate limits, so we keep this conservative
const MAX_CONCURRENT_UPLOADS = 5;

// Retry configuration for rate limit errors
const MAX_RETRIES = 5;
const MIN_RETRY_DELAY_MS = 2000; // Minimum 2 seconds even if retryAfter is 0
const MAX_RETRY_DELAY_MS = 60000; // Maximum 60 seconds

export interface UploadOptions {
  buildId: string;
  irOutputPath: string;
  dryRun?: boolean;
  /** Enable package-level upload (new structure) */
  packageLevel?: boolean;
  /** Package ID for package-level uploads */
  packageId?: string;
}

export interface UploadResult {
  buildId: string;
  uploadedAt: string;
  files: number;
  totalSize: number;
}

interface UploadTask {
  blobPath: string;
  content: string | Buffer;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a transient network error that should be retried.
 */
function isTransientError(error: unknown): boolean {
  return (
    error instanceof BlobUnknownError ||
    error instanceof BlobRequestAbortedError ||
    error instanceof BlobServiceNotAvailable
  );
}

/**
 * Upload a single blob with retry logic for rate limits and transient errors.
 * Uses the Retry-After header value from the BlobServiceRateLimited error,
 * with exponential backoff and jitter as fallback.
 */
export async function putWithRetry(
  blobPath: string,
  content: string | Buffer,
  options: Parameters<typeof put>[2],
): Promise<Awaited<ReturnType<typeof put>>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await put(blobPath, content, options);
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error using the SDK's typed error
      if (error instanceof BlobServiceRateLimited) {
        if (attempt < MAX_RETRIES - 1) {
          // Calculate delay: use retryAfter if provided, otherwise exponential backoff
          // retryAfter can be 0 when the API doesn't provide a specific wait time
          const retryAfterMs = error.retryAfter * 1000;
          const exponentialBackoff = MIN_RETRY_DELAY_MS * Math.pow(2, attempt);

          // Use the larger of retryAfter or exponential backoff, with a minimum floor
          let delay = Math.max(retryAfterMs, exponentialBackoff, MIN_RETRY_DELAY_MS);

          // Cap at maximum delay
          delay = Math.min(delay, MAX_RETRY_DELAY_MS);

          // Add random jitter (0-25%) to prevent thundering herd
          const jitter = delay * Math.random() * 0.25;
          delay = Math.round(delay + jitter);

          console.log(
            `   ⏳ Rate limited, waiting ${(delay / 1000).toFixed(1)}s before retry (attempt ${attempt + 1}/${MAX_RETRIES})...`,
          );
          await sleep(delay);
          continue;
        }
      }

      // Check if it's a transient network error that should be retried
      if (isTransientError(error)) {
        if (attempt < MAX_RETRIES - 1) {
          // Use exponential backoff for transient errors
          const exponentialBackoff = MIN_RETRY_DELAY_MS * Math.pow(2, attempt);
          let delay = Math.min(exponentialBackoff, MAX_RETRY_DELAY_MS);

          // Add random jitter (0-25%) to prevent thundering herd
          const jitter = delay * Math.random() * 0.25;
          delay = Math.round(delay + jitter);

          const errorName = (error as Error).constructor.name;
          console.log(
            `   ⏳ ${errorName}, waiting ${(delay / 1000).toFixed(1)}s before retry (attempt ${attempt + 1}/${MAX_RETRIES})...`,
          );
          await sleep(delay);
          continue;
        }
      }

      // For non-retryable errors, throw immediately
      throw error;
    }
  }

  throw lastError || new Error(`Failed to upload ${blobPath} after ${MAX_RETRIES} attempts`);
}

/**
 * Upload a single file to Vercel Blob with retry logic for rate limits.
 */
async function uploadFile(
  blobPath: string,
  content: string | Buffer,
  dryRun: boolean,
): Promise<{ url: string; size: number }> {
  const size = Buffer.byteLength(content);

  if (dryRun) {
    return { url: `https://blob.vercel-storage.com/${blobPath}`, size };
  }

  const blob = await putWithRetry(blobPath, content, {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });

  return { url: blob.url, size };
}

/**
 * Upload multiple files in parallel with concurrency limit.
 */
async function uploadFilesInParallel(
  tasks: UploadTask[],
  dryRun: boolean,
  onProgress?: (completed: number, total: number) => void,
): Promise<{ filesUploaded: number; totalSize: number }> {
  let filesUploaded = 0;
  let totalSize = 0;
  let completed = 0;

  // Process tasks in batches
  for (let i = 0; i < tasks.length; i += MAX_CONCURRENT_UPLOADS) {
    const batch = tasks.slice(i, i + MAX_CONCURRENT_UPLOADS);

    const results = await Promise.all(
      batch.map(async (task) => {
        const result = await uploadFile(task.blobPath, task.content, dryRun);
        completed++;
        onProgress?.(completed, tasks.length);
        return result;
      }),
    );

    for (const result of results) {
      filesUploaded++;
      totalSize += result.size;
    }

    // Delay between batches to avoid rate limiting
    if (i + MAX_CONCURRENT_UPLOADS < tasks.length && !dryRun) {
      await sleep(500);
    }
  }

  return { filesUploaded, totalSize };
}

/**
 * Shard symbols by ID prefix for efficient loading.
 */
function shardSymbols(symbols: SymbolRecord[]): Map<string, SymbolRecord[]> {
  const shards = new Map<string, SymbolRecord[]>();

  for (const symbol of symbols) {
    // Use first 2 characters of the symbol ID as shard key
    const shardKey = symbol.id.substring(0, 2);
    const existing = shards.get(shardKey) || [];
    existing.push(symbol);
    shards.set(shardKey, existing);
  }

  return shards;
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
 * Generate routing map from symbols.
 *
 * The routing map uses qualifiedName as the key to match the format expected
 * by getStaticParamsForLanguage which splits by "." to generate URL segments.
 *
 * Example: "langchain_classic.model_laboratory.ModelLaboratory" ->
 *          /python/langchain-classic/model_laboratory/ModelLaboratory
 */
export function generateRoutingMap(
  packageId: string,
  displayName: string,
  language: Language,
  symbols: SymbolRecord[],
): RoutingMap {
  const slugs: RoutingMap["slugs"] = {};

  for (const symbol of symbols) {
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

    // Use qualifiedName as key (e.g., "langchain_classic.model_laboratory.ModelLaboratory")
    // This matches the format expected by getStaticParamsForLanguage
    slugs[symbol.qualifiedName] = {
      refId: symbol.id,
      kind: symbol.kind,
      pageType: mapKindToPageType(symbol.kind),
      title: symbol.name,
    };
  }

  return {
    packageId,
    displayName,
    language,
    slugs,
  };
}

/**
 * Map symbol kind to page type.
 */
function mapKindToPageType(kind: string): RoutingMap["slugs"][string]["pageType"] {
  switch (kind) {
    case "class":
      return "class";
    case "function":
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
// SHARDED INDEX GENERATION
// =============================================================================
// These functions generate small, sharded index files (<500KB each) to avoid
// hitting Next.js's 2MB data cache limit and enable CDN caching.

/**
 * Compute a shard key from a qualified name using MD5 hash.
 * Returns first 2 hex characters (00-ff = 256 possible shards).
 */
function computeShardKey(qualifiedName: string): string {
  const hash = createHash("md5").update(qualifiedName).digest("hex");
  return hash.substring(0, 2);
}

/**
 * Lookup index - maps qualifiedName to symbol info for efficient lookups
 */
export interface LookupIndex {
  packageId: string;
  symbolCount: number;
  /** Symbol names that can be linked (classes, interfaces, typeAliases, enums) */
  knownSymbols: string[];
  /** Map of qualifiedName -> symbol info */
  symbols: Record<string, SymbolLookupEntry>;
}

/**
 * Generate a single lookup index file.
 * Contains qualifiedName -> { id, kind, name } mappings for all symbols.
 * This replaces the previous sharded approach which created 200+ small files.
 */
export function generateLookupIndex(
  packageId: string,
  symbols: SymbolRecord[],
): LookupIndex {
  const symbolsMap: Record<string, SymbolLookupEntry> = {};
  const knownSymbols: string[] = [];
  const linkableKinds = ["class", "interface", "typeAlias", "enum"];

  for (const symbol of symbols) {
    symbolsMap[symbol.qualifiedName] = {
      id: symbol.id,
      kind: symbol.kind,
      name: symbol.name,
    };

    // Track linkable symbol names for type linking
    if (linkableKinds.includes(symbol.kind)) {
      knownSymbols.push(symbol.name);
    }
  }

  return {
    packageId,
    symbolCount: symbols.length,
    knownSymbols: [...new Set(knownSymbols)],
    symbols: symbolsMap,
  };
}

/**
 * Catalog entry - lightweight symbol summary for package overview
 */
interface CatalogEntry {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  summaryHtml?: string;
  signature?: string;
}

/**
 * Catalog entry - lightweight symbol summary for package overview
 */
export interface CatalogEntryPublic {
  id: string;
  kind: string;
  name: string;
  qualifiedName: string;
  summaryHtml?: string;
  signature?: string;
}

/**
 * Generate a single catalog file containing all public symbols.
 * This replaces the previous sharded approach which created 100+ small files.
 */
export async function generateCatalog(
  packageId: string,
  symbols: SymbolRecord[],
): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];

  // First pass: collect entries and queue summaries for rendering
  const entriesToRender: { index: number; summary: string }[] = [];

  for (const symbol of symbols) {
    // Only include public symbols that should appear in package overview
    if (symbol.tags?.visibility !== "public") continue;
    if (!["class", "function", "interface", "module", "typeAlias", "enum"].includes(symbol.kind))
      continue;

    const summary = symbol.docs?.summary?.substring(0, 200);
    const index = entries.length;

    // Note: We don't store raw `summary` anymore - only `summaryHtml`
    // This reduces catalog size and avoids redundancy
    entries.push({
      id: symbol.id,
      kind: symbol.kind,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      signature: symbol.signature?.substring(0, 300),
    });

    // Queue for HTML rendering if summary exists
    if (summary) {
      entriesToRender.push({ index, summary });
    }
  }

  // Second pass: batch render summaries to HTML
  if (entriesToRender.length > 0) {
    // Render in parallel with concurrency limit
    const BATCH_SIZE = 20;
    for (let i = 0; i < entriesToRender.length; i += BATCH_SIZE) {
      const batch = entriesToRender.slice(i, i + BATCH_SIZE);
      const htmlResults = await Promise.all(
        batch.map(({ summary }) => renderMarkdown(summary)),
      );

      // Store results back in entries
      for (let j = 0; j < batch.length; j++) {
        const { index } = batch[j];
        entries[index].summaryHtml = htmlResults[j];
      }
    }
  }

  return entries;
}

/**
 * Changelog entry for a single symbol
 */
interface SymbolChangelogEntry {
  version: string;
  releaseDate: string;
  type: "added" | "modified" | "deprecated" | "removed";
}

/**
 * Sharded changelog manifest
 */
interface ShardedChangelogIndex {
  packageId: string;
  generatedAt: string;
  versions: Array<{ version: string; releaseDate: string }>;
  shards: string[];
}

/**
 * Single shard of the changelog
 */
type ChangelogShard = Record<string, SymbolChangelogEntry[]>;

/**
 * Generate sharded changelog files.
 * Each shard contains symbol histories keyed by qualifiedName.
 */
function generateShardedChangelog(changelog: PackageChangelog): {
  index: ShardedChangelogIndex;
  shards: Map<string, ChangelogShard>;
} {
  const shards = new Map<string, ChangelogShard>();
  const versions: Array<{ version: string; releaseDate: string }> = [];

  // Process each version delta
  for (const delta of changelog.history) {
    versions.push({ version: delta.version, releaseDate: delta.releaseDate });

    // Process added symbols
    for (const added of delta.added) {
      addToChangelogShard(shards, added.qualifiedName, {
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "added",
      });
    }

    // Process modified symbols
    for (const modified of delta.modified) {
      addToChangelogShard(shards, modified.qualifiedName, {
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "modified",
      });
    }

    // Process deprecated symbols
    for (const deprecated of delta.deprecated) {
      addToChangelogShard(shards, deprecated.qualifiedName, {
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "deprecated",
      });
    }

    // Process removed symbols
    for (const removed of delta.removed) {
      addToChangelogShard(shards, removed.qualifiedName, {
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "removed",
      });
    }
  }

  const index: ShardedChangelogIndex = {
    packageId: changelog.packageId,
    generatedAt: changelog.generatedAt,
    versions,
    shards: Array.from(shards.keys()).sort(),
  };

  return { index, shards };
}

/**
 * Helper to add a changelog entry to the appropriate shard.
 */
function addToChangelogShard(
  shards: Map<string, ChangelogShard>,
  qualifiedName: string,
  entry: SymbolChangelogEntry,
): void {
  const shardKey = computeShardKey(qualifiedName);

  if (!shards.has(shardKey)) {
    shards.set(shardKey, {});
  }

  const shard = shards.get(shardKey)!;
  if (!shard[qualifiedName]) {
    shard[qualifiedName] = [];
  }

  shard[qualifiedName].push(entry);
}

/**
 * Upload all IR artifacts for a build.
 */
export async function uploadIR(options: UploadOptions): Promise<UploadResult> {
  const { packageLevel, packageId } = options;

  if (!packageLevel || !packageId) {
    throw new Error("Package-level uploads require packageLevel: true and packageId");
  }

  return uploadPackageIR(options);
}

/**
 * Upload IR artifacts for a single package with package-level structure.
 *
 * New blob structure: ir/packages/{packageId}/{buildId}/...
 * This allows independent package updates without affecting other packages.
 */
async function uploadPackageIR(options: UploadOptions): Promise<UploadResult> {
  const { buildId, irOutputPath, dryRun = false, packageId } = options;

  if (!packageId) {
    throw new Error("packageId is required for package-level uploads");
  }

  console.log(`\n☁️  Uploading package IR artifacts for ${packageId}`);
  console.log(`   Build ID: ${buildId}`);
  console.log(`   Concurrency: ${MAX_CONCURRENT_UPLOADS} parallel uploads`);
  if (dryRun) {
    console.log("   (dry-run mode - no actual uploads)\n");
  }

  let filesUploaded = 0;
  let totalSize = 0;

  // For package-level builds, symbols.json is directly in irOutputPath
  const symbolsPath = path.join(irOutputPath, "symbols.json");
  let symbols: SymbolRecord[] = [];

  try {
    const symbolsContent = await fs.readFile(symbolsPath, "utf-8");
    const parsed = JSON.parse(symbolsContent);
    symbols = Array.isArray(parsed) ? parsed : parsed.symbols || [];
  } catch {
    console.log(`   ⚠️  No symbols file found at ${symbolsPath}`);
    return { buildId, uploadedAt: new Date().toISOString(), files: 0, totalSize: 0 };
  }

  console.log(`   📦 ${packageId}: ${symbols.length} symbols`);

  // Base path for package-level storage: ir/packages/{packageId}/{buildId}/
  const basePath = `ir/packages/${packageId}/${buildId}`;

  const uploadTasks: UploadTask[] = [];

  // Upload package.json (package info, replaces manifest for package-level)
  const packageInfoPath = path.join(irOutputPath, "package.json");
  try {
    const packageInfoContent = await fs.readFile(packageInfoPath, "utf-8");
    uploadTasks.push({
      blobPath: `${basePath}/package.json`,
      content: packageInfoContent,
    });
  } catch {
    // Package info is optional
  }

  // Upload symbols.json
  uploadTasks.push({
    blobPath: `${basePath}/symbols.json`,
    content: JSON.stringify({ symbols }, null, 2),
  });

  // Get language from package info or infer from packageId
  const language = packageId.startsWith("pkg_py_") ? "python" : "typescript";

  // Generate and upload routing map
  // For package-level, we need displayName from package.json
  let displayName = packageId;
  try {
    const packageInfoContent = await fs.readFile(packageInfoPath, "utf-8");
    const packageInfo = JSON.parse(packageInfoContent);
    displayName = packageInfo.displayName || packageInfo.publishedName || packageId;
  } catch {
    // Use packageId as fallback
  }

  const routingMap = generateRoutingMap(packageId, displayName, language as Language, symbols);
  uploadTasks.push({
    blobPath: `${basePath}/routing.json`,
    content: JSON.stringify(routingMap, null, 2),
  });

  // Generate and upload sharded lookup index
  // Generate and upload single lookup file
  const lookupIndex = generateLookupIndex(packageId, symbols);
  uploadTasks.push({
    blobPath: `${basePath}/lookup.json`,
    content: JSON.stringify(lookupIndex),
  });

  // Generate and upload single catalog file (with pre-rendered HTML)
  const catalogEntries = await generateCatalog(packageId, symbols);
  uploadTasks.push({
    blobPath: `${basePath}/catalog.json`,
    content: JSON.stringify(catalogEntries),
  });

  // Upload individual symbols (sharded)
  const shards = shardSymbols(symbols);
  for (const [shardKey, shardSymbolList] of shards) {
    for (const symbol of shardSymbolList) {
      uploadTasks.push({
        blobPath: `${basePath}/symbols/${shardKey}/${symbol.id}.json`,
        content: JSON.stringify(symbol, null, 2),
      });
    }
  }

  // Upload changelog if it exists
  const changelogPath = path.join(irOutputPath, "changelog.json");
  let changelogContent: string | null = null;
  try {
    changelogContent = await fs.readFile(changelogPath, "utf-8");
    const changelog: PackageChangelog = JSON.parse(changelogContent);

    // Generate sharded changelog
    const { index: changelogIndex, shards: changelogShards } = generateShardedChangelog(changelog);
    uploadTasks.push({
      blobPath: `${basePath}/changelog/index.json`,
      content: JSON.stringify(changelogIndex),
    });
    for (const [shardKey, shardData] of changelogShards) {
      uploadTasks.push({
        blobPath: `${basePath}/changelog/${shardKey}.json`,
        content: JSON.stringify(shardData),
      });
    }
  } catch {
    // No changelog file - skip
  }

  // Upload versions.json if it exists
  const versionsPath = path.join(irOutputPath, "versions.json");
  try {
    const versionsContent = await fs.readFile(versionsPath, "utf-8");
    uploadTasks.push({
      blobPath: `${basePath}/versions.json`,
      content: versionsContent,
    });
  } catch {
    // No versions file - skip
  }

  // Upload subpages directory if it exists
  const subpagesDir = path.join(irOutputPath, "subpages");
  try {
    const subpageFiles = await fs.readdir(subpagesDir);
    for (const file of subpageFiles) {
      if (file.endsWith(".json")) {
        const subpageContent = await fs.readFile(path.join(subpagesDir, file), "utf-8");
        uploadTasks.push({
          blobPath: `${basePath}/subpages/${file}`,
          content: subpageContent,
        });
      }
    }
    if (subpageFiles.length > 0) {
      console.log(`   📄 ${subpageFiles.length} subpage files`);
    }
  } catch {
    // No subpages directory - skip
  }

  console.log(`   Total upload tasks: ${uploadTasks.length}`);

  // Upload all files in parallel
  console.log("\n⬆️  Uploading files...");
  const startTime = Date.now();
  let lastProgressLog = 0;

  const result = await uploadFilesInParallel(uploadTasks, dryRun, (completed, total) => {
    const progress = Math.floor((completed / total) * 100);
    if (progress >= lastProgressLog + 10 || completed === total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   Progress: ${completed}/${total} (${progress}%) - ${elapsed}s elapsed`);
      lastProgressLog = progress;
    }
  });

  filesUploaded += result.filesUploaded;
  totalSize += result.totalSize;

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const uploadedAt = new Date().toISOString();

  console.log(`\n✅ Package upload complete!`);
  console.log(`   Files: ${filesUploaded}`);
  console.log(`   Total size: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`   Time: ${totalTime}s`);
  console.log(`   Speed: ${(filesUploaded / parseFloat(totalTime)).toFixed(1)} files/sec`);

  return {
    buildId,
    uploadedAt,
    files: filesUploaded,
    totalSize,
  };
}

/**
 * Delete old builds from Vercel Blob to save storage.
 */
export async function cleanupOldBuilds(keepBuilds: string[], dryRun = false): Promise<number> {
  console.log("\n🧹 Cleaning up old builds...");

  const { blobs } = await list({ prefix: "ir/" });

  // Group blobs by build ID
  const buildIds = new Set<string>();
  for (const blob of blobs) {
    const match = blob.pathname.match(/^ir\/([^/]+)\//);
    if (match) {
      buildIds.add(match[1]);
    }
  }

  let deletedCount = 0;
  for (const buildId of buildIds) {
    if (keepBuilds.includes(buildId)) {
      console.log(`   Keeping: ${buildId}`);
      continue;
    }

    if (dryRun) {
      console.log(`   [dry-run] Would delete: ${buildId}`);
    } else {
      const buildBlobs = blobs.filter((b) => b.pathname.startsWith(`ir/${buildId}/`));
      for (const blob of buildBlobs) {
        await del(blob.url);
        deletedCount++;
      }
      console.log(`   Deleted: ${buildId} (${buildBlobs.length} files)`);
    }
  }

  return deletedCount;
}
