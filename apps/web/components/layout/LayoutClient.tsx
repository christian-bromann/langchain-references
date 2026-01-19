"use client";

/**
 * LayoutClient Component
 *
 * Client-side wrapper for the reference layout that manages mobile menu state.
 * This allows the MobileProjectMenu to be rendered at the layout level
 * (outside of Header) so its backdrop can properly cover all content.
 */

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { MobileProjectMenu } from "./MobileProjectMenu";
import { getEnabledProjects } from "@/lib/config/projects";
import { getCurrentProject, getCurrentLanguage } from "./ProjectTabs";
import type { SidebarPackage } from "./Sidebar";

interface LayoutClientProps {
  children: React.ReactNode;
  pythonPackages: SidebarPackage[];
  javascriptPackages: SidebarPackage[];
}

export function LayoutClient({
  children,
  pythonPackages,
  javascriptPackages,
}: LayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Get projects and current context
  const projects = getEnabledProjects();
  const currentProject = getCurrentProject(pathname, projects);
  const currentLanguage = getCurrentLanguage(pathname);

  return (
    <>
      {/* Header */}
      <Header onMobileMenuOpen={() => setMobileMenuOpen(true)} />

      {/* Main content */}
      {children}

      {/* Mobile Project Menu - rendered at layout level for proper backdrop */}
      <MobileProjectMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        projects={projects}
        currentProject={currentProject}
        currentLanguage={currentLanguage}
        pythonPackages={pythonPackages}
        javascriptPackages={javascriptPackages}
      />
    </>
  );
}
