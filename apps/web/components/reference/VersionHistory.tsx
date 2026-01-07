"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type { VersionDelta, ModifiedSymbol, ChangeRecord } from "@langchain/ir-schema";

/**
 * Props for the VersionHistory component.
 */
interface VersionHistoryProps {
  /** Qualified name of the symbol */
  qualifiedName: string;
  /** Project identifier */
  project: string;
  /** Language */
  language: string;
  /** Package identifier */
  packageId: string;
  /** Additional class names */
  className?: string;
}

/**
 * A collapsible panel showing the version history of a symbol.
 * Lazy loads changelog data when expanded.
 */
export function VersionHistory({
  qualifiedName,
  project,
  language,
  packageId,
  className,
}: VersionHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<VersionChange[]>([]);

  const loadChangelog = useCallback(async () => {
    if (changes.length > 0) return; // Already loaded

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/changelog/${project}/${language}/${packageId}?symbol=${encodeURIComponent(qualifiedName)}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          setChanges([]);
          return;
        }
        throw new Error(`Failed to load changelog: ${response.statusText}`);
      }

      const data: VersionChange[] = await response.json();
      setChanges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load changelog");
    } finally {
      setLoading(false);
    }
  }, [project, language, packageId, qualifiedName, changes.length]);

  const handleToggle = useCallback(() => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    if (newExpanded) {
      loadChangelog();
    }
  }, [expanded, loadChangelog]);

  return (
    <div
      className={cn(
        "rounded-lg border",
        "border-slate-200 dark:border-slate-700",
        "bg-white dark:bg-slate-900",
        className
      )}
    >
      {/* Header - always visible */}
      <button
        onClick={handleToggle}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3",
          "text-left text-sm font-medium",
          "text-slate-700 dark:text-slate-200",
          "hover:bg-slate-50 dark:hover:bg-slate-800/50",
          "transition-colors duration-150",
          expanded && "border-b border-slate-200 dark:border-slate-700"
        )}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-slate-400" />
          Version History
        </span>
        <ChevronIcon
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Content - lazy loaded */}
      {expanded && (
        <div className="p-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <LoadingSpinner className="h-4 w-4" />
              Loading version history...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && changes.length === 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              No version history available for this symbol.
            </div>
          )}

          {!loading && !error && changes.length > 0 && (
            <div className="space-y-4">
              {changes.map((change, idx) => (
                <VersionChangeEntry key={idx} change={change} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A single version change entry.
 */
interface VersionChange {
  version: string;
  releaseDate: string;
  type: "added" | "modified" | "deprecated" | "removed";
  changes?: ChangeRecord[];
  snapshotBefore?: string;
  snapshotAfter?: string;
}

function VersionChangeEntry({ change }: { change: VersionChange }) {
  const [showFullInterface, setShowFullInterface] = useState(false);

  const typeColors = {
    added: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    modified: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
    deprecated: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
    removed: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  };

  const typeLabels = {
    added: "Added",
    modified: "Modified",
    deprecated: "Deprecated",
    removed: "Removed",
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700">
      {/* Timeline dot */}
      <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />

      {/* Version header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
          v{change.version}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.5 text-xs font-medium rounded",
            typeColors[change.type]
          )}
        >
          {typeLabels[change.type]}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatDate(change.releaseDate)}
        </span>
      </div>

      {/* Change details */}
      {change.changes && change.changes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {change.changes.map((c, idx) => (
            <li key={idx} className="flex items-start gap-2">
              {c.breaking && (
                <span className="flex-shrink-0 px-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded">
                  BREAKING
                </span>
              )}
              <span className="text-slate-600 dark:text-slate-300">
                {c.description}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Full interface view (client-side expansion) */}
      {(change.snapshotBefore || change.snapshotAfter) && (
        <div className="mt-2">
          <button
            onClick={() => setShowFullInterface(!showFullInterface)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showFullInterface ? "Hide full interface" : "View full interface"}
          </button>

          {showFullInterface && (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {change.snapshotBefore && (
                <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Before (v{change.version})
                  </div>
                  <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                    {change.snapshotBefore}
                  </pre>
                </div>
              )}
              {change.snapshotAfter && (
                <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    After
                  </div>
                  <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                    {change.snapshotAfter}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Icon components
function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

