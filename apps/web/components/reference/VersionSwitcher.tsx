"use client";

/**
 * Version Switcher Component
 *
 * A dropdown that allows users to switch between different versions of a symbol.
 * Shows "latest" by default and lists all versions where the symbol was changed.
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, History, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface VersionChange {
  version: string;
  releaseDate: string;
  type: "added" | "modified" | "deprecated" | "removed";
  /** If this change is from a member/child symbol, this contains the member name(s) */
  affectedMember?: string;
}

interface VersionSwitcherProps {
  /** Qualified name of the symbol */
  qualifiedName: string;
  /** Project identifier */
  project: string;
  /** Language */
  language: string;
  /** Package identifier */
  packageId: string;
  /** Current version from URL (null = latest) */
  currentVersion?: string | null;
  /** The actual latest version number (e.g., "1.2.3") */
  latestVersion?: string;
  /** Additional class names */
  className?: string;
}

/**
 * A dropdown to switch between different versions of a symbol.
 * Lazy loads version data when opened.
 */
export function VersionSwitcher({
  qualifiedName,
  project,
  language,
  packageId,
  currentVersion,
  latestVersion,
  className,
}: VersionSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<VersionChange[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadVersions = useCallback(async () => {
    if (hasLoaded) return;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/changelog/${project}/${language}/${packageId}?symbol=${encodeURIComponent(qualifiedName)}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          setVersions([]);
          setHasLoaded(true);
          return;
        }
        throw new Error(`Failed to load versions: ${response.statusText}`);
      }

      const data: VersionChange[] = await response.json();
      setVersions(data);
      setHasLoaded(true);
    } catch (err) {
      console.error("Failed to load versions:", err);
      setVersions([]);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [project, language, packageId, qualifiedName, hasLoaded]);

  // Load versions when dropdown opens
  useEffect(() => {
    if (open && !hasLoaded) {
      loadVersions();
    }
  }, [open, hasLoaded, loadVersions]);

  const handleVersionChange = (version: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (version === null) {
      // Remove version param for "latest"
      params.delete("v");
    } else {
      params.set("v", version);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
    router.push(newUrl);
    setOpen(false);
  };

  const displayVersion = currentVersion || "latest";

  // If no versions available and we've loaded, don't show the switcher
  if (hasLoaded && versions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg",
            "text-sm font-medium",
            "border border-gray-200 dark:border-gray-700",
            "bg-white dark:bg-gray-900",
            "text-gray-700 dark:text-gray-300",
            "hover:bg-gray-50 dark:hover:bg-gray-800",
            "transition-colors",
            className,
          )}
          aria-label="Select version"
        >
          <History className="h-3.5 w-3.5 text-gray-400" />
          <span className="font-mono">
            {displayVersion === "latest"
              ? latestVersion
                ? `v${latestVersion} (latest)`
                : "latest"
              : `v${displayVersion}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="start"
          className={cn(
            "z-50 min-w-[200px] max-w-[320px]",
            "max-h-80 overflow-y-auto rounded-lg p-1",
            "bg-white dark:bg-gray-900",
            "border border-gray-200 dark:border-gray-700",
            "shadow-lg shadow-gray-500/10 dark:shadow-none",
            "origin-[--radix-dropdown-menu-content-transform-origin]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2",
          )}
        >
          {/* Latest option */}
          <DropdownMenu.Item
            onSelect={() => handleVersionChange(null)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md cursor-pointer",
              "px-3 py-2",
              "text-sm",
              "text-gray-700 dark:text-gray-300",
              "hover:bg-gray-100 dark:hover:bg-gray-800",
              "outline-none focus:bg-gray-100 dark:focus:bg-gray-800",
            )}
          >
            <span className="font-mono font-medium">
              {latestVersion ? `v${latestVersion} (latest)` : "latest"}
            </span>
            {!currentVersion && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenu.Item>

          {/* Separator if we have versions */}
          {(versions.length > 0 || loading) && (
            <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
              <LoadingSpinner className="h-4 w-4" />
              Loading...
            </div>
          )}

          {/* Version list */}
          {!loading &&
            versions.map((v) => {
              const isSelected = currentVersion === v.version;
              return (
                <DropdownMenu.Item
                  key={v.version}
                  onSelect={() => handleVersionChange(v.version)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md cursor-pointer",
                    "px-3 py-2",
                    "text-sm",
                    "text-gray-700 dark:text-gray-300",
                    "hover:bg-gray-100 dark:hover:bg-gray-800",
                    "outline-none focus:bg-gray-100 dark:focus:bg-gray-800",
                  )}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono">v{v.version}</span>
                    <VersionTypeBadge type={v.type} />
                    {v.affectedMember && (
                      <span
                        className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate max-w-[120px]"
                        title={v.affectedMember}
                      >
                        ({v.affectedMember})
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </DropdownMenu.Item>
              );
            })}

          {/* Empty state */}
          {!loading && hasLoaded && versions.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No version history
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Badge showing the type of change in a version
 */
function VersionTypeBadge({ type }: { type: VersionChange["type"] }) {
  const colors: Record<VersionChange["type"], string> = {
    added: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    modified: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    deprecated: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    removed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={cn("px-1.5 py-0.5 text-[10px] font-medium rounded", colors[type])}>
      {type}
    </span>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
