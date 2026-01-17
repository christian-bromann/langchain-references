"use client";

/**
 * Language Dropdown Component
 *
 * A dropdown in the sidebar to switch between Python and JavaScript documentation.
 * Styled similarly to Mintlify's nav dropdown.
 *
 * When switching languages, attempts to navigate to the equivalent symbol in the
 * target language using cross-language symbol resolution.
 */

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ResolveSymbolResponse } from "@/lib/symbol-resolution";

const LANGUAGES = [
  {
    id: "python",
    name: "Python",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />
      </svg>
    ),
  },
  {
    id: "javascript",
    name: "JavaScript",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z" />
      </svg>
    ),
  },
] as const;

// =============================================================================
// URL Parsing Utilities
// =============================================================================

/**
 * Extract the symbol name from a URL pathname.
 * Returns the last segment of the path after the package.
 */
function extractSymbolNameFromPath(pathname: string): string | null {
  const parts = pathname.replace(/^\//, "").split("/");
  // First part is language, second is package, rest is symbol path
  if (parts.length < 3) return null;
  return parts[parts.length - 1] || null;
}

/**
 * Extract the package slug from a URL pathname.
 */
function extractPackageFromPath(pathname: string): string | null {
  const parts = pathname.replace(/^\//, "").split("/");
  // First part is language, second is package
  if (parts.length < 2) return null;
  return parts[1] || null;
}

/**
 * Extract the full symbol path for mapping lookup.
 * Returns format: "{package}/{symbolPath}"
 */
function extractSymbolPathForMapping(pathname: string): string | null {
  const parts = pathname.replace(/^\//, "").split("/");
  // First part is language, rest is package + symbol path
  if (parts.length < 3) return null;
  return parts.slice(1).join("/");
}

/**
 * Check if the current path is a symbol page (not just package landing).
 */
function isSymbolPage(pathname: string): boolean {
  const parts = pathname.replace(/^\//, "").split("/");
  // Symbol pages have at least: language/package/symbol
  return parts.length >= 3;
}

// =============================================================================
// Component
// =============================================================================

export function LanguageDropdown() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isResolving, setIsResolving] = useState(false);

  // Determine current language from pathname
  const currentLang = pathname.startsWith("/python")
    ? "python"
    : pathname.startsWith("/javascript")
      ? "javascript"
      : null;

  const currentLanguage = LANGUAGES.find((l) => l.id === currentLang) ?? LANGUAGES[1];

  const isLoading = isPending || isResolving;

  /**
   * Handle language change with cross-language symbol resolution.
   */
  const handleLanguageChange = async (langId: string) => {
    if (langId === currentLang) return;

    // If not on a symbol page, just navigate to language root
    if (!isSymbolPage(pathname)) {
      startTransition(() => {
        router.push(`/${langId}`);
      });
      return;
    }

    setIsResolving(true);

    try {
      // Extract symbol info from current path
      const symbolName = extractSymbolNameFromPath(pathname);
      const sourcePackage = extractPackageFromPath(pathname);
      const symbolPath = extractSymbolPathForMapping(pathname);

      if (!symbolName) {
        // No symbol to resolve, go to language root
        startTransition(() => {
          router.push(`/${langId}`);
        });
        return;
      }

      // Call resolution API
      const params = new URLSearchParams({
        symbolName,
        targetLanguage: langId,
        sourceLanguage: currentLang || "",
        ...(sourcePackage && { sourcePackage }),
        ...(symbolPath && { symbolPath }),
      });

      const response = await fetch(`/api/resolve-symbol?${params}`);

      if (!response.ok) {
        console.warn("[LanguageDropdown] Resolution API returned", response.status);
        startTransition(() => {
          router.push(`/${langId}`);
        });
        return;
      }

      const result: ResolveSymbolResponse = await response.json();

      // Navigate to the resolved URL
      startTransition(() => {
        router.push(result.targetUrl);
      });

      // Log for debugging (could add toast notifications here)
      if (!result.found) {
        console.log(`[LanguageDropdown] No equivalent found for "${symbolName}", navigated to ${result.matchType}`);
      } else if (result.matchType !== "exact" && result.matchType !== "explicit") {
        console.log(`[LanguageDropdown] Resolved "${symbolName}" → "${result.matchedSymbol || symbolName}" (${result.matchType})`);
      }
    } catch (error) {
      console.error("[LanguageDropdown] Resolution failed:", error);
      // Fallback to language root on error
      startTransition(() => {
        router.push(`/${langId}`);
      });
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={isLoading}
          className={cn(
            "group flex w-full items-center gap-1 mb-4 z-10",
            "pl-2 pr-3.5 py-1.5 rounded-[0.85rem]",
            "border border-gray-200/70 dark:border-white/[0.07]",
            "bg-background hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
            "text-sm text-gray-950/50 dark:text-white/50",
            "group-hover:text-gray-950/70 dark:group-hover:text-white/70",
            "transition-colors",
            isLoading && "opacity-70 cursor-wait",
          )}
        >
          {/* Icon container */}
          <div
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-lg flex-shrink-0",
              "border border-gray-200/70 dark:border-white/[0.07]",
              "text-primary dark:text-primary-light",
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              currentLanguage.icon
            )}
          </div>

          {/* Text */}
          <div className="flex-1 px-1 flex flex-col grow text-left">
            <p className="text-base lg:text-sm text-gray-800 dark:text-gray-300 font-medium">
              {currentLanguage.name}
            </p>
          </div>

          {/* Chevron */}
          <svg
            width="8"
            height="24"
            viewBox="0 -9 3 24"
            className={cn(
              "transition-transform overflow-visible rotate-90",
              "text-gray-400 group-hover:text-gray-600",
              "dark:text-gray-600 dark:group-hover:text-gray-400",
            )}
          >
            <path
              d="M0 0L3 3L0 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="start"
          className={cn(
            "z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] w-full",
            "max-h-96 overflow-y-auto rounded-xl p-1",
            "bg-white dark:bg-[#0D0D0D]",
            "border border-gray-200/70 dark:border-white/[0.07]",
            "shadow-xl shadow-gray-500/5 dark:shadow-none",
            "text-gray-950/70 dark:text-white/70",
            "origin-[--radix-dropdown-menu-content-transform-origin]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=left]:slide-in-from-right-2",
            "data-[side=right]:slide-in-from-left-2",
            "data-[side=top]:slide-in-from-bottom-2",
          )}
        >
          {LANGUAGES.map((lang) => {
            const isSelected = lang.id === currentLang;

            return (
              <DropdownMenu.Item
                key={lang.id}
                disabled={isLoading}
                onSelect={() => handleLanguageChange(lang.id)}
                className={cn(
                  "flex items-center gap-1 rounded-xl cursor-pointer",
                  "px-1.5 pr-2.5 py-1.5",
                  "text-gray-800 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-200",
                  "hover:bg-gray-950/5 dark:hover:bg-white/5",
                  "outline-none focus:bg-gray-950/5 dark:focus:bg-white/5",
                  isLoading && "opacity-50 cursor-not-allowed",
                )}
              >
                {/* Icon container */}
                <div
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-lg flex-shrink-0",
                    "border border-gray-200/70 dark:border-white/[0.07]",
                    "text-primary dark:text-primary-light",
                  )}
                >
                  {lang.icon}
                </div>

                {/* Text */}
                <div className="flex-1 px-1 flex flex-col grow text-left">
                  <p className="text-base lg:text-sm text-gray-800 dark:text-gray-300 font-medium">
                    {lang.name}
                  </p>
                </div>

                {/* Check mark for selected */}
                {isSelected && (
                  <Check className="ml-2 h-4 w-4 text-primary dark:text-primary-light" />
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
