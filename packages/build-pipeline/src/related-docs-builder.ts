/**
 * Related Docs Builder
 *
 * Scans the docs repository for symbol imports and builds a mapping
 * of symbol names to related documentation pages.
 */

import path from "node:path";
import fs from "node:fs/promises";

import {
  scanDocsForImports,
  groupMatchesBySymbol,
  cloneOrUpdateDocsRepo,
  readPackageNamesFromConfigs,
  type RelatedDocsMap,
  type ScanOptions,
  type PackageLists,
} from "@langchain/related-docs-scanner";

/** Default docs repository URL */
const DEFAULT_DOCS_REPO = "https://github.com/langchain-ai/docs.git";

/** Maximum entries to store per symbol */
const MAX_ENTRIES_PER_SYMBOL = 20;

/** Cached package lists to avoid re-reading configs for each package */
let cachedPackageLists: PackageLists | null = null;

export interface RelatedDocsBuildOptions {
  /** Path to the docs repository (cloned locally) */
  docsRepoPath?: string;

  /** If no docsRepoPath, clone the docs repo to this directory */
  cloneToDir?: string;

  /** Language to scan for ("python", "javascript", or both if not specified) */
  language?: "python" | "javascript";

  /** Package ID for the resulting mapping */
  packageId: string;

  /** Output directory for the related-docs.json file */
  outputDir: string;

  /** Path to the configs directory (for reading known package names) */
  configsDir?: string;
}

export interface RelatedDocsBuildResult {
  /** Path to the generated related-docs.json file */
  outputPath: string;

  /** Number of symbols with related docs */
  symbolCount: number;

  /** Total number of related doc entries */
  entryCount: number;

  /** Docs repo commit SHA used for scanning */
  docsRepoSha: string;
}

/**
 * Build the related docs mapping for a package.
 *
 * @param options - Build options
 * @returns Build result
 */
export async function buildRelatedDocs(
  options: RelatedDocsBuildOptions,
): Promise<RelatedDocsBuildResult> {
  const { packageId, outputDir, language, configsDir } = options;

  console.log(`\n📚 Building related docs for ${packageId}...`);

  // Read package lists from configs (cached for multiple packages)
  let packageLists: PackageLists | null = cachedPackageLists;
  if (!packageLists && configsDir) {
    console.log(`   📋 Reading package names from configs...`);
    packageLists = await readPackageNamesFromConfigs(configsDir);
    cachedPackageLists = packageLists;
    console.log(
      `   📋 Found ${packageLists.python.size} Python packages, ${packageLists.javascript.size} JS/TS packages`,
    );
  }

  // Determine docs repo path
  let docsRepoPath = options.docsRepoPath;
  let docsRepoSha = "";

  if (!docsRepoPath) {
    // Clone or update the docs repo
    const cloneToDir = options.cloneToDir || path.join(outputDir, ".docs-repo");
    docsRepoSha = await cloneOrUpdateDocsRepo(DEFAULT_DOCS_REPO, cloneToDir);
    docsRepoPath = cloneToDir;
  } else {
    // Get SHA from existing repo by reading .git/HEAD
    try {
      const headPath = path.join(docsRepoPath, ".git", "HEAD");
      const headContent = await fs.readFile(headPath, "utf-8");
      // HEAD could be a ref or a SHA
      if (headContent.startsWith("ref:")) {
        const refPath = headContent.replace("ref:", "").trim();
        const refFile = path.join(docsRepoPath, ".git", refPath);
        docsRepoSha = (await fs.readFile(refFile, "utf-8")).trim();
      } else {
        docsRepoSha = headContent.trim();
      }
    } catch {
      docsRepoSha = "unknown";
    }
  }

  console.log(`   📂 Using docs repo at: ${docsRepoPath}`);
  console.log(`   🔖 Docs repo SHA: ${docsRepoSha.substring(0, 8)}`);

  // Find the docs source directory (usually src/ or docs/)
  const docsDir = await findDocsSourceDir(docsRepoPath);
  console.log(`   📄 Scanning: ${docsDir}`);

  // Scan for imports with package filtering
  const scanOptions: ScanOptions = {
    docsDir,
    language,
    pythonPackages: packageLists?.python,
    javascriptPackages: packageLists?.javascript,
  };

  const scanResult = await scanDocsForImports(scanOptions);

  // Group matches by symbol and limit entries
  const groupedMatches = groupMatchesBySymbol(scanResult, MAX_ENTRIES_PER_SYMBOL);

  // Build the RelatedDocsMap
  const symbolsMap: RelatedDocsMap["symbols"] = {};
  let totalEntries = 0;

  for (const [symbolName, data] of groupedMatches) {
    symbolsMap[symbolName] = {
      entries: data.entries,
      totalCount: data.totalCount,
    };
    totalEntries += data.entries.length;
  }

  const relatedDocsMap: RelatedDocsMap = {
    packageId,
    generatedAt: new Date().toISOString(),
    docsRepoSha,
    symbols: symbolsMap,
  };

  // Write to output file
  const outputPath = path.join(outputDir, "related-docs.json");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(relatedDocsMap, null, 2));

  console.log(`   ✅ Found related docs for ${groupedMatches.size} symbols`);
  console.log(`   📊 Total entries: ${totalEntries}`);

  return {
    outputPath,
    symbolCount: groupedMatches.size,
    entryCount: totalEntries,
    docsRepoSha,
  };
}

/**
 * Find the docs source directory in the cloned repo.
 * Common patterns: src/, docs/, src/docs/
 */
async function findDocsSourceDir(repoPath: string): Promise<string> {
  const possiblePaths = ["docs", "src/docs", "src", "content", "pages"];

  for (const relativePath of possiblePaths) {
    const fullPath = path.join(repoPath, relativePath);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        // Check if it contains markdown files
        const files = await fs.readdir(fullPath);
        const hasMarkdown = files.some((f) => f.endsWith(".md") || f.endsWith(".mdx"));
        if (hasMarkdown) {
          return fullPath;
        }
        // Check subdirectories
        for (const file of files) {
          const subPath = path.join(fullPath, file);
          const subStat = await fs.stat(subPath);
          if (subStat.isDirectory()) {
            const subFiles = await fs.readdir(subPath);
            if (subFiles.some((f) => f.endsWith(".md") || f.endsWith(".mdx"))) {
              return fullPath;
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist, try next
    }
  }

  // Default to the repo root
  return repoPath;
}

/**
 * Upload related docs JSON to blob storage.
 * This is called from the main upload flow.
 */
export async function uploadRelatedDocs(
  packageId: string,
  buildId: string,
  relatedDocsPath: string,
  dryRun: boolean = false,
): Promise<void> {
  if (dryRun) {
    console.log(`   📄 [dry-run] Would upload related-docs.json for ${packageId}`);
    return;
  }

  // Import the upload function from upload.ts to avoid circular dependencies
  const { putWithRetry } = await import("./upload.js");

  const content = await fs.readFile(relatedDocsPath, "utf-8");
  const blobPath = `ir/packages/${packageId}/${buildId}/related-docs.json`;

  await putWithRetry(blobPath, content, {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });

  console.log(`   ✅ Uploaded related-docs.json`);
}
