/**
 * Version Discovery Module
 *
 * Discovers and filters versions from git tags for changelog generation.
 * Supports various tag patterns used in monorepos.
 */

import * as semver from "semver";
import type { DiscoveredVersion, VersioningConfig } from "@langchain/ir-schema";

// =============================================================================
// VERSION DISCOVERY OPTIONS
// =============================================================================

export interface VersionDiscoveryOptions {
  /** Maximum minor/major versions to track (default: 10) */
  maxVersions: number;

  /** Versions to always include regardless of limit */
  alwaysInclude?: string[];

  /** Minimum version to consider */
  minVersion?: string;
}

// =============================================================================
// GIT TAG TYPES
// =============================================================================

interface GitTag {
  name: string;
  sha: string;
  date: string;
}

interface GitHubTagRef {
  ref: string;
  node_id: string;
  url: string;
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
  sha: string;
  commit: {
    committer: {
      date: string;
    };
  };
}

// =============================================================================
// TAG PATTERN PARSING
// =============================================================================

/**
 * Parse a version string from a git tag name based on the pattern.
 *
 * Supported patterns:
 * - "@scope/package@*" → extracts version after last @ (also matches == separator)
 * - "package-v*" → extracts version after -v
 * - "v*" → extracts version after v
 *
 * @param tagName - The full tag name (e.g., "@langchain/core==0.3.44")
 * @param pattern - The pattern (e.g., "@langchain/core@*")
 * @returns The parsed version string, or null if no match
 */
