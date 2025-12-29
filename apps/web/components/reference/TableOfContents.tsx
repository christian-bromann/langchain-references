"use client";

/**
 * Table of Contents Component
 *
 * Displays an "On This Page" navigation sidebar for symbol pages.
 * Shows sections like Constructors, Properties, Methods, etc. in collapsible groups.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
 * Collapsible section component
 */
function CollapsibleSection({ section }: { section: TOCSection }) {
  const [isOpen, setIsOpen] = useState(true);

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
            isOpen && "rotate-180"
          )}
        />
        <span className="truncate">{section.title}</span>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pl-4 space-y-0">
          {section.items.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToId(item.id)}
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
 * Nested collapsible section for inherited members
 */
function NestedCollapsibleSection({ section }: { section: TOCSection }) {
  const [isOpen, setIsOpen] = useState(false);

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
            isOpen && "rotate-180"
          )}
        />
        <SectionIcon title={section.title} size="small" />
        <span className="truncate">{section.title}</span>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pl-4 space-y-0">
          {section.items.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToId(item.id)}
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
 * Collapsible inherited group component (top level for base class)
 */
function InheritedGroupSection({ group }: { group: TOCInheritedGroup }) {
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
            isOpen && "rotate-180"
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
          isOpen ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="pl-4 space-y-0">
          {group.sections.map((section) => (
            <NestedCollapsibleSection key={section.id} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
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
        icon.color
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
        color
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

  return (
    <span className={cn("text-xs shrink-0", icon.color)}>{icon.icon}</span>
  );
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
  // Don't render if there's nothing to show
  const hasContent =
    (topItems && topItems.length > 0) ||
    sections.length > 0 ||
    (inheritedGroups && inheritedGroups.length > 0);

  if (!hasContent) {
    return null;
  }

  return (
    <nav
      className="hidden xl:block sticky top-[calc(var(--header-height)+2rem)] self-start w-toc shrink-0 pl-8 max-h-[calc(100vh-var(--header-height)-4rem)] overflow-y-auto scrollbar-hide"
      aria-label="On this page"
    >
      <div className="pl-4 pb-8">
        {/* AI Actions - Copy page button and context menu */}
        {markdown && pageUrl && (
          <div className="flex items-center mb-4">
            <CopyPageButton markdown={markdown} />
            <PageContextMenu pageUrl={pageUrl} markdown={markdown} />
          </div>
        )}

        <h3 className="text-sm font-semibold text-foreground mb-3">
          On This Page
        </h3>

        {/* Top-level items (examples, etc.) */}
        {topItems && topItems.length > 0 && (
          <div className="space-y-0 mb-2">
            {topItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToId(item.id)}
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
              <CollapsibleSection key={section.id} section={section} />
            ))}
          </div>
        )}

        {/* Inherited member groups */}
        {inheritedGroups && inheritedGroups.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
            {inheritedGroups.map((group) => (
              <InheritedGroupSection key={group.id} group={group} />
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
