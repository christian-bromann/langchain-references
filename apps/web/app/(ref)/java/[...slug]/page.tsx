/**
 * Java Symbol Page
 *
 * Dynamic route handler for Java package and symbol pages.
 * Parses the URL slug and renders the appropriate component.
 */

import { notFound } from "next/navigation";
import { parseSlugWithLanguage } from "@/lib/utils/url";
import { SymbolPage } from "@/components/reference/SymbolPage";
import { PackagePage } from "@/components/reference/PackagePage";
import { SubpagePage } from "@/components/reference/SubpagePage";
import { getStaticParamsForLanguage, isSubpage, getBuildIdForPackageId } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";

interface Props {
  params: Promise<{
    slug: string[];
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Generate static params for all Java packages and symbols.
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const projects = getEnabledProjects();
  const allParams: { slug: string[] }[] = [];

  const projectParams = await Promise.all(
    projects.map((project) => getStaticParamsForLanguage("java", project.id)),
  );

  for (const params of projectParams) {
    allParams.push(...params);
  }

  return allParams;
}

/**
 * Enable Incremental Static Regeneration (ISR).
 */
export const revalidate = 3600; // 1 hour

/**
 * Enable dynamic params for on-demand page generation.
 */
export const dynamicParams = true;

export default async function JavaSymbolPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;

  if (!slug || slug.length === 0) {
    notFound();
  }

  const parsed = parseSlugWithLanguage(slug, "java");

  if (!parsed) {
    notFound();
  }

  const version = typeof resolvedSearchParams.v === "string" ? resolvedSearchParams.v : undefined;

  // If only package name, show package overview
  if (parsed.symbolPath.length === 0) {
    return (
      <PackagePage language="java" packageId={parsed.packageId} packageName={parsed.packageName} />
    );
  }

  // Check if this is a subpage
  if (parsed.symbolPath.length === 1) {
    const buildId = await getBuildIdForPackageId(parsed.packageId);
    if (buildId) {
      const subpageSlug = parsed.symbolPath[0];
      const subpageCheck = await isSubpage(parsed.packageId, buildId, subpageSlug);
      if (subpageCheck) {
        return (
          <SubpagePage
            language="java"
            packageId={parsed.packageId}
            packageName={parsed.packageName}
            subpageSlug={subpageSlug}
          />
        );
      }
    }
  }

  // Otherwise, show symbol page
  return (
    <SymbolPage
      language="java"
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
  const parsed = parseSlugWithLanguage(slug || [], "java");

  if (!parsed) {
    return { title: "Not Found" };
  }

  const symbolName =
    parsed.symbolPath.length > 0
      ? parsed.symbolPath[parsed.symbolPath.length - 1]
      : parsed.packageName;

  const title = `${symbolName} | ${parsed.packageName}`;
  const description = parsed.fullPath
    ? `Java API reference for ${parsed.fullPath} in ${parsed.packageName}. Part of the LangChain ecosystem.`
    : `Java API reference for ${parsed.packageName}. Part of the LangChain ecosystem.`;

  const ogImagePath = `/og/java/${slug.join("/")}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/java/${slug.join("/")}`,
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImagePath],
    },
    alternates: {
      canonical: `/java/${slug.join("/")}`,
    },
  };
}
