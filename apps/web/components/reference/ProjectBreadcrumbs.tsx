/**
 * ProjectBreadcrumbs Component
 *
 * Breadcrumb navigation that includes project context.
 * Shows the project name, language, and symbol path.
 */

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import type { ProjectConfig } from "@langchain/ir-schema";
import { cn } from "@/lib/utils/cn";
import { getDefaultPackageSlug } from "@/lib/config/projects";
import { LANGUAGE_CONFIG } from "@/lib/config/languages";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ProjectBreadcrumbsProps {
  project: ProjectConfig;
  language: "python" | "javascript";
  items?: BreadcrumbItem[];
  className?: string;
}

export function ProjectBreadcrumbs({
  project,
  language,
  items = [],
  className,
}: ProjectBreadcrumbsProps) {
  // Use the default package slug for this project/language
  const packageSlug = getDefaultPackageSlug(project.id, language);
  const allItems: BreadcrumbItem[] = [
    { label: project.displayName, href: `/${language}/${packageSlug}` },
    { label: LANGUAGE_CONFIG[language].name },
    ...items,
  ];

  return (
    <nav
      className={cn(
        "flex items-center text-sm text-gray-500 dark:text-gray-400 mb-6 flex-wrap gap-y-1",
        className,
      )}
      aria-label="Breadcrumb"
    >
      {/* Home link */}
      <Link
        href="/"
        className="hover:text-primary dark:hover:text-primary-light transition-colors"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {allItems.map((item, index) => (
        <span key={index} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-2 shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-primary dark:hover:text-primary-light transition-colors truncate max-w-[200px]"
              title={item.label}
            >
              {item.label}
            </Link>
          ) : (
            <span
              className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]"
              title={item.label}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/**
 * Simple breadcrumbs without project context.
 * For use on pages that don't have project information yet.
 */
export function SimpleBreadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "flex items-center text-sm text-gray-500 dark:text-gray-400 mb-6 flex-wrap gap-y-1",
        className,
      )}
      aria-label="Breadcrumb"
    >
      {/* Home link */}
      <Link
        href="/"
        className="hover:text-primary dark:hover:text-primary-light transition-colors"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {items.map((item, index) => (
        <span key={index} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-2 shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-primary dark:hover:text-primary-light transition-colors truncate max-w-[200px]"
              title={item.label}
            >
              {item.label}
            </Link>
          ) : (
            <span
              className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]"
              title={item.label}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
