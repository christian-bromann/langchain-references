import type { Metadata } from "next";
import Link from "next/link";
import { WebsiteJsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "LangChain Reference Docs",
  description:
    "Unified API reference documentation for LangChain, LangGraph, DeepAgents, LangSmith, and Integrations. Browse Python, TypeScript, Java, and Go packages.",
  openGraph: {
    title: "LangChain Reference Docs",
    description:
      "Unified API reference documentation for LangChain, LangGraph, DeepAgents, LangSmith, and Integrations.",
    type: "website",
    url: "/",
    images: [{ url: "/og/home", width: 1200, height: 630, alt: "LangChain Reference Docs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LangChain Reference Docs",
    description:
      "Unified API reference documentation for LangChain, LangGraph, DeepAgents, LangSmith, and Integrations.",
    images: ["/og/home"],
  },
};

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="text-sm max-w-36 whitespace-normal md:truncate text-foreground-muted hover:text-foreground-secondary transition-colors"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function SocialLinks() {
  return (
    <>
      <a href="https://github.com/langchain-ai" target="_blank" rel="noreferrer" className="h-fit">
        <span className="sr-only">GitHub</span>
        <svg
          className="w-5 h-5 text-foreground-muted hover:text-foreground-secondary transition-colors"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
      </a>
      <a href="https://x.com/LangChain" target="_blank" rel="noreferrer" className="h-fit">
        <span className="sr-only">X</span>
        <svg
          className="w-5 h-5 text-foreground-muted hover:text-foreground-secondary transition-colors"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
      <a
        href="https://www.linkedin.com/company/langchain/"
        target="_blank"
        rel="noreferrer"
        className="h-fit"
      >
        <span className="sr-only">LinkedIn</span>
        <svg
          className="w-5 h-5 text-foreground-muted hover:text-foreground-secondary transition-colors"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </a>
      <a
        href="https://www.youtube.com/@LangChain"
        target="_blank"
        rel="noreferrer"
        className="h-fit"
      >
        <span className="sr-only">YouTube</span>
        <svg
          className="w-5 h-5 text-foreground-muted hover:text-foreground-secondary transition-colors"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      </a>
    </>
  );
}

const projects = [
  {
    name: "LangChain",
    description: "Build LLM-powered applications with composable components",
    href: "/python/langchain",
    languages: ["Python", "TypeScript"],
  },
  {
    name: "LangGraph",
    description: "Multi-actor stateful graphs for complex agent workflows",
    href: "/python/langgraph",
    languages: ["Python", "TypeScript"],
  },
  {
    name: "DeepAgents",
    description: "Advanced framework for autonomous AI systems",
    href: "/python/deepagents",
    languages: ["Python", "TypeScript"],
  },
  {
    name: "Integrations",
    description: "Pre-built connectors for LLM providers and tools",
    href: "/python/langchain-anthropic",
    languages: ["Python", "TypeScript"],
  },
  {
    name: "LangSmith",
    description: "Debug, test, and monitor LLM applications",
    href: "/python/langsmith",
    languages: ["Python", "TypeScript", "Java", "Go"],
  },
];

export default function HomePage() {
  return (
    <>
      <WebsiteJsonLd />
      <div className="min-h-screen bg-background flex flex-col">
        {/* Hero */}
        <div className="border-b border-border bg-background-secondary">
          <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-center mb-4 text-foreground">
              Reference Documentation
            </h1>
            <p className="text-base sm:text-lg text-foreground-secondary text-center max-w-2xl mx-auto">
              Explore the complete API reference for the LangChain ecosystem across Python,
              TypeScript, Java, and Go.
            </p>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.name}
                href={project.href}
                className="group p-5 rounded-lg border border-border bg-background hover:border-primary hover:bg-primary/5 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-heading font-semibold text-foreground group-hover:text-primary transition-colors">
                    {project.name}
                  </h2>
                  <svg
                    className="w-4 h-4 text-foreground-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <p className="text-sm text-foreground-secondary mb-3">{project.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {project.languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-2 py-0.5 text-xs font-medium rounded border border-border bg-background-secondary text-foreground-muted"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-auto border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
            {/* Top section - Logo, Links, Social */}
            <div className="flex flex-col md:flex-row gap-10 md:gap-8 justify-between mb-10">
              {/* Logo */}
              <div className="shrink-0">
                <Link href="/">
                  <span className="sr-only">LangChain Reference home page</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-auto object-contain block dark:hidden h-[26px]"
                    alt="LangChain Reference"
                    src="/reference-light.svg"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="w-auto object-contain hidden dark:block h-[26px]"
                    alt="LangChain Reference"
                    src="/reference-dark.svg"
                  />
                </Link>
              </div>

              {/* Link columns */}
              <div className="flex gap-16 md:gap-24">
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-foreground mb-1">Resources</p>
                  <FooterLink href="https://forum.langchain.com/">Forum</FooterLink>
                  <FooterLink href="https://changelog.langchain.com/">Changelog</FooterLink>
                  <FooterLink href="https://academy.langchain.com/">LangChain Academy</FooterLink>
                  <FooterLink href="https://trust.langchain.com/">Trust Center</FooterLink>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-foreground mb-1">Company</p>
                  <FooterLink href="https://langchain.com/about">About</FooterLink>
                  <FooterLink href="https://langchain.com/careers">Careers</FooterLink>
                  <FooterLink href="https://blog.langchain.com/">Blog</FooterLink>
                </div>
              </div>

              {/* Social icons */}
              <div className="flex gap-4 shrink-0">
                <SocialLinks />
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
