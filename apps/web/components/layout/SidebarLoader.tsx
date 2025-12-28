/**
 * Sidebar Loader - Server Component
 *
 * Loads package data from IR and passes it to the client Sidebar component.
 */

import { Sidebar, type SidebarPackage } from "./Sidebar";
import {
  getLocalLatestBuildId,
  getLocalManifest,
  getLocalPackageSymbols,
} from "@/lib/ir/loader";
import type { Package, SymbolRecord } from "@/lib/ir/types";

/**
 * Get package URL slug from display name
 */
function getPackageSlug(pkg: Package, language: "python" | "javascript"): string {
  if (language === "javascript") {
    // Convert @langchain/core -> langchain-core
    return pkg.displayName.replace(/^@/, "").replace(/\//g, "-");
  }
  // Convert langchain_core -> langchain-core
  return pkg.displayName.replace(/_/g, "-");
}

/**
 * Build navigation items from symbols
 */
function buildNavItems(
  symbols: SymbolRecord[],
  language: "python" | "javascript",
  packageSlug: string
): SidebarPackage["items"] {
  // Get top-level modules (for hierarchical display)
  const modules = symbols
    .filter(
      (s) =>
        s.kind === "module" &&
        s.tags?.visibility === "public" &&
        // Only show top-level modules (one level deep)
        !s.qualifiedName.slice(s.qualifiedName.indexOf(".") + 1).includes(".")
    )
    .slice(0, 20) // Limit to avoid overwhelming the sidebar
    .map((s) => ({
      name: s.name,
      path: `/${language}/${packageSlug}/${s.name}`,
      kind: s.kind,
    }));

  // If no modules, show top-level classes
  if (modules.length === 0) {
    const classes = symbols
      .filter((s) => s.kind === "class" && s.tags?.visibility === "public")
      .slice(0, 20)
      .map((s) => ({
        name: s.name,
        path: `/${language}/${packageSlug}/${s.name}`,
        kind: s.kind,
      }));
    return classes;
  }

  return modules;
}

/**
 * Load sidebar data for a language
 */
async function loadSidebarPackages(
  language: "python" | "javascript"
): Promise<SidebarPackage[]> {
  const buildId = await getLocalLatestBuildId(language);
  if (!buildId) {
    return [];
  }

  const manifest = await getLocalManifest(buildId);
  if (!manifest) {
    return [];
  }

  const packages = manifest.packages.filter((p) =>
    language === "python"
      ? p.language === "python"
      : p.language === "typescript" || p.ecosystem === "javascript"
  );

  const sidebarPackages: SidebarPackage[] = [];

  for (const pkg of packages) {
    const slug = getPackageSlug(pkg, language);
    const result = await getLocalPackageSymbols(buildId, pkg.packageId);

    const items = result?.symbols
      ? buildNavItems(result.symbols, language, slug)
      : [];

    sidebarPackages.push({
      id: pkg.packageId,
      name: pkg.displayName,
      items,
    });
  }

  return sidebarPackages;
}

export async function SidebarLoader() {
  const [pythonPackages, javascriptPackages] = await Promise.all([
    loadSidebarPackages("python"),
    loadSidebarPackages("javascript"),
  ]);

  return (
    <Sidebar
      pythonPackages={pythonPackages}
      javascriptPackages={javascriptPackages}
    />
  );
}

