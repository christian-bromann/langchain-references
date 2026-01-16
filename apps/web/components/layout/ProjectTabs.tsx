"use client";

/**
 * ProjectTabs Component
 *
 * Navigation tabs for switching between projects in the header.
 * Matches the Mintlify Aspen theme design with underline indicators.
 */

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { ProjectConfig } from "@langchain/ir-schema";

interface ProjectTabsProps {
  projects: ProjectConfig[];
  currentProject: ProjectConfig | null;
  currentLanguage: "python" | "javascript";
}

export function ProjectTabs({ projects, currentProject, currentLanguage }: ProjectTabsProps) {
  return (
    <div className="hidden lg:flex px-4 h-10 border-t border-gray-200/50 dark:border-gray-800/50">
      <nav className="h-full flex text-sm gap-x-6" aria-label="Project navigation">
        {projects.map((project) => {
          const isActive = currentProject?.id === project.id;
          const href = `/${currentLanguage}/${project.slug}`;

          return (
            <Link
              key={project.id}
              href={href}
              className={cn(
                "group relative h-full gap-2 flex items-center font-medium transition-colors",
                isActive
                  ? "text-primary dark:text-primary-light [text-shadow:-0.2px_0_0_currentColor,0.2px_0_0_currentColor]"
                  : "text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100",
              )}
            >
              {project.displayName}

              {/* Active indicator */}
              <div
                className={cn(
                  "absolute bottom-0 w-full left-0 h-px transition-colors",
                  isActive
                    ? "bg-primary dark:bg-primary-light"
                    : "bg-transparent group-hover:bg-gray-200 dark:group-hover:bg-gray-700",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Helper to extract current project from pathname.
 * Uses getProjectFromPathname which handles both explicit project slugs
 * and inferring project from package names.
 */
export function getCurrentProject(
  pathname: string,
  projects: ProjectConfig[],
): ProjectConfig | null {
  // Import dynamically to avoid circular dependencies
  const { getProjectFromPathname } = require("@/lib/config/projects");

  const project = getProjectFromPathname(pathname);
  if (project && projects.some((p) => p.id === project.id)) {
    return project;
  }

  // Default to first project
  return projects.length > 0 ? projects[0] : null;
}

/**
 * Helper to extract current language from pathname.
 */
export function getCurrentLanguage(pathname: string): "python" | "javascript" {
  if (pathname.startsWith("/javascript")) return "javascript";
  return "python";
}
