/**
 * Changelog Fetcher Module
 *
 * Fetches existing changelogs from deployed storage for incremental builds.
 * This allows the build pipeline to only process new versions.
 */

import type { PackageChangelog, PackageVersionIndex } from "@langchain/ir-schema";
import type { LatestBuildPointer } from "./pointers.js";

// =============================================================================
// TYPES
// =============================================================================

export interface DeployedChangelog {
  changelog: PackageChangelog;
  versions: PackageVersionIndex;
}

// =============================================================================
// BLOB URL RESOLUTION
// =============================================================================

/**
 * Get the Vercel Blob base URL from environment.
 * Supports multiple sources:
 * 1. BLOB_BASE_URL (explicit, preferred for CI)
 * 2. BLOB_URL (used by the web app)
 * 3. Derived from BLOB_READ_WRITE_TOKEN (fallback)
 *
 * The token format is: vercel_blob_rw_{store_id}_{secret}
 * The public URL is: https://{store_id}.public.blob.vercel-storage.com
 */
function getBlobBaseUrl(): string | null {
  if (process.env.BLOB_BASE_URL) {
    return process.env.BLOB_BASE_URL;
  }

  if (process.env.BLOB_URL) {
    return process.env.BLOB_URL;
  }

  // Try to derive from BLOB_READ_WRITE_TOKEN
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    // Token format: vercel_blob_rw_{store_id}_{secret}
    const match = token.match(/^vercel_blob_rw_([^_]+)_/);
    if (match) {
      const storeId = match[1];
      return `https://${storeId}.public.blob.vercel-storage.com`;
    }
  }

  return null;
}

// =============================================================================
// FETCH DEPLOYED CHANGELOG
// =============================================================================

/**
 * Fetch the latest buildId for a project+language from blob storage.
 */
async function fetchLatestBuildId(
  blobBaseUrl: string,
  project: string,
  language: string,
): Promise<string | null> {
  const langSuffix = language === "python" ? "python" : "javascript";
  const pointerUrl = `${blobBaseUrl}/pointers/latest-${project}-${langSuffix}.json`;

  try {
    const response = await fetchWithRetry(pointerUrl);
    if (!response.ok) return null;
    const pointer = (await response.json()) as LatestBuildPointer;
    return pointer.buildId;
  } catch {
    return null;
  }
}

/**
 * Fetch the currently deployed changelog for a package.
 * Returns null if no changelog exists (first build).
 *
 * @param project - Project identifier (langchain, langgraph, etc.)
 * @param language - Language (python, javascript)
 * @param packageId - Package identifier
 * @param baseUrl - Base URL for blob storage (from env)
 * @returns Existing changelog and version index, or null if not found
 */
export async function fetchDeployedChangelog(
  project: string,
  language: string,
  packageId: string,
  baseUrl?: string,
): Promise<DeployedChangelog | null> {
  const blobBaseUrl = baseUrl ?? getBlobBaseUrl();

  if (!blobBaseUrl) {
    console.log(
      "No blob storage URL available (BLOB_BASE_URL, BLOB_URL, or BLOB_READ_WRITE_TOKEN not set) - will do full build",
    );
    return null;
  }

  try {
    // First, get the latest buildId for this project+language
    const buildId = await fetchLatestBuildId(blobBaseUrl, project, language);
    if (!buildId) {
      console.log(`No build pointer found for ${project}/${language} - will do full build`);
      return null;
    }

    const changelogUrl = `${blobBaseUrl}/ir/${buildId}/packages/${packageId}/changelog.json`;
    const versionsUrl = `${blobBaseUrl}/ir/${buildId}/packages/${packageId}/versions.json`;

    console.log(`Fetching existing changelog from ${changelogUrl}...`);

    const [changelogRes, versionsRes] = await Promise.all([
      fetchWithRetry(changelogUrl),
      fetchWithRetry(versionsUrl),
    ]);

    if (!changelogRes.ok || !versionsRes.ok) {
      if (changelogRes.status === 404 || versionsRes.status === 404) {
        console.log(`No existing changelog found for ${packageId} - will do full build`);
        return null;
      }
      throw new Error(`Failed to fetch changelog: ${changelogRes.status} / ${versionsRes.status}`);
    }

    const changelog = (await changelogRes.json()) as PackageChangelog;
    const versions = (await versionsRes.json()) as PackageVersionIndex;

    console.log(
      `Found existing changelog with ${changelog.history.length} version(s), ` +
        `latest: ${versions.latest.version}`,
    );

    return { changelog, versions };
  } catch (error) {
    console.warn(`Failed to fetch existing changelog: ${error}`);
    console.log("Will proceed with full build");
    return null;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Fetch with retry logic for transient failures.
 */
async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });
      return response;
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        console.log(`Retry ${i + 1}/${retries} after ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
