/**
 * Sidebar Loader - Server Component
 *
 * Loads package data from IR and passes it to the client Sidebar component.
 * Loads packages from ALL enabled projects (langchain, langgraph, deepagent).
 *
 * OPTIMIZATION: Uses lightweight routing maps (~100KB) instead of full symbol
 * files (~14MB) to build navigation. This dramatically reduces build times.
 */

import { Sidebar, type SidebarPackage, type SidebarSubpage } from "./Sidebar";
import { getBuildIdForLanguage, getManifestData, getRoutingMapData, getPackageInfoV2, getProjectPackageIndex } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";
import type { Package, RoutingMap, SymbolKind } from "@/lib/ir/types";
import type { Language } from "@langchain/ir-schema";

/**
 * Get package URL slug from published name
 */
function getPackageSlug(pkg: Package, language: Language): string {
  const name = pkg.publishedName || pkg.displayName || pkg.packageId || "";

  if (language === "javascript") {
    // Convert @langchain/core -> langchain-core
    return name.replace(/^@/, "").replace(/\//g, "-").replace(/_/g, "-").toLowerCase();
  }
  if (language === "java") {
    // Convert io.langchain.langsmith -> langsmith
    const parts = name.split(".");
    return parts[parts.length - 1].replace(/_/g, "-").toLowerCase();
  }
  if (language === "go") {
    // Convert github.com/langchain-ai/langsmith-go -> langsmith
    const parts = name.split("/");
    return parts[parts.length - 1].replace(/_/g, "-").replace(/-go$/, "").toLowerCase();
  }
  // Python: Convert langchain_core -> langchain-core
  return name.replace(/_/g, "-").toLowerCase();
}

/**
 * Build navigation items from routing map.
 *
 * Uses the lightweight routing map instead of full symbols.
 * Only extracts module names for sidebar navigation.
 */
function buildNavItemsFromRouting(
  routingMap: RoutingMap,
  language: Language,
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
  language: Language,
  projectId: string,
): Promise<SidebarPackage[]> {
  // First try package-level architecture (Java/Go use this)
  const packageIndex = await getProjectPackageIndex(projectId, language);
  if (packageIndex && Object.keys(packageIndex.packages).length > 0) {
    // Package-level architecture: build sidebar from package index
    const sidebarPackages: SidebarPackage[] = [];

    for (const [packageId, pkgPointer] of Object.entries(packageIndex.packages)) {
      const pkgBuildId = pkgPointer.buildId;

      // Load package info to get display name and subpages
      const packageInfoV2 = await getPackageInfoV2(packageId, pkgBuildId);
      const displayName = packageInfoV2?.displayName || pkgPointer.displayName || pkgPointer.publishedName;

      // Create a minimal Package-like object for getPackageSlug
      const pkg = {
        packageId,
        displayName,
        publishedName: pkgPointer.publishedName,
        language: language === "javascript" ? "typescript" : language,
        ecosystem: language,
        version: pkgPointer.version || "0.0.0",
      } as Package;

      const slug = getPackageSlug(pkg, language);

      // For Java/Go, only show package names in sidebar (no sub-module listing)
      let items: SidebarPackage["items"] = [];
      if (language === "javascript") {
        const routingMap = await getRoutingMapData(pkgBuildId, packageId);
        items = routingMap ? buildNavItemsFromRouting(routingMap, language, slug) : [];
      }

      // Load subpages from package info if available
      let subpages: SidebarSubpage[] | undefined;
      if (packageInfoV2?.subpages && Array.isArray(packageInfoV2.subpages)) {
        subpages = packageInfoV2.subpages.map((sp: { slug: string; title: string }) => ({
          slug: sp.slug,
          title: sp.title,
          path: `/${language}/${slug}/${sp.slug}`,
        }));
      }

      sidebarPackages.push({
        id: packageId,
        name: displayName,
        path: `/${language}/${slug}`,
        items,
        project: projectId,
        subpages,
      });
    }

    return sidebarPackages;
  }

  // Fallback to manifest-based architecture (Python/JavaScript)
  const buildId = await getBuildIdForLanguage(language, projectId);
  if (!buildId) return [];

  const manifest = await getManifestData(buildId);
  if (!manifest) return [];

  // Filter by language/ecosystem AND by project
  const packages = manifest.packages.filter((p) => {
    let matchesLanguage = false;
    if (language === "python") {
      matchesLanguage = p.language === "python";
    } else if (language === "javascript") {
      matchesLanguage = p.language === "typescript" || p.ecosystem === "javascript";
    } else if (language === "java") {
      matchesLanguage = p.language === "java";
    } else if (language === "go") {
      matchesLanguage = p.language === "go";
    }

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

    // For Python/Java/Go, only show package names in sidebar (no sub-module listing)
    // since these packages have a different export structure with many modules
    // JavaScript/TypeScript packages show submodule navigation
    let items: SidebarPackage["items"] = [];
    if (language === "javascript") {
      // Use routing map instead of full symbols (~100KB vs ~14MB)
      const routingMap = await getRoutingMapData(pkgBuildId, pkg.packageId);
      items = routingMap ? buildNavItemsFromRouting(routingMap, language, slug) : [];
    }

    // Load subpages from package info if available
    let subpages: SidebarSubpage[] | undefined;
    const packageInfoV2 = await getPackageInfoV2(pkg.packageId, pkgBuildId);
    if (packageInfoV2?.subpages && Array.isArray(packageInfoV2.subpages)) {
      subpages = packageInfoV2.subpages.map((sp: { slug: string; title: string }) => ({
        slug: sp.slug,
        title: sp.title,
        path: `/${language}/${slug}/${sp.slug}`,
      }));
    }

    sidebarPackages.push({
      id: pkg.packageId,
      name: pkg.displayName,
      path: `/${language}/${slug}`,
      items,
      project: projectId,
      subpages,
    });
  }

  return sidebarPackages;
}

/**
 * Load sidebar data for a language from ALL enabled projects
 */
async function loadSidebarPackages(language: Language): Promise<SidebarPackage[]> {
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
  const [pythonPackages, javascriptPackages, javaPackages, goPackages] = await Promise.all([
    loadSidebarPackages("python"),
    loadSidebarPackages("javascript"),
    loadSidebarPackages("java"),
    loadSidebarPackages("go"),
  ]);

  return (
    <Sidebar
      pythonPackages={pythonPackages}
      javascriptPackages={javascriptPackages}
      javaPackages={javaPackages}
      goPackages={goPackages}
    />
  );
}

/**
 * Load navigation data for use by NavigationProvider.
 * This is exported so it can be called at the layout level.
 */
export async function loadNavigationData() {
  const [pythonPackages, javascriptPackages, javaPackages, goPackages] = await Promise.all([
    loadSidebarPackages("python"),
    loadSidebarPackages("javascript"),
    loadSidebarPackages("java"),
    loadSidebarPackages("go"),
  ]);

  return { pythonPackages, javascriptPackages, javaPackages, goPackages };
}
