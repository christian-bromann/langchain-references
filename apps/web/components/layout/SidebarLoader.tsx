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
import {
  getBuildIdForLanguage,
  getManifestData,
  getRoutingMapData,
  getPackageInfoV2,
  getProjectPackageIndex,
  normalizePackageId,
} from "@/lib/ir/loader";
import { getEnabledProjects, getProjectById } from "@/lib/config/projects";
import type { Package, RoutingMap, SymbolKind } from "@/lib/ir/types";
import { languageToSymbolLanguage, type Language } from "@langchain/ir-schema";

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
  // OPTIMIZATION: Early return if the project doesn't support this language.
  // This avoids ~20 unnecessary getBuildIdForLanguage calls per request.
  const project = getProjectById(projectId);
  if (!project) return [];

  const hasLanguageVariant = project.variants.some((v) => v.language === language && v.enabled);
  if (!hasLanguageVariant) return [];

  // OPTIMIZATION: For Python/JavaScript, skip package-level architecture and use manifest directly.
  // The manifest already contains displayName, subpages, exportPaths - no need to fetch each package.json.
  // Only use package-level architecture for Java/Go which don't have rich manifest data.
  const useManifestPath = language === "python" || language === "javascript";

  // First try package-level architecture (Java/Go use this)
  const packageIndex = !useManifestPath ? await getProjectPackageIndex(projectId, language) : null;
  if (packageIndex && Object.keys(packageIndex.packages).length > 0) {
    // OPTIMIZATION: Fetch all package data in parallel instead of sequential for-loop
    const packageEntries = Object.entries(packageIndex.packages);
    const symbolLanguage = languageToSymbolLanguage(language);

    const sidebarPackages = (
      await Promise.all(
        packageEntries.map(async ([pkgKey, pkgPointer]) => {
          try {
            // Skip packages without buildId
            if (!pkgPointer?.buildId) return null;

            const pkgBuildId = pkgPointer.buildId;
            // Use centralized normalization (handles @, /, -, . in package names)
            const packageId = pkgKey.startsWith("pkg_")
              ? pkgKey
              : normalizePackageId(pkgKey, language);

            // Fetch package info and routing map in parallel
            const [packageInfoV2, routingMap] = await Promise.all([
              getPackageInfoV2(packageId, pkgBuildId),
              language === "javascript"
                ? getRoutingMapData(pkgBuildId, packageId)
                : Promise.resolve(null),
            ]);

            const derivedName = pkgKey.replace(/^pkg_(py|js|java|go)_/, "").replace(/_/g, "-");
            const displayName = packageInfoV2?.displayName || derivedName;
            const publishedName = derivedName;

            const pkg = {
              packageId,
              displayName,
              publishedName,
              language: symbolLanguage,
              ecosystem: language,
              version: pkgPointer.version || "0.0.0",
            } as Package;

            const slug = getPackageSlug(pkg, language);

            // For JavaScript, use exportPaths from package info instead of routing map modules
            // For Python, use routing map modules
            let items: SidebarPackage["items"] = [];
            if (language !== "javascript") {
              items = routingMap ? buildNavItemsFromRouting(routingMap, language, slug) : [];
            } else if (packageInfoV2?.exportPaths && Array.isArray(packageInfoV2.exportPaths)) {
              // Use export paths for JavaScript packages
              items = packageInfoV2.exportPaths.map((ep: { slug: string; title: string }) => ({
                name: ep.title,
                path: `/${language}/${slug}/${ep.slug}`,
                kind: "module" as const,
              }));
            }

            let subpages: SidebarSubpage[] | undefined;
            if (packageInfoV2?.subpages && Array.isArray(packageInfoV2.subpages)) {
              subpages = packageInfoV2.subpages.map((sp: { slug: string; title: string }) => ({
                slug: sp.slug,
                title: sp.title,
                path: `/${language}/${slug}/${sp.slug}`,
              }));
            }

            return {
              id: packageId,
              name: displayName,
              path: `/${language}/${slug}`,
              items,
              project: projectId,
              subpages,
              _pkgKey: pkgKey, // Store for sorting
            };
          } catch (err) {
            // oxlint-disable-next-line no-console
            console.error(`[SidebarLoader] Error loading package ${pkgKey}:`, err);
            return null;
          }
        }),
      )
    ).filter((pkg) => pkg !== null) as (SidebarPackage & { _pkgKey: string })[];

    // Sort packages based on packageOrder from index
    if (packageIndex.packageOrder && packageIndex.packageOrder.length > 0) {
      const orderMap = new Map(packageIndex.packageOrder.map((name, idx) => [name, idx]));
      sidebarPackages.sort((a, b) => {
        const aOrder = orderMap.get(a._pkgKey);
        const bOrder = orderMap.get(b._pkgKey);
        // Packages in packageOrder come first, sorted by their order
        // Packages not in packageOrder come after, maintaining their original order
        if (aOrder !== undefined && bOrder !== undefined) {
          return aOrder - bOrder;
        }
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        return 0;
      });
    }

    // Remove internal _pkgKey before returning
    return sidebarPackages.map(({ _pkgKey, ...pkg }) => pkg);
  }

  // Fallback to manifest-based architecture (Python/JavaScript)
  // OPTIMIZATION: Use manifest data directly instead of fetching each package.json
  // The manifest already contains displayName, subpages, and exportPaths
  const buildId = await getBuildIdForLanguage(language, projectId);
  if (!buildId) {
    return [];
  }

  const manifest = await getManifestData(buildId);
  if (!manifest) {
    return [];
  }

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

  // OPTIMIZATION: Build sidebar directly from manifest data (NO additional fetches)
  // The manifest already has displayName, subpages, exportPaths for all packages
  const sidebarPackages = packages
    .map((pkg) => {
      try {
        const slug = getPackageSlug(pkg, language);

        // Use exportPaths directly from manifest (for JavaScript)
        // For Python, we skip module sub-items in sidebar for now (faster load)
        const manifestPkg = pkg as {
          exportPaths?: Array<{ slug: string; title: string }>;
          subpages?: Array<{ slug: string; title: string }>;
        };

        let items: SidebarPackage["items"] = [];
        if (
          language === "javascript" &&
          manifestPkg.exportPaths &&
          Array.isArray(manifestPkg.exportPaths)
        ) {
          items = manifestPkg.exportPaths.map((ep) => ({
            name: ep.title,
            path: `/${language}/${slug}/${ep.slug}`,
            kind: "module" as const,
          }));
        }

        let subpages: SidebarSubpage[] | undefined;
        if (manifestPkg.subpages && Array.isArray(manifestPkg.subpages)) {
          subpages = manifestPkg.subpages.map((sp) => ({
            slug: sp.slug,
            title: sp.title,
            path: `/${language}/${slug}/${sp.slug}`,
          }));
        }

        const derivedName = pkg.packageId.replace(/^pkg_(py|js|java|go)_/, "").replace(/_/g, "-");
        const pkgDisplayName = pkg.displayName || pkg.publishedName || derivedName;

        return {
          id: pkg.packageId,
          name: pkgDisplayName,
          path: `/${language}/${slug}`,
          items,
          project: projectId,
          subpages,
        };
      } catch (err) {
        // oxlint-disable-next-line no-console
        console.error(`[SidebarLoader] Error loading manifest package ${pkg.packageId}:`, err);
        return null;
      }
    })
    .filter((pkg) => pkg !== null) as SidebarPackage[];

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

/**
 * SidebarLoader - Server component that loads and renders the Sidebar.
 *
 * OPTIMIZATION: If you've already called loadNavigationData() at the layout level,
 * use SidebarWithData instead to avoid duplicate fetching.
 */
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
 * SidebarWithData - Renders sidebar with pre-loaded data.
 * Use this when navigation data is already loaded at the layout level.
 */
export function SidebarWithData({
  pythonPackages,
  javascriptPackages,
  javaPackages,
  goPackages,
}: {
  pythonPackages: SidebarPackage[];
  javascriptPackages: SidebarPackage[];
  javaPackages: SidebarPackage[];
  goPackages: SidebarPackage[];
}) {
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
 *
 * NOTE: This data should be loaded ONCE at the layout level and passed down.
 * Avoid calling both loadNavigationData() and SidebarLoader() - they fetch the same data.
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
