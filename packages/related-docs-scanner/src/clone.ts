/**
 * Docs repository cloning utilities
 */

import { simpleGit, type SimpleGit } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Clone the docs repository (shallow clone for speed).
 *
 * @param repoUrl - The repository URL to clone
 * @param targetDir - The directory to clone into
 * @returns The commit SHA of the cloned repo
 */
export async function cloneDocsRepo(repoUrl: string, targetDir: string): Promise<string> {
  const git: SimpleGit = simpleGit();

  // Clone with depth 1 for speed
  await git.clone(repoUrl, targetDir, ["--depth", "1"]);

  // Get the commit SHA for tracking
  const repoGit = simpleGit(targetDir);
  const sha = await repoGit.revparse(["HEAD"]);
  return sha.trim();
}

/**
 * Pull latest changes if the repo already exists.
 *
 * @param repoDir - The repository directory
 * @returns The current commit SHA
 */
export async function pullDocsRepo(repoDir: string): Promise<string> {
  const git = simpleGit(repoDir);

  // Fetch and reset to origin/main to get latest
  await git.fetch(["--depth", "1"]);
  await git.reset(["--hard", "origin/main"]);

  // Get the commit SHA
  const sha = await git.revparse(["HEAD"]);
  return sha.trim();
}

/**
 * Check if a directory exists and is a git repository.
 *
 * @param dir - The directory to check
 * @returns True if the directory is a git repo
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const gitDir = path.join(dir, ".git");
    const stat = await fs.stat(gitDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Clone or update the docs repository.
 *
 * @param repoUrl - The repository URL
 * @param targetDir - The directory to clone/update into
 * @returns The current commit SHA
 */
export async function cloneOrUpdateDocsRepo(repoUrl: string, targetDir: string): Promise<string> {
  if (await isGitRepo(targetDir)) {
    console.log(`📚 Updating existing docs repo at ${targetDir}...`);
    return pullDocsRepo(targetDir);
  } else {
    console.log(`📚 Cloning docs repo to ${targetDir}...`);
    return cloneDocsRepo(repoUrl, targetDir);
  }
}
