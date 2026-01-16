"use client";

/**
 * Sidebar Component
 *
 * Navigation sidebar with package list and symbol tree.
 * Follows Mintlify design patterns with collapsible sections.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SymbolKind } from "@/lib/ir/types";
import { LanguageDropdown } from "./LanguageDropdown";
import { getProjectFromPathname, packageBelongsToProject } from "@/lib/config/projects";

/**
 * Navigation item structure
 */
export interface NavItem {
  name: string;
  path: string;
  kind?: SymbolKind;
  children?: NavItem[];
}

/**
 * Package in the sidebar
 */
export interface SidebarPackage {
  id: string;
  name: string;
  path: string;
  items: NavItem[];
}

interface SidebarProps {
  pythonPackages?: SidebarPackage[];
  javascriptPackages?: SidebarPackage[];
}

export function Sidebar({ pythonPackages = [], javascriptPackages = [] }: SidebarProps) {
  const pathname = usePathname();
  const isPython = pathname.startsWith("/python");
  const isJavaScript = pathname.startsWith("/javascript");

  // Get current project from URL
  const currentProject = useMemo(() => getProjectFromPathname(pathname), [pathname]);

  // Filter packages by language first
  const languagePackages = isPython ? pythonPackages : isJavaScript ? javascriptPackages : [];

  // Then filter by project
  const packages = useMemo(() => {
    if (!currentProject) return languagePackages;

    return languagePackages.filter((pkg) => packageBelongsToProject(pkg.name, currentProject.id));
  }, [languagePackages, currentProject]);

  return (
    <aside
      id="sidebar-content"
      className="hidden lg:flex sticky top-header self-start shrink-0 flex-col border-r border-gray-100 dark:border-white/10 transition-transform duration-100"
      style={{
        height: "calc(100vh - var(--header-height))",
        width: "var(--sidebar-width)",
      }}
    >
      <div className="flex-1 pr-5 pt-5 pb-4 overflow-y-auto scrollbar-hide" id="navigation-items">
        {/* Language Dropdown */}
        <div className="pl-4 mb-6">
          <LanguageDropdown />
        </div>

        {/* Project Title */}
        {currentProject && (
          <div className="pl-4 mb-6">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {currentProject.displayName}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">API Reference</p>
          </div>
        )}

        <div className="text-sm relative">
          {/* Package navigation */}
          {packages.map((pkg, index) => (
            <div key={pkg.id}>
              {index > 0 && <SidebarDivider />}
              <PackageSection package={pkg} currentPath={pathname} />
            </div>
          ))}

          {packages.length === 0 && currentProject && (
            <div className="text-gray-500 dark:text-gray-400 text-sm py-8 text-center px-4">
              <p>No packages available for {currentProject.displayName} yet.</p>
              <p className="mt-2 text-xs">Reference docs are coming soon.</p>
            </div>
          )}

          {packages.length === 0 && !currentProject && (
            <div className="text-gray-500 dark:text-gray-400 text-sm py-8 text-center pl-4">
              Select a language to view packages
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Divider between sidebar sections
 */
function SidebarDivider() {
  return (
    <div className="px-1 py-3">
      <div className="sidebar-nav-group-divider h-px w-full bg-gray-100 dark:bg-white/10" />
    </div>
  );
}

/**
 * Package section with group header (Mintlify style)
 *
 * Shows the package name as a clickable header. If the package has named
 * sub-modules (exports), they're listed below. If not, users click the
 * package name to explore its contents.
 */
function PackageSection({
  package: pkg,
  currentPath,
}: {
  package: SidebarPackage;
  currentPath: string;
}) {
  const isPackageActive = currentPath === pkg.path || currentPath.startsWith(pkg.path + "/");
  const hasItems = pkg.items.length > 0;

  return (
    <div className="my-2">
      {/* Group header - clickable link to package index */}
      <Link
        href={pkg.path}
        className={cn(
          "sidebar-group-header flex items-center gap-2.5 pl-4",
          hasItems ? "mb-3.5 lg:mb-2.5" : "mb-0",
          "hover:opacity-80 transition-opacity",
        )}
      >
        <h5
          id="sidebar-title"
          className={cn(
            "font-semibold text-xs uppercase tracking-wide",
            isPackageActive
              ? "text-primary dark:text-primary-light"
              : "text-gray-700 dark:text-gray-300",
          )}
        >
          {pkg.name}
        </h5>
      </Link>

      {/* Group items - only shown if package has named sub-modules */}
      {hasItems && (
        <ul id="sidebar-group" className="sidebar-group list-none space-y-px">
          {pkg.items.map((item, index) => (
            <NavItemLink key={`${item.path}-${index}`} item={item} currentPath={currentPath} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Navigation item link (Mintlify style)
 */
function NavItemLink({
  item,
  currentPath,
  depth = 0,
}: {
  item: NavItem;
  currentPath: string;
  depth?: number;
}) {
  const isActive = currentPath === item.path;
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  // Calculate padding based on depth
  const paddingLeft = `${1 + depth * 0.75}rem`;

  if (hasChildren) {
    return (
      <li data-title={item.name} className="space-y-px">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "group flex items-center pr-3 py-1.5 cursor-pointer gap-x-3 text-left rounded-xl w-full",
            "-outline-offset-1",
            "hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
            "text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300",
          )}
          style={{ paddingLeft }}
          aria-label={`Toggle ${item.name} section`}
          aria-expanded={isOpen}
        >
          <div className="flex-1 flex items-center gap-2 justify-start">{item.name}</div>
          <ChevronRight
            className={cn(
              "w-2 h-5 -mr-0.5 transition-transform",
              "text-gray-400 group-hover:text-gray-600 dark:text-gray-600 dark:group-hover:text-gray-400",
              isOpen && "rotate-90",
            )}
            strokeWidth={1.5}
          />
        </button>

        {isOpen && (
          <ul className="list-none space-y-px">
            {item.children!.map((child) => (
              <NavItemLink
                key={child.path}
                item={child}
                currentPath={currentPath}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li id={item.path} className="relative scroll-m-4 first:scroll-m-20" data-title={item.name}>
      <Link
        href={item.path}
        className={cn(
          "group flex items-center pr-3 py-1.5 cursor-pointer gap-x-3 text-left rounded-xl w-full",
          "-outline-offset-1",
          isActive
            ? "bg-primary/10 text-primary dark:text-primary-light dark:bg-primary-light/10 font-medium"
            : "hover:bg-gray-600/5 dark:hover:bg-gray-200/5 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300",
        )}
        style={{ paddingLeft }}
      >
        <div className="flex-1 flex items-center space-x-2.5">
          <div>{item.name}</div>
        </div>
      </Link>
    </li>
  );
}
