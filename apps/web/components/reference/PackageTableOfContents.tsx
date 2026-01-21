"use client";

/**
 * Package Table of Contents Component
 *
 * Displays a right sidebar navigation for package overview pages.
 * Shows links to symbol sections (Classes, Functions, Modules, Interfaces, Types).
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { Box, Code, Folder, FileType, List, X } from "lucide-react";
import { CopyPageButton } from "./CopyPageButton";
import { PageContextMenu } from "./PageContextMenu";

export interface PackageTOCSection {
  id: string;
  title: string;
  icon: "class" | "function" | "module" | "interface" | "type";
  /** Number of items in this section (optional for description sections) */
  count?: number;
}

export interface PackageTableOfContentsProps {
  sections: PackageTOCSection[];
  /** Markdown content for AI copy functionality */
  markdown?: string;
  /** Page URL for AI context menu */
  pageUrl?: string;
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
 * TOC Content component - shared between desktop and mobile views
 */
function TOCContent({
  sections,
  markdown,
  pageUrl,
  onItemClick,
}: {
  sections: PackageTOCSection[];
  markdown?: string;
  pageUrl?: string;
  onItemClick?: () => void;
}) {
  const handleScrollToId = (id: string) => {
    scrollToId(id);
    onItemClick?.();
  };

  return (
    <div className="pl-4 pb-8">
      {/* AI Actions - Copy page button and context menu */}
      {markdown && pageUrl && (
        <div className="flex items-center mb-8">
          <CopyPageButton markdown={markdown} />
          <PageContextMenu pageUrl={pageUrl} markdown={markdown} />
        </div>
      )}

      <h3 className="text-sm font-semibold text-foreground mb-3">On This Page</h3>

      <div className="space-y-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => handleScrollToId(section.id)}
            className="flex items-center gap-2 w-full py-1.5 text-left text-sm text-foreground-secondary hover:text-primary transition-colors group cursor-pointer"
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
  );
}

/**
 * Mobile TOC Component - renders via portal for proper fixed positioning
 */
function MobilePackageTOC({
  isOpen,
  onOpen,
  onClose,
  sections,
  markdown,
  pageUrl,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  sections: PackageTOCSection[];
  markdown?: string;
  pageUrl?: string;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 1280);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  if (!isMounted || !isSmallScreen) {
    return null;
  }

  const mobileContent = (
    <>
      {/* Mobile TOC toggle button */}
      {!isOpen && (
        <button
          onClick={onOpen}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            backgroundColor: "#2F6868",
            color: "white",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            border: "none",
            cursor: "pointer",
          }}
          className="flex items-center justify-center hover:opacity-90 transition-opacity"
          aria-label="Open table of contents"
        >
          <List className="h-5 w-5" />
        </button>
      )}

      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 200ms",
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 9999,
          height: "100%",
          width: "320px",
          maxWidth: "85vw",
          backgroundColor: "var(--bg-primary)",
          borderLeft: "1px solid var(--border-light)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease-out",
        }}
        aria-label="On this page"
        aria-hidden={!isOpen}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-semibold text-foreground">On This Page</span>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-foreground-secondary hover:text-foreground hover:bg-background-secondary transition-colors cursor-pointer"
            aria-label="Close table of contents"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Panel content */}
        <div className="overflow-y-auto h-[calc(100%-4rem)] p-4">
          <TOCContent
            sections={sections}
            markdown={markdown}
            pageUrl={pageUrl}
            onItemClick={onClose}
          />
        </div>
      </nav>
    </>
  );

  return createPortal(mobileContent, document.body);
}

/**
 * Main Package Table of Contents component
 */
export function PackageTableOfContents({
  sections,
  markdown,
  pageUrl,
}: PackageTableOfContentsProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile TOC when pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen]);

  // Prevent body scroll when mobile TOC is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  // Don't render if there's nothing to show
  if (!sections || sections.length === 0) {
    return null;
  }

  return (
    <>
      {/* Desktop TOC */}
      <nav
        className="hidden xl:block sticky top-[calc(var(--header-height)+2rem)] self-start w-toc shrink-0 pl-8 max-h-[calc(100vh-var(--header-height)-4rem)] overflow-y-auto scrollbar-hide"
        aria-label="On this page"
      >
        <TOCContent sections={sections} markdown={markdown} pageUrl={pageUrl} />
      </nav>

      {/* Mobile TOC */}
      <MobilePackageTOC
        isOpen={isMobileOpen}
        onOpen={() => setIsMobileOpen(true)}
        onClose={() => setIsMobileOpen(false)}
        sections={sections}
        markdown={markdown}
        pageUrl={pageUrl}
      />
    </>
  );
}
