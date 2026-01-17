/**
 * Blob Storage Utilities
 *
 * Shared utilities for interacting with Vercel Blob storage.
 */

export interface GetBlobBaseUrlOptions {
  /**
   * When true, prioritizes BLOB_READ_WRITE_TOKEN over BLOB_URL and
   * excludes localhost URLs. Use this when you need to always connect
   * to production blob storage (e.g., pull-ir command).
   */
  productionOnly?: boolean;
}

/**
 * Derive blob URL from BLOB_READ_WRITE_TOKEN.
 * Token format: vercel_blob_rw_{store_id}_{secret}
 * Public URL: https://{store_id}.public.blob.vercel-storage.com
 */
function deriveUrlFromToken(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const match = token.match(/^vercel_blob_rw_([^_]+)_/);
    if (match) {
      const storeId = match[1];
      return `https://${storeId}.public.blob.vercel-storage.com`;
    }
  }
  return null;
}

/**
 * Get the Vercel Blob base URL from environment.
 *
 * Default behavior:
 * 1. BLOB_URL (primary)
 * 2. Derived from BLOB_READ_WRITE_TOKEN (fallback)
 *
 * With productionOnly=true:
 * 1. Derived from BLOB_READ_WRITE_TOKEN (always production)
 * 2. BLOB_URL only if not localhost
 */
export function getBlobBaseUrl(options: GetBlobBaseUrlOptions = {}): string | null {
  const { productionOnly = false } = options;

  if (productionOnly) {
    // For production-only mode, prioritize token (always production)
    const tokenUrl = deriveUrlFromToken();
    if (tokenUrl) {
      return tokenUrl;
    }

    // Fall back to BLOB_URL only if it's not localhost
    if (process.env.BLOB_URL && !process.env.BLOB_URL.includes("localhost")) {
      return process.env.BLOB_URL;
    }

    return null;
  }

  // Default behavior: BLOB_URL first, then derive from token
  if (process.env.BLOB_URL) {
    return process.env.BLOB_URL;
  }

  return deriveUrlFromToken();
}
