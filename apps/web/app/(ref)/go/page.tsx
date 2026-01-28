/**
 * Go Reference Index Page
 *
 * Landing page for Go API reference documentation.
 * Lists all available Go packages.
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
  title: "Go API Reference",
  description:
    "Go API reference documentation for LangSmith SDK. Browse types, functions, and methods.",
  openGraph: {
    title: "Go API Reference",
    description: "Go API reference documentation for LangSmith SDK.",
    type: "website",
    url: "/go",
    images: [
      {
        url: "/og/go",
        width: 1200,
        height: 630,
        alt: "Go API Reference",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Go API Reference",
    description: "Go API reference documentation for LangSmith SDK.",
    images: ["/og/go"],
  },
  alternates: {
    canonical: "/go",
  },
};
import { getManifestData } from "@/lib/ir/loader";

export default async function GoIndexPage() {
  const manifest = await getManifestData();
  const packages = manifest?.packages.filter((p) => p.language === "go") ?? [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary mb-2">
          <span>🐹</span>
          <span>Go</span>
        </div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Go API Reference</h1>
        <p className="mt-2 text-foreground-secondary text-lg">
          API reference documentation for LangSmith Go SDK.
        </p>
      </div>

      {/* Package list */}
      <div className="grid gap-4">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.packageId}
            package={pkg}
            basePath="/go"
            statsConfig={{
              classesLabel: "types",
              showModules: false,
            }}
          />
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
