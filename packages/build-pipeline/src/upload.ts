/**
 * Upload Utilities
 *
 * Uploads IR artifacts to Vercel Blob storage.
 * Handles sharding, routing maps, and search indices.
 */

import { put, list, del } from "@vercel/blob";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { Manifest, SymbolRecord, RoutingMap, SearchIndex, PackageChangelog } from "@langchain/ir-schema";

// Maximum concurrent uploads to avoid overwhelming the Vercel Blob API
// Vercel Blob has rate limits, so we keep this conservative
const MAX_CONCURRENT_UPLOADS = 10;

// Retry configuration for rate limit errors
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;

export interface UploadOptions {
  buildId: string;
  irOutputPath: string;
  dryRun?: boolean;
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
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a single file to Vercel Blob with retry logic for rate limits.
 */
async function uploadFile(
  blobPath: string,
  content: string | Buffer,
  dryRun: boolean
): Promise<{ url: string; size: number }> {
  const size = Buffer.byteLength(content);

  if (dryRun) {
    return { url: `https://blob.vercel-storage.com/${blobPath}`, size };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const blob = await put(blobPath, content, {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true,
      });
      return { url: blob.url, size };
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || "";

      // Check if it's a rate limit error
      if (errorMessage.includes("Too many requests") || errorMessage.includes("rate limit")) {
        // Extract wait time from error message if available (e.g., "try again in 42 seconds")
        const waitMatch = errorMessage.match(/try again in (\d+) seconds/i);
        const waitSeconds = waitMatch ? parseInt(waitMatch[1], 10) : null;

        // Use exponential backoff, but respect the API's suggested wait time if provided
        const backoffDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        const delay = waitSeconds ? (waitSeconds * 1000) + 1000 : backoffDelay;

        if (attempt < MAX_RETRIES - 1) {
          console.log(`   ⏳ Rate limited, waiting ${(delay / 1000).toFixed(0)}s before retry (attempt ${attempt + 1}/${MAX_RETRIES})...`);
          await sleep(delay);
          continue;
        }
      }

      // For non-rate-limit errors, don't retry
      throw error;
    }
  }

  throw lastError || new Error(`Failed to upload ${blobPath} after ${MAX_RETRIES} attempts`);
}

/**
 * Upload multiple files in parallel with concurrency limit.
 */
