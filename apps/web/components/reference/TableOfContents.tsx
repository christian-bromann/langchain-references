"use client";

/**
 * Table of Contents Component
 *
 * Displays an "On This Page" navigation sidebar for symbol pages.
 * Shows sections like Constructors, Properties, Methods, etc. in collapsible groups.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, List, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CopyPageButton } from "./CopyPageButton";
import { PageContextMenu } from "./PageContextMenu";

export interface TOCItem {
  id: string;
  label: string;
  kind?: string;
}

export interface TOCSection {
  id: string;
  title: string;
  items: TOCItem[];
}

/** Inherited group with nested sections */
export interface TOCInheritedGroup {
  id: string;
  baseName: string;
  sections: TOCSection[];
}

export interface TableOfContentsProps {
  /** Top-level items like "Examples" that don't belong to a collapsible group */
  topItems?: TOCItem[];
  /** Collapsible sections like "Constructors", "Properties", "Methods" */
  sections: TOCSection[];
  /** Inherited member groups with nested sections */
  inheritedGroups?: TOCInheritedGroup[];
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
 * Section icon based on section title
 */
function SectionIcon({ title, size = "normal" }: { title: string; size?: "normal" | "small" }) {
  const iconMap: Record<string, { color: string; label: string }> = {
    Constructors: { color: "text-purple-500", label: "C" },
    Properties: { color: "text-blue-500", label: "P" },
    Attributes: { color: "text-blue-500", label: "A" },
    Accessors: { color: "text-orange-500", label: "A" },
    Methods: { color: "text-green-500", label: "M" },
    Functions: { color: "text-green-500", label: "F" },
  };

  const icon = iconMap[title];
  if (!icon) return null;

  const sizeClasses = size === "small" ? "w-3 h-3 text-[8px]" : "w-4 h-4 text-[10px]";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded shrink-0",
        sizeClasses,
        icon.color,
      )}
      title={title}
    >
      {icon.label}
    </span>
  );
}

/**
 * Kind icon for different symbol types
 */
function KindIcon({ kind, size = "normal" }: { kind: string; size?: "normal" | "small" }) {
  const iconColors: Record<string, string> = {
    constructor: "text-purple-500",
    property: "text-blue-500",
    attribute: "text-blue-500",
    method: "text-green-500",
    function: "text-green-500",
    accessor: "text-orange-500",
  };

  const iconLabels: Record<string, string> = {
    constructor: "C",
    property: "P",
    attribute: "A",
    method: "M",
    function: "F",
    accessor: "A",
  };

  const color = iconColors[kind] || "text-foreground-muted";
  const label = iconLabels[kind] || kind.charAt(0).toUpperCase();
  const sizeClasses = size === "small" ? "w-3 h-3 text-[8px]" : "w-4 h-4 text-[10px]";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-bold rounded shrink-0",
        sizeClasses,
        color,
      )}
      title={kind}
    >
      {label}
    </span>
  );
}

/**
 * Top-level item icon
 */
function TopItemIcon({ label }: { label: string }) {
  const iconMap: Record<string, { color: string; icon: string }> = {
    Examples: { color: "text-amber-500", icon: "⚡" },
    Parameters: { color: "text-cyan-500", icon: "◇" },
  };

  const icon = iconMap[label];
  if (!icon) return null;

  return <span className={cn("text-xs shrink-0", icon.color)}>{icon.icon}</span>;
}

/**
 * Shared TOC content component (used in both desktop and mobile views)
 */
