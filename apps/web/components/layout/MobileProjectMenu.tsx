"use client";

/**
 * MobileProjectMenu Component
 *
 * Full-featured mobile navigation drawer with:
 * - Projects tab: Switch between LangChain, LangGraph, etc.
 * - Navigation tab: Browse packages and subpages (like the desktop sidebar)
 * - Language toggle with cross-language symbol resolution
 * - Theme toggle
 */

import { Fragment, useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { X, ChevronRight, Loader2, Sun, Moon, Layers, FolderTree } from "lucide-react";
import type { ProjectConfig } from "@langchain/ir-schema";
import { cn } from "@/lib/utils/cn";
import { getDefaultPackageSlug } from "@/lib/config/projects";
import type { ResolveSymbolResponse } from "@/lib/symbol-resolution";
import type { SidebarPackage, NavItem } from "./Sidebar";

interface MobileProjectMenuProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectConfig[];
  currentProject: ProjectConfig | null;
  currentLanguage: "python" | "javascript";
  pythonPackages?: SidebarPackage[];
  javascriptPackages?: SidebarPackage[];
}

// =============================================================================
// URL Parsing Utilities
// =============================================================================

function extractSymbolNameFromPath(pathname: string): string | null {
  const parts = pathname.replace(/^\//, "").split("/");
  if (parts.length < 3) return null;
  return parts[parts.length - 1] || null;
}

function extractPackageFromPath(pathname: string): string | null {
  const parts = pathname.replace(/^\//, "").split("/");
  if (parts.length < 2) return null;
  return parts[1] || null;
}

function extractSymbolPathForMapping(pathname: string): string | null {
  const parts = pathname.replace(/^\//, "").split("/");
  if (parts.length < 3) return null;
  return parts.slice(1).join("/");
}

function isSymbolPage(pathname: string): boolean {
  const parts = pathname.replace(/^\//, "").split("/");
  return parts.length >= 3;
}

// =============================================================================
// Tab Type
// =============================================================================

type TabType = "projects" | "navigation";

// =============================================================================
// Component
// =============================================================================

export function MobileProjectMenu({
  open,
  onClose,
  projects,
  currentProject,
  currentLanguage,
  pythonPackages = [],
  javascriptPackages = [],
}: MobileProjectMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingLang, setResolvingLang] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("navigation");

  // Filter packages by current language and project
  const packages = useMemo(() => {
    const languagePackages = currentLanguage === "python" ? pythonPackages : javascriptPackages;
    if (!currentProject) return languagePackages;
    return languagePackages.filter((pkg) => pkg.project === currentProject.id);
  }, [pythonPackages, javascriptPackages, currentLanguage, currentProject]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  /**
   * Handle language change with cross-language symbol resolution.
   */
  const handleLanguageClick = async (targetLang: "python" | "javascript") => {
    if (targetLang === currentLanguage) return;

    if (!isSymbolPage(pathname)) {
      onClose();
      router.push(`/${targetLang}/${currentProject?.slug || "langchain"}`);
      return;
    }

    setIsResolving(true);
    setResolvingLang(targetLang);

    try {
      const symbolName = extractSymbolNameFromPath(pathname);
      const sourcePackage = extractPackageFromPath(pathname);
      const symbolPath = extractSymbolPathForMapping(pathname);

      if (!symbolName) {
        onClose();
        router.push(`/${targetLang}/${currentProject?.slug || "langchain"}`);
        return;
      }

      const params = new URLSearchParams({
        symbolName,
        targetLanguage: targetLang,
        sourceLanguage: currentLanguage,
        ...(sourcePackage && { sourcePackage }),
        ...(symbolPath && { symbolPath }),
      });

      const response = await fetch(`/api/resolve-symbol?${params}`);

      if (!response.ok) {
        onClose();
        router.push(`/${targetLang}/${currentProject?.slug || "langchain"}`);
        return;
      }

      const result: ResolveSymbolResponse = await response.json();
      onClose();
      router.push(result.targetUrl);
    } catch (error) {
      console.error("[MobileProjectMenu] Resolution failed:", error);
      onClose();
      router.push(`/${targetLang}/${currentProject?.slug || "langchain"}`);
    } finally {
      setIsResolving(false);
      setResolvingLang(null);
    }
  };

  return (
    <Fragment>
      {/* Backdrop - covers everything with blur */}
      <div
        className="fixed inset-0 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
        style={{
          zIndex: 9998,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      {/* Drawer - full viewport height */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-sm lg:hidden"
        style={{
          zIndex: 9999,
          height: "100dvh",
        }}
      >
        <div className="flex h-full flex-col bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Menu
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setActiveTab("navigation")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative cursor-pointer",
                activeTab === "navigation"
                  ? "text-primary dark:text-primary-light"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              <FolderTree className="h-4 w-4" />
              Navigation
              {activeTab === "navigation" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary-light" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("projects")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative cursor-pointer",
                activeTab === "projects"
                  ? "text-primary dark:text-primary-light"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              <Layers className="h-4 w-4" />
              Projects
              {activeTab === "projects" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary dark:bg-primary-light" />
              )}
            </button>
          </div>

          {/* Tab Content - takes remaining vertical space */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "projects" ? (
              <ProjectsList
                projects={projects}
                currentProject={currentProject}
                currentLanguage={currentLanguage}
                onClose={onClose}
              />
            ) : (
              <NavigationList
                packages={packages}
                currentPath={pathname}
                onClose={onClose}
              />
            )}
          </div>

          {/* Footer: Language and Theme */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-4">
            {/* Language Toggle */}
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Language
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleLanguageClick("python")}
                  disabled={isResolving}
                  className={cn(
                    "flex-1 py-2.5 px-3 text-center rounded-lg text-sm font-medium transition-colors",
                    "flex items-center justify-center gap-2",
                    currentLanguage === "python"
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
                    isResolving && "opacity-70 cursor-wait",
                  )}
                >
                  {isResolving && resolvingLang === "python" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Python
                </button>
                <button
                  type="button"
                  onClick={() => handleLanguageClick("javascript")}
                  disabled={isResolving}
                  className={cn(
                    "flex-1 py-2.5 px-3 text-center rounded-lg text-sm font-medium transition-colors",
                    "flex items-center justify-center gap-2",
                    currentLanguage === "javascript"
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700",
                    isResolving && "opacity-70 cursor-wait",
                  )}
                >
                  {isResolving && resolvingLang === "javascript" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  JavaScript
                </button>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Theme
              </span>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
                  "hover:bg-gray-200 dark:hover:bg-gray-700",
                )}
                aria-label="Toggle dark mode"
              >
                <Sun className="h-4 w-4 block dark:hidden" />
                <Moon className="h-4 w-4 hidden dark:block" />
                <span className="dark:hidden">Light</span>
                <span className="hidden dark:inline">Dark</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

// =============================================================================
// Projects List Tab
// =============================================================================

function ProjectsList({
  projects,
  currentProject,
  currentLanguage,
  onClose,
}: {
  projects: ProjectConfig[];
  currentProject: ProjectConfig | null;
  currentLanguage: "python" | "javascript";
  onClose: () => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Layers className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No projects available.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {projects.map((project) => {
        const isActive = currentProject?.id === project.id;
        const packageSlug = getDefaultPackageSlug(project.id, currentLanguage);
        const href = `/${currentLanguage}/${packageSlug}`;

        return (
          <Link
            key={project.id}
            href={href}
            onClick={onClose}
            className={cn(
              "flex items-center justify-between mx-2 px-3 py-3 rounded-lg transition-colors",
              isActive
                ? "bg-primary/10"
                : "hover:bg-gray-50 dark:hover:bg-gray-800/50",
            )}
          >
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "font-medium",
                  isActive
                    ? "text-primary dark:text-primary-light"
                    : "text-gray-900 dark:text-gray-100",
                )}
              >
                {project.displayName}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {project.description}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-600 shrink-0 ml-2" />
          </Link>
        );
      })}
    </div>
  );
}

// =============================================================================
// Navigation List Tab (Packages & Subpages)
// =============================================================================

function NavigationList({
  packages,
  currentPath,
  onClose,
}: {
  packages: SidebarPackage[];
  currentPath: string;
  onClose: () => void;
}) {
  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <FolderTree className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No packages available.
        </p>
        <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
          Select a project to see packages.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {packages.map((pkg, index) => (
        <div key={pkg.id}>
          {index > 0 && (
            <div className="mx-4 my-2 h-px bg-gray-100 dark:bg-gray-800" />
          )}
          <MobilePackageSection
            package={pkg}
            currentPath={currentPath}
            onClose={onClose}
          />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Mobile Package Section (Similar to Sidebar PackageSection)
// =============================================================================

function MobilePackageSection({
  package: pkg,
  currentPath,
  onClose,
}: {
  package: SidebarPackage;
  currentPath: string;
  onClose: () => void;
}) {
  const isPackageActive = currentPath === pkg.path || currentPath.startsWith(pkg.path + "/");
  const hasSubpages = pkg.subpages && pkg.subpages.length > 0;
  const hasItems = pkg.items.length > 0;
  const [isExpanded, setIsExpanded] = useState(isPackageActive);

  return (
    <div className="px-2">
      {/* Package Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
          isPackageActive
            ? "bg-primary/5"
            : "hover:bg-gray-50 dark:hover:bg-gray-800/50",
        )}
      >
        <span
          className={cn(
            "font-semibold text-sm uppercase tracking-wide",
            isPackageActive
              ? "text-primary dark:text-primary-light"
              : "text-gray-700 dark:text-gray-300",
          )}
        >
          {pkg.name}
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 transition-transform text-gray-400",
            isExpanded && "rotate-90",
          )}
        />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-1 space-y-0.5">
          {/* Overview link (always shown if package has subpages or items) */}
          {(hasSubpages || hasItems) && (
            <Link
              href={pkg.path}
              onClick={onClose}
              className={cn(
                "block px-4 py-2 rounded-lg text-sm transition-colors ml-2",
                currentPath === pkg.path
                  ? "bg-primary/10 text-primary dark:text-primary-light font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200",
              )}
            >
              Overview
            </Link>
          )}

          {/* Subpages */}
          {hasSubpages &&
            pkg.subpages!.map((subpage) => (
              <Link
                key={subpage.slug}
                href={subpage.path}
                onClick={onClose}
                className={cn(
                  "block px-4 py-2 rounded-lg text-sm transition-colors ml-2",
                  currentPath === subpage.path
                    ? "bg-primary/10 text-primary dark:text-primary-light font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200",
                )}
              >
                {subpage.title}
              </Link>
            ))}

          {/* Module/Export items (if no subpages) */}
          {!hasSubpages &&
            hasItems &&
            pkg.items.map((item) => (
              <MobileNavItem
                key={item.path}
                item={item}
                currentPath={currentPath}
                onClose={onClose}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Mobile Nav Item (Recursive for nested items)
// =============================================================================

function MobileNavItem({
  item,
  currentPath,
  onClose,
  depth = 0,
}: {
  item: NavItem;
  currentPath: string;
  onClose: () => void;
  depth?: number;
}) {
  const isActive = currentPath === item.path;
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const paddingLeft = `${(depth + 1) * 0.75 + 1}rem`;

  if (hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center justify-between py-2 rounded-lg text-sm transition-colors",
            "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50",
          )}
          style={{ paddingLeft, paddingRight: "1rem" }}
        >
          <span>{item.name}</span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform text-gray-400",
              isOpen && "rotate-90",
            )}
          />
        </button>
        {isOpen && (
          <div className="space-y-0.5">
            {item.children!.map((child) => (
              <MobileNavItem
                key={child.path}
                item={child}
                currentPath={currentPath}
                onClose={onClose}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.path}
      onClick={onClose}
      className={cn(
        "block py-2 rounded-lg text-sm transition-colors",
        isActive
          ? "bg-primary/10 text-primary dark:text-primary-light font-medium"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200",
      )}
      style={{ paddingLeft, paddingRight: "1rem" }}
    >
      {item.name}
    </Link>
  );
}
