/**
 * Legacy Reference URL Redirect Helpers
 *
 * Pure path-mapping helpers (no Next.js / no fetch).
 * The middleware uses these to translate legacy Python + TypeDoc URL schemas
 * into the new canonical routes under /python and /javascript.
 */

export type LegacyRedirectResult =
  | {
      /** Redirect target pathname (no origin, no query) */
      pathname: string;
    }
  | {
      /** Redirect target pathname (no origin, no query) */
      pathname: string;
      /**
       * Optional metadata for follow-up work in middleware.
       * Used for best-effort v0.3 version resolution.
       */
      meta: {
        v03: {
          /** Canonical python package name (snake_case) */
          packageName: string;
          /** Canonical packageId (matches our IR ids) */
          packageId: string;
        };
      };
    };

const TYPEDOC_KINDS = new Set([
  "modules",
  "classes",
  "interfaces",
  "functions",
  "type-aliases",
  "enumerations",
  "variables",
  "namespaces",
]);

const TYPEDOC_INDEX_PAGES = new Set([
  "modules",
  "classes",
  "interfaces",
  "functions",
  "type-aliases",
  "enumerations",
  "variables",
  "namespaces",
]);

const TYPEDOC_SHORT_MODULE_MAP: Record<string, string> = {
  core: "langchain-core",
  openai: "langchain-openai",
  aws: "langchain-aws",
  community: "langchain-community",
  classic: "langchain-classic",
  textsplitters: "langchain-textsplitters",
  langgraph: "langchain-langgraph",
};

function stripTrailingIndexHtml(pathname: string): string {
  return pathname.endsWith("/index.html") ? pathname.slice(0, -"/index.html".length) : pathname;
}

function stripTrailingHtml(pathname: string): string {
  return pathname.endsWith(".html") ? pathname.slice(0, -".html".length) : pathname;
}

function stripTrailingSlashExceptRoot(pathname: string, root: string): string {
  if (pathname === root || pathname === `${root}/`) return root;
  return pathname.endsWith("/") ? pathname.replace(/\/+$/, "") : pathname;
}

function pythonPackageSlugToCanonical(pkg: string): string {
  return pkg.replace(/_/g, "-").toLowerCase();
}

function jsPackageTokenToSlug(pkgToken: string): string {
  const token = pkgToken.replace(/^_/, "");
  // Most TypeDoc packages use underscore-separated "langchain_*" tokens.
  return token.replace(/_/g, "-").toLowerCase();
}

