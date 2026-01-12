/**
 * Robots.txt Configuration
 *
 * Configures search engine crawling directives for the site.
 * This allows all search engines to crawl and index all pages.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://reference.langchain.com/sitemap.xml",
  };
}
