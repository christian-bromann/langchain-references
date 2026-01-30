"use client";

/**
 * Header Component
 *
 * Site header with logo, navigation, search, and theme toggle.
 * Matches the Mintlify Aspen theme design.
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Search, MessageSquare, Moon, Sun, MoreVertical, BookText } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SearchModal, useSearchShortcut } from "@/components/search/SearchModal";
import { ProjectTabs, getCurrentProject, getCurrentLanguage } from "./ProjectTabs";
import { OfflineBadge } from "./OfflineIndicator";
import { getEnabledProjects } from "@/lib/config/projects";

interface HeaderProps {
  onMobileMenuOpen?: () => void;
  /** Whether to show project navigation tabs. Defaults to true. */
  showProjectTabs?: boolean;
}

export function Header({ onMobileMenuOpen, showProjectTabs = true }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  // Get projects and current context
  const projects = getEnabledProjects();
  const currentProject = getCurrentProject(pathname, projects);
  const currentLanguage = getCurrentLanguage(pathname);

  // Enable ⌘K shortcut to open search
  useSearchShortcut(() => setSearchOpen(true));

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="z-10 mx-auto relative max-w-8xl px-0 lg:px-5">
        <div className="flex items-center lg:px-4 h-14 min-w-0 px-4">
          {/* Left: Logo and navigation */}
          <div className="h-full relative flex-1 flex items-center gap-x-4 min-w-0 lg:border-none">
            <div className="flex-1 flex items-center gap-x-4">
              <Link href="/" className="flex items-center">
                <span className="sr-only">LangChain Reference home page</span>
                {/* Light mode logo */}
                <Image
                  src="/reference-light.svg"
                  alt="LangChain Reference"
                  width={332}
                  height={38}
                  className="w-auto h-[22.5px] relative object-contain block dark:hidden"
                  priority
                />
                {/* Dark mode logo */}
                <Image
                  src="/reference-dark.svg"
                  alt="LangChain Reference"
                  width={332}
                  height={38}
                  className="w-auto h-[22.5px] relative object-contain hidden dark:block"
                  priority
                />
              </Link>
              {/* Offline badge - shown when user is offline */}
              <OfflineBadge />
            </div>

            {/* Center: Search bar */}
            <div className="relative hidden lg:flex items-center flex-1 z-20 justify-center">
              <button
                type="button"
                className={cn(
                  "flex pointer-events-auto w-full items-center text-sm leading-6 h-9 pl-3.5 pr-3",
                  "text-gray-500 dark:text-white/50 dark:brightness-[1.1] dark:hover:brightness-[1.25]",
                  "justify-between truncate gap-2 min-w-[43px] max-w-sm",
                  "bg-gray-950/3 dark:bg-white/3",
                  "hover:bg-gray-950/10 dark:hover:bg-white/10",
                  "rounded-full shadow-none border-none",
                )}
                id="search-bar-entry"
                aria-label="Open search"
                onClick={() => setSearchOpen(true)}
              >
                <div className="flex items-center gap-2 min-w-[42px]">
                  <Search className="min-w-4 flex-none h-4 w-4 text-gray-700 hover:text-gray-800 dark:text-gray-400 hover:dark:text-gray-200" />
                  <div className="truncate min-w-0">Search...</div>
                </div>
                <span className="flex-none text-xs font-semibold">⌘K</span>
              </button>
            </div>

            {/* Right: Links and theme toggle */}
            <div className="hidden lg:flex flex-1 items-center gap-2 ml-auto justify-end">
              <div className="flex relative items-center justify-end space-x-4">
                <nav className="text-sm">
                  <ul className="flex gap-2 items-center">
                    <li>
                      <a
                        href="https://chat.langchain.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "flex items-center gap-2 whitespace-nowrap font-medium",
                          "text-gray-800 dark:text-gray-50",
                          "bg-gray-950/3 dark:bg-white/3",
                          "hover:bg-gray-950/10 dark:hover:bg-white/10",
                          "rounded-xl px-[14px] py-2",
                        )}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Ask AI
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://github.com/langchain-ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "flex items-center gap-2 whitespace-nowrap font-medium",
                          "text-gray-800 dark:text-gray-50",
                          "bg-gray-950/3 dark:bg-white/3",
                          "hover:bg-gray-950/10 dark:hover:bg-white/10",
                          "rounded-xl px-[14px] py-2",
                        )}
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                        </svg>
                        GitHub
                      </a>
                    </li>
                    <li className="whitespace-nowrap">
                      <a
                        href="https://docs.langchain.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group px-4 py-1.5 relative inline-flex items-center text-sm font-medium"
                      >
                        <span className="absolute inset-0 bg-[#1c3c3c] rounded-xl group-hover:opacity-90"></span>
                        <div className="mr-0.5 space-x-2.5 flex items-center">
                          <BookText className="z-10 h-4 w-4 text-white" />
                          <span className="z-10 text-white">Main Docs</span>
                          <svg
                            width="3"
                            height="24"
                            viewBox="0 -9 3 24"
                            className="h-5 rotate-0 overflow-visible text-white/90"
                          >
                            <path
                              d="M0 0L3 3L0 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>

              {/* Theme toggle */}
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={cn(
                  "group p-2 flex items-center justify-center w-[30px] h-[30px] rounded-full",
                  "bg-gray-800/4 dark:bg-white/10",
                )}
                aria-label="Toggle dark mode"
              >
                <Sun className="h-4 w-4 block dark:hidden text-gray-600 group-hover:text-gray-800" />
                <Moon className="h-4 w-4 hidden dark:block text-gray-300 dark:group-hover:text-gray-100" />
              </button>
            </div>
          </div>

          {/* Mobile: Search and menu buttons */}
          <div className="flex lg:hidden items-center gap-3">
            <button
              type="button"
              className="text-gray-500 w-8 h-8 flex items-center justify-center hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
              id="search-bar-entry-mobile"
              aria-label="Open search"
              onClick={() => setSearchOpen(true)}
            >
              <span className="sr-only">Search...</span>
              <Search className="h-4 w-4" />
            </button>
            <button
              aria-label="Open project menu"
              className="h-7 w-5 flex items-center justify-end cursor-pointer"
              onClick={onMobileMenuOpen}
            >
              <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          </div>
        </div>
        {/* Project Navigation Tabs */}
        {showProjectTabs && (
          <ProjectTabs
            projects={projects}
            currentProject={currentProject}
            currentLanguage={currentLanguage}
          />
        )}
      </div>

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
