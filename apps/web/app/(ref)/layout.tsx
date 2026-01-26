/**
 * Reference Layout
 *
 * Shared layout for Python and JavaScript reference documentation.
 * Includes header, sidebar navigation, and main content area.
 */

import { loadNavigationData, SidebarWithData } from "@/components/layout/SidebarLoader";
import { LayoutClient } from "@/components/layout/LayoutClient";

export default async function ReferenceLayout({ children }: { children: React.ReactNode }) {
  // Load navigation data ONCE at the layout level
  // This data is shared between Header (MobileProjectMenu) and Sidebar
  const { pythonPackages, javascriptPackages, javaPackages, goPackages } =
    await loadNavigationData();

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
            {/* Sidebar - uses pre-loaded data to avoid duplicate fetching */}
            <SidebarWithData
              pythonPackages={pythonPackages}
              javascriptPackages={javascriptPackages}
              javaPackages={javaPackages}
              goPackages={goPackages}
            />

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
