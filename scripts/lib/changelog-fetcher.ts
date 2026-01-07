/**
 * Changelog Fetcher Module
 *
 * Fetches existing changelogs from deployed storage for incremental builds.
 * This allows the build pipeline to only process new versions.
 */

import type {
  PackageChangelog,
  PackageVersionIndex,
} from "@langchain/ir-schema";

// =============================================================================
// TYPES
// =============================================================================

export interface DeployedChangelog {
  changelog: PackageChangelog;
  versions: PackageVersionIndex;
}

// =============================================================================
// FETCH DEPLOYED CHANGELOG
// =============================================================================

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
  baseUrl?: string
): Promise<DeployedChangelog | null> {
  const blobBaseUrl = baseUrl ?? process.env.BLOB_BASE_URL;

  if (!blobBaseUrl) {
    console.log("BLOB_BASE_URL not set - will do full build");
    return null;
  }

  try {
    const changelogUrl = `${blobBaseUrl}/ir/${project}/${language}/${packageId}/changelog.json`;
    const versionsUrl = `${blobBaseUrl}/ir/${project}/${language}/${packageId}/versions.json`;

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
      throw new Error(
        `Failed to fetch changelog: ${changelogRes.status} / ${versionsRes.status}`
      );
    }

    const changelog: PackageChangelog = await changelogRes.json();
    const versions: PackageVersionIndex = await versionsRes.json();

    console.log(
      `Found existing changelog with ${changelog.history.length} version(s), ` +
        `latest: ${versions.latest.version}`
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
async function fetchWithRetry(
  url: string,
  retries = 3,
  delay = 1000
): Promise<Response> {
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

