#!/usr/bin/env node
/**
 * Update Package Indexes Command
 *
 * Regenerates the project package index files from individual package pointers.
 * This is used after batch package builds to ensure the index is complete and
 * up-to-date.
 *
 * The project package index aggregates all package pointers for a project/language
 * into a single file for efficient loading by the web app.
 *
 * Usage:
 *   update-indexes --project langchain --language python
 *   update-indexes --all
 *
 * Example:
 *   # Update index for langchain Python packages
 *   pnpm update-indexes --project langchain --language python
 *
 *   # Update all project indexes
 *   pnpm update-indexes --all
 */


import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

import { Command } from "commander";
import { regenerateProjectPackageIndex } from "../pointers.js";
import { PROJECTS, OUTPUT_LANGUAGES } from "../constants.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

interface ConfigFile {
  project?: string;
  language: "python" | "typescript";
  packages: Array<{ name: string }>;
}

/**
 * Load package names from a config file.
 */
async function loadPackageNamesFromConfig(project: string, language: string): Promise<string[]> {
  const configDir = path.resolve(__dirname, "../../../../configs");
  const configFile = path.join(configDir, `${project}-${language}.json`);

  try {
    const content = await fs.readFile(configFile, "utf-8");
    const config: ConfigFile = JSON.parse(content);
    return config.packages.map((p) => p.name);
  } catch {
    console.warn(`   ⚠️  Could not load config: ${configFile}`);
    return [];
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("update-indexes")
    .description("Regenerate project package indexes from individual package pointers")
    .option("--project <name>", `Project to update (${PROJECTS.join(", ")})`)
    .option("--language <lang>", `Language to update (python, javascript)`)
    .option("--all", "Update indexes for all project/language combinations")
    .option("--dry-run", "Print what would be updated without making changes")
    .action(
      async (options: { project?: string; language?: string; all?: boolean; dryRun?: boolean }) => {
        console.log(`\n🔄 Regenerating project package indexes`);

        if (options.dryRun) {
          console.log("   (dry-run mode - no actual updates)\n");
        }

        // Determine which project/language combinations to update
        const combinations: Array<{ project: string; language: "python" | "javascript" }> = [];

        if (options.all) {
          for (const project of PROJECTS) {
            for (const language of OUTPUT_LANGUAGES) {
              combinations.push({ project, language });
            }
          }
        } else if (options.project && options.language) {
          // Map typescript to javascript for the pointer system
          const lang = options.language === "typescript" ? "javascript" : options.language;
          combinations.push({
            project: options.project,
            language: lang as "python" | "javascript",
          });
        } else if (options.project) {
          // Update both languages for the project
          combinations.push({ project: options.project, language: "python" });
          combinations.push({ project: options.project, language: "javascript" });
        } else if (options.language) {
          // Update all projects for the language
          const lang = options.language === "typescript" ? "javascript" : options.language;
          for (const project of PROJECTS) {
            combinations.push({ project, language: lang as "python" | "javascript" });
          }
        } else {
          console.error("❌ Must specify --project, --language, or --all");
          process.exit(1);
        }

        console.log(`\n📦 Updating ${combinations.length} index(es):`);
        for (const { project, language } of combinations) {
          console.log(`   - ${project}-${language}`);
        }
        console.log("");

        let successCount = 0;
        let failCount = 0;

        for (const { project, language } of combinations) {
          // Map javascript back to typescript for config file lookup
          const configLanguage = language === "javascript" ? "typescript" : language;

          console.log(`\n📋 ${project}-${language}:`);

          // Load package names from config
          const packageNames = await loadPackageNamesFromConfig(project, configLanguage);

          if (packageNames.length === 0) {
            console.log(`   ⚠️  No packages found, skipping`);
            continue;
          }

          console.log(`   Found ${packageNames.length} packages in config`);

          try {
            await regenerateProjectPackageIndex(
              project,
              language,
              packageNames,
              options.dryRun ?? false,
            );
            successCount++;
          } catch (error) {
            console.error(`   ❌ Failed to update index: ${error}`);
            failCount++;
          }
        }

        console.log(`\n${"─".repeat(40)}`);
        console.log(`📊 Summary: ${successCount} succeeded, ${failCount} failed`);

        if (failCount > 0) {
          process.exit(1);
        }
      },
    );

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("❌ Update indexes failed:", error);
  process.exit(1);
});

export { main as updateIndexesMain };
