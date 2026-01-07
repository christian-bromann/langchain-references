#!/usr/bin/env tsx
/**
 * Fetch Tarball - Downloads source tarballs from GitHub
 *
 * Usage:
 *   pnpm fetch-tarball --repo langchain-ai/langchain --sha abc123
 *
 * Tarballs are extracted to a system temp directory to avoid polluting
 * the main project and to prevent PATH/dependency conflicts.
 */

import { program } from "commander";
import { fetchTarball, getLatestSha, getCacheBaseDir } from "../tarball.js";

async function main() {
  program
    .name("fetch-tarball")
    .description("Download and extract source tarballs from GitHub")
    .requiredOption("--repo <repo>", "GitHub repository (owner/repo)")
    .option("--sha <sha>", "Git commit SHA (defaults to latest main)")
    .option("--output <path>", "Output directory (defaults to system temp)")
    .parse();

  const opts = program.opts();

  // Resolve SHA if not provided
  const sha = opts.sha || (await getLatestSha(opts.repo));

  const result = await fetchTarball({
    repo: opts.repo,
    sha,
    output: opts.output || getCacheBaseDir(),
  });

  console.log(`\n📁 Source available at: ${result.extractedPath}`);
  console.log(`   SHA: ${result.sha}`);
  console.log(`   Fetched: ${result.fetchedAt}`);
}

main().catch((error) => {
  console.error("Fetch failed:", error);
  process.exit(1);
});

