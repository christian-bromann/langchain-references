#!/usr/bin/env tsx
/**
 * Sync Versions - Fetches and caches version metadata for all packages
 *
 * This script:
 * 1. Reads package configs and their versioning patterns
 * 2. Fetches git tags from GitHub (only once)
 * 3. Caches version-to-SHA mappings in JSON files
 * 4. On subsequent runs, only fetches new versions
 *
 * Usage:
 *   # Sync all projects
 *   pnpm sync-versions
 *
 *   # Sync specific project
 *   pnpm sync-versions --project langchain
 *
 *   # Force full refresh
 *   pnpm sync-versions --full
 */

import { program } from "commander";
import path from "path";
import fs from "fs/promises";
import semver from "semver";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIGS_DIR = path.resolve(__dirname, "../../../../configs");

// =============================================================================
// TYPES
// =============================================================================

interface VersionEntry {
  version: string;
  sha: string;
  tag: string;
  releaseDate: string;
}

interface PackageVersions {
  packageName: string;
  tagPattern: string;
  versions: VersionEntry[];
  lastUpdated: string;
}

interface ProjectVersionsFile {
  project: string;
  language: string;
  repo: string;
  lastSynced: string;
  packages: PackageVersions[];
}

interface PackageConfig {
  name: string;
  path: string;
  displayName?: string;
  versioning?: {
    tagPattern: string;
    maxVersions?: number;
    alwaysInclude?: string[];
    minVersion?: string;
    enabled?: boolean;
  };
}

interface BuildConfig {
  project?: string;
  language: string;
  repo: string;
  packages: PackageConfig[];
}

// =============================================================================
// GITHUB API
// =============================================================================

interface GitHubTagRef {
  ref: string;
  object: {
    sha: string;
    type: string;
    url: string;
  };
  tagger?: {
    date: string;
  };
}

interface GitHubCommit {
  commit: {
    committer: {
      date: string;
    };
  };
}

/**
 * Extract the tag prefix from a pattern for GitHub API filtering.
 * e.g., "@langchain/core@*" -> "@langchain/core"
 */
function getTagPrefixFromPattern(pattern: string): string | null {
  if (pattern.endsWith("@*")) {
    return pattern.slice(0, -2); // Remove @*
  }
  if (pattern.endsWith("-v*")) {
    return pattern.slice(0, -2); // Remove v*
  }
  if (pattern === "v*") {
    return "v";
  }
  return null;
}

/**
 * Fetch tags matching a specific prefix from GitHub.
 * Much more efficient than fetching all tags.
 */
