"use client";

/**
 * Package Table of Contents Component
 *
 * Displays a right sidebar navigation for package overview pages.
 * Shows links to symbol sections (Classes, Functions, Modules, Interfaces, Types).
 */

import { cn } from "@/lib/utils/cn";
import { Box, Code, Folder, FileType } from "lucide-react";

export interface PackageTOCSection {
  id: string;
  title: string;
  icon: "class" | "function" | "module" | "interface" | "type";
  /** Number of items in this section (optional for description sections) */
  count?: number;
}

export interface PackageTableOfContentsProps {
  sections: PackageTOCSection[];
}

/**
 * Scroll to element by ID with smooth scrolling
 */
function scrollToId(id: string) {
  const element = document.getElementById(id);
  if (element) {
    const headerOffset = 80; // Account for fixed header
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.scrollY - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
  }
}

/**
 * Get icon for section type
 */
function SectionIcon({ type }: { type: PackageTOCSection["icon"] }) {
  const iconClass = "h-4 w-4 shrink-0";

  switch (type) {
    case "class":
      return <Box className={cn(iconClass, "text-purple-500")} />;
    case "function":
      return <Code className={cn(iconClass, "text-green-500")} />;
    case "module":
      return <Folder className={cn(iconClass, "text-amber-500")} />;
    case "interface":
      return <FileType className={cn(iconClass, "text-blue-500")} />;
    case "type":
      return <FileType className={cn(iconClass, "text-cyan-500")} />;
    default:
      return null;
  }
}

/**
 * Main Package Table of Contents component
 */
export function PackageTableOfContents({ sections }: PackageTableOfContentsProps) {
  // Don't render if there's nothing to show
  if (!sections || sections.length === 0) {
    return null;
  }

  return (
    <nav
      className="hidden xl:block sticky top-[calc(var(--header-height)+2rem)] self-start w-toc shrink-0 pl-8 max-h-[calc(100vh-var(--header-height)-4rem)] overflow-y-auto scrollbar-hide"
      aria-label="On this page"
    >
      <div className="pl-4 pb-8">
        <h3 className="text-sm font-semibold text-foreground mb-3">On This Page</h3>

        <div className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToId(section.id)}
              className="flex items-center gap-2 w-full py-1.5 text-left text-sm text-foreground-secondary hover:text-primary transition-colors group"
            >
              <SectionIcon type={section.icon} />
              <span className="truncate group-hover:text-primary transition-colors">
                {section.title}
              </span>
              {section.count !== undefined && (
                <span className="ml-auto text-xs text-foreground-muted tabular-nums">
                  {section.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
