/**
 * Canonical base URL for the site.
 *
 * Prefer an explicit public base URL, otherwise fall back to the current Vercel
 * deployment host so OG images (and other absolute URLs) work before a custom
 * domain is wired up.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

export const BASE_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (process.env.NODE_ENV !== "production"
      ? "http://localhost:3000"
      : "https://langchain-references.vercel.app"),
);