function packageNameToIdPython(packageName: string): string {
  const normalized = packageName
    .replace(/-/g, "_")
    .replace(/^@/, "")
    .replace(/\//g, "_")
    .toLowerCase();
  return `pkg_py_${normalized}`;
}

/**
 * Map a legacy Python docs pathname into the new /python routes.
 */
export function mapLegacyPythonPath(pathname: string): LegacyRedirectResult | null {
  // Canonicalize common suffixes
  let p = pathname;
  p = stripTrailingIndexHtml(p);
  p = stripTrailingHtml(p);
  p = stripTrailingSlashExceptRoot(p, "/python");

  // /python or /python/ -> /python
  if (p === "/python") {
    return { pathname: "/python" };
  }

  // /python/api_reference(.html) isn't a real page in the new site
  if (p === "/python/api_reference") {
    return { pathname: "/python" };
  }

  if (!p.startsWith("/python/")) return null;

  const segments = p.split("/").filter(Boolean); // ["python", ...]
  if (segments.length < 2) return { pathname: "/python" };

  // /python/integrations -> /python
  if (segments[1] === "integrations") {
    if (segments.length === 2) return { pathname: "/python" };

    const pkg = segments[2] ?? "";
    if (!pkg) return { pathname: "/python" };

    const pkgSlug = pythonPackageSlugToCanonical(pkg);
    const rest = segments.slice(3); // remaining path after pkg
    const target = rest.length > 0 ? `/python/${pkgSlug}/${rest.join("/")}` : `/python/${pkgSlug}`;
    return { pathname: target };
  }

  // Default: /python/<py-package>/<...>
  const pkg = segments[1]!;
  const pkgSlug = pythonPackageSlugToCanonical(pkg);
  const rest = segments.slice(2);
  const target = rest.length > 0 ? `/python/${pkgSlug}/${rest.join("/")}` : `/python/${pkgSlug}`;

  // Only redirect if something actually changes (avoid loops)
  if (target === pathname) return null;
  return { pathname: target };
}

/**
 * Map a legacy TypeDoc (JavaScript) pathname into the new /javascript routes.
 */
export function mapLegacyJavaScriptTypeDocPath(pathname: string): LegacyRedirectResult | null {
  let p = pathname;
  p = stripTrailingIndexHtml(p);
  p = stripTrailingSlashExceptRoot(p, "/javascript");

  // /javascript or /javascript/ -> /javascript
  if (p === "/javascript") {
    return { pathname: "/javascript" };
  }

  // /javascript/<index>.html -> /javascript
  if (p.startsWith("/javascript/") && p.endsWith(".html")) {
    const base = p.slice("/javascript/".length);
    if (!base.includes("/")) {
      const name = base.slice(0, -".html".length);
      if (TYPEDOC_INDEX_PAGES.has(name)) {
        return { pathname: "/javascript" };
      }
    }
  }

  if (!p.startsWith("/javascript/")) return null;

  const segments = p.split("/").filter(Boolean); // ["javascript", ...]
  if (segments.length < 2) return { pathname: "/javascript" };

  const kind = segments[1]!;
  if (!TYPEDOC_KINDS.has(kind)) return null;

  // Expect /javascript/<kind>/<reflection>.html (or without .html due to canonicalization upstream)
  const reflectionWithMaybeHtml = segments.slice(2).join("/");
  if (!reflectionWithMaybeHtml) {
    // /javascript/modules (directory) is not meaningful in the new site
    return { pathname: "/javascript" };
  }

  const reflection = stripTrailingHtml(`/${reflectionWithMaybeHtml}`).slice(1);
  if (!reflection) return { pathname: "/javascript" };

  const parts = reflection.split(".");
  const head = parts[0] || "";
  const tail = parts.slice(1);

  const pkgToken = head.replace(/^_/, "");

  // Handle optional "short module" pages like modules/core.html
  if (kind === "modules" && tail.length === 0) {
    const mapped = TYPEDOC_SHORT_MODULE_MAP[pkgToken.toLowerCase()];
    if (mapped) return { pathname: `/javascript/${mapped}` };
  }

  const packageSlug = jsPackageTokenToSlug(pkgToken);

  if (tail.length === 0) {
    return { pathname: `/javascript/${packageSlug}` };
  }

  const symbolSegments: string[] = [];
  for (const t of tail) {
    // TypeDoc encodes module paths with underscores in the token.
    // Split underscores into path segments and keep original casing.
    symbolSegments.push(...t.split("_").filter(Boolean));
  }

  if (symbolSegments.length === 0) {
    return { pathname: `/javascript/${packageSlug}` };
  }

  return { pathname: `/javascript/${packageSlug}/${symbolSegments.join("/")}` };
}

/**
 * Map legacy /v0.3/python/... paths into the new /python schema.
 *
 * Note: This function only maps the pathname. The middleware may optionally
 * add a ?v= query param after resolving an available 0.3.x version.
 */
export function mapLegacyPythonV03Path(pathname: string): LegacyRedirectResult | null {
  let p = pathname;
  p = stripTrailingIndexHtml(p);
  p = stripTrailingSlashExceptRoot(p, "/v0.3/python");

  if (p === "/v0.3/python") {
    return { pathname: "/python" };
  }

  if (!p.startsWith("/v0.3/python/")) return null;

  // Example:
  // /v0.3/python/core/indexing/langchain_core.indexing.api.index.html
  // -> /python/langchain-core/indexing/api/index
  const segments = p.split("/").filter(Boolean); // ["v0.3","python",...]
  const after = segments.slice(2); // remove v0.3 + python
  if (after.length === 0) return { pathname: "/python" };

  const section = after[0]!;
  const sectionToPkgSlug: Record<string, string> = {
    core: "langchain-core",
    langchain: "langchain",
    community: "langchain-community",
    openai: "langchain-openai",
  };

  const pkgSlug = sectionToPkgSlug[section] ?? null;
  if (!pkgSlug) {
    return { pathname: "/python" };
  }

  const packageName = pkgSlug.replace(/-/g, "_");
  const packageId = packageNameToIdPython(packageName);

  // If we have a dot-qualified filename, prefer it and ignore directory prefixes (avoids duplication).
  const last = after[after.length - 1] ?? "";
  const lastNoHtml = stripTrailingHtml(last);
  const hasDotQualified = lastNoHtml.includes(".");

  let symbolSegments: string[] = [];

  if (hasDotQualified) {
    let dotPath = lastNoHtml;
    // Strip package prefix if present
    const prefix = `${packageName}.`;
    if (dotPath.startsWith(prefix)) {
      dotPath = dotPath.slice(prefix.length);
    }
    symbolSegments = dotPath.split(".").filter(Boolean);
  } else {
    symbolSegments = after.slice(1); // drop section
  }

  const target =
    symbolSegments.length > 0
      ? `/python/${pkgSlug}/${symbolSegments.join("/")}`
      : `/python/${pkgSlug}`;

  return {
    pathname: target,
    meta: { v03: { packageName, packageId } },
  };
}

/**
 * Main entry: detect and map legacy paths to canonical routes.
 */
export function mapLegacyReferencePath(pathname: string): LegacyRedirectResult | null {
  // v0.3 must be handled before /python checks
  const v03 = mapLegacyPythonV03Path(pathname);
  if (v03) return v03;

  const py = mapLegacyPythonPath(pathname);
  if (py) return py;

  const js = mapLegacyJavaScriptTypeDocPath(pathname);
  if (js) return js;

  return null;
}
