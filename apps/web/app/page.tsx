import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-heading font-bold mb-4">
          LangChain Reference Docs
        </h1>
        <p className="text-lg text-foreground-secondary mb-8">
          Unified API reference documentation for LangChain Python and
          JavaScript libraries.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/python/langchain"
            className="px-6 py-3 rounded-lg bg-primary text-white font-medium
                     hover:bg-primary-dark transition-colors"
          >
            Python Reference
          </Link>
          <Link
            href="/javascript/@langchain/core"
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
  );
}



