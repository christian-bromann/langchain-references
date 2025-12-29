#!/usr/bin/env node
/**
 * CLI Interface
 *
 * Command-line interface for the TypeScript API extractor.
 */

import { program } from "commander";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { createConfig, type ExtractionConfig } from "./config.js";
import { TypeScriptExtractor } from "./extractor.js";
import { TypeDocTransformer } from "./transformer.js";

interface CliOptions {
  package: string;
  path: string;
  output: string;
  repo: string;
  sha: string;
  entryPoints: string[];
  tsconfig?: string;
  includePrivate: boolean;
  includeInternal: boolean;
  raw: boolean;
  verbose: boolean;
  sourcePathPrefix?: string;
}

program
  .name("extract-typescript")
  .description("Extract TypeScript API documentation to IR format")
  .requiredOption("--package <name>", "Package name (e.g., @langchain/core)")
  .requiredOption("--path <path>", "Path to the package source directory")
  .requiredOption("--output <file>", "Output JSON file path")
  .option("--repo <repo>", "Repository (e.g., langchain-ai/langchainjs)", "")
  .option("--sha <sha>", "Git commit SHA", "")
  .option(
    "--entry-points <files...>",
    "Entry points relative to package path",
    ["src/index.ts"]
  )
  .option("--tsconfig <file>", "Path to tsconfig.json (relative to package path)")
  .option("--include-private", "Include private members", false)
  .option("--include-internal", "Include @internal members", false)
  .option("--raw", "Output raw TypeDoc JSON without IR transformation", false)
  .option("--source-path-prefix <prefix>", "Path prefix to strip from source file paths in output")
  .option("-v, --verbose", "Enable verbose output", false);

program.parse();

const options = program.opts<CliOptions>();

async function main(): Promise<void> {
  try {
    // Create configuration
    const config: ExtractionConfig = createConfig({
      packageName: options.package,
      packagePath: options.path,
      entryPoints: options.entryPoints,
      tsconfig: options.tsconfig,
      excludePrivate: !options.includePrivate,
      excludeInternal: !options.includeInternal,
      excludeExternals: false, // Keep re-exports visible
      repo: options.repo,
      sha: options.sha,
    });

    if (options.verbose) {
      console.log("Extracting:", config.packageName);
      console.log("Source path:", config.packagePath);
      console.log("Entry points config:", config.entryPoints);
      console.log("Repository:", config.repo);
      console.log("SHA:", config.sha);
      console.log();
    }

    // Run extraction
    const extractor = new TypeScriptExtractor(config);
    const packageInfo = await extractor.getPackageInfo();

    if (options.verbose) {
      console.log("Package version:", packageInfo.version);
    }

    const rawJson = await extractor.extractToJson();

    if (options.verbose) {
      const project = rawJson as { children?: unknown[] };
      console.log(`Extracted ${project.children?.length || 0} top-level items`);
    }

    let outputData: object;

    if (options.raw) {
      // Output raw TypeDoc JSON
      outputData = rawJson;
    } else {
      // Transform to IR format
      const transformer = new TypeDocTransformer(
        rawJson as any,
        config.packageName,
        config.repo,
        config.sha,
        options.sourcePathPrefix,
        config.packagePath  // Pass package path for AST fallback resolution
      );

      const symbols = transformer.transform();

      if (options.verbose) {
        console.log(`Transformed to ${symbols.length} IR symbols`);
      }

      outputData = {
        package: {
          packageId: `pkg_js_${config.packageName.replace(/^@/, "").replace(/\//g, "_")}`,
          displayName: config.packageName,
          publishedName: config.packageName,
          language: "typescript",
          ecosystem: "javascript",
          version: packageInfo.version,
          repo: {
            owner: config.repo.split("/")[0] || "",
            name: config.repo.split("/")[1] || "",
            sha: config.sha,
            path: config.packagePath,
          },
        },
        symbols,
      };
    }

    // Ensure output directory exists
    await mkdir(dirname(options.output), { recursive: true });

    // Write output
    await writeFile(options.output, JSON.stringify(outputData, null, 2), "utf-8");

    const symbolCount = "symbols" in outputData
      ? (outputData.symbols as unknown[]).length
      : "N/A";

    console.log(`✅ Extracted ${symbolCount} symbols to ${options.output}`);
  } catch (error) {
    console.error("❌ Extraction failed:", error);
    process.exit(1);
  }
}

main();

