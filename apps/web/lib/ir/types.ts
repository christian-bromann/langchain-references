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
  TypeReference,
  SearchRecord,
  SearchIndex,
  RoutingMap,
  SlugEntry,
  NavTree,
  RelatedDocEntry,
  RelatedDocEntryWithCount,
  RelatedDocsMap,
} from "@langchain/ir-schema";

import type { SymbolRecord, Package, SymbolKind, Language } from "@langchain/ir-schema";

/**
 * Resolved symbol with full data
 */
export interface ResolvedSymbol {
  symbol: SymbolRecord;
  package: Package;
  buildId: string;
}

/**
 * Navigation item for sidebar
 */
export interface NavItem {
  id: string;
  name: string;
  path: string;
  kind: SymbolKind;
  children?: NavItem[];
}

/**
 * Package navigation for sidebar
 */
export interface PackageNav {
  packageId: string;
  packageName: string;
  language: Language;
  items: NavItem[];
}
