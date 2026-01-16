"use client";

/**
 * MobileProjectMenu Component
 *
 * Slide-in drawer for project navigation on mobile devices.
 * Provides a touch-friendly way to switch between projects.
 */

import { Fragment } from "react";
import Link from "next/link";
import { X, ChevronRight } from "lucide-react";
import type { ProjectConfig } from "@langchain/ir-schema";
import { cn } from "@/lib/utils/cn";

interface MobileProjectMenuProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectConfig[];
  currentProject: ProjectConfig | null;
  currentLanguage: "python" | "javascript";
}

export function MobileProjectMenu({
  open,
  onClose,
  projects,
  currentProject,
  currentLanguage,
}: MobileProjectMenuProps) {
  if (!open) return null;

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 w-full max-w-sm z-50 lg:hidden",
          "transform transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full flex-col bg-background shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Projects</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto">
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {projects.map((project) => {
                const isActive = currentProject?.id === project.id;
                const href = `/${currentLanguage}/${project.slug}`;

                return (
                  <li key={project.id}>
                    <Link
                      href={href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center justify-between px-4 py-4",
                        isActive
                          ? "bg-primary/5 text-primary dark:text-primary-light"
                          : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900",
                      )}
                    >
                      <div>
                        <div className="font-medium">{project.displayName}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {project.description}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Language Toggle */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Language
            </div>
            <div className="flex gap-2">
              <Link
                href={`/python/${currentProject?.slug || "langchain"}`}
                onClick={onClose}
                className={cn(
                  "flex-1 py-2 px-3 text-center rounded-lg text-sm font-medium transition-colors",
                  currentLanguage === "python"
                    ? "bg-primary text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
                )}
              >
                Python
              </Link>
              <Link
                href={`/javascript/${currentProject?.slug || "langchain"}`}
                onClick={onClose}
                className={cn(
                  "flex-1 py-2 px-3 text-center rounded-lg text-sm font-medium transition-colors",
                  currentLanguage === "javascript"
                    ? "bg-primary text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
                )}
              >
                JavaScript
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
