#!/usr/bin/env tsx
/**
 * Upload IR - Uploads IR artifacts to Vercel Blob storage
 *
 * This script uploads:
 * - reference.manifest.json
 * - Routing maps per package
 * - Symbol shards (partitioned by ID prefix)
 * - Search index per language
 */

import { put, list, del } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";
import type { Manifest, SymbolRecord, RoutingMap, SearchIndex } from "@langchain/ir-schema";

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

/**
 * Upload a single file to Vercel Blob.
 */
async function uploadFile(
  blobPath: string,
  content: string | Buffer,
  dryRun: boolean
): Promise<{ url: string; size: number }> {
  const size = Buffer.byteLength(content);

  if (dryRun) {
    console.log(`  [dry-run] Would upload: ${blobPath} (${size} bytes)`);
    return { url: `https://blob.vercel-storage.com/${blobPath}`, size };
  }

  const blob = await put(blobPath, content, {
    access: "public",
    contentType: "application/json",
  });

  return { url: blob.url, size };
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
 * Generate routing map from symbols.
 */
function generateRoutingMap(
  packageId: string,
  displayName: string,
  language: "python" | "typescript",
  symbols: SymbolRecord[]
): RoutingMap {
  const slugs: RoutingMap["slugs"] = {};

  for (const symbol of symbols) {
    if (!["class", "function", "interface", "module", "typeAlias", "enum"].includes(symbol.kind)) {
      continue;
    }

    const slug = generateSlug(symbol);
    slugs[slug] = {
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
 * Generate URL slug from symbol.
 */
function generateSlug(symbol: SymbolRecord): string {
  const kindPlural = symbol.kind + "s";
  return `${kindPlural}/${symbol.name}`;
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

/**
 * Upload all IR artifacts for a build.
 */
export async function uploadIR(options: UploadOptions): Promise<UploadResult> {
  const { buildId, irOutputPath, dryRun = false } = options;

  console.log(`\n☁️  Uploading IR artifacts for build ${buildId}`);
  if (dryRun) {
    console.log("   (dry-run mode - no actual uploads)\n");
  }

  let filesUploaded = 0;
  let totalSize = 0;

  // Load manifest
  const manifestPath = path.join(irOutputPath, "reference.manifest.json");
  const manifestContent = await fs.readFile(manifestPath, "utf-8");
  const manifest: Manifest = JSON.parse(manifestContent);

  // Upload manifest
  console.log("📄 Uploading manifest...");
  const manifestResult = await uploadFile(
    `ir/${buildId}/reference.manifest.json`,
    manifestContent,
    dryRun
  );
  filesUploaded++;
  totalSize += manifestResult.size;

  // Process each package
  for (const pkg of manifest.packages) {
    console.log(`\n📦 Processing package: ${pkg.displayName}`);

    // Load symbols for this package
    const symbolsPath = path.join(irOutputPath, "packages", pkg.packageId, "symbols.json");
    let symbols: SymbolRecord[] = [];

    try {
      const symbolsContent = await fs.readFile(symbolsPath, "utf-8");
      const parsed = JSON.parse(symbolsContent);
      // Handle both formats: { symbols: [...] } or just [...]
      symbols = Array.isArray(parsed) ? parsed : (parsed.symbols || []);
    } catch (error) {
      console.log(`   ⚠️  No symbols file found for ${pkg.packageId}`);
      continue;
    }

    console.log(`   Found ${symbols.length} symbols`);

    // Upload routing map
    const routingMap = generateRoutingMap(
      pkg.packageId,
      pkg.displayName,
      pkg.language,
      symbols
    );
    const routingContent = JSON.stringify(routingMap, null, 2);
    const routingPath = `ir/${buildId}/routing/${pkg.language}/${pkg.packageId}.json`;

    const routingResult = await uploadFile(routingPath, routingContent, dryRun);
    filesUploaded++;
    totalSize += routingResult.size;
    console.log(`   ✓ Routing map uploaded`);

    // Upload sharded symbols
    const shards = shardSymbols(symbols);
    console.log(`   Uploading ${shards.size} symbol shards...`);

    for (const [shardKey, shardSymbols] of shards) {
      for (const symbol of shardSymbols) {
        const symbolContent = JSON.stringify(symbol, null, 2);
        const symbolPath = `ir/${buildId}/symbols/${shardKey}/${symbol.id}.json`;

        const symbolResult = await uploadFile(symbolPath, symbolContent, dryRun);
        filesUploaded++;
        totalSize += symbolResult.size;
      }
    }
    console.log(`   ✓ ${symbols.length} symbols uploaded`);
  }

  // Generate and upload search indices
  console.log("\n🔍 Generating search indices...");

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
    const searchContent = JSON.stringify(searchIndex);
    const searchPath = `ir/${buildId}/search/${language}.json`;

    const searchResult = await uploadFile(searchPath, searchContent, dryRun);
    filesUploaded++;
    totalSize += searchResult.size;
    console.log(`   ✓ ${language} search index (${searchIndex.totalRecords} records)`);
  }

  const uploadedAt = new Date().toISOString();

  console.log(`\n✅ Upload complete!`);
  console.log(`   Files: ${filesUploaded}`);
  console.log(`   Total size: ${(totalSize / 1024).toFixed(1)} KB`);

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



