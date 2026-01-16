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
 * Get package URL slug from published name
 */
function getPackageSlug(pkg: Package, language: "python" | "javascript"): string {
  if (language === "javascript") {
    // Convert @langchain/core -> langchain-core
    return pkg.publishedName.replace(/^@/, "").replace(/\//g, "-").replace(/_/g, "-").toLowerCase();
  }
  // Convert langchain_core -> langchain-core
  return pkg.publishedName.replace(/_/g, "-").toLowerCase();
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
  packageSlug: string,
): SidebarPackage["items"] {
  const modules: { name: string; path: string; kind: SymbolKind }[] = [];
  const slugEntries = Object.entries(routingMap.slugs || {});

  // Extract modules from routing map slugs
  // Slugs are formatted as "{kindPlural}/{symbolName}" (e.g., "modules/hub", "classes/ChatModel")
  for (const [slug, entry] of slugEntries) {
    if (entry.kind !== "module") continue;

    // The slug format is "modules/{moduleName}" for JavaScript
    // For Python, slug might be "langchain_core.messages" (qualified name)
    let name: string;
    if (language === "javascript") {
      // Extract module name from slug like "modules/hub" -> "hub"
      if (slug.startsWith("modules/")) {
        name = slug.slice("modules/".length);
      } else {
        // Fallback: use slug as-is if it doesn't match expected format
        name = slug;
      }
      // Skip nested modules (e.g., "modules/agents/toolkits" -> "agents/toolkits" still has /)
      if (name.includes("/")) continue;
    } else {
      // For Python, take the last part after the dot
      name = slug.includes(".") ? slug.split(".").pop()! : slug;
    }

    // Skip if name still contains path separators
    if (name.includes("/") || name.includes(".")) continue;

    // Skip index modules
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
  projectId: string,
): Promise<SidebarPackage[]> {
  const buildId = await getBuildIdForLanguage(language, projectId);
  if (!buildId) return [];

  const manifest = await getManifestData(buildId);
  if (!manifest) return [];

  // Filter by language/ecosystem AND by project
  const packages = manifest.packages.filter((p) => {
    const matchesLanguage =
      language === "python"
        ? p.language === "python"
        : p.language === "typescript" || p.ecosystem === "javascript";

    // Filter by project (using extended package info)
    const pkg = p as { project?: string };
    const matchesProject = pkg.project === projectId;

    return matchesLanguage && matchesProject;
  });

  const sidebarPackages: SidebarPackage[] = [];

  for (const pkg of packages) {
    const slug = getPackageSlug(pkg, language);

    // Use each package's own buildId (package-level architecture)
    const pkgBuildId = (pkg as { buildId?: string }).buildId || buildId;

    // For Python, only show package names in sidebar (no sub-module listing)
    // since Python packages have a different export structure with many modules
    let items: SidebarPackage["items"] = [];
    if (language === "javascript") {
      // Use routing map instead of full symbols (~100KB vs ~14MB)
      const routingMap = await getRoutingMapData(pkgBuildId, pkg.packageId);
      items = routingMap ? buildNavItemsFromRouting(routingMap, language, slug) : [];
    }

    sidebarPackages.push({
      id: pkg.packageId,
      name: pkg.displayName,
      path: `/${language}/${slug}`,
      items,
      project: projectId,
    });
  }

  return sidebarPackages;
}

/**
 * Load sidebar data for a language from ALL enabled projects
 */
async function loadSidebarPackages(language: "python" | "javascript"): Promise<SidebarPackage[]> {
  const projects = getEnabledProjects();

  // Load packages from all projects in parallel
  const projectPackages = await Promise.all(
    projects.map((project) => loadSidebarPackagesForProject(language, project.id)),
  );

  // Deduplicate packages by id - the same package (e.g., @langchain/core) may exist
  // in multiple project manifests, but we only want to show it once in the sidebar
  const seen = new Set<string>();
  const allPackages: SidebarPackage[] = [];

  for (const packages of projectPackages) {
    for (const pkg of packages) {
      if (!seen.has(pkg.id)) {
        seen.add(pkg.id);
        allPackages.push(pkg);
      }
    }
  }

  return allPackages;
}

export async function SidebarLoader() {
  const [pythonPackages, javascriptPackages] = await Promise.all([
    loadSidebarPackages("python"),
    loadSidebarPackages("javascript"),
  ]);

  return <Sidebar pythonPackages={pythonPackages} javascriptPackages={javascriptPackages} />;
}
