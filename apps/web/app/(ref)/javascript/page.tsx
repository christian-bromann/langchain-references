/**
 * JavaScript Reference Index Page
 *
 * Landing page for JavaScript/TypeScript API reference documentation.
 * Lists all available JavaScript packages.
 */

import Link from "next/link";
import { Box, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getBuildIdForLanguage, getManifestData } from "@/lib/ir/loader";
import type { Package } from "@/lib/ir/types";

/**
 * Get package URL slug from display name
 */
function getPackageSlug(pkg: Package): string {
  // Convert @langchain/core -> langchain-core
  return pkg.displayName.replace(/^@/, "").replace(/\//g, "-");
}

export default async function JavaScriptIndexPage() {
  const buildId = await getBuildIdForLanguage("javascript");
  const manifest = buildId ? await getManifestData(buildId) : null;
  const packages = manifest?.packages.filter(
    (p) => p.language === "typescript" || p.ecosystem === "javascript"
  ) ?? [];

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
          <PackageCard key={pkg.packageId} package={pkg} />
        ))}
      </div>

      {packages.length === 0 && (
        <div className="text-center py-12 text-foreground-secondary">
          <p>No packages found.</p>
          <p className="mt-2 text-sm">
            Run the build script to generate IR data.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Package card component
 */
function PackageCard({
  package: pkg,
}: {
  package: Package;
}) {
  const href = `/javascript/${getPackageSlug(pkg)}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between p-4 rounded-lg",
        "border border-border bg-background-secondary",
        "hover:border-primary/50 hover:bg-background transition-colors"
      )}
    >
      <div className="flex items-start gap-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Box className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
            {pkg.displayName}
          </h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            API reference for {pkg.displayName}
          </p>
          <div className="mt-2 flex gap-4 text-xs text-foreground-muted">
            <span>{pkg.stats.classes} classes</span>
            <span>{pkg.stats.functions} functions</span>
            <span>{pkg.stats.modules} modules</span>
          </div>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors" />
    </Link>
  );
}
