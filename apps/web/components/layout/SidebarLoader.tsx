/**
 * Sidebar Loader - Server Component
 *
 * Loads package data from IR and passes it to the client Sidebar component.
 * Loads packages from ALL enabled projects (langchain, langgraph, deepagent).
 *
 * OPTIMIZATION: Uses lightweight routing maps (~100KB) instead of full symbol
 * files (~14MB) to build navigation. This dramatically reduces build times.
 */

import { Sidebar, type SidebarPackage } from "./Sidebar";
import { getBuildIdForLanguage, getManifestData, getRoutingMapData } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";
import type { Package, RoutingMap, SymbolKind } from "@/lib/ir/types";

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
 * Build navigation items from routing map.
 *
 * Uses the lightweight routing map instead of full symbols.
 * Only extracts module names for sidebar navigation.
 */
function buildNavItemsFromRouting(
  routingMap: RoutingMap,
  language: "python" | "javascript",
  packageSlug: string
): SidebarPackage["items"] {
  const modules: { name: string; path: string; kind: SymbolKind }[] = [];

  // Extract top-level modules from routing map slugs
  for (const [slug, entry] of Object.entries(routingMap.slugs)) {
    if (entry.kind !== "module") continue;

    // Get the module name from the slug
    // For JS: slug is usually the module name directly
    // For Python: slug might be qualified like "langchain_core.messages"
    const name = slug.includes(".") ? slug.split(".").pop()! : slug;

    // Only show top-level modules (no nested slashes or dots)
    if (name.includes("/")) continue;
    if (name.includes(".")) continue;

    // Skip index modules for now (we can't tell if they have exports without full data)
    // Users can click the package name to explore
    if (name === "index") continue;

    modules.push({
      name,
      path: `/${language}/${packageSlug}/${name}`,
      kind: entry.kind,
    });
  }

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

  // Sort alphabetically
  uniqueModules.sort((a, b) => a.name.localeCompare(b.name));

  return uniqueModules;
}

/**
 * Load sidebar data for a language from a specific project
 */
async function loadSidebarPackagesForProject(
  language: "python" | "javascript",
  projectId: string
): Promise<SidebarPackage[]> {
  const buildId = await getBuildIdForLanguage(language, projectId);
  if (!buildId) {
    console.log(`[SidebarLoader] No buildId for ${language}/${projectId}`);
    return [];
  }

  const manifest = await getManifestData(buildId);
  if (!manifest) {
    console.log(`[SidebarLoader] No manifest for buildId ${buildId}`);
    return [];
  }

  const packages = manifest.packages.filter((p) =>
    language === "python"
      ? p.language === "python"
      : p.language === "typescript" || p.ecosystem === "javascript"
  );

  const irLanguage = language === "python" ? "python" : "typescript";
  const sidebarPackages: SidebarPackage[] = [];

  for (const pkg of packages) {
    const slug = getPackageSlug(pkg, language);

    // For Python, only show package names in sidebar (no sub-module listing)
    // since Python packages have a different export structure with many modules
    let items: SidebarPackage["items"] = [];
    if (language === "javascript") {
      // Use routing map instead of full symbols (~100KB vs ~14MB)
      const routingMap = await getRoutingMapData(buildId, pkg.packageId, pkg.displayName, irLanguage);
      if (!routingMap) {
        console.log(`[SidebarLoader] No routing map for ${pkg.packageId} (buildId: ${buildId})`);
      }
      items = routingMap ? buildNavItemsFromRouting(routingMap, language, slug) : [];
      console.log(`[SidebarLoader] ${pkg.displayName}: ${items.length} nav items`);
    }

    sidebarPackages.push({
      id: pkg.packageId,
      name: pkg.displayName,
      path: `/${language}/${slug}`,
      items,
    });
  }

  return sidebarPackages;
}

/**
 * Load sidebar data for a language from ALL enabled projects
 */
async function loadSidebarPackages(
  language: "python" | "javascript"
): Promise<SidebarPackage[]> {
  const projects = getEnabledProjects();
  const allPackages: SidebarPackage[] = [];

  // Load packages from all projects in parallel
  const projectPackages = await Promise.all(
    projects.map((project) => loadSidebarPackagesForProject(language, project.id))
  );

  for (const packages of projectPackages) {
    allPackages.push(...packages);
  }

  return allPackages;
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
