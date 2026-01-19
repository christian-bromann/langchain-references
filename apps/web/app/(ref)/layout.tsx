/**
 * Reference Layout
 *
 * Shared layout for Python and JavaScript reference documentation.
 * Includes header, sidebar navigation, and main content area.
 */

import { Suspense } from "react";
import { SidebarLoader, loadNavigationData } from "@/components/layout/SidebarLoader";
import { LayoutClient } from "@/components/layout/LayoutClient";

export default async function ReferenceLayout({ children }: { children: React.ReactNode }) {
  // Load navigation data at the layout level so it can be shared
  // between Header (MobileProjectMenu) and Sidebar
  const { pythonPackages, javascriptPackages, javaPackages, goPackages } = await loadNavigationData();

  return (
    <div className="min-h-screen bg-background">
      <LayoutClient
        pythonPackages={pythonPackages}
        javascriptPackages={javascriptPackages}
        javaPackages={javaPackages}
        goPackages={goPackages}
      >
        {/* Main layout with sidebar */}
        <div className="max-w-8xl mx-auto px-0 lg:px-5">
          <div className="flex pt-header">
            {/* Sidebar */}
            <Suspense fallback={<SidebarSkeleton />}>
              <SidebarLoader />
            </Suspense>

            {/* Main content - full width on mobile */}
            <main className="flex-1 min-w-0">
              <div className="px-6 py-8">{children}</div>
            </main>
          </div>
        </div>
      </LayoutClient>
    </div>
  );
}

/**
 * Loading skeleton for sidebar (Mintlify style)
 */
function SidebarSkeleton() {
  return (
    <aside
      className="hidden lg:flex sticky top-header self-start shrink-0 flex-col border-r border-gray-100 dark:border-white/10"
      style={{
        height: "calc(100vh - var(--header-height))",
        width: "var(--sidebar-width)",
      }}
    >
      <div className="flex-1 pr-5 pt-5 pb-4">
        {/* Group header skeleton */}
        <div className="pl-4 mb-2.5">
          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Navigation items skeleton */}
        <div className="space-y-1 pl-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-7 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"
              style={{ width: `${60 + (i % 3) * 15}%` }}
            />
          ))}
        </div>

        {/* Divider skeleton */}
        <div className="px-1 py-3 mt-4">
          <div className="h-px w-full bg-gray-100 dark:bg-white/10" />
        </div>

        {/* Second group */}
        <div className="pl-4 mb-2.5">
          <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="space-y-1 pl-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-7 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"
              style={{ width: `${50 + (i % 4) * 12}%` }}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
