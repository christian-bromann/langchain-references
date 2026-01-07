/**
 * JavaScript Symbol Page
 *
 * Dynamic route handler for JavaScript/TypeScript package and symbol pages.
 * Parses the URL slug and renders the appropriate component.
 *
 * This page is statically generated at build time using generateStaticParams.
 */

import { notFound } from "next/navigation";
import { parseSlugWithLanguage } from "@/lib/utils/url";
import { SymbolPage } from "@/components/reference/SymbolPage";
import { PackagePage } from "@/components/reference/PackagePage";
import { getStaticParamsForLanguage } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";

interface Props {
  params: Promise<{
    slug: string[];
  }>;
}

/**
 * Generate static params for all JavaScript packages and symbols.
 * This enables static generation (SSG) for all pages at build time.
 * Generates params for ALL enabled projects (langchain, langgraph, deepagent).
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  console.log("[generateStaticParams:js] Starting static param generation");
  console.log("[generateStaticParams:js] BLOB_URL set:", !!process.env.BLOB_URL);
  console.log("[generateStaticParams:js] NODE_ENV:", process.env.NODE_ENV);
  
  const projects = getEnabledProjects();
  console.log("[generateStaticParams:js] Enabled projects:", projects.map(p => p.id).join(", "));
  
  const allParams: { slug: string[] }[] = [];
  
  // Generate params for all projects in parallel
  const projectParams = await Promise.all(
    projects.map(async (project) => {
      console.log(`[generateStaticParams:js] Getting params for project: ${project.id}`);
      const params = await getStaticParamsForLanguage("javascript", project.id);
      console.log(`[generateStaticParams:js] Project ${project.id} returned ${params.length} params`);
      return params;
    })
  );
  
  for (const params of projectParams) {
    allParams.push(...params);
  }
  
  console.log(`[generateStaticParams:js] Total params: ${allParams.length}`);
  
  // Log first few params for debugging
  if (allParams.length > 0) {
    console.log("[generateStaticParams:js] Sample params:", JSON.stringify(allParams.slice(0, 3)));
  } else {
    console.log("[generateStaticParams:js] WARNING: No params generated!");
  }
  
  return allParams;
}

/**
 * Allow dynamic params for paths not generated at build time.
 * Set to false to return 404 for unknown paths.
 * Set to true to dynamically render unknown paths on-demand.
 */
export const dynamicParams = true;

export default async function JavaScriptSymbolPage({ params }: Props) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    notFound();
  }

  // Parse the slug - treat as JavaScript (includes TypeScript)
  const parsed = parseSlugWithLanguage(slug, "javascript");

  if (!parsed) {
    notFound();
  }

  // If only package name, show package overview
  if (parsed.symbolPath.length === 0) {
    return (
      <PackagePage
        language="javascript"
        packageId={parsed.packageId}
        packageName={parsed.packageName}
      />
    );
  }

  // Otherwise, show symbol page
  return (
    <SymbolPage
      language="javascript"
      packageId={parsed.packageId}
      packageName={parsed.packageName}
      symbolPath={parsed.fullPath}
    />
  );
}

/**
 * Generate metadata for the page
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlugWithLanguage(slug || [], "javascript");

  if (!parsed) {
    return { title: "Not Found" };
  }

  const symbolName = parsed.symbolPath.length > 0
    ? parsed.symbolPath[parsed.symbolPath.length - 1]
    : parsed.packageName;

  return {
    title: `${symbolName} | ${parsed.packageName}`,
    description: `JavaScript API reference for ${parsed.packageName}${parsed.fullPath ? ` - ${parsed.fullPath}` : ""}`,
  };
}



