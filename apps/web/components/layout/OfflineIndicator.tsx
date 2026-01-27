"use client";

/**
 * Offline Indicator Component
 *
 * Displays offline status, cache statistics, and provides cache management controls.
 * Shows a small badge next to the logo when offline and a cache indicator when online.
 */

import { useState } from "react";
import { WifiOff, Database, RefreshCw, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useCacheSafe } from "@/components/cache/CacheProvider";
import { cn } from "@/lib/utils/cn";

/**
 * Format relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Small offline badge to show next to the logo
 * Shows a wifi-off icon when the user is offline
 */
export function OfflineBadge() {
  const cache = useCacheSafe();

  // Don't render if online or cache not available
  if (!cache || cache.isOnline) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
      title="You're offline - viewing cached content"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span className="text-xs font-medium hidden sm:inline">Offline</span>
    </div>
  );
}

/**
 * Main offline indicator with cache stats (shown at bottom right)
 */
export function OfflineIndicator() {
  const cache = useCacheSafe();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Don't render if cache context is not available
  if (!cache) return null;

  const { cacheStats, refreshStats, clearCache, hasUpdate, applyUpdate } = cache;

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await clearCache();
    } finally {
      setIsClearing(false);
    }
  };

  // Update available banner
  if (hasUpdate) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-primary text-white px-4 py-3 rounded-lg shadow-lg max-w-sm">
        <div className="flex items-start gap-3">
          <RefreshCw className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Update available</p>
            <p className="text-sm text-primary-foreground/80 mt-1">
              A new version is ready. Refresh to get the latest content.
            </p>
            <button
              onClick={applyUpdate}
              className="mt-2 text-sm font-medium underline hover:no-underline"
            >
              Update now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No stats yet
  if (!cacheStats || cacheStats.symbolCount === 0) {
    return null;
  }

  // Compact cache indicator (bottom right)
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div
        className={cn(
          "bg-background-secondary border border-border rounded-lg shadow-lg overflow-hidden transition-all duration-200",
          isExpanded ? "w-72" : "w-auto",
        )}
      >
        {/* Collapsed view - just icon */}
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
            title="View cache info"
          >
            <Database className="h-4 w-4" />
            <span className="font-mono text-xs">{cacheStats.symbolCount} cached</span>
            <ChevronUp className="h-3 w-3" />
          </button>
        )}

        {/* Expanded view */}
        {isExpanded && (
          <div className="p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-foreground">
                <Database className="h-4 w-4" />
                <span className="font-medium text-sm">Offline Cache</span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-background rounded transition-colors"
                aria-label="Collapse"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {/* Stats */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-foreground-secondary">
                <span>Symbols cached</span>
                <span className="font-mono">{cacheStats.symbolCount}</span>
              </div>
              <div className="flex justify-between text-foreground-secondary">
                <span>Catalogs cached</span>
                <span className="font-mono">{cacheStats.catalogCount}</span>
              </div>
              <div className="flex justify-between text-foreground-secondary">
                <span>Cache size</span>
                <span className="font-mono">{cacheStats.totalSizeFormatted}</span>
              </div>
              {cacheStats.newestEntry && (
                <div className="flex justify-between text-foreground-secondary">
                  <span>Last updated</span>
                  <span className="font-mono text-xs">
                    {formatRelativeTime(cacheStats.newestEntry)}
                  </span>
                </div>
              )}

              {/* Usage bar */}
              <div className="mt-2">
                <div className="flex justify-between text-xs text-foreground-muted mb-1">
                  <span>Usage</span>
                  <span>{Math.round(cacheStats.usagePercent)}%</span>
                </div>
                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      cacheStats.usagePercent > 90
                        ? "bg-red-500"
                        : cacheStats.usagePercent > 70
                          ? "bg-amber-500"
                          : "bg-primary",
                    )}
                    style={{ width: `${Math.min(cacheStats.usagePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={refreshStats}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-foreground-secondary hover:text-foreground hover:bg-background rounded transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
              <button
                onClick={handleClearCache}
                disabled={isClearing}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {isClearing ? "Clearing..." : "Clear"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
