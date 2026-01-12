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
 * e.g., "langchain-core==*" -> "langchain-core"
 */
function getTagPrefixFromPattern(pattern: string): string | null {
  if (pattern.endsWith("@*")) {
    return pattern.slice(0, -2); // Remove @*
  }
  if (pattern.endsWith("==*")) {
    return pattern.slice(0, -3); // Remove ==*
  }
  if (pattern.endsWith("-v*")) {
    return pattern.slice(0, -2); // Remove v*
  }
  if (pattern === "v*") {
    return "v";
  }
  // Pattern: * (bare version tags) - no prefix, matches all
  if (pattern === "*") {
    return "";
  }
  return null;
}

/**
 * Cached repository tags to avoid redundant API calls.
 */
interface RepoTagCache {
  repo: string;
  tags: { name: string; sha: string; objectType: string; objectUrl?: string }[];
  fetchedAt: string;
}

const repoTagCache = new Map<string, RepoTagCache>();

/**
 * Fetch with retries and exponential backoff for transient network errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) break;

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelayMs * Math.pow(2, attempt);
      const errorMsg = lastError.message || "Unknown error";
      process.stdout.write(`\r   ⚠️  Network error (${errorMsg}), retrying in ${delay / 1000}s... (${attempt + 1}/${maxRetries})`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Fetch failed after retries");
}

/**
 * Response from /repos/{owner}/{repo}/tags endpoint.
 * This endpoint properly supports page-based pagination.
 */
interface GitHubTag {
  name: string;
  zipball_url: string;
  tarball_url: string;
  commit: {
    sha: string;
    url: string;
  };
  node_id: string;
}

/**
 * Parse the Link header to extract the next page URL.
 * Format: <url>; rel="next", <url>; rel="last"
 */
function getNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  const links = linkHeader.split(",");
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Fetch all tags from a repository (cached).
 * Uses /repos/{owner}/{repo}/tags with Link header pagination.
 * This is more efficient when processing multiple packages from the same repo.
 */
async function fetchAllRepoTags(
  repo: string,
  headers: Record<string, string>
): Promise<{ name: string; sha: string; objectType: string; objectUrl?: string }[]> {
  // Check cache first
  const cached = repoTagCache.get(repo);
  if (cached) {
    console.log(`   Using cached tags for ${repo} (${cached.tags.length} tags)`);
    return cached.tags;
  }

  console.log(`   Fetching all tags from ${repo}...`);
  const allTags: { name: string; sha: string; objectType: string; objectUrl?: string }[] = [];
  let nextUrl: string | null = `https://api.github.com/repos/${repo}/tags?per_page=100`;
  let pageCount = 0;

  while (nextUrl) {
    pageCount++;
    const response = await fetchWithRetry(nextUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`   Repository ${repo} not found or no tags exist`);
        break;
      }
      if (response.status === 403) {
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

    const tags = (await response.json()) as GitHubTag[];

    for (const tag of tags) {
      allTags.push({
        name: tag.name,
        // /tags endpoint already dereferences to commit SHA
        sha: tag.commit.sha,
        // We know it's a commit since /tags dereferences annotated tags
        objectType: "commit",
        objectUrl: tag.commit.url,
      });
    }

    process.stdout.write(`\r   Fetching tags... ${allTags.length} found (page ${pageCount})`);

    // Follow Link header for next page
    nextUrl = getNextPageUrl(response.headers.get("link"));
  }

  process.stdout.write("\r" + " ".repeat(60) + "\r");
  console.log(`   Found ${allTags.length} total tags in ${repo}`);

  // Cache the result
  repoTagCache.set(repo, {
    repo,
    tags: allTags,
    fetchedAt: new Date().toISOString(),
  });

  return allTags;
}

/**
 * Filter cached tags for a specific package pattern.
 * Excludes pre-release versions (alpha, beta, rc, etc.)
 */
