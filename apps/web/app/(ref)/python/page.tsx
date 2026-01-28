/**
 * Python Reference Index Page
 *
 * Landing page for Python API reference documentation.
 * Lists all available Python packages.
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
  title: "Python API Reference",
  description:
    "Python API reference documentation for LangChain, LangGraph, and LangSmith packages. Browse classes, functions, and modules.",
  openGraph: {
    title: "Python API Reference",
    description:
      "Python API reference documentation for LangChain, LangGraph, and LangSmith packages.",
    type: "website",
    url: "/python",
    images: [
      {
        url: "/og/python",
        width: 1200,
        height: 630,
        alt: "Python API Reference",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Python API Reference",
    description:
      "Python API reference documentation for LangChain, LangGraph, and LangSmith packages.",
    images: ["/og/python"],
  },
  alternates: {
    canonical: "/python",
  },
};
import { getManifestData } from "@/lib/ir/loader";

export default async function PythonIndexPage() {
  const manifest = await getManifestData();
  const packages = manifest?.packages.filter((p) => p.language === "python") ?? [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-foreground-secondary mb-2">
          <span>🐍</span>
          <span>Python</span>
        </div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Python API Reference</h1>
        <p className="mt-2 text-foreground-secondary text-lg">
          API reference documentation for LangChain Python packages.
        </p>
      </div>

      {/* Package list */}
      <div className="grid gap-4">
        {packages.map((pkg) => (
          <PackageCard key={pkg.packageId} package={pkg} basePath="/python" />
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
