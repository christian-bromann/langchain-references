import { NextResponse } from "next/server";

/**
 * API route that exposes development configuration info.
 * Used by the DevTools component to show the current data source.
 */
export async function GET() {
  const blobUrl = process.env.BLOB_URL || process.env.NEXT_PUBLIC_BLOB_URL || "not configured";
  const isLocal = blobUrl.includes("localhost") || blobUrl.includes("127.0.0.1");

  return NextResponse.json({
    blobUrl,
    isLocal,
    nodeEnv: process.env.NODE_ENV || "unknown",
  });
}
