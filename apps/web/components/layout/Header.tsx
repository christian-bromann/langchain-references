"use client";

/**
 * Header Component
 *
 * Site header with logo, navigation, search, and theme toggle.
 * Matches the Mintlify Aspen theme design.
 */

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Search, MessageCircle, Github, Moon, Sun, Menu, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto max-w-8xl px-0 lg:px-5">
        <div className="flex items-center lg:px-4 h-14 min-w-0 px-4">
          {/* Left: Logo and navigation */}
          <div className="h-full relative flex-1 flex items-center gap-x-4 min-w-0 lg:border-none">
            <div className="flex-1 flex items-center gap-x-4">
              <Link href="/" className="flex items-center">
                <span className="sr-only">Docs by LangChain home page</span>
                {/* Light mode logo (teal) */}
                <Image
                  src="/langchain-docs-teal.svg"
                  alt="LangChain Docs"
                  width={265}
                  height={32}
                  className="w-auto h-6 relative object-contain block dark:hidden"
                  priority
                />
                {/* Dark mode logo (lilac) */}
                <Image
                  src="/langchain-docs-lilac.svg"
                  alt="LangChain Docs"
                  width={265}
                  height={32}
                  className="w-auto h-6 relative object-contain hidden dark:block"
                  priority
                />
              </Link>

              {/* Primary navigation */}
              <nav className="hidden lg:flex items-center gap-x-2">
                <NavLink href="/python">Python</NavLink>
                <NavLink href="/javascript">JavaScript</NavLink>
              </nav>
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
                  "rounded-full shadow-none border-none"
                )}
                id="search-bar-entry"
                aria-label="Open search"
                onClick={() => {
                  // TODO: Open search modal
                  console.log("Open search");
                }}
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
                          "rounded-xl px-[14px] py-2"
                        )}
                      >
                        <MessageCircle className="h-4 w-4" />
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
                          "rounded-xl px-[14px] py-2"
                        )}
                      >
                        <Github className="h-4 w-4" />
                        GitHub
                      </a>
                    </li>
                    <li className="whitespace-nowrap">
                      <a
                        href="https://smith.langchain.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group px-4 py-1.5 relative inline-flex items-center text-sm font-medium"
                      >
                        <span className="absolute inset-0 bg-primary rounded-xl group-hover:opacity-90"></span>
                        <div className="mr-0.5 space-x-2.5 flex items-center">
                          <span className="z-10 text-white">Try LangSmith</span>
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
                  "bg-gray-800/4 dark:bg-white/10"
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
            >
              <span className="sr-only">Search...</span>
              <Search className="h-4 w-4" />
            </button>
            <button
              aria-label="More actions"
              className="h-7 w-5 flex items-center justify-end"
            >
              <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Navigation link component (Mintlify style)
 */
function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "py-1.5 px-2.5 rounded-lg",
        "text-sm font-medium text-gray-900 dark:text-gray-300",
        "hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
        "transition-colors"
      )}
    >
      {children}
    </Link>
  );
}

