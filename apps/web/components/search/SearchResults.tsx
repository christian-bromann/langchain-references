/**
 * Search Results Component
 *
 * Displays search results with kind badges, breadcrumbs, and excerpts.
 */

"use client";

import { cn } from "@/lib/utils/cn";
import type { SearchResult } from "@/lib/search/client";

interface SearchResultsProps {
  results: SearchResult[];
  selectedIndex: number;
  onSelect: (result: SearchResult) => void;
  loading?: boolean;
  query?: string;
}

/**
 * Get color classes for a symbol kind badge
 */
function getKindColor(kind: string): string {
  const colors: Record<string, string> = {
    class: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    function: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    method: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
    module: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    interface: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    typeAlias: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    variable: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    property: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    enum: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  };

  return colors[kind] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
}

/**
 * Kind badge component
 */
function KindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 text-xs font-medium rounded shrink-0",
        getKindColor(kind)
      )}
    >
      {kind}
    </span>
  );
}

export function SearchResults({
  results,
  selectedIndex,
  onSelect,
  loading,
  query,
}: SearchResultsProps) {
  if (loading) {
    return (
      <div className="p-8 text-center text-foreground-muted">
        <div className="inline-block w-5 h-5 border-2 border-foreground-muted border-t-transparent rounded-full animate-spin" />
        <p className="mt-2">Searching...</p>
      </div>
    );
  }

  if (results.length === 0 && query) {
    return (
      <div className="p-8 text-center text-foreground-muted">
        <p>No results found for &ldquo;{query}&rdquo;</p>
        <p className="mt-1 text-sm">Try a different search term</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-8 text-center text-foreground-muted">
        <p>Start typing to search...</p>
      </div>
    );
  }

  return (
    <ul className="max-h-96 overflow-y-auto" role="listbox">
      {results.map((result, index) => (
        <li
          key={result.id}
          role="option"
          aria-selected={index === selectedIndex}
          className={cn(
            "px-4 py-3 cursor-pointer border-b border-border last:border-0",
            "transition-colors",
            index === selectedIndex
              ? "bg-primary/10 dark:bg-primary-light/10"
              : "hover:bg-background-secondary"
          )}
          onClick={() => onSelect(result)}
          onMouseEnter={() => {
            // Could add hover selection here if desired
          }}
        >
          {/* Title row with kind badge */}
          <div className="flex items-center gap-2">
            <KindBadge kind={result.kind} />
            <span className="font-medium text-foreground truncate">
              {result.title}
            </span>
          </div>

          {/* Breadcrumbs */}
          <div className="mt-1 text-sm text-foreground-muted truncate">
            {result.breadcrumbs.join(" › ")}
          </div>

          {/* Excerpt */}
          {result.excerpt && (
            <p className="mt-1 text-sm text-foreground-secondary line-clamp-1">
              {result.excerpt}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

