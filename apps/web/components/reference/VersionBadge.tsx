"use client";

import { cn } from "@/lib/utils/cn";

/**
 * Props for the VersionBadge component.
 */
interface VersionBadgeProps {
  /** The version when this symbol was introduced */
  since: string;
  /** Additional class names */
  className?: string;
}

/**
 * A badge showing when a symbol was introduced.
 * Displays "Since v{version}" in an emerald-colored pill.
 */
export function VersionBadge({ since, className }: VersionBadgeProps) {
  // Normalize the version (remove 'v' prefix if present)
  const version = since.startsWith("v") ? since : `v${since}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full",
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
        "border border-emerald-200 dark:border-emerald-800",
        className
      )}
      title={`Introduced in version ${version}`}
    >
      <span className="text-[0.65rem]">●</span>
      Since {version.split(".").slice(0, 2).join(".")}
    </span>
  );
}

