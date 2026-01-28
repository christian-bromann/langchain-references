/**
 * JavaScript Reference Index Page
 *
 * Landing page for JavaScript/TypeScript API reference documentation.
 * Lists all available JavaScript packages.
 */

import type { Metadata } from "next";
import { PackageCard } from "@/components/reference/PackageCard";

/**
 * Force static generation for optimal performance.
 */
export const dynamic = "force-static";

/**
 * Page metadata for SEO and social sharing
 */
export const metadata: Metadata = {
  title: "JavaScript API Reference",
  description:
    "JavaScript/TypeScript API reference documentation for LangChain.js, LangGraph.js, and related packages. Browse classes, functions, and modules.",
  openGraph: {
    title: "JavaScript API Reference",
    description:
      "JavaScript/TypeScript API reference documentation for LangChain.js and LangGraph.js packages.",
    type: "website",
    url: "/javascript",
    images: [
      {
        url: "/og/javascript",
        width: 1200,
        height: 630,
        alt: "JavaScript API Reference",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JavaScript API Reference",
    description:
      "JavaScript/TypeScript API reference documentation for LangChain.js and LangGraph.js packages.",
    images: ["/og/javascript"],
  },
  alternates: {
    canonical: "/javascript",
  },
};
import { getManifestData } from "@/lib/ir/loader";

export default async function JavaScriptIndexPage() {
  const manifest = await getManifestData();
  const packages =
    manifest?.packages.filter((p) => p.language === "typescript" || p.ecosystem === "javascript") ??
    [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary mb-2">
          <span>📘</span>
          <span>JavaScript / TypeScript</span>
        </div>
        <h1 className="text-3xl font-heading font-bold text-foreground">
          JavaScript API Reference
        </h1>
        <p className="mt-2 text-foreground-secondary text-lg">
          API reference documentation for LangChain.js packages.
        </p>
      </div>

      {/* Package list */}
      <div className="grid gap-4">
        {packages.map((pkg) => (
          <PackageCard key={pkg.packageId} package={pkg} basePath="/javascript" />
        ))}
      </div>

      {packages.length === 0 && (
        <div className="text-center py-12 text-foreground-secondary">
          <p>No packages found.</p>
          <p className="mt-2 text-sm">Run the build script to generate IR data.</p>
        </div>
      )}
    </div>
  );
}
