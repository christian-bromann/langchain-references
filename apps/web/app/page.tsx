import type { Metadata } from "next";
import Link from "next/link";
import { WebsiteJsonLd } from "@/components/seo/JsonLd";

/**
 * Page metadata for SEO and social sharing
 */
export const metadata: Metadata = {
  title: "LangChain Reference Docs",
  description:
    "Unified API reference documentation for LangChain, LangGraph, and LangSmith. Browse Python and JavaScript/TypeScript packages, classes, functions, and modules.",
  openGraph: {
    title: "LangChain Reference Docs",
    description: "Unified API reference documentation for LangChain, LangGraph, and LangSmith.",
    type: "website",
    url: "/",
    images: [
      {
        url: "/og/home",
        width: 1200,
        height: 630,
        alt: "LangChain Reference Docs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LangChain Reference Docs",
    description: "Unified API reference documentation for LangChain, LangGraph, and LangSmith.",
    images: ["/og/home"],
  },
};

export default function HomePage() {
  return (
    <>
      <WebsiteJsonLd />
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl text-center">
          <h1 className="text-4xl font-heading font-bold mb-4">LangChain Reference Docs</h1>
          <p className="text-lg text-foreground-secondary mb-8">
            Unified API reference documentation for LangChain Python and JavaScript libraries.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/python"
              className="px-6 py-3 rounded-lg bg-primary text-white font-medium
                     hover:bg-primary-dark transition-colors"
            >
              Python Reference
            </Link>
            <Link
              href="/javascript"
              className="px-6 py-3 rounded-lg border border-border bg-background-secondary
                     text-foreground font-medium hover:border-primary transition-colors"
            >
              JavaScript Reference
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-6 text-left">
            <div className="p-4 rounded-lg border border-border bg-background-secondary">
              <h3 className="font-heading font-semibold mb-2">Python Packages</h3>
              <ul className="text-sm text-foreground-secondary space-y-1">
                <li>langchain</li>
                <li>langchain-core</li>
                <li>langchain-text-splitters</li>
                <li>langchain-mcp-adapters</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-border bg-background-secondary">
              <h3 className="font-heading font-semibold mb-2">JS/TS Packages</h3>
              <ul className="text-sm text-foreground-secondary space-y-1">
                <li>@langchain/core</li>
                <li>@langchain/community</li>
                <li>@langchain/anthropic</li>
                <li>@langchain/google-genai</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
