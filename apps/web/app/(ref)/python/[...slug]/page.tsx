/**
 * Python Symbol Page
 *
 * Dynamic route handler for Python package and symbol pages.
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
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Generate static params for all Python packages and symbols.
 * This enables static generation (SSG) for all pages at build time.
 * Generates params for ALL enabled projects (langchain, langgraph, deepagent).
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  console.log("[generateStaticParams:python] Starting static param generation");
  console.log("[generateStaticParams:python] BLOB_URL set:", !!process.env.BLOB_URL);
  console.log("[generateStaticParams:python] NODE_ENV:", process.env.NODE_ENV);
  
  const projects = getEnabledProjects();
  console.log("[generateStaticParams:python] Enabled projects:", projects.map(p => p.id).join(", "));
  
  const allParams: { slug: string[] }[] = [];
  
  // Generate params for all projects in parallel
  const projectParams = await Promise.all(
    projects.map(async (project) => {
      console.log(`[generateStaticParams:python] Getting params for project: ${project.id}`);
      const params = await getStaticParamsForLanguage("python", project.id);
      console.log(`[generateStaticParams:python] Project ${project.id} returned ${params.length} params`);
      return params;
    })
  );
  
  for (const params of projectParams) {
    allParams.push(...params);
  }
  
  console.log(`[generateStaticParams:python] Total params: ${allParams.length}`);
  
  // Log first few params for debugging
  if (allParams.length > 0) {
    console.log("[generateStaticParams:python] Sample params:", JSON.stringify(allParams.slice(0, 3)));
  } else {
    console.log("[generateStaticParams:python] WARNING: No params generated!");
  }
  
  return allParams;
}

/**
 * Allow dynamic params for paths not generated at build time.
 * Set to false to return 404 for unknown paths.
 * Set to true to dynamically render unknown paths on-demand.
 */
export const dynamicParams = true;

export default async function PythonSymbolPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  if (!slug || slug.length === 0) {
    notFound();
  }

  // Parse the slug
  const parsed = parseSlugWithLanguage(slug, "python");

  if (!parsed) {
    notFound();
  }

  // Get version from search params (e.g., ?v=1.1.6)
  const version = typeof resolvedSearchParams.v === "string" ? resolvedSearchParams.v : undefined;

  // If only package name, show package overview
  if (parsed.symbolPath.length === 0) {
    return (
      <PackagePage
        language="python"
        packageId={parsed.packageId}
        packageName={parsed.packageName}
      />
    );
  }

  // Otherwise, show symbol page
  return (
    <SymbolPage
      language="python"
      packageId={parsed.packageId}
      packageName={parsed.packageName}
      symbolPath={parsed.fullPath}
      version={version}
    />
  );
}

/**
 * Generate metadata for the page
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlugWithLanguage(slug || [], "python");

  if (!parsed) {
    return { title: "Not Found" };
  }

  const symbolName = parsed.symbolPath.length > 0
    ? parsed.symbolPath[parsed.symbolPath.length - 1]
    : parsed.packageName;

  return {
    title: `${symbolName} | ${parsed.packageName}`,
    description: `Python API reference for ${parsed.packageName}${parsed.fullPath ? ` - ${parsed.fullPath}` : ""}`,
  };
}



