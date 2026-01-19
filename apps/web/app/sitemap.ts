// oxlint-disable no-console
/**
 * Sitemap Configuration
 *
 * Dynamically generates a sitemap for all pages in the reference documentation.
 * This includes language index pages, package pages, and all symbol pages.
 */

import type { MetadataRoute } from "next";
import { getStaticParamsForLanguage } from "@/lib/ir/loader";
import { getEnabledProjects } from "@/lib/config/projects";
import { BASE_URL } from "@/lib/config/base-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = getEnabledProjects();
  const entries: MetadataRoute.Sitemap = [];

  // Add homepage
  entries.push({
    url: BASE_URL,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 1.0,
  });

  // Add language index pages
  entries.push({
    url: `${BASE_URL}/python`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  });

  entries.push({
    url: `${BASE_URL}/javascript`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  });

  // Generate entries for both languages across all projects
  const languages = ["python", "javascript"] as const;

  for (const language of languages) {
    for (const project of projects) {
      try {
        const params = await getStaticParamsForLanguage(language, project.id);

        for (const { slug } of params) {
          const path = `/${language}/${slug.join("/")}`;

          // Determine priority based on path depth
          // Package pages get higher priority than deep symbol pages
          const priority = slug.length === 1 ? 0.8 : 0.6;

          entries.push({
            url: `${BASE_URL}${path}`,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority,
          });
        }
      } catch (error) {
        // Log but don't fail - some projects may not have data yet
        console.warn(`Failed to generate sitemap entries for ${language}/${project.id}:`, error);
      }
    }
  }

  return entries;
}
