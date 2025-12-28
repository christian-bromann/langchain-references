/**
 * Search Modal Component
 *
 * Full-featured search modal with:
 * - ⌘K keyboard shortcut to open
 * - Language toggle (Python/JavaScript)
 * - Keyboard navigation (↑↓↵)
 * - Fuzzy search with real-time results
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { search, preloadIndex, type SearchResult } from "@/lib/search/client";
import { SearchResults } from "./SearchResults";

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine initial language from current path
  const getInitialLanguage = (): "python" | "javascript" => {
    if (pathname.startsWith("/python")) return "python";
    if (pathname.startsWith("/javascript")) return "javascript";
    return "python"; // default
  };

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"python" | "javascript">(
    getInitialLanguage()
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Preload index when modal opens
  useEffect(() => {
    if (open) {
      preloadIndex(language).catch(console.error);
      // Focus input after modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open, language]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setLanguage(getInitialLanguage());
    }
  }, [open, pathname]);

  // Search on query or language change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const controller = new AbortController();

    const doSearch = async () => {
      setLoading(true);
      try {
        const searchResults = await search(query, language, { limit: 20 });
        if (!controller.signal.aborted) {
          setResults(searchResults);
          setSelectedIndex(0);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Search failed:", error);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    // Debounce search
    const timer = setTimeout(doSearch, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, language]);

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      router.push(result.url);
      onOpenChange(false);
    },
    [router, onOpenChange]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [results, selectedIndex, handleSelect, onOpenChange]
  );

  // Toggle language
  const toggleLanguage = (newLang: "python" | "javascript") => {
    setLanguage(newLang);
    // Preload new language index
    preloadIndex(newLang).catch(console.error);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-in fade-in-0" />

        {/* Modal */}
        <Dialog.Content
          className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50
                     bg-background rounded-xl shadow-2xl border border-border overflow-hidden
                     animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <Search className="w-5 h-5 text-foreground-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documentation..."
              className="flex-1 bg-transparent text-lg outline-none text-foreground
                       placeholder:text-foreground-muted"
              autoFocus
            />

            {/* Language Toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
              <button
                onClick={() => toggleLanguage("python")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  language === "python"
                    ? "bg-primary text-white"
                    : "bg-transparent text-foreground-secondary hover:bg-background-secondary"
                )}
              >
                Python
              </button>
              <button
                onClick={() => toggleLanguage("javascript")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  language === "javascript"
                    ? "bg-primary text-white"
                    : "bg-transparent text-foreground-secondary hover:bg-background-secondary"
                )}
              >
                JavaScript
              </button>
            </div>

            {/* Close button */}
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground
                         hover:bg-background-secondary transition-colors"
                aria-label="Close search"
              >
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Results */}
          <SearchResults
            results={results}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            loading={loading}
            query={query}
          />

          {/* Footer */}
          <div
            className="p-3 border-t border-border text-xs text-foreground-muted
                      flex items-center gap-4 bg-background-secondary"
          >
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">
                ↓
              </kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">
                ↵
              </kbd>
              <span className="ml-1">to select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">
                esc
              </kbd>
              <span className="ml-1">to close</span>
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Hook to handle ⌘K keyboard shortcut for opening search
 */
export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K on Mac, Ctrl+K on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpen]);
}

