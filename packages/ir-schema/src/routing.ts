/**
 * Routing Schema
 *
 * Defines the routing map structure used to resolve URL slugs
 * to symbol reference IDs.
 */

import type { Language, SymbolKind } from "./symbol.js";

/**
 * The routing map for a package.
 */
export interface RoutingMap {
  /** Package ID this routing map is for */
  packageId: string;

  /** Package display name */
  displayName: string;

  /** Language */
  language: Language;

  /** URL slug → symbol entry mapping */
  slugs: Record<string, SlugEntry>;
}

/**
 * An entry in the routing map.
 */
export interface SlugEntry {
  /** Symbol reference ID */
  refId: string;

  /** Symbol kind */
  kind: SymbolKind;

  /** Page type for rendering */
  pageType: PageType;

  /** Title for the page */
  title: string;

  /** Parent slug (for hierarchy) */
  parent?: string;

  /** Child slugs (for navigation) */
  children?: string[];
}

/**
 * Page types determine which component to use for rendering.
 */
export type PageType =
  | "module"
  | "class"
  | "function"
  | "interface"
  | "type"
  | "enum"
  | "variable";

/**
 * Navigation tree structure for sidebar rendering.
 */
export interface NavTree {
  /** Root nodes of the navigation tree */
  roots: NavNode[];
}

/**
 * A node in the navigation tree.
 */
export interface NavNode {
  /** Display label */
  label: string;

  /** URL slug (relative to package) */
  slug: string;

  /** Symbol kind for icon */
  kind: SymbolKind;

  /** Child nodes */
  children?: NavNode[];

  /** Whether this is a group header (not a link) */
  isGroup?: boolean;
}

/**
 * Breadcrumb item for page navigation.
 */
export interface BreadcrumbItem {
  /** Display label */
  label: string;

  /** URL href */
  href: string;

  /** Whether this is the current page */
  isCurrent?: boolean;
}





