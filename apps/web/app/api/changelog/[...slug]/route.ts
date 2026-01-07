import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { PackageChangelog, VersionDelta, ChangeRecord } from "@langchain/ir-schema";

interface VersionChange {
  version: string;
  releaseDate: string;
  type: "added" | "modified" | "deprecated" | "removed";
  changes?: ChangeRecord[];
  snapshotBefore?: string;
  snapshotAfter?: string;
}

/**
 * Map project+language to the local IR output symlink name.
 */
function getLocalIrPath(project: string, language: string): string {
  const langSuffix = language === "python" ? "python" : "javascript";
  return `latest-${project}-${langSuffix}`;
}

/**
 * GET /api/changelog/:project/:language/:packageId
 *
 * Lazy-load changelog data for a specific symbol.
 * Query param: ?symbol=QualifiedName
 *
 * Returns an array of version changes relevant to the symbol.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string[] }> }
): Promise<NextResponse> {
  const { slug } = await context.params;

  if (!slug || slug.length < 3) {
    return NextResponse.json(
      { error: "Invalid path. Expected /api/changelog/:project/:language/:packageId" },
      { status: 400 }
    );
  }

  const [project, language, packageId] = slug;
  const symbolName = request.nextUrl.searchParams.get("symbol");

  if (!symbolName) {
    return NextResponse.json(
      { error: "Missing 'symbol' query parameter" },
      { status: 400 }
    );
  }

  try {
    let changelog: PackageChangelog | null = null;

    // Try local IR output first (for development)
    const localIrPath = getLocalIrPath(project, language);
    const localChangelogPath = path.join(
      process.cwd(),
      "..",
      "..",
      "ir-output",
      localIrPath,
      "packages",
      packageId,
      "changelog.json"
    );

    try {
      const localContent = await fs.readFile(localChangelogPath, "utf-8");
      changelog = JSON.parse(localContent);
    } catch {
      // Local file not found, try blob storage
    }

    // Fallback to blob storage
    if (!changelog) {
      const blobBaseUrl = process.env.BLOB_BASE_URL;
      if (blobBaseUrl) {
        const changelogUrl = `${blobBaseUrl}/ir/${project}/${language}/${packageId}/changelog.json`;
        const response = await fetch(changelogUrl, {
          next: { revalidate: 3600 },
        });

        if (response.ok) {
          changelog = await response.json();
        }
      }
    }

    if (!changelog) {
      return NextResponse.json([], { status: 200 });
    }

    // Extract changes relevant to this symbol
    const symbolChanges = extractSymbolChanges(changelog, symbolName);

    return NextResponse.json(symbolChanges, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Failed to load changelog:", error);
    return NextResponse.json(
      { error: "Failed to load changelog" },
      { status: 500 }
    );
  }
}

/**
 * Extract changes relevant to a specific symbol from the full changelog.
 */
function extractSymbolChanges(
  changelog: PackageChangelog,
  symbolName: string
): VersionChange[] {
  const changes: VersionChange[] = [];

  for (const delta of changelog.history) {
    // Check if symbol was added in this version
    const added = delta.added.find((a) => a.qualifiedName === symbolName);
    if (added) {
      changes.push({
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "added",
      });
      continue;
    }

    // Check if symbol was modified in this version
    const modified = delta.modified.find((m) => m.qualifiedName === symbolName);
    if (modified) {
      changes.push({
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "modified",
        changes: modified.changes,
        snapshotBefore: modified.snapshotBefore
          ? renderSnapshot(modified.snapshotBefore)
          : undefined,
        snapshotAfter: modified.snapshotAfter
          ? renderSnapshot(modified.snapshotAfter)
          : undefined,
      });
      continue;
    }

    // Check if symbol was deprecated in this version
    const deprecated = delta.deprecated.find((d) => d.qualifiedName === symbolName);
    if (deprecated) {
      changes.push({
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "deprecated",
        changes: deprecated.message
          ? [
              {
                type: "deprecated",
                description: deprecated.message,
                breaking: false,
              },
            ]
          : undefined,
      });
      continue;
    }

    // Check if symbol was removed in this version
    const removed = delta.removed.find((r) => r.qualifiedName === symbolName);
    if (removed) {
      changes.push({
        version: delta.version,
        releaseDate: delta.releaseDate,
        type: "removed",
      });
    }
  }

  return changes;
}

/**
 * Render a symbol snapshot to a string for display.
 */
function renderSnapshot(snapshot: any): string {
  if (!snapshot) return "";

  // For classes/interfaces, show full structure
  if (snapshot.members && snapshot.members.length > 0) {
    const lines = [snapshot.signature + " {"];
    for (const member of snapshot.members) {
      lines.push(`  ${member.signature};`);
    }
    lines.push("}");
    return lines.join("\n");
  }

  // For functions and other types, just show signature
  return snapshot.signature;
}