function TOCContent({
  topItems,
  sections,
  inheritedGroups,
  markdown,
  pageUrl,
  onItemClick,
}: {
  topItems?: TOCItem[];
  sections: TOCSection[];
  inheritedGroups?: TOCInheritedGroup[];
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

      {/* Top-level items (examples, etc.) */}
      {topItems && topItems.length > 0 && (
        <div className="space-y-0 mb-2">
          {topItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleScrollToId(item.id)}
              className="flex items-center gap-1.5 w-full text-left text-sm text-foreground-secondary hover:text-primary transition-colors py-1"
            >
              <TopItemIcon label={item.label} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Collapsible sections for own members */}
      {sections.length > 0 && (
        <div className="space-y-0">
          {sections.map((section) => (
            <CollapsibleSectionWithCallback
              key={section.id}
              section={section}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}

      {/* Inherited member groups */}
      {inheritedGroups && inheritedGroups.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
          {inheritedGroups.map((group) => (
            <InheritedGroupSectionWithCallback
              key={group.id}
              group={group}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible section with optional callback
 */
function CollapsibleSectionWithCallback({
  section,
  onItemClick,
}: {
  section: TOCSection;
  onItemClick?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  const handleScrollToId = (id: string) => {
    scrollToId(id);
    onItemClick?.();
  };

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full py-1 text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
        aria-expanded={isOpen}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-foreground-muted transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
        <span className="truncate">{section.title}</span>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-4 space-y-0">
          {section.items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleScrollToId(item.id)}
              className="flex items-center gap-1.5 w-full py-0.5 text-left text-xs text-foreground-secondary hover:text-primary transition-colors"
            >
              {item.kind && <KindIcon kind={item.kind} size="small" />}
              <span className="truncate font-mono">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Nested collapsible section with optional callback
 */
function NestedCollapsibleSectionWithCallback({
  section,
  onItemClick,
}: {
  section: TOCSection;
  onItemClick?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleScrollToId = (id: string) => {
    scrollToId(id);
    onItemClick?.();
  };

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full py-0.5 text-left text-xs text-foreground-secondary hover:text-primary transition-colors"
        aria-expanded={isOpen}
      >
        <ChevronDown
          className={cn(
            "h-2.5 w-2.5 shrink-0 text-foreground-muted transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
        <SectionIcon title={section.title} size="small" />
        <span className="truncate">{section.title}</span>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-4 space-y-0">
          {section.items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleScrollToId(item.id)}
              className="flex items-center gap-1.5 w-full py-0.5 text-left text-xs text-foreground-muted hover:text-primary transition-colors"
            >
              {item.kind && <KindIcon kind={item.kind} size="small" />}
              <span className="truncate font-mono">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Collapsible inherited group component with optional callback
 */
function InheritedGroupSectionWithCallback({
  group,
  onItemClick,
}: {
  group: TOCInheritedGroup;
  onItemClick?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full py-1 text-left text-xs text-foreground-secondary hover:text-primary transition-colors"
        aria-expanded={isOpen}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-foreground-muted transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
        <span className="truncate">
          <span className="text-foreground-muted">from </span>
          <span className="font-mono font-medium text-foreground">{group.baseName}</span>
        </span>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-4 space-y-0">
          {group.sections.map((section) => (
            <NestedCollapsibleSectionWithCallback
              key={section.id}
              section={section}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile TOC Component
 * Renders the mobile TOC button and slide-in panel
 */
function MobileTOC({
  isOpen,
  onOpen,
  onClose,
  topItems,
  sections,
  inheritedGroups,
  markdown,
  pageUrl,
}: {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  topItems?: TOCItem[];
  sections: TOCSection[];
  inheritedGroups?: TOCInheritedGroup[];
  markdown?: string;
  pageUrl?: string;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Only render on client side after hydration
  useEffect(() => {
    setIsMounted(true);

    // Check screen size
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 1280);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // During SSR or before hydration, don't render anything
  if (!isMounted) {
    return null;
  }

  // Don't render mobile TOC on large screens
  if (!isSmallScreen) {
    return null;
  }

  const mobileContent = (
    <>
      {/* Mobile TOC toggle button - visible below xl screens */}
      {!isOpen && (
        <button
          onClick={onOpen}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#2F6868',
            color: 'white',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: 'none',
            cursor: 'pointer',
          }}
          className="flex items-center justify-center hover:opacity-90 transition-opacity"
          aria-label="Open table of contents"
        >
          <List className="h-5 w-5" />
        </button>
      )}

      {/* Mobile TOC overlay - backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 200ms',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile TOC slide-in panel */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          zIndex: 9999,
          height: '100%',
          width: '320px',
          maxWidth: '85vw',
          backgroundColor: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border-light)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease-out',
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
            topItems={topItems}
            sections={sections}
            inheritedGroups={inheritedGroups}
            markdown={markdown}
            pageUrl={pageUrl}
            onItemClick={onClose}
          />
        </div>
      </nav>
    </>
  );

  // Use portal to render at document.body level for proper fixed positioning
  return createPortal(mobileContent, document.body);
}

/**
 * Main Table of Contents component
 */
export function TableOfContents({
  topItems,
  sections,
  inheritedGroups,
  markdown,
  pageUrl,
}: TableOfContentsProps) {
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
  const hasContent =
    (topItems && topItems.length > 0) ||
    sections.length > 0 ||
    (inheritedGroups && inheritedGroups.length > 0);

  if (!hasContent) {
    return null;
  }

  return (
    <>
      {/* Desktop TOC - visible on xl screens */}
      <nav
        className="hidden xl:block sticky top-[calc(var(--header-height)+2rem)] self-start w-toc shrink-0 pl-8 max-h-[calc(100vh-var(--header-height)-4rem)] overflow-y-auto scrollbar-hide"
        aria-label="On this page"
      >
        <TOCContent
          topItems={topItems}
          sections={sections}
          inheritedGroups={inheritedGroups}
          markdown={markdown}
          pageUrl={pageUrl}
        />
      </nav>

      {/* Mobile TOC - rendered via portal to document.body for proper fixed positioning */}
      <MobileTOC
        isOpen={isMobileOpen}
        onOpen={() => setIsMobileOpen(true)}
        onClose={() => setIsMobileOpen(false)}
        topItems={topItems}
        sections={sections}
        inheritedGroups={inheritedGroups}
        markdown={markdown}
        pageUrl={pageUrl}
      />
    </>
  );
}
