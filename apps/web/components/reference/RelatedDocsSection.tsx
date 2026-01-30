"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type { RelatedDocEntry } from "@/lib/ir/types";

/** Base URL for the docs site */
const DOCS_BASE_URL = "https://docs.langchain.com";

/**
 * Props for the RelatedDocsSection component.
 */
interface RelatedDocsSectionProps {
  /** The related documentation entries */
  docs: RelatedDocEntry[];
  /** Total count of related docs (may be greater than docs.length) */
  totalCount: number;
  /** Additional class names */
  className?: string;
}

/**
 * A minimal section displaying related documentation pages that use this symbol.
 * Shows 5 docs by default, expandable to show all (up to 20).
 */
export function RelatedDocsSection({ docs, totalCount, className }: RelatedDocsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);

  // Default to showing 5, expand to show all (up to 20)
  const displayLimit = expanded ? 20 : 5;
  const displayedDocs = docs.slice(0, displayLimit);
  const hasMore = docs.length > 5;
  const extraNotShown = totalCount > 20 ? totalCount - 20 : 0;

  // Don't render if no docs
  if (docs.length === 0) {
    return null;
  }

  return (
    <section id="related-docs" className={cn("scroll-mt-24", className)}>
      {/* Header - minimal style like "Bases" */}
      <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-2">
        Used in Docs
      </h2>

      {/* Doc entries as simple text links */}
      <ul className="space-y-1 pl-2">
        {displayedDocs.map((doc, index) => (
          <li key={`${doc.path}-${index}`} className="flex items-center gap-2">
            <a
              href={`${DOCS_BASE_URL}${doc.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "text-sm text-blue-600 dark:text-blue-400",
                "hover:text-blue-700 dark:hover:text-blue-300",
                "hover:underline cursor-pointer",
              )}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {doc.title}
            </a>
            {hoveredIndex === index && (
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[300px]">
                ({`${DOCS_BASE_URL}${doc.path}`})
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* Expand/collapse and extra count */}
      {(hasMore || extraNotShown > 0) && (
        <div className="mt-2 ml-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {hasMore && (
            <button
              onClick={toggleExpanded}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {expanded ? "Show less" : `+${docs.length - 5} more`}
            </button>
          )}
          {extraNotShown > 0 && (
            <span className="text-slate-400">({extraNotShown} more not shown)</span>
          )}
        </div>
      )}
    </section>
  );
}
