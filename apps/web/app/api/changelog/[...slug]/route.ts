import { NextRequest, NextResponse } from "next/server";
import {
  getBuildIdForPackageId,
  getSymbolChangelog,
  type SymbolChangelogEntry,
} from "@/lib/ir/loader";

interface VersionChange {
  version: string;
  releaseDate: string;
  type: "added" | "modified" | "deprecated" | "removed";
}

/**
 * GET /api/changelog/:project/:language/:packageId
 *
 * Lazy-load changelog data for a specific symbol.
 * Query param: ?symbol=QualifiedName
 *
 * Note: project and language in the URL are kept for backwards compatibility
 * but only packageId is used to look up the buildId.
 *
 * OPTIMIZATION: Uses sharded changelog files (<500KB each) instead of
 * full changelog.json (which can be 18MB+). This enables CDN caching
 * and fast API responses.
 *
 * Returns an array of version changes relevant to the symbol.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> },
): Promise<NextResponse> {
  const { slug } = await context.params;

  if (!slug || slug.length < 3) {
    return NextResponse.json(
      { error: "Invalid path. Expected /api/changelog/:project/:language/:packageId" },
      { status: 400 },
    );
  }

  const [, , packageId] = slug;
  const symbolName = request.nextUrl.searchParams.get("symbol");

  if (!symbolName) {
    return NextResponse.json({ error: "Missing 'symbol' query parameter" }, { status: 400 });
  }

  try {
    // Get the package-specific buildId
    const buildId = await getBuildIdForPackageId(packageId);
    if (!buildId) {
      return NextResponse.json([], { status: 200 });
    }

    // Fetch only the shard containing this symbol's changelog (~50-200KB)
    const shardedChanges = await getSymbolChangelog(buildId, packageId, symbolName);

    // Convert to VersionChange format
    const changes: VersionChange[] = shardedChanges.map((entry: SymbolChangelogEntry) => ({
      version: entry.version,
      releaseDate: entry.releaseDate,
      type: entry.type,
    }));

    return NextResponse.json(changes, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Failed to load changelog:", error);
    return NextResponse.json({ error: "Failed to load changelog" }, { status: 500 });
  }
}
