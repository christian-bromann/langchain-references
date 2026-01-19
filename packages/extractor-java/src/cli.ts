#!/usr/bin/env node
/**
 * Java Extractor CLI
 *
 * Command-line interface for the Java API extractor.
 */

import { program } from "commander";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { createConfig } from "./config.js";
import { JavaExtractor } from "./extractor.js";
import { JavaTransformer } from "./transformer.js";

interface CliOptions {
  package: string;
  path: string;
  output: string;
  repo: string;
  sha: string;
  includePrivate: boolean;
  verbose: boolean;
}

program
  .name("extract-java")
  .description("Extract Java API documentation to IR format")
  .requiredOption("--package <name>", "Package name (e.g., langsmith)")
  .requiredOption("--path <path>", "Path to the Java source directory")
  .requiredOption("--output <file>", "Output JSON file path")
  .option("--repo <repo>", "Repository (e.g., langchain-ai/langsmith-java)", "")
  .option("--sha <sha>", "Git commit SHA", "")
  .option("--include-private", "Include private members", false)
  .option("-v, --verbose", "Enable verbose output", false);

program.parse();

const options = program.opts<CliOptions>();

async function main(): Promise<void> {
  try {
    // Create configuration
    const config = createConfig({
      packageName: options.package,
      packagePath: options.path,
      repo: options.repo,
      sha: options.sha,
      excludePrivate: !options.includePrivate,
      excludePackagePrivate: !options.includePrivate,
    });

    if (options.verbose) {
      console.log("Extracting:", config.packageName);
      console.log("Source path:", config.packagePath);
      console.log("Repository:", config.repo);
      console.log("SHA:", config.sha);
      console.log();
    }

    // Run extraction
    const extractor = new JavaExtractor(config);
    const result = await extractor.extract();

    if (options.verbose) {
      console.log("Package version:", result.version);
      console.log(`Found ${result.types.length} types`);
    }

    // Transform to IR format
    const transformer = new JavaTransformer(result, config);
    const symbols = transformer.transform();

    if (options.verbose) {
      console.log(`Transformed to ${symbols.length} IR symbols`);
    }

    const outputData = {
      package: {
        packageId: `pkg_java_${config.packageName.replace(/[^a-zA-Z0-9]/g, "_")}`,
        displayName: config.packageName,
        publishedName: config.packageName,
        language: "java",
        ecosystem: "java",
        version: result.version,
        repo: {
          owner: config.repo.split("/")[0] || "",
          name: config.repo.split("/")[1] || "",
          sha: config.sha,
          path: config.packagePath,
        },
      },
      symbols,
    };

    // Ensure output directory exists
    await mkdir(dirname(options.output), { recursive: true });

    // Write output
    await writeFile(options.output, JSON.stringify(outputData, null, 2), "utf-8");

    console.log(`✅ Extracted ${symbols.length} symbols to ${options.output}`);
  } catch (error) {
    console.error("❌ Extraction failed:", error);
    process.exit(1);
  }
}

main();
