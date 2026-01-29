"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { FileText, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
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
 * A section displaying related documentation pages that use this symbol.
 * Shows 5 docs by default, expandable to show all (up to 20).
 */
export function RelatedDocsSection({ docs, totalCount, className }: RelatedDocsSectionProps) {
  const [expanded, setExpanded] = useState(false);

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
    <section
      id="related-docs"
      className={cn(
        "scroll-mt-24",
        "rounded-lg border",
        "border-slate-200 dark:border-slate-700",
        "bg-white dark:bg-slate-900",
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          "border-b border-slate-200 dark:border-slate-700",
        )}
      >
        <h2 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <DocsIcon className="h-4 w-4 text-blue-500" />
          Related Documentation
          <span className="text-xs text-slate-400 font-normal">
            ({totalCount} page{totalCount !== 1 ? "s" : ""})
          </span>
        </h2>
      </div>

      {/* Doc entries list */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {displayedDocs.map((doc, index) => (
          <li key={`${doc.path}-${index}`}>
            <a
              href={`${DOCS_BASE_URL}${doc.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-start gap-3 px-4 py-3",
                "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                "transition-colors duration-150",
                "group",
              )}
            >
              <FileText className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {doc.title}
                  </span>
                  <ExternalLink className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" />
                </div>
                {doc.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {doc.description}
                  </p>
                )}
              </div>
            </a>
          </li>
        ))}
      </ul>

      {/* Expand/collapse button and extra count */}
      {(hasMore || extraNotShown > 0) && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                "text-blue-600 dark:text-blue-400",
                "hover:text-blue-700 dark:hover:text-blue-300",
                "transition-colors",
              )}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show {Math.min(docs.length - 5, 15)} more
                </>
              )}
            </button>
          )}
          {extraNotShown > 0 && (
            <span className="text-xs text-slate-400 ml-auto">+{extraNotShown} more not shown</span>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Documentation icon component.
 */
function DocsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </svg>
  );
}
