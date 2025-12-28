/**
 * JavaScript Symbol Page
 *
 * Dynamic route handler for JavaScript/TypeScript package and symbol pages.
 * Parses the URL slug and renders the appropriate component.
 */

import { notFound } from "next/navigation";
import { parseSlugWithLanguage } from "@/lib/utils/url";
import { SymbolPage } from "@/components/reference/SymbolPage";
import { PackagePage } from "@/components/reference/PackagePage";

interface Props {
  params: Promise<{
    slug: string[];
  }>;
}

export default async function JavaScriptSymbolPage({ params }: Props) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    notFound();
  }

  // Parse the slug - treat as JavaScript (includes TypeScript)
  const parsed = parseSlugWithLanguage(slug, "javascript");

  if (!parsed) {
    notFound();
  }

  // If only package name, show package overview
  if (parsed.symbolPath.length === 0) {
    return (
      <PackagePage
        language="javascript"
        packageId={parsed.packageId}
        packageName={parsed.packageName}
      />
    );
  }

  // Otherwise, show symbol page
  return (
    <SymbolPage
      language="javascript"
      packageId={parsed.packageId}
      packageName={parsed.packageName}
      symbolPath={parsed.fullPath}
    />
  );
}

/**
 * Generate metadata for the page
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlugWithLanguage(slug || [], "javascript");

  if (!parsed) {
    return { title: "Not Found" };
  }

  const symbolName = parsed.symbolPath.length > 0
    ? parsed.symbolPath[parsed.symbolPath.length - 1]
    : parsed.packageName;

  return {
    title: `${symbolName} | ${parsed.packageName}`,
    description: `JavaScript API reference for ${parsed.packageName}${parsed.fullPath ? ` - ${parsed.fullPath}` : ""}`,
  };
}

