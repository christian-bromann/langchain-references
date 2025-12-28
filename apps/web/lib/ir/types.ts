/**
 * IR Types - Re-exports and extensions for IR schema
 */

export type {
  Manifest,
  Package,
  BuildInfo,
  SymbolRecord,
  SymbolKind,
  Language,
  Visibility,
  Stability,
  SymbolDocs,
  SymbolParam,
  SymbolSource,
  MemberReference,
  SearchRecord,
  SearchIndex,
  RoutingMap,
  SlugEntry,
  NavTree,
} from "@langchain/ir-schema";

/**
 * Resolved symbol with full data
 */
export interface ResolvedSymbol {
  symbol: import("@langchain/ir-schema").SymbolRecord;
  package: import("@langchain/ir-schema").Package;
  buildId: string;
}

/**
 * Navigation item for sidebar
 */
export interface NavItem {
  id: string;
  name: string;
  path: string;
  kind: import("@langchain/ir-schema").SymbolKind;
  children?: NavItem[];
}

/**
 * Package navigation for sidebar
 */
export interface PackageNav {
  packageId: string;
  packageName: string;
  language: import("@langchain/ir-schema").Language;
  items: NavItem[];
}