async function fetchTagsForPackage(
  repo: string,
  pattern: string,
  headers: Record<string, string>
): Promise<{ tag: string; version: string; sha: string }[]> {
  const prefix = getTagPrefixFromPattern(pattern);
  if (!prefix) {
    console.warn(`   Cannot determine prefix from pattern: ${pattern}`);
    return [];
  }

  const tags: { tag: string; version: string; sha: string }[] = [];
  let page = 1;
  const perPage = 100;

  // URL-encode the prefix for the API (@ needs encoding)
  const encodedPrefix = encodeURIComponent(prefix);

  while (true) {
    // Use the matching parameter to filter by prefix
    const url = `https://api.github.com/repos/${repo}/git/matching-refs/tags/${encodedPrefix}?per_page=${perPage}&page=${page}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        // No tags match this prefix
        break;
      }
      if (response.status === 403) {
        // Rate limited - show helpful info
        const remaining = response.headers.get("x-ratelimit-remaining");
        const reset = response.headers.get("x-ratelimit-reset");
        const resetDate = reset ? new Date(parseInt(reset) * 1000) : null;
        
        console.error(`\n   ⚠️  Rate limited by GitHub API`);
        console.error(`      Remaining: ${remaining ?? "unknown"}`);
        if (resetDate) {
          const waitMins = Math.ceil((resetDate.getTime() - Date.now()) / 60000);
          console.error(`      Resets at: ${resetDate.toLocaleTimeString()} (in ~${waitMins} min)`);
        }
        console.error(`      Tip: Set GITHUB_TOKEN for higher limits (5000/hr vs 60/hr)`);
        throw new Error(`GitHub API rate limited. Wait and try again.`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const refs = (await response.json()) as GitHubTagRef[];
    if (refs.length === 0) break;

    for (const ref of refs) {
      const tagName = ref.ref.replace("refs/tags/", "");
      const version = parseVersionFromTag(tagName, pattern);
      if (version) {
        tags.push({
          tag: tagName,
          version,
          sha: ref.object.sha,
        });
      }
    }

    process.stdout.write(`\r      Fetching tags... ${tags.length} found (page ${page})`);

    if (refs.length < perPage) break;
    page++;
  }

  process.stdout.write("\r" + " ".repeat(60) + "\r");
  return tags;
}

interface TagObjectResponse {
  object?: {
    sha: string;
    type: string;
  };
  tagger?: {
    date: string;
  };
}

/**
 * Fetch the commit date for a tag.
 * Handles both annotated tags (need to dereference) and lightweight tags.
 */
async function fetchCommitDate(
  repo: string,
  tagSha: string,
  headers: Record<string, string>
): Promise<{ date: string; commitSha: string }> {
  try {
    // First, try to get the tag object (for annotated tags)
    const tagResponse = await fetch(
      `https://api.github.com/repos/${repo}/git/tags/${tagSha}`,
      { headers }
    );

    if (tagResponse.ok) {
      const tagData = (await tagResponse.json()) as TagObjectResponse;
      // Annotated tag - use tagger date and dereference to commit
      if (tagData.tagger?.date) {
        return {
          date: tagData.tagger.date,
          commitSha: tagData.object?.sha ?? tagSha,
        };
      }
    }

    // Not an annotated tag or failed - try as commit directly
    const commitResponse = await fetch(
      `https://api.github.com/repos/${repo}/commits/${tagSha}`,
      { headers }
    );

    if (commitResponse.ok) {
      const commitData = (await commitResponse.json()) as GitHubCommit;
      return {
        date: commitData.commit.committer.date,
        commitSha: tagSha,
      };
    }
  } catch {
    // Ignore errors, use default date
  }

  return {
    date: new Date().toISOString(),
    commitSha: tagSha,
  };
}

// =============================================================================
// VERSION PARSING
// =============================================================================

function parseVersionFromTag(tagName: string, pattern: string): string | null {
  // Pattern: @scope/package@* (scoped npm style)
  if (pattern.includes("@") && pattern.endsWith("@*")) {
    const packageName = pattern.slice(0, -2);

    // Try various separators: @, ==, -
    for (const sep of ["@", "==", "-"]) {
      const prefix = packageName + sep;
      if (tagName.startsWith(prefix)) {
        const version = tagName.slice(prefix.length);
        return semver.valid(version) ? version : null;
      }
    }
    return null;
  }

  // Pattern: package-v* (prefix style)
  if (pattern.endsWith("-v*")) {
    const prefix = pattern.slice(0, -1);
    if (tagName.startsWith(prefix)) {
      const version = tagName.slice(prefix.length);
      return semver.valid(version) ? version : null;
    }
    return null;
  }

  // Pattern: v* (simple tags)
  if (pattern === "v*") {
    if (tagName.startsWith("v")) {
      const version = tagName.slice(1);
      return semver.valid(version) ? version : null;
    }
    return null;
  }

  return null;
}

// =============================================================================
// SYNC LOGIC
// =============================================================================

