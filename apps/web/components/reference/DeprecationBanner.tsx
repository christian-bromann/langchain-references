"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * Deprecation information for a symbol.
 */
interface DeprecationInfo {
  /** Version when the symbol was deprecated */
  since: string;
  /** Optional deprecation message */
  message?: string;
  /** Replacement symbol qualified name */
  replacement?: string;
}

/**
 * Props for the DeprecationBanner component.
 */
interface DeprecationBannerProps {
  /** Deprecation details */
  deprecation: DeprecationInfo;
  /** Current project/language for routing replacement links */
  project?: string;
  language?: string;
  /** Additional class names */
  className?: string;
}

/**
 * A warning banner shown at the top of deprecated symbol pages.
 * Displays deprecation message and links to replacement if available.
 */
export function DeprecationBanner({
  deprecation,
  project,
  language,
  className,
}: DeprecationBannerProps) {
  const { since, message, replacement } = deprecation;

  // Build the link to the replacement symbol
  const replacementHref = replacement
    ? `/ref/${project}/${language}/${encodeURIComponent(replacement)}`
    : undefined;

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        "bg-amber-50 border-amber-200 text-amber-800",
        "dark:bg-amber-900/20 dark:border-amber-700/50 dark:text-amber-200",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {/* Warning icon */}
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-amber-500 dark:text-amber-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Deprecated since v{since.replace(/^v/, "")}
          </h3>

          {/* Message */}
          {message && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{message}</p>}

          {/* Replacement link */}
          {replacement && (
            <p className="mt-2 text-sm">
              <span className="text-amber-600 dark:text-amber-400">Use instead: </span>
              {replacementHref ? (
                <Link
                  href={replacementHref}
                  className="font-mono text-amber-800 dark:text-amber-200 hover:underline"
                >
                  {replacement}
                </Link>
              ) : (
                <code className="font-mono text-amber-800 dark:text-amber-200">{replacement}</code>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