function filterTagsForPattern(
  allTags: { name: string; sha: string; objectType: string; objectUrl?: string }[],
  pattern: string
): { tag: string; version: string; sha: string; objectType: string; objectUrl?: string }[] {
  const prefix = getTagPrefixFromPattern(pattern);
  if (prefix === null) {
    console.warn(`      Cannot determine prefix from pattern: ${pattern}`);
    return [];
  }

  const matchingTags: { tag: string; version: string; sha: string; objectType: string; objectUrl?: string }[] = [];

  for (const tag of allTags) {
    // Quick prefix check before expensive parsing (empty prefix means match all)
    if (prefix && !tag.name.startsWith(prefix)) continue;

    const version = parseVersionFromTag(tag.name, pattern);
    if (version) {
      // Skip pre-release versions (alpha, beta, rc, etc.)
      const parsed = semver.parse(version);
      if (parsed && parsed.prerelease.length > 0) {
        continue;
      }

      matchingTags.push({
        tag: tag.name,
        version,
        sha: tag.sha,
        objectType: tag.objectType,
        objectUrl: tag.objectUrl,
      });
    }
  }

  return matchingTags;
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
 * When objectType is provided from the refs API, we can skip unnecessary calls.
 */
async function fetchCommitDate(
  repo: string,
  tagSha: string,
  headers: Record<string, string>,
  objectType?: string,
  objectUrl?: string
): Promise<{ date: string; commitSha: string }> {
  try {
    // If we know it's a commit, fetch commit directly (skip tag object lookup)
    if (objectType === "commit") {
      const commitResponse = await fetchWithRetry(
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
    }

    // For annotated tags or unknown types, try to get the tag object
    if (objectType === "tag" || !objectType) {
      const tagResponse = await fetchWithRetry(
        objectUrl ?? `https://api.github.com/repos/${repo}/git/tags/${tagSha}`,
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
    }

    // Fallback: try as commit directly
    const commitResponse = await fetchWithRetry(
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

  // Pattern: package==* (Python style)
  if (pattern.endsWith("==*")) {
    const packageName = pattern.slice(0, -3);
    const prefix = packageName + "==";
    if (tagName.startsWith(prefix)) {
      const version = tagName.slice(prefix.length);
      return semver.valid(version) ? version : null;
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

  // Pattern: * (bare version tags like "0.6.11", "1.0.5")
  if (pattern === "*") {
    // Only match if it's a valid semver (not prefixed with anything)
    return semver.valid(tagName);
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

  // Fetch all tags from the repo once (cached for efficiency)
  const allRepoTags = await fetchAllRepoTags(config.repo, headers);

  // Process each package using cached tags
  const packages: PackageVersions[] = [];

  for (const pkg of versionedPackages) {
    console.log(`\n   📄 ${pkg.name}`);

    const pattern = pkg.versioning!.tagPattern;
    const maxVersions = pkg.versioning!.maxVersions ?? 10;

    // Check existing data first
    const existingPkg = existingVersions?.packages.find(
      (p) => p.packageName === pkg.name
    );

    // Filter cached tags for this package's pattern
    const matchingVersions = filterTagsForPattern(allRepoTags, pattern);

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

    // Filter to keep first and last patch for each minor version
    // Exception: For 0.0.x, only keep the last version
    const minorGroups = new Map<string, typeof matchingVersions>();

    for (const v of matchingVersions) {
      const parsed = semver.parse(v.version);
      if (!parsed) continue;

      const minorKey = `${parsed.major}.${parsed.minor}`;
      if (!minorGroups.has(minorKey)) {
        minorGroups.set(minorKey, []);
      }
      minorGroups.get(minorKey)!.push(v);
    }

    const minorVersions: typeof matchingVersions = [];

    for (const [minorKey, group] of minorGroups) {
      // group is already sorted newest first
      const latest = group[0];
      const oldest = group[group.length - 1];

      // For 0.0.x, only include the latest version
      if (minorKey === "0.0") {
        minorVersions.push(latest);
      } else {
        // Include the latest patch
        minorVersions.push(latest);

        // Include the oldest patch if different from latest
        if (oldest.version !== latest.version) {
          minorVersions.push(oldest);
        }
      }
    }

    // Sort final result by version descending
    minorVersions.sort((a, b) => semver.rcompare(a.version, b.version));

    // Filter v0.x: keep only the single highest v0.x version
    // This reduces processing of old 0.x versions that often have build/compatibility issues
    const v0Versions = minorVersions.filter((v) => semver.major(v.version) === 0);
    const v1PlusVersions = minorVersions.filter((v) => semver.major(v.version) >= 1);

    let filteredMinorVersions: typeof minorVersions;
    if (v0Versions.length > 0) {
      // v0Versions is already sorted descending, take only the first (highest)
      const latestV0 = v0Versions[0];
      filteredMinorVersions = [...v1PlusVersions, latestV0];
      // Re-sort to maintain descending order
      filteredMinorVersions.sort((a, b) => semver.rcompare(a.version, b.version));
    } else {
      filteredMinorVersions = minorVersions;
    }

    // Apply maxVersions limit (counting by unique minor versions, not individual versions)
    const limitedVersions: typeof matchingVersions = [];
    const minorCount = new Set<string>();

    for (const v of filteredMinorVersions) {
      const parsed = semver.parse(v.version);
      if (!parsed) continue;

      const minorKey = `${parsed.major}.${parsed.minor}`;
      if (!minorCount.has(minorKey)) {
        if (minorCount.size >= maxVersions) break;
        minorCount.add(minorKey);
      }
      limitedVersions.push(v);
    }

    const v0Kept = limitedVersions.filter((v) => semver.major(v.version) === 0).length;
    console.log(`      Filtered to ${limitedVersions.length} versions (${minorCount.size} minors, ${v0Kept} v0.x)`);

    // Check what's new vs existing
    const existingVersionSet = new Set(
      existingPkg?.versions.map((v) => v.version) ?? []
    );

    const newVersions = limitedVersions.filter(
      (v) => !existingVersionSet.has(v.version)
    );

    if (newVersions.length === 0 && !forceRefresh) {
      console.log(`      ✓ No new versions, using cached data`);
      if (existingPkg) {
        packages.push(existingPkg);
      }
      continue;
    }

    console.log(`      Fetching dates for ${forceRefresh ? limitedVersions.length : newVersions.length} versions...`);

    // Fetch dates for new versions (or all if force refresh)
    const versionsToFetch = forceRefresh ? limitedVersions : newVersions;
    const versionEntries: VersionEntry[] = [];

    // Reuse existing entries if not force refresh
    if (!forceRefresh && existingPkg) {
      for (const v of limitedVersions) {
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

      const { date, commitSha } = await fetchCommitDate(
        config.repo,
        v.sha,
        headers,
        v.objectType,
        v.objectUrl
      );
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