async function syncProject(
  configPath: string,
  existingVersions: ProjectVersionsFile | null,
  githubToken?: string,
  forceRefresh?: boolean
): Promise<ProjectVersionsFile | null> {
  const configContent = await fs.readFile(configPath, "utf-8");
  const config: BuildConfig = JSON.parse(configContent);

  console.log(`\n📦 Syncing ${config.project || "unknown"} (${config.language})`);
  console.log(`   Repo: ${config.repo}`);

  // Get packages with versioning enabled
  const versionedPackages = config.packages.filter(
    (p) => p.versioning?.tagPattern && p.versioning.enabled !== false
  );

  if (versionedPackages.length === 0) {
    console.log(`   No packages with versioning enabled, skipping`);
    return null;
  }

  console.log(`   Packages: ${versionedPackages.map((p) => p.name).join(", ")}`);

  // Build headers for API calls
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "langchain-ir-builder",
  };
  if (githubToken) {
    headers.Authorization = getAuthHeader(githubToken);
  }

  // Process each package - fetch only tags for that package
  const packages: PackageVersions[] = [];

  for (const pkg of versionedPackages) {
    console.log(`\n   📄 ${pkg.name}`);

    const pattern = pkg.versioning!.tagPattern;
    const maxVersions = pkg.versioning!.maxVersions ?? 10;

    // Check existing data first
    const existingPkg = existingVersions?.packages.find(
      (p) => p.packageName === pkg.name
    );

    // Fetch matching tags for this specific package
    const matchingVersions = await fetchTagsForPackage(config.repo, pattern, headers);

    console.log(`      Found ${matchingVersions.length} matching tags`);

    if (matchingVersions.length === 0) {
      // Keep existing if we have it, otherwise empty
      if (existingPkg) {
        packages.push(existingPkg);
      } else {
        packages.push({
          packageName: pkg.name,
          tagPattern: pattern,
          versions: [],
          lastUpdated: new Date().toISOString(),
        });
      }
      continue;
    }

    // Sort by semver descending
    matchingVersions.sort((a, b) => semver.rcompare(a.version, b.version));

    // Filter to minor versions only (keep latest patch per minor)
    const seenMinors = new Set<string>();
    const minorVersions: typeof matchingVersions = [];

    for (const v of matchingVersions) {
      const parsed = semver.parse(v.version);
      if (!parsed) continue;

      const minorKey = `${parsed.major}.${parsed.minor}`;
      if (seenMinors.has(minorKey)) continue;

      seenMinors.add(minorKey);
      minorVersions.push(v);

      if (minorVersions.length >= maxVersions) break;
    }

    console.log(`      Filtered to ${minorVersions.length} minor versions`);

    // Check what's new vs existing
    const existingVersionSet = new Set(
      existingPkg?.versions.map((v) => v.version) ?? []
    );

    const newVersions = minorVersions.filter(
      (v) => !existingVersionSet.has(v.version)
    );

    if (newVersions.length === 0 && !forceRefresh) {
      console.log(`      ✓ No new versions, using cached data`);
      if (existingPkg) {
        packages.push(existingPkg);
      }
      continue;
    }

    console.log(`      Fetching dates for ${forceRefresh ? minorVersions.length : newVersions.length} versions...`);

    // Fetch dates for new versions (or all if force refresh)
    const versionsToFetch = forceRefresh ? minorVersions : newVersions;
    const versionEntries: VersionEntry[] = [];

    // Reuse existing entries if not force refresh
    if (!forceRefresh && existingPkg) {
      for (const v of minorVersions) {
        const existing = existingPkg.versions.find((e) => e.version === v.version);
        if (existing) {
          versionEntries.push(existing);
        }
      }
    }

    // Fetch new entries
    let fetchCount = 0;
    for (const v of versionsToFetch) {
      fetchCount++;
      process.stdout.write(`\r      Fetching dates... ${fetchCount}/${versionsToFetch.length}`);

      const { date, commitSha } = await fetchCommitDate(config.repo, v.sha, headers);
      versionEntries.push({
        version: v.version,
        sha: commitSha, // Use the actual commit SHA, not tag object SHA
        tag: v.tag,
        releaseDate: date,
      });
    }

    process.stdout.write("\r" + " ".repeat(60) + "\r");

    // Sort final entries by version descending
    versionEntries.sort((a, b) => semver.rcompare(a.version, b.version));

    console.log(`      ✓ ${versionEntries.length} versions ready`);

    packages.push({
      packageName: pkg.name,
      tagPattern: pattern,
      versions: versionEntries,
      lastUpdated: new Date().toISOString(),
    });
  }

  return {
    project: config.project || "unknown",
    language: config.language,
    repo: config.repo,
    lastSynced: new Date().toISOString(),
    packages,
  };
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Get the correct Authorization header for different token types.
 * - Classic tokens (ghp_*): use "token X"
 * - Fine-grained PATs (github_pat_*): use "Bearer X"
 */
