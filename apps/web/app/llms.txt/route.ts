/**
 * llms.txt Route
 *
 * Provides a standardized index file for LLM crawlers and AI agents.
 * This follows the llms.txt convention for machine-readable documentation.
 *
 * @see https://llmstxt.org/
 */

import { getBuildIdForLanguage, getManifestData } from "@/lib/ir/loader";
import { getBaseUrl, getMcpServerUrl } from "@/lib/config/mcp";
import { slugifyPackageName } from "@/lib/utils/url";

export const dynamic = "force-static";
export const revalidate = 3600; // Revalidate every hour

export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const mcpServerUrl = getMcpServerUrl();

  const lines: string[] = [
    "# LangChain API Reference",
    "",
    "> Comprehensive API documentation for LangChain Python and JavaScript libraries.",
    "",
    "## Overview",
    "",
    "This is the API reference for LangChain, a framework for building applications",
    "with large language models (LLMs). This reference covers:",
    "",
    "- **Python packages**: langchain, langchain-core, langchain-community, and provider integrations",
    "- **JavaScript packages**: @langchain/core, @langchain/community, and provider integrations",
    "",
    "## Quick Links",
    "",
  ];

  // Get Python packages
  const pythonBuildId = await getBuildIdForLanguage("python");
  if (pythonBuildId) {
    const pythonManifest = await getManifestData(pythonBuildId);
    if (pythonManifest) {
      const pythonPackages = pythonManifest.packages.filter((p) => p.language === "python");

      if (pythonPackages.length > 0) {
        lines.push("### Python");
        lines.push("");
        for (const pkg of pythonPackages) {
          const pkgUrl = `${baseUrl}/python/${slugifyPackageName(pkg.publishedName)}`;
          lines.push(`- [${pkg.publishedName}](${pkgUrl}): ${pkg.stats?.total || 0} symbols`);
        }
        lines.push("");
      }
    }
  }

  // Get JavaScript packages
  const jsBuildId = await getBuildIdForLanguage("javascript");
  if (jsBuildId) {
    const jsManifest = await getManifestData(jsBuildId);
    if (jsManifest) {
      const jsPackages = jsManifest.packages.filter((p) => p.language === "typescript");

      if (jsPackages.length > 0) {
        lines.push("### JavaScript");
        lines.push("");
        for (const pkg of jsPackages) {
          const pkgUrl = `${baseUrl}/javascript/${slugifyPackageName(pkg.publishedName)}`;
          lines.push(`- [${pkg.publishedName}](${pkgUrl}): ${pkg.stats?.total || 0} symbols`);
        }
        lines.push("");
      }
    }
  }

  lines.push("");

  // API Access section
  lines.push("## API Access");
  lines.push("");
  lines.push("You can access any page as markdown by appending `?format=md` to the URL.");
  lines.push("");
  lines.push("**Examples:**");
  lines.push("");
  lines.push(`- \`${baseUrl}/python/langchain-core/RunnableSequence?format=md\``);
  lines.push(`- \`${baseUrl}/javascript/langchain-core/ChatPromptTemplate?format=md\``);
  lines.push("");
  lines.push("The API also serves markdown automatically when detecting LLM user agents");
  lines.push("(GPTBot, Claude-Web, etc.) or when using curl/wget without Accept headers.");
  lines.push("");

  // MCP Server section
  lines.push("## MCP Server");
  lines.push("");
  lines.push(`This documentation is available as an MCP (Model Context Protocol) server:`);
  lines.push("");
  lines.push(`\`${mcpServerUrl}\``);
  lines.push("");
  lines.push("Use this URL to connect from Cursor, VS Code, or other MCP-compatible tools.");
  lines.push("");

  // Additional resources
  lines.push("## Additional Resources");
  lines.push("");
  lines.push(`- [Full symbol index](${baseUrl}/llms-full.txt)`);
  lines.push("- [LangChain Documentation](https://docs.langchain.com/)");
  lines.push("- [LangChain GitHub](https://github.com/langchain-ai/langchain)");
  lines.push("- [LangChain.js GitHub](https://github.com/langchain-ai/langchainjs)");

  const content = lines.join("\n");

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
