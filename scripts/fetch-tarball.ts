#!/usr/bin/env tsx
/**
 * Fetch Tarball - Downloads source tarballs from GitHub
 *
 * Usage:
 *   tsx fetch-tarball.ts --repo langchain-ai/langchain --sha abc123 --output ./cache
 */

import { program } from "commander";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import * as tar from "tar";

export interface FetchOptions {
  repo: string;
  sha: string;
  output: string;
}

export interface FetchResult {
  repo: string;
  sha: string;
  extractedPath: string;
  fetchedAt: string;
}

/**
 * Get GitHub API headers.
 */
function getGitHubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "langchain-reference-docs",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

/**
 * Get the default branch for a repository.
 */
async function getDefaultBranch(repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}`;
  const response = await fetch(url, { headers: getGitHubHeaders() });

  if (!response.ok) {
    // Fallback to trying common branch names
    console.log(`   ⚠️  Could not fetch repo info, trying common branch names...`);
    return "main";
  }

  const data = await response.json() as { default_branch: string };
  return data.default_branch || "main";
}

/**
 * Get the latest commit SHA for a repository's default branch.
 */
export async function getLatestSha(repo: string): Promise<string> {
  // First get the default branch
  const defaultBranch = await getDefaultBranch(repo);
  console.log(`   Using branch: ${defaultBranch}`);

  const url = `https://api.github.com/repos/${repo}/commits/${defaultBranch}`;
  const response = await fetch(url, { headers: getGitHubHeaders() });

  if (!response.ok) {
    // Try fallback branches
    const fallbackBranches = ["main", "master"];
    for (const branch of fallbackBranches) {
      if (branch === defaultBranch) continue;

      const fallbackUrl = `https://api.github.com/repos/${repo}/commits/${branch}`;
      const fallbackResponse = await fetch(fallbackUrl, { headers: getGitHubHeaders() });

      if (fallbackResponse.ok) {
        const data = (await fallbackResponse.json()) as { sha: string };
        return data.sha;
      }
    }

    throw new Error(
      `Failed to get latest SHA: ${response.status} ${response.statusText}. ` +
      `Consider setting GITHUB_TOKEN environment variable to avoid rate limits.`
    );
  }

  const data = (await response.json()) as { sha: string };
  return data.sha;
}

/**
 * Fetch and extract a tarball from GitHub.
 */
export async function fetchTarball(options: FetchOptions): Promise<FetchResult> {
  const { repo, sha, output } = options;

  console.log(`📥 Fetching tarball for ${repo}@${sha.substring(0, 7)}`);

  // Create output directory
  const cacheDir = path.join(output, repo.replace("/", "_"), sha);
  await fs.mkdir(cacheDir, { recursive: true });

  const tarballPath = path.join(cacheDir, "source.tar.gz");
  const extractedPath = path.join(cacheDir, "extracted");

  // Check if already cached
  try {
    await fs.access(extractedPath);
    const stats = await fs.stat(path.join(extractedPath, ".fetch-complete"));
    console.log(`✅ Using cached tarball: ${extractedPath}`);
    return {
      repo,
      sha,
      extractedPath,
      fetchedAt: stats.mtime.toISOString(),
    };
  } catch {
    // Not cached or incomplete, need to download
  }

  // Download tarball from GitHub
  const url = `https://api.github.com/repos/${repo}/tarball/${sha}`;
  console.log(`📡 Downloading: ${url}`);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "langchain-reference-docs",
  };

  // Add auth token if available
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch tarball: ${response.status} ${response.statusText}`);
  }

  // Save tarball
  const body = response.body;
  if (!body) {
    throw new Error("No response body");
  }

  await pipeline(
    Readable.fromWeb(body as any),
    createWriteStream(tarballPath)
  );

  console.log(`💾 Saved tarball: ${tarballPath}`);

  // Extract tarball
  console.log(`📦 Extracting to: ${extractedPath}`);
  await fs.mkdir(extractedPath, { recursive: true });

  await tar.extract({
    file: tarballPath,
    cwd: extractedPath,
    strip: 1, // Remove top-level directory
  });

  // Mark extraction as complete
  const fetchedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(extractedPath, ".fetch-complete"),
    JSON.stringify({ repo, sha, fetchedAt }, null, 2)
  );

  console.log(`✅ Extraction complete`);

  // Clean up tarball to save space
  await fs.unlink(tarballPath).catch(() => {});

  return {
    repo,
    sha,
    extractedPath,
    fetchedAt,
  };
}

/**
 * Fetch multiple repositories in parallel.
 */
export async function fetchMultiple(
  repos: Array<{ repo: string; sha?: string }>,
  output: string
): Promise<FetchResult[]> {
  const results = await Promise.all(
    repos.map(async ({ repo, sha }) => {
      const resolvedSha = sha || (await getLatestSha(repo));
      return fetchTarball({ repo, sha: resolvedSha, output });
    })
  );
  return results;
}

// CLI entry point
async function main() {
  program
    .name("fetch-tarball")
    .description("Download and extract source tarballs from GitHub")
    .requiredOption("--repo <repo>", "GitHub repository (owner/repo)")
    .option("--sha <sha>", "Git commit SHA (defaults to latest main)")
    .option("--output <path>", "Output directory", "./cache")
    .parse();

  const opts = program.opts();

  // Resolve SHA if not provided
  const sha = opts.sha || (await getLatestSha(opts.repo));

  const result = await fetchTarball({
    repo: opts.repo,
    sha,
    output: opts.output,
  });

  console.log(`\n📁 Source available at: ${result.extractedPath}`);
  console.log(`   SHA: ${result.sha}`);
  console.log(`   Fetched: ${result.fetchedAt}`);
}

// Only run main if this is the entry point
const isMainModule = process.argv[1]?.includes("fetch-tarball");
if (isMainModule) {
  main().catch((error) => {
    console.error("Fetch failed:", error);
    process.exit(1);
  });
}