function getAuthHeader(token: string): string {
  if (token.startsWith("github_pat_")) {
    return `Bearer ${token}`;
  }
  return `token ${token}`;
}

async function checkRateLimit(githubToken?: string): Promise<void> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "langchain-ir-builder",
  };
  if (githubToken) {
    headers.Authorization = getAuthHeader(githubToken);
  }

  try {
    const response = await fetch("https://api.github.com/rate_limit", { headers });
    if (response.ok) {
      const data = await response.json() as { resources?: { core?: { remaining: number; limit: number; reset: number } } };
      const core = data.resources?.core;
      if (core) {
        const reset = new Date(core.reset * 1000);
        console.log(`   Rate limit: ${core.remaining}/${core.limit} remaining`);
        if (core.remaining < 100) {
          const waitMins = Math.ceil((reset.getTime() - Date.now()) / 60000);
          console.warn(`   ⚠️  Low rate limit! Resets at ${reset.toLocaleTimeString()} (~${waitMins} min)`);
        }
      }
    }
  } catch {
    // Ignore errors checking rate limit
  }
}

async function main() {
  program
    .name("sync-versions")
    .description("Sync version metadata from GitHub tags")
    .option("--project <name>", "Sync specific project only")
    .option("--full", "Force full refresh (re-fetch all dates)")
    .parse();

  const opts = program.opts();
  const githubToken = process.env.GITHUB_TOKEN;

  console.log("🔄 Syncing version metadata from GitHub");
  console.log("========================================");

  if (!githubToken) {
    console.warn("⚠️  No GITHUB_TOKEN set - will use unauthenticated rate limit (60/hr)");
    console.warn("   Set GITHUB_TOKEN for 5000 requests/hr");
  } else {
    console.log("   ✓ Using GITHUB_TOKEN for authentication");
  }

  await checkRateLimit(githubToken);

  // Find all config files
  const files = await fs.readdir(CONFIGS_DIR);
  const configFiles = files.filter(
    (f) => f.endsWith(".json") && !f.endsWith("-versions.json") && f !== "config-schema.json"
  );

  for (const configFile of configFiles) {
    // Parse project from filename
    const match = configFile.match(/^(\w+)-(python|typescript)\.json$/);
    if (!match) continue;

    const [, project, language] = match;

    // Filter by project if specified
    if (opts.project && project !== opts.project) continue;

    const configPath = path.join(CONFIGS_DIR, configFile);
    const versionsFile = path.join(CONFIGS_DIR, `${project}-${language}-versions.json`);

    // Load existing versions if present
    let existingVersions: ProjectVersionsFile | null = null;
    try {
      const content = await fs.readFile(versionsFile, "utf-8");
      existingVersions = JSON.parse(content);
    } catch {
      // No existing file
    }

    // Sync
    const result = await syncProject(configPath, existingVersions, githubToken, opts.full);

    if (result) {
      await fs.writeFile(versionsFile, JSON.stringify(result, null, 2) + "\n");
      console.log(`\n   💾 Saved to ${path.basename(versionsFile)}`);
    }
  }

  console.log("\n✅ Version sync complete!");
}

main().catch((error) => {
  console.error("\n❌ Sync failed:", error);
  process.exit(1);
});

