"use client";

/**
 * Sidebar Component
 *
 * Navigation sidebar with package list and symbol tree.
 * Follows Mintlify design patterns with collapsible sections.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SymbolKind } from "@/lib/ir/types";

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

  const packages = isPython ? pythonPackages : isJavaScript ? javascriptPackages : [];

  return (
    <aside
      id="sidebar-content"
      className="hidden lg:flex fixed left-0 shrink-0 flex-col border-r border-gray-100 dark:border-white/10 transition-transform duration-100"
      style={{
        top: "var(--header-height)",
        height: "calc(100vh - var(--header-height))",
        width: "var(--sidebar-width)"
      }}
    >
      <div
        className="flex-1 pr-5 pt-5 pb-4 overflow-y-auto"
        id="navigation-items"
        style={{ scrollbarGutter: "stable" }}
      >
        <div className="text-sm relative">
          {/* Package navigation */}
          {packages.map((pkg, index) => (
            <div key={pkg.id}>
              {index > 0 && <SidebarDivider />}
              <PackageSection package={pkg} currentPath={pathname} />
            </div>
          ))}

          {packages.length === 0 && (
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
 */
function PackageSection({
  package: pkg,
  currentPath,
}: {
  package: SidebarPackage;
  currentPath: string;
}) {
  return (
    <div className="my-2">
      {/* Group header */}
      <div className="sidebar-group-header flex items-center gap-2.5 pl-4 mb-3.5 lg:mb-2.5">
        <h5
          id="sidebar-title"
          className="font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide"
        >
          {pkg.name}
        </h5>
      </div>

      {/* Group items */}
      <ul id="sidebar-group" className="sidebar-group list-none space-y-px">
        {pkg.items.map((item) => (
          <NavItemLink key={item.path} item={item} currentPath={currentPath} />
        ))}
      </ul>
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
            "text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
          )}
          style={{ paddingLeft }}
          aria-label={`Toggle ${item.name} section`}
          aria-expanded={isOpen}
        >
          <div className="flex-1 flex items-center gap-2 justify-start">
            {item.name}
          </div>
          <ChevronRight
            className={cn(
              "w-2 h-5 -mr-0.5 transition-transform",
              "text-gray-400 group-hover:text-gray-600 dark:text-gray-600 dark:group-hover:text-gray-400",
              isOpen && "rotate-90"
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
    <li
      id={item.path}
      className="relative scroll-m-4 first:scroll-m-20"
      data-title={item.name}
    >
      <Link
        href={item.path}
        className={cn(
          "group flex items-center pr-3 py-1.5 cursor-pointer gap-x-3 text-left rounded-xl w-full",
          "-outline-offset-1",
          isActive
            ? "bg-primary/10 text-primary dark:text-primary-light dark:bg-primary-light/10 font-medium"
            : "hover:bg-gray-600/5 dark:hover:bg-gray-200/5 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
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

