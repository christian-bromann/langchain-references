/**
 * JSON-LD Structured Data Components
 *
 * Provides structured data for search engines using schema.org vocabulary.
 * This helps search engines understand the content better and can enable
 * rich snippets in search results.
 */

import Script from "next/script";
import type { Language } from "@langchain/ir-schema";

import { BASE_URL } from "@/lib/config/base-url";

/**
 * Website structured data for the homepage
 */
export function WebsiteJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LangChain Reference Docs",
    description: "API reference documentation for LangChain, LangGraph, and LangSmith",
    url: BASE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
    publisher: {
      "@type": "Organization",
      name: "LangChain",
      url: "https://langchain.com",
    },
  };

  return (
    <Script
      id="website-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * Technical documentation structured data
 */
interface TechArticleJsonLdProps {
  title: string;
  description: string;
  url: string;
  dateModified?: string;
  language: Language;
  packageName: string;
}

export function TechArticleJsonLd({
  title,
  description,
  url,
  dateModified,
  language,
  packageName,
}: TechArticleJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    url: `${BASE_URL}${url}`,
    dateModified: dateModified || new Date().toISOString(),
    author: {
      "@type": "Organization",
      name: "LangChain",
      url: "https://langchain.com",
    },
    publisher: {
      "@type": "Organization",
      name: "LangChain",
      url: "https://langchain.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}${url}`,
    },
    about: {
      "@type": "SoftwareSourceCode",
      name: packageName,
      programmingLanguage: {
        "@type": "ComputerLanguage",
        name: language === "python" ? "Python" : "JavaScript/TypeScript",
      },
    },
    inLanguage: "en-US",
    isAccessibleForFree: true,
  };

  return (
    <Script
      id={`tech-article-jsonld-${url.replace(/\//g, "-")}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * Software source code structured data for symbol pages
 */
interface SoftwareSourceCodeJsonLdProps {
  name: string;
  description: string;
  url: string;
  codeRepository?: string;
  programmingLanguage: "python" | "javascript";
  runtimePlatform?: string;
}

export function SoftwareSourceCodeJsonLd({
  name,
  description,
  url,
  codeRepository,
  programmingLanguage,
  runtimePlatform,
}: SoftwareSourceCodeJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name,
    description,
    url: `${BASE_URL}${url}`,
    codeRepository:
      codeRepository ||
      (programmingLanguage === "python"
        ? "https://github.com/langchain-ai/langchain"
        : "https://github.com/langchain-ai/langchainjs"),
    programmingLanguage: {
      "@type": "ComputerLanguage",
      name: programmingLanguage === "python" ? "Python" : "TypeScript",
    },
    runtimePlatform:
      runtimePlatform || (programmingLanguage === "python" ? "Python 3.9+" : "Node.js 18+"),
    author: {
      "@type": "Organization",
      name: "LangChain",
      url: "https://langchain.com",
    },
    license: "https://opensource.org/licenses/MIT",
  };

  return (
    <Script
      id={`software-jsonld-${name.replace(/[^a-zA-Z0-9]/g, "-")}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * Breadcrumb structured data
 */
interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbJsonLdProps {
  items: BreadcrumbItem[];
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`,
    })),
  };

  return (
    <Script
      id="breadcrumb-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