async function uploadFilesInParallel(
  tasks: UploadTask[],
  dryRun: boolean,
  onProgress?: (completed: number, total: number) => void
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
      })
    );

    for (const result of results) {
      filesUploaded++;
      totalSize += result.size;
    }

    // Small delay between batches to avoid rate limiting
    if (i + MAX_CONCURRENT_UPLOADS < tasks.length && !dryRun) {
      await sleep(100);
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
 * Symbol lookup index - maps qualifiedName to symbol info for efficient lookups
 */
interface SymbolLookupIndex {
  packageId: string;
  symbolCount: number;
  // Map of qualifiedName -> { id, kind, name }
  symbols: Record<string, SymbolLookupEntry>;
  // List of linkable symbol names (for type linking in UI)
  knownSymbols: string[];
}

/**
 * Generate a symbol lookup index for efficient single-symbol fetching.
 * This is a small file (~50-100KB) that maps qualifiedName -> symbolId.
 */
function generateSymbolLookupIndex(
  packageId: string,
  symbols: SymbolRecord[]
): SymbolLookupIndex {
  const symbolMap: Record<string, SymbolLookupEntry> = {};
  const knownSymbols: string[] = [];
  const linkableKinds = ["class", "interface", "typeAlias", "enum"];

  for (const symbol of symbols) {
    symbolMap[symbol.qualifiedName] = {
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
    symbols: symbolMap,
    knownSymbols: [...new Set(knownSymbols)], // Dedupe
  };
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
function generateRoutingMap(
  packageId: string,
  displayName: string,
  language: "python" | "typescript",
  symbols: SymbolRecord[]
): RoutingMap {
  const slugs: RoutingMap["slugs"] = {};

  for (const symbol of symbols) {
    // Only include routable symbol kinds
    if (!["class", "function", "interface", "module", "typeAlias", "enum", "method"].includes(symbol.kind)) {
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

/**
 * Generate search index from symbols.
 */
function generateSearchIndex(
  buildId: string,
  language: "python" | "typescript",
  symbols: SymbolRecord[]
): SearchIndex {
  const records = symbols
    .filter((s) => ["class", "function", "interface", "module", "method", "typeAlias"].includes(s.kind))
    .map((symbol) => ({
      id: symbol.id,
      url: symbol.urls.canonical,
      title: symbol.name,
      breadcrumbs: symbol.qualifiedName.split("."),
      excerpt: symbol.docs.summary.substring(0, 150),
      keywords: extractKeywords(symbol),
      kind: symbol.kind,
      language,
      packageId: symbol.packageId,
    }));

  return {
    version: "1.0",
    buildId,
    createdAt: new Date().toISOString(),
    language,
    totalRecords: records.length,
    records,
  };
}

/**
 * Extract keywords from symbol for search boosting.
 */
function extractKeywords(symbol: SymbolRecord): string[] {
  const keywords: string[] = [symbol.name.toLowerCase()];

  // Add name parts (e.g., "ChatOpenAI" -> ["chat", "openai"])
  const parts = symbol.name.split(/(?=[A-Z])/).map((p) => p.toLowerCase());
  keywords.push(...parts);

  // Add from qualified name
  const qualifiedParts = symbol.qualifiedName.split(".");
  keywords.push(...qualifiedParts.map((p) => p.toLowerCase()));

  return [...new Set(keywords)];
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
 * Sharded lookup index manifest
 */
interface ShardedLookupIndex {
  packageId: string;
  symbolCount: number;
  shards: string[];
  knownSymbols: string[];
}

/**
 * Single shard of the lookup index
 */
type LookupShard = Record<string, SymbolLookupEntry>;

/**
 * Generate sharded lookup index files.
 * Each shard contains qualifiedName -> { id, kind, name } mappings for symbols
 * whose qualifiedName hashes to that shard.
 */
function generateShardedLookupIndex(
  packageId: string,
  symbols: SymbolRecord[]
): { index: ShardedLookupIndex; shards: Map<string, LookupShard> } {
  const shards = new Map<string, LookupShard>();
  const knownSymbols: string[] = [];
  const linkableKinds = ["class", "interface", "typeAlias", "enum"];

  for (const symbol of symbols) {
    const shardKey = computeShardKey(symbol.qualifiedName);
    
    if (!shards.has(shardKey)) {
      shards.set(shardKey, {});
    }
    
    shards.get(shardKey)![symbol.qualifiedName] = {
      id: symbol.id,
      kind: symbol.kind,
      name: symbol.name,
    };

    // Track linkable symbol names for type linking
    if (linkableKinds.includes(symbol.kind)) {
      knownSymbols.push(symbol.name);
    }
  }

  const index: ShardedLookupIndex = {
    packageId,
    symbolCount: symbols.length,
    shards: Array.from(shards.keys()).sort(),
    knownSymbols: [...new Set(knownSymbols)],
  };

  return { index, shards };
}

/**
 * Catalog entry - lightweight symbol summary for package overview
 */
interface CatalogEntry {
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
 * Generate sharded catalog files for package overview pages.
 * Each shard contains lightweight symbol summaries.
 */
function generateShardedCatalog(
  packageId: string,
  symbols: SymbolRecord[]
): { index: ShardedCatalogIndex; shards: Map<string, CatalogEntry[]> } {
  const shards = new Map<string, CatalogEntry[]>();

  for (const symbol of symbols) {
    // Only include public symbols that should appear in package overview
    if (symbol.tags?.visibility !== "public") continue;
    if (!["class", "function", "interface", "module", "typeAlias", "enum"].includes(symbol.kind)) continue;

    const shardKey = computeShardKey(symbol.qualifiedName);
    
    if (!shards.has(shardKey)) {
      shards.set(shardKey, []);
    }
    
    shards.get(shardKey)!.push({
      id: symbol.id,
      kind: symbol.kind,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      summary: symbol.docs?.summary?.substring(0, 200),
      signature: symbol.signature?.substring(0, 300),
    });
  }

  const index: ShardedCatalogIndex = {
    packageId,
    symbolCount: symbols.length,
    shards: Array.from(shards.keys()).sort(),
  };

  return { index, shards };
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
function generateShardedChangelog(
  changelog: PackageChangelog
): { index: ShardedChangelogIndex; shards: Map<string, ChangelogShard> } {
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
  entry: SymbolChangelogEntry
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
  const { buildId, irOutputPath, dryRun = false } = options;

  console.log(`\n☁️  Uploading IR artifacts for build ${buildId}`);
  console.log(`   Concurrency: ${MAX_CONCURRENT_UPLOADS} parallel uploads`);
  if (dryRun) {
    console.log("   (dry-run mode - no actual uploads)\n");
  }

  let filesUploaded = 0;
  let totalSize = 0;

  // Load manifest
  const manifestPath = path.join(irOutputPath, "reference.manifest.json");
  const manifestContent = await fs.readFile(manifestPath, "utf-8");
  const manifest: Manifest = JSON.parse(manifestContent);

  // Upload manifest first (single file, quick)
  console.log("\n📄 Uploading manifest...");
  const manifestResult = await uploadFile(
    `ir/${buildId}/reference.manifest.json`,
    manifestContent,
    dryRun
  );
  filesUploaded++;
  totalSize += manifestResult.size;
  console.log("   ✓ Manifest uploaded");

  // Collect all upload tasks
  console.log("\n📦 Preparing upload tasks...");
  const uploadTasks: UploadTask[] = [];
  const packageSymbolCounts: Map<string, number> = new Map();

  for (const pkg of manifest.packages) {
    // Load symbols for this package
    const symbolsPath = path.join(irOutputPath, "packages", pkg.packageId, "symbols.json");
    let symbols: SymbolRecord[] = [];

    try {
      const symbolsContent = await fs.readFile(symbolsPath, "utf-8");
      const parsed = JSON.parse(symbolsContent);
      // Handle both formats: { symbols: [...] } or just [...]
      symbols = Array.isArray(parsed) ? parsed : (parsed.symbols || []);
    } catch {
      console.log(`   ⚠️  No symbols file found for ${pkg.packageId}`);
      continue;
    }

    packageSymbolCounts.set(pkg.displayName, symbols.length);

    // Add package-level symbols.json (used by getPackageSymbols and getSymbolByPath)
    uploadTasks.push({
      blobPath: `ir/${buildId}/packages/${pkg.packageId}/symbols.json`,
      content: JSON.stringify({ symbols }, null, 2),
    });

    // Add routing map task
    const routingMap = generateRoutingMap(
      pkg.packageId,
      pkg.displayName,
      pkg.language,
      symbols
    );
    uploadTasks.push({
      blobPath: `ir/${buildId}/routing/${pkg.language}/${pkg.packageId}.json`,
      content: JSON.stringify(routingMap, null, 2),
    });

    // Add SHARDED symbol lookup index (replaces monolithic lookup.json)
    const { index: lookupIndex, shards: lookupShards } = generateShardedLookupIndex(pkg.packageId, symbols);
    
    // Upload lookup index manifest
    uploadTasks.push({
      blobPath: `ir/${buildId}/packages/${pkg.packageId}/lookup/index.json`,
      content: JSON.stringify(lookupIndex),
    });
    
    // Upload lookup shards
    for (const [shardKey, shardData] of lookupShards) {
      uploadTasks.push({
        blobPath: `ir/${buildId}/packages/${pkg.packageId}/lookup/${shardKey}.json`,
        content: JSON.stringify(shardData),
      });
    }
    
    // Also upload legacy lookup.json for backward compatibility (can be removed later)
    const legacyLookupIndex = generateSymbolLookupIndex(pkg.packageId, symbols);
    uploadTasks.push({
      blobPath: `ir/${buildId}/packages/${pkg.packageId}/lookup.json`,
      content: JSON.stringify(legacyLookupIndex),
    });
    
    // Add SHARDED catalog for package overview pages
    const { index: catalogIndex, shards: catalogShards } = generateShardedCatalog(pkg.packageId, symbols);
    
    // Upload catalog index manifest
    uploadTasks.push({
      blobPath: `ir/${buildId}/packages/${pkg.packageId}/catalog/index.json`,
      content: JSON.stringify(catalogIndex),
    });
    
    // Upload catalog shards
    for (const [shardKey, shardData] of catalogShards) {
      uploadTasks.push({
        blobPath: `ir/${buildId}/packages/${pkg.packageId}/catalog/${shardKey}.json`,
        content: JSON.stringify(shardData),
      });
    }

    // Add individual symbol tasks (sharded for efficient single-symbol lookups)
    const shards = shardSymbols(symbols);
    for (const [shardKey, shardSymbols] of shards) {
      for (const symbol of shardSymbols) {
        uploadTasks.push({
          blobPath: `ir/${buildId}/symbols/${shardKey}/${symbol.id}.json`,
          content: JSON.stringify(symbol, null, 2),
        });
      }
    }

    // Add SHARDED changelog if it exists (generated with --with-versions)
    const changelogPath = path.join(irOutputPath, "packages", pkg.packageId, "changelog.json");
    try {
      const changelogContent = await fs.readFile(changelogPath, "utf-8");
      const changelog: PackageChangelog = JSON.parse(changelogContent);
      
      // Generate sharded changelog
      const { index: changelogIndex, shards: changelogShards } = generateShardedChangelog(changelog);
      
      // Upload changelog index manifest
      uploadTasks.push({
        blobPath: `ir/${buildId}/packages/${pkg.packageId}/changelog/index.json`,
        content: JSON.stringify(changelogIndex),
      });
      
      // Upload changelog shards
      for (const [shardKey, shardData] of changelogShards) {
        uploadTasks.push({
          blobPath: `ir/${buildId}/packages/${pkg.packageId}/changelog/${shardKey}.json`,
          content: JSON.stringify(shardData),
        });
      }
      
      // Also upload legacy changelog.json for backward compatibility (can be removed later)
      uploadTasks.push({
        blobPath: `ir/${buildId}/packages/${pkg.packageId}/changelog.json`,
        content: changelogContent,
      });
    } catch {
      // No changelog file - skip
    }

    // Add versions.json if it exists (generated with --with-versions)
    const versionsPath = path.join(irOutputPath, "packages", pkg.packageId, "versions.json");
    try {
      const versionsContent = await fs.readFile(versionsPath, "utf-8");
      uploadTasks.push({
        blobPath: `ir/${buildId}/packages/${pkg.packageId}/versions.json`,
        content: versionsContent,
      });
    } catch {
      // No versions file - skip
    }
  }

  // Add search index tasks
  for (const language of ["python", "typescript"] as const) {
    const languageSymbols: SymbolRecord[] = [];

    for (const p of manifest.packages.filter((p) => p.language === language)) {
      try {
        const symbolsPath = path.join(irOutputPath, "packages", p.packageId, "symbols.json");
        const content = await fs.readFile(symbolsPath, "utf-8");
        const parsed = JSON.parse(content);
        // Handle both formats: { symbols: [...] } or just [...]
        const symbols = Array.isArray(parsed) ? parsed : (parsed.symbols || []);
        languageSymbols.push(...symbols);
      } catch {
        // Skip packages without symbols
      }
    }

    if (languageSymbols.length === 0) continue;

    const searchIndex = generateSearchIndex(buildId, language, languageSymbols);
    uploadTasks.push({
      blobPath: `ir/${buildId}/search/${language}.json`,
      content: JSON.stringify(searchIndex),
    });
  }

  // Log summary
  console.log(`   Packages: ${packageSymbolCounts.size}`);
  for (const [pkgName, count] of packageSymbolCounts) {
    console.log(`     - ${pkgName}: ${count} symbols`);
  }
  console.log(`   Total upload tasks: ${uploadTasks.length}`);

  // Upload all files in parallel
  console.log("\n⬆️  Uploading files...");
  const startTime = Date.now();
  let lastProgressLog = 0;

  const result = await uploadFilesInParallel(
    uploadTasks,
    dryRun,
    (completed, total) => {
      // Log progress every 10% or every 100 files
      const progress = Math.floor((completed / total) * 100);
      if (progress >= lastProgressLog + 10 || completed === total) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   Progress: ${completed}/${total} (${progress}%) - ${elapsed}s elapsed`);
        lastProgressLog = progress;
      }
    }
  );

  filesUploaded += result.filesUploaded;
  totalSize += result.totalSize;

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const uploadedAt = new Date().toISOString();

  console.log(`\n✅ Upload complete!`);
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
export async function cleanupOldBuilds(
  keepBuilds: string[],
  dryRun = false
): Promise<number> {
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