export function parseVersionFromTag(
  tagName: string,
  pattern: string
): string | null {
  // Pattern: @scope/package@* (scoped npm style)
  // Also matches tags with == separator (common in langchainjs)
  if (pattern.includes("@") && pattern.endsWith("@*")) {
    const packageName = pattern.slice(0, -2); // Remove trailing @*

    // Try @scope/package@version format
    const atPrefix = packageName + "@";
    if (tagName.startsWith(atPrefix)) {
      const version = tagName.slice(atPrefix.length);
      return semver.valid(version) ? version : null;
    }

    // Try @scope/package==version format (langchainjs style)
    const eqPrefix = packageName + "==";
    if (tagName.startsWith(eqPrefix)) {
      const version = tagName.slice(eqPrefix.length);
      return semver.valid(version) ? version : null;
    }

    // Try @scope/package-version format (some packages)
    const dashPrefix = packageName + "-";
    if (tagName.startsWith(dashPrefix)) {
      const version = tagName.slice(dashPrefix.length);
      return semver.valid(version) ? version : null;
    }

    return null;
  }

  // Pattern: package-v* (prefix style)
  if (pattern.endsWith("-v*")) {
    const prefix = pattern.slice(0, -1); // Remove trailing *
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

/**
 * Check if a tag name matches the given pattern.
 *
 * @param tagName - The full tag name
 * @param pattern - The pattern to match against
 * @returns True if the tag matches the pattern
 */
export function tagMatchesPattern(tagName: string, pattern: string): boolean {
  return parseVersionFromTag(tagName, pattern) !== null;
}

// =============================================================================
// MINOR VERSION FILTERING
// =============================================================================

/**
 * Keep only the latest patch release for each minor version.
 *
 * Example: [0.2.15, 0.2.14, 0.2.13, 0.1.5, 0.1.4] → [0.2.15, 0.1.5]
 *
 * @param versions - Array of discovered versions (should be sorted newest first)
 * @returns Filtered array with only one version per minor
 */
export function filterToMinorVersions(
  versions: DiscoveredVersion[]
): DiscoveredVersion[] {
  const seen = new Map<string, DiscoveredVersion>();

  for (const v of versions) {
    const parsed = semver.parse(v.version);
    if (!parsed) continue;

    const minorKey = `${parsed.major}.${parsed.minor}`;
    if (!seen.has(minorKey)) {
      seen.set(minorKey, v);
    }
  }

  return Array.from(seen.values());
}

/**
 * Keep both the first and last patch release for each minor version.
 * Exception: For 0.0.x versions, only keep the last version.
 *
 * Example: [0.2.15, 0.2.14, 0.2.0, 0.1.5, 0.1.0, 0.0.8, 0.0.1]
 *       → [0.2.15, 0.2.0, 0.1.5, 0.1.0, 0.0.8]
 *
 * @param versions - Array of discovered versions (should be sorted newest first)
 * @returns Filtered array with first and last version per minor (except 0.0.x)
 */
export function filterToFirstAndLastMinorVersions(
  versions: DiscoveredVersion[]
): DiscoveredVersion[] {
  // Group versions by minor version
  const minorGroups = new Map<string, DiscoveredVersion[]>();

  for (const v of versions) {
    const parsed = semver.parse(v.version);
    if (!parsed) continue;

    const minorKey = `${parsed.major}.${parsed.minor}`;
    if (!minorGroups.has(minorKey)) {
      minorGroups.set(minorKey, []);
    }
    minorGroups.get(minorKey)!.push(v);
  }

  const result: DiscoveredVersion[] = [];

  for (const [minorKey, group] of minorGroups) {
    // Sort group by semver (newest first)
    group.sort((a, b) => semver.rcompare(a.version, b.version));

    const latest = group[0]; // Newest patch
    const oldest = group[group.length - 1]; // Oldest patch

    // For 0.0.x, only include the latest version
    if (minorKey === "0.0") {
      result.push(latest);
    } else {
      // Include the latest patch
      result.push(latest);

      // Include the oldest patch if different from latest
      if (oldest.version !== latest.version) {
        result.push(oldest);
      }
    }
  }

  // Sort final result by semver (newest first)
  result.sort((a, b) => semver.rcompare(a.version, b.version));

  return result;
}

// =============================================================================
// GIT TAG FETCHING
// =============================================================================

/**
 * Fetch git tags from a GitHub repository.
 *
 * @param repo - Repository in "owner/repo" format
 * @param pattern - Tag pattern to filter by
 * @param githubToken - GitHub token for API authentication
 * @returns Array of matching git tags
 */
export async function fetchGitTags(
  repo: string,
  pattern: string,
  githubToken?: string
): Promise<GitTag[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "langchain-ir-builder",
  };

  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }

  const tags: GitTag[] = [];
  let page = 1;
  const perPage = 100;

  // Phase 1: Collect all matching tag refs (no date API calls yet)
  interface TagRef {
    name: string;
    version: string;
    sha: string;
    objectUrl?: string;
    objectType: string;
  }
  const matchingRefs: TagRef[] = [];

  while (true) {
    const url = `https://api.github.com/repos/${repo}/git/refs/tags?per_page=${perPage}&page=${page}`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Repository ${repo} not found or no tags exist`);
        return [];
      }
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const refs = await response.json() as GitHubTagRef[];

    if (refs.length === 0) break;

    // Collect matching tags without fetching dates
    const beforeCount = matchingRefs.length;
    for (const ref of refs) {
      const tagName = ref.ref.replace("refs/tags/", "");
      const version = parseVersionFromTag(tagName, pattern);
      if (!version) continue;

      // Skip pre-release versions (alpha, beta, rc, etc.)
      const parsed = semver.parse(version);
      if (parsed && parsed.prerelease.length > 0) {
        continue;
      }

      matchingRefs.push({
        name: tagName,
        version,
        sha: ref.object.sha,
        objectUrl: ref.object.url,
        objectType: ref.object.type,
      });
    }

    // Show progress with matching count
    process.stdout.write(`\r   Scanning tags... page ${page}, found ${matchingRefs.length} matching "${pattern}"`);

    // Check if there are more pages
    if (refs.length < perPage) break;
    page++;
  }

  // Clear the progress line and show final count
  process.stdout.write("\r" + " ".repeat(80) + "\r");
  console.log(`   Found ${matchingRefs.length} matching tags across ${page} pages`);

  // Phase 2: Filter to keep first and last patch for each minor version
  // Exception: For 0.0.x, only keep the last version
  // Sort by semver descending first
  matchingRefs.sort((a, b) => semver.rcompare(a.version, b.version));

  // Group by minor version
  const minorGroups = new Map<string, TagRef[]>();
  for (const ref of matchingRefs) {
    const parsed = semver.parse(ref.version);
    if (!parsed) continue;

    const minorKey = `${parsed.major}.${parsed.minor}`;
    if (!minorGroups.has(minorKey)) {
      minorGroups.set(minorKey, []);
    }
    minorGroups.get(minorKey)!.push(ref);
  }

  const filteredRefs: TagRef[] = [];

  for (const [minorKey, group] of minorGroups) {
    // group is already sorted newest first
    const latest = group[0];
    const oldest = group[group.length - 1];

    // For 0.0.x, only include the latest version
    if (minorKey === "0.0") {
      filteredRefs.push(latest);
    } else {
      // Include the latest patch
      filteredRefs.push(latest);

      // Include the oldest patch if different from latest
      if (oldest.version !== latest.version) {
        filteredRefs.push(oldest);
      }
    }
  }

  // Sort final result by semver (newest first)
  filteredRefs.sort((a, b) => semver.rcompare(a.version, b.version));

  console.log(`   Filtered to ${filteredRefs.length} versions (first+last per minor): ${filteredRefs.map(r => r.version).join(", ")}`);

  // Phase 3: Fetch dates only for the filtered minor versions
  let fetchedCount = 0;
  for (const ref of filteredRefs) {
    fetchedCount++;
    process.stdout.write(`\r   Fetching release dates... ${fetchedCount}/${filteredRefs.length}`);

    let sha = ref.sha;
    let date = new Date().toISOString();

    if (ref.objectType === "tag" && ref.objectUrl) {
      const tagResponse = await fetch(ref.objectUrl, { headers });
      if (tagResponse.ok) {
        const tagData = await tagResponse.json() as GitHubTagRef;
        if (tagData.object?.sha) {
          sha = tagData.object.sha;
        }
        if (tagData.tagger?.date) {
          date = tagData.tagger.date;
        }
      }
    } else {
      const commitResponse = await fetch(
        `https://api.github.com/repos/${repo}/commits/${sha}`,
        { headers }
      );
      if (commitResponse.ok) {
        const commitData = await commitResponse.json() as GitHubCommit;
        date = commitData.commit.committer.date;
      }
    }

    tags.push({
      name: ref.name,
      sha,
      date,
    });
  }

  // Clear progress line
  process.stdout.write("\r" + " ".repeat(60) + "\r");
  console.log(`   ✓ Fetched dates for ${tags.length} versions`);

  return tags;
}

