/**
 * Sidebar Loader - Server Component
 *
 * Loads package data from IR and passes it to the client Sidebar component.
 */

import { Sidebar, type SidebarPackage } from "./Sidebar";
import { getBuildIdForLanguage, getManifestData, getSymbols } from "@/lib/ir/loader";
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
 *
 * Strategy:
 * - If a package has named exports (sub-modules like `hub`, `chat_models/universal`),
 *   list them in the sidebar with `index` first.
 * - If a package doesn't have named exports (just exports classes/functions from a
 *   single entry point), return empty items - users click the package name to explore.
 * - Hide `index` modules that don't have any exports (no members).
 */
function buildNavItems(
  symbols: SymbolRecord[],
  language: "python" | "javascript",
  packageSlug: string
): SidebarPackage["items"] {
  // Get top-level modules (named exports / sub-modules)
  const modules = symbols
    .filter(
      (s) =>
        s.kind === "module" &&
        s.tags?.visibility === "public" &&
        // Only show top-level modules (no nested slashes for JS, no nested dots for Python)
        !s.name.includes("/") &&
        !s.name.slice(s.name.indexOf(".") + 1).includes(".") &&
        // Hide `index` modules without exports (no members)
        !(s.name === "index" && (!s.members || s.members.length === 0))
    )
    .map((s) => ({
      name: s.name,
      path: `/${language}/${packageSlug}/${s.name}`,
      kind: s.kind,
    }));

  // If no modules (named exports), return empty - the package link itself is enough
  // Users can click the package name to explore its exports
  if (modules.length === 0) {
    return [];
  }

  // Deduplicate by path
  const seen = new Set<string>();
  const uniqueModules = modules.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });

  // Sort: `index` first, then alphabetically
  uniqueModules.sort((a, b) => {
    if (a.name === "index") return -1;
    if (b.name === "index") return 1;
    return a.name.localeCompare(b.name);
  });

  return uniqueModules;
}

/**
 * Load sidebar data for a language
 */
async function loadSidebarPackages(
  language: "python" | "javascript"
): Promise<SidebarPackage[]> {
  const buildId = await getBuildIdForLanguage(language);
  if (!buildId) return [];

  const manifest = await getManifestData(buildId);
  if (!manifest) return [];

  const packages = manifest.packages.filter((p) =>
    language === "python"
      ? p.language === "python"
      : p.language === "typescript" || p.ecosystem === "javascript"
  );

  const sidebarPackages: SidebarPackage[] = [];

  for (const pkg of packages) {
    const slug = getPackageSlug(pkg, language);
    const result = await getSymbols(buildId, pkg.packageId);
    const items = result?.symbols ? buildNavItems(result.symbols, language, slug) : [];

    sidebarPackages.push({
      id: pkg.packageId,
      name: pkg.displayName,
      path: `/${language}/${slug}`,
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
