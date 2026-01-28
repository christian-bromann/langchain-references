/**
 * Java Reference Index Page
 *
 * Landing page for Java API reference documentation.
 * Lists all available Java packages.
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
  title: "Java API Reference",
  description:
    "Java API reference documentation for LangSmith SDK. Browse classes, interfaces, and methods.",
  openGraph: {
    title: "Java API Reference",
    description: "Java API reference documentation for LangSmith SDK.",
    type: "website",
    url: "/java",
    images: [
      {
        url: "/og/java",
        width: 1200,
        height: 630,
        alt: "Java API Reference",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Java API Reference",
    description: "Java API reference documentation for LangSmith SDK.",
    images: ["/og/java"],
  },
  alternates: {
    canonical: "/java",
  },
};
import { getManifestData } from "@/lib/ir/loader";

export default async function JavaIndexPage() {
  const manifest = await getManifestData();
  const packages = manifest?.packages.filter((p) => p.language === "java") ?? [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary mb-2">
          <span>☕</span>
          <span>Java</span>
        </div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Java API Reference</h1>
        <p className="mt-2 text-foreground-secondary text-lg">
          API reference documentation for LangSmith Java SDK.
        </p>
      </div>

      {/* Package list */}
      <div className="grid gap-4">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.packageId}
            package={pkg}
            basePath="/java"
            statsConfig={{
              functionsLabel: "methods",
              showModules: false,
              showTypes: true,
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
