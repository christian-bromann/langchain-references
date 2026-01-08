/**
 * Tarball Utilities
 *
 * Downloads and extracts source tarballs from GitHub.
 * Handles caching, dependency installation, and type building.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import * as tar from "tar";

/**
 * Get the base cache directory for all LangChain reference builds.
 * Uses system temp directory to isolate from the main project.
 */
export function getCacheBaseDir(): string {
  return path.join(os.tmpdir(), "langchain-reference-build-cache");
}

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
 * Check if the project uses Yarn Berry (v2+) by checking packageManager field.
 */
async function isYarnBerry(dir: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(dir, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);
    const pm = packageJson.packageManager;
    if (pm && pm.startsWith("yarn@")) {
      const version = pm.replace("yarn@", "").split(".")[0];
      return parseInt(version, 10) >= 2;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Detect the package manager used in a directory by checking for lock files.
 */
async function detectPackageManager(
  dir: string
): Promise<{ name: "pnpm" | "yarn" | "npm"; installCmd: string; buildCmd: string }> {
  // Check for lock files in order of preference
  const lockFiles = [
    { file: "pnpm-lock.yaml", name: "pnpm" as const },
    { file: "yarn.lock", name: "yarn" as const },
    { file: "package-lock.json", name: "npm" as const },
  ];

  for (const { file, name } of lockFiles) {
    try {
      await fs.access(path.join(dir, file));

      if (name === "yarn") {
        // Check if it's Yarn Berry (v2+) which has different flags
        const isBerry = await isYarnBerry(dir);
        if (isBerry) {
          return {
            name: "yarn",
            // Yarn Berry: use --immutable for frozen lockfile, --mode=skip-build to skip postinstall
            installCmd: "corepack enable && yarn install --immutable --mode=skip-build",
            buildCmd: "yarn run build",
          };
        }
        // Yarn Classic (v1): use --frozen-lockfile
        return {
          name: "yarn",
          installCmd: "yarn install --frozen-lockfile --ignore-scripts --ignore-optional",
          buildCmd: "yarn run build",
        };
      }

      if (name === "pnpm") {
        return {
          name: "pnpm",
          // --frozen-lockfile: don't update lockfile
          // --config.engine-strict=false: ignore engine requirements (e.g., Node >= 24)
          // Note: don't use --no-optional as it breaks esbuild (needs platform binaries)
          installCmd: "pnpm install --frozen-lockfile --ignore-scripts --config.engine-strict=false",
          buildCmd: "pnpm run build",
        };
      }

      // npm: use --package-lock=false to avoid lockfile updates (npm ci requires exact lockfile)
      // Note: don't use --no-optional as it breaks esbuild (needs platform binaries)
      return {
        name: "npm",
        installCmd: "npm ci --ignore-scripts --legacy-peer-deps",
        buildCmd: "npm run build",
      };
    } catch {
      // Lock file not found, try next
    }
  }

  // Default to npm if no lock file found
  // Note: npm ci requires a lockfile, so we use npm install here
  return {
    name: "npm",
    installCmd: "npm install --ignore-scripts --legacy-peer-deps",
    buildCmd: "npm run build",
  };
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
  const pmInfo = await detectPackageManager(extractedPath);
  console.log(`   📦 Installing dependencies with ${pmInfo.name}...`);

  try {
    execSync(pmInfo.installCmd, {
      cwd: extractedPath,
      stdio: "pipe" as const,
      timeout: 600000, // 10 minute timeout for large monorepos
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large monorepos
      shell: "/bin/bash", // Required for corepack enable && yarn install
      env: {
        ...process.env,
        CI: "true", // Required for non-interactive pnpm/yarn
      },
    });

    // Create marker file to skip future installs
    await fs.writeFile(installMarkerPath, new Date().toISOString());
    console.log(`   ✅ Dependencies installed with ${pmInfo.name}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`   ⚠️  Could not install dependencies: ${errorMessage.slice(0, 100)}`);
    console.warn("   ⚠️  External types may show as 'any'");
  }

  // For TypeScript projects, try to build to generate type declarations
  // This enables TypeDoc to resolve types from workspace dependencies
  await buildTypeDeclarations(extractedPath, pmInfo);
}

/**
 * Build TypeScript declarations for workspace packages.
 * This helps TypeDoc resolve types from sibling packages in a monorepo.
 */
async function buildTypeDeclarations(
  extractedPath: string,
  pmInfo: { name: string; buildCmd: string }
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
      ? `${pmInfo.name} run build:types`
      : pmInfo.buildCmd;

    try {
      // Add node_modules/.bin to PATH so binaries like tsdown are found
      const binPath = path.join(extractedPath, "node_modules", ".bin");
      const pathSep = process.platform === "win32" ? ";" : ":";
      const enhancedPath = `${binPath}${pathSep}${process.env.PATH}`;

      execSync(buildCmd, {
        cwd: extractedPath,
        stdio: "pipe" as const,
        timeout: 900000, // 15 minute timeout for builds
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large monorepos
        shell: "/bin/bash",
        env: {
          ...process.env,
          PATH: enhancedPath,
          // Skip tests and linting during build
          CI: "true",
        },
      });

      await fs.writeFile(buildMarkerPath, new Date().toISOString());
      console.log("   ✅ Type declarations built");
    } catch (error: unknown) {
      // Building is optional - extraction will still work but with some "unknown" types
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`   ⚠️  Could not build types: ${errorMessage.slice(0, 100)}`);
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
    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
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

