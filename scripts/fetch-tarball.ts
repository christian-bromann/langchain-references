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
 * Detect the package manager used in a directory by checking for lock files.
 */
async function detectPackageManager(
  dir: string
): Promise<{ name: "pnpm" | "yarn" | "npm"; installCmd: string }> {
  // Check for lock files in order of preference
  const lockFiles = [
    { file: "pnpm-lock.yaml", name: "pnpm" as const, cmd: "pnpm install --ignore-scripts --no-optional" },
    { file: "yarn.lock", name: "yarn" as const, cmd: "yarn install --ignore-scripts --ignore-optional" },
    { file: "package-lock.json", name: "npm" as const, cmd: "npm install --ignore-scripts --no-optional --legacy-peer-deps" },
  ];

  for (const { file, name, cmd } of lockFiles) {
    try {
      await fs.access(path.join(dir, file));
      return { name, installCmd: cmd };
    } catch {
      // Lock file not found, try next
    }
  }

  // Default to npm if no lock file found
  return { name: "npm", installCmd: "npm install --ignore-scripts --no-optional --legacy-peer-deps" };
}

/**
 * Install dependencies in the extracted directory for proper type resolution.
 * Detects the package manager from lock files and installs dependencies.
 */
async function installDependencies(extractedPath: string): Promise<void> {
  const { execSync } = await import("child_process");

  // Check if package.json exists
  const packageJsonPath = path.join(extractedPath, "package.json");
  try {
    await fs.access(packageJsonPath);
  } catch {
    console.log("   No package.json found, skipping dependency install");
    return;
  }

  // Check if dependencies are already installed by looking for a marker file
  const installMarkerPath = path.join(extractedPath, ".deps-installed");
  try {
    await fs.access(installMarkerPath);
    console.log("   Dependencies already installed, skipping");
    return;
  } catch {
    // Marker doesn't exist, proceed with install
  }

  // Detect package manager from lock files
  const { name: pm, installCmd } = await detectPackageManager(extractedPath);
  console.log(`   📦 Installing dependencies with ${pm}...`);

  try {
    execSync(installCmd, {
      cwd: extractedPath,
      stdio: "pipe",
      timeout: 600000, // 10 minute timeout for large monorepos
    });

    // Create marker file to skip future installs
    await fs.writeFile(installMarkerPath, new Date().toISOString());
    console.log(`   ✅ Dependencies installed with ${pm}`);
  } catch (error: any) {
    console.warn(`   ⚠️  Could not install dependencies: ${error.message?.slice(0, 100)}`);
    console.warn("   ⚠️  External types may show as 'any'");
  }

  // For TypeScript projects, try to build to generate type declarations
  // This enables TypeDoc to resolve types from workspace dependencies
  await buildTypeDeclarations(extractedPath, pm);
}

/**
 * Build TypeScript declarations for workspace packages.
 * This helps TypeDoc resolve types from sibling packages in a monorepo.
 */
async function buildTypeDeclarations(
  extractedPath: string,
  packageManager: "pnpm" | "yarn" | "npm"
): Promise<void> {
  const { execSync } = await import("child_process");

  // Check if this is a TypeScript project with a build script
  const packageJsonPath = path.join(extractedPath, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    // Check for a build:types or build script
    const scripts = packageJson.scripts || {};
    const hasBuildTypes = scripts["build:types"] || scripts["build"];

    if (!hasBuildTypes) {
      return;
    }

    // Check if types are already built
    const buildMarkerPath = path.join(extractedPath, ".types-built");
    try {
      await fs.access(buildMarkerPath);
      console.log("   Types already built, skipping");
      return;
    } catch {
      // Marker doesn't exist, proceed with build
    }

    console.log("   🔨 Building type declarations...");

    // Try build:types first, then fall back to build
    const buildCmd = scripts["build:types"]
      ? `${packageManager} run build:types`
      : `${packageManager} run build`;

    try {
      execSync(buildCmd, {
        cwd: extractedPath,
        stdio: "pipe",
        timeout: 900000, // 15 minute timeout for builds
        env: {
          ...process.env,
          // Skip tests and linting during build
          CI: "true",
        },
      });

      await fs.writeFile(buildMarkerPath, new Date().toISOString());
      console.log("   ✅ Type declarations built");
    } catch (error: any) {
      // Building is optional - extraction will still work but with some "unknown" types
      console.warn(`   ⚠️  Could not build types: ${error.message?.slice(0, 100)}`);
      console.warn("   ⚠️  Some external type references may show as 'unknown'");
    }
  } catch {
    // No package.json or couldn't read it
  }
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

    // Ensure dependencies are installed even for cached tarballs
    await installDependencies(extractedPath);

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

  // Install dependencies for proper type resolution
  // This handles both workspace packages and external dependencies (e.g., openai, @anthropic-ai/sdk)
  await installDependencies(extractedPath);

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