// =============================================================================
// VERSION DISCOVERY
// =============================================================================

/**
 * Discover versions from git tags for a package.
 *
 * @param repo - Repository in "owner/repo" format
 * @param tagPattern - Tag pattern for this package's releases
 * @param options - Discovery options
 * @param githubToken - GitHub token for API authentication
 * @returns Array of discovered versions (newest first)
 */
export async function discoverVersions(
  repo: string,
  tagPattern: string,
  options: VersionDiscoveryOptions,
  githubToken?: string
): Promise<DiscoveredVersion[]> {
  console.log(`Discovering versions for ${repo} with pattern "${tagPattern}"...`);

  // Step 1: Fetch all tags matching the pattern
  const tags = await fetchGitTags(repo, tagPattern, githubToken);
  console.log(`Found ${tags.length} tags matching pattern`);

  // Step 2: Parse version from each tag
  const versions: DiscoveredVersion[] = [];
  for (const tag of tags) {
    console.log(`Checking tag: ${tag.name}`);
    const version = parseVersionFromTag(tag.name, tagPattern);
    if (version) {
      // Apply minVersion filter
      if (options.minVersion && semver.lt(version, options.minVersion)) {
        continue;
      }

      console.log(`Adding version: ${version}`);
      versions.push({
        version,
        sha: tag.sha,
        tag: tag.name,
        releaseDate: tag.date,
      });
    }
  }

  // Step 3: Sort by semantic version (newest first)
  versions.sort((a, b) => semver.rcompare(a.version, b.version));

  // Step 4: Filter to keep first and last patch per minor version (except 0.0.x)
  const filteredVersions = filterToFirstAndLastMinorVersions(versions);
  console.log(`Filtered to ${filteredVersions.length} versions (first+last per minor)`);

  // Step 5: Apply maxVersions limit
  let result = filteredVersions.slice(0, options.maxVersions);

  // Step 6: Always include specified versions
  if (options.alwaysInclude) {
    for (const v of options.alwaysInclude) {
      if (!result.find((r) => r.version === v)) {
        const found = versions.find((ver) => ver.version === v);
        if (found) {
          result.push(found);
          console.log(`Always including version ${v}`);
        }
      }
    }
    // Re-sort after adding
    result.sort((a, b) => semver.rcompare(a.version, b.version));
  }

  console.log(
    `Final version list: ${result.map((v) => v.version).join(", ")}`
  );
  return result;
}

/**
 * Create discovery options from versioning config.
 *
 * @param config - Versioning configuration
 * @returns Discovery options
 */
export function createDiscoveryOptions(
  config: VersioningConfig
): VersionDiscoveryOptions {
  return {
    maxVersions: config.maxVersions ?? 10,
    alwaysInclude: config.alwaysInclude,
    minVersion: config.minVersion,
  };
}

