/**
 * PackageCard Component
 *
 * Reusable card component for displaying package information
 * on language index pages.
 */

import Link from "next/link";
import { Box, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Package } from "@/lib/ir/types";

/**
 * Configuration for stats display
 */
export interface StatsConfig {
  /** Label for classes count (e.g., "classes", "types") */
  classesLabel?: string;
  /** Label for functions count (e.g., "functions", "methods") */
  functionsLabel?: string;
  /** Label for modules count */
  modulesLabel?: string;
  /** Label for types count */
  typesLabel?: string;
  /** Whether to show modules stat */
  showModules?: boolean;
  /** Whether to show types stat */
  showTypes?: boolean;
}

export interface PackageCardProps {
  /** The package to display */
  package: Package;
  /** URL path prefix for the language (e.g., "/python", "/javascript") */
  basePath: string;
  /** Optional stats display configuration */
  statsConfig?: StatsConfig;
}

/**
 * Default stats configuration
 */
const defaultStatsConfig: Required<StatsConfig> = {
  classesLabel: "classes",
  functionsLabel: "functions",
  modulesLabel: "modules",
  typesLabel: "types",
  showModules: true,
  showTypes: false,
};

/**
 * Get package URL slug from published name
 * Handles different package naming conventions across ecosystems
 */
function getPackageSlug(pkg: Package): string {
  // JavaScript packages: @langchain/core -> langchain-core
  if (pkg.publishedName.startsWith("@")) {
    return pkg.publishedName.replace(/^@/, "").replace(/\//g, "-").replace(/_/g, "-").toLowerCase();
  }
  // Python/Go/Java packages: langchain_core -> langchain-core
  return pkg.publishedName.replace(/_/g, "-").toLowerCase();
}

/**
 * Package card component for language index pages
 */
export function PackageCard({ package: pkg, basePath, statsConfig }: PackageCardProps) {
  const config = { ...defaultStatsConfig, ...statsConfig };
  const href = `${basePath}/${getPackageSlug(pkg)}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center justify-between p-4 rounded-lg",
        "border border-border bg-background-secondary",
        "hover:border-primary/50 hover:bg-background transition-colors",
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
          {pkg.stats && (
            <div className="mt-2 flex gap-4 text-xs text-foreground-muted">
              <span>
                {pkg.stats.classes || 0} {config.classesLabel}
              </span>
              <span>
                {pkg.stats.functions || 0} {config.functionsLabel}
              </span>
              {config.showModules && (
                <span>
                  {pkg.stats.modules || 0} {config.modulesLabel}
                </span>
              )}
              {config.showTypes && (
                <span>
                  {pkg.stats.types || 0} {config.typesLabel}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-foreground-muted group-hover:text-primary transition-colors" />
    </Link>
  );
}
