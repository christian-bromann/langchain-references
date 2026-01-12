/**
 * Custom 404 Page
 *
 * Provides a helpful 404 page with navigation back to the main documentation
 * and quick links to common sections.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Home, Search, Book, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist or has been moved.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-lg text-center">
        {/* 404 indicator */}
        <div className="mb-8">
          <span className="text-8xl font-heading font-bold text-primary/20">
            404
          </span>
        </div>

        {/* Message */}
        <h1 className="text-2xl font-heading font-bold text-foreground mb-4">
          Page not found
        </h1>
        <p className="text-foreground-secondary mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Try searching for what you need or navigate back to the documentation.
        </p>

        {/* Quick actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark transition-colors"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
          <Link
            href="/python"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-background-secondary text-foreground font-medium hover:border-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Docs
          </Link>
        </div>

        {/* Helpful links */}
        <div className="border-t border-border pt-8">
          <p className="text-sm text-foreground-muted mb-4">
            Popular destinations
          </p>
          <div className="grid grid-cols-2 gap-4 text-left">
            <Link
              href="/python"
              className="group flex items-start gap-3 p-4 rounded-lg border border-border bg-background-secondary hover:border-primary/50 transition-colors"
            >
              <Book className="h-5 w-5 text-foreground-muted group-hover:text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground group-hover:text-primary block">
                  Python Reference
                </span>
                <span className="text-sm text-foreground-secondary">
                  langchain, langchain-core, etc.
                </span>
              </div>
            </Link>
            <Link
              href="/javascript"
              className="group flex items-start gap-3 p-4 rounded-lg border border-border bg-background-secondary hover:border-primary/50 transition-colors"
            >
              <Book className="h-5 w-5 text-foreground-muted group-hover:text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground group-hover:text-primary block">
                  JavaScript Reference
                </span>
                <span className="text-sm text-foreground-secondary">
                  @langchain/core, @langchain/openai, etc.
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* Search hint */}
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-foreground-muted">
          <Search className="h-4 w-4" />
          <span>
            Press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-background-secondary border border-border font-mono text-xs">
              ⌘K
            </kbd>{" "}
            to search
          </span>
        </div>
      </div>
    </div>
  );
}
