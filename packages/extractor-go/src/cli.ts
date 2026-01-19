#!/usr/bin/env node
/**
 * Go Extractor CLI
 *
 * Command-line interface for the Go API extractor.
 */

import { program } from "commander";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { execSync } from "child_process";
import { createConfig } from "./config.js";
import { GoExtractor } from "./extractor.js";
import { GoTransformer } from "./transformer.js";

interface CliOptions {
  package: string;
  path: string;
  output: string;
  repo: string;
  sha: string;
  includeUnexported: boolean;
  verbose: boolean;
}

program
  .name("extract-go")
  .description("Extract Go API documentation to IR format")
  .requiredOption("--package <name>", "Package name (e.g., langsmith)")
  .requiredOption("--path <path>", "Path to the Go source directory")
  .requiredOption("--output <file>", "Output JSON file path")
  .option("--repo <repo>", "Repository (e.g., langchain-ai/langsmith-go)", "")
  .option("--sha <sha>", "Git commit SHA", "")
  .option("--include-unexported", "Include unexported symbols", false)
  .option("-v, --verbose", "Enable verbose output", false);

program.parse();

const options = program.opts<CliOptions>();

/**
 * Check if Go is installed.
 */
function checkGoInstalled(): boolean {
  try {
    execSync("go version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  try {
    // Check for Go (optional, for future enhancements)
    const goInstalled = checkGoInstalled();
    if (options.verbose) {
      console.log("Go installed:", goInstalled);
    }

    // Create configuration
    const config = createConfig({
      packageName: options.package,
      packagePath: options.path,
      repo: options.repo,
      sha: options.sha,
      exportedOnly: !options.includeUnexported,
    });

    if (options.verbose) {
      console.log("Extracting:", config.packageName);
      console.log("Source path:", config.packagePath);
      console.log("Repository:", config.repo);
      console.log("SHA:", config.sha);
      console.log();
    }

    // Run extraction
    const extractor = new GoExtractor(config);
    const result = await extractor.extract();

    if (options.verbose) {
      console.log("Module:", result.moduleName);
      console.log("Version:", result.version);
      console.log(`Found ${result.types.length} types`);
      console.log(`Found ${result.functions.length} functions`);
      console.log(`Found ${result.constants.length} constants`);
    }

    // Transform to IR format
    const transformer = new GoTransformer(result, config);
    const symbols = transformer.transform();

    if (options.verbose) {
      console.log(`Transformed to ${symbols.length} IR symbols`);
    }

    const outputData = {
      package: {
        packageId: `pkg_go_${config.packageName.replace(/[^a-zA-Z0-9]/g, "_")}`,
        displayName: config.packageName,
        publishedName: config.packageName,
        language: "go",
        ecosystem: "go",
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
