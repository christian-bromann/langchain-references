#!/usr/bin/env node
/**
 * Update Pointers Command
 *
 * Updates build pointers in Vercel Blob storage for a specific build.
 * This is typically run after a successful IR build to update the
 * "latest" pointers.
 *
 * Usage:
 *   update-pointers <buildId> <manifestPath>
 *
 * Example:
 *   update-pointers 20240115-langchain-python ./ir-output/20240115-langchain-python/reference.manifest.json
 */

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import type { Manifest } from "@langchain/ir-schema";
import { updatePointers } from "../pointers.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("update-pointers")
    .description("Update build pointers in Vercel Blob storage")
    .argument("<buildId>", "Build ID (e.g., 20240115-langchain-python)")
    .argument("<manifestPath>", "Path to the reference.manifest.json file")
    .option("--dry-run", "Print what would be updated without making changes")
    .action(async (buildId: string, manifestPath: string, options: { dryRun?: boolean }) => {
      console.log(`\n📍 Updating pointers for build: ${buildId}`);

      // Read and parse manifest
      const absolutePath = path.resolve(manifestPath);
      let manifestContent: string;

      try {
        manifestContent = await fs.readFile(absolutePath, "utf-8");
      } catch (error) {
        console.error(`❌ Failed to read manifest: ${absolutePath}`);
        console.error(error);
        process.exit(1);
      }

      let manifest: Manifest;
      try {
        manifest = JSON.parse(manifestContent) as Manifest;
      } catch (error) {
        console.error(`❌ Failed to parse manifest JSON`);
        console.error(error);
        process.exit(1);
      }

      console.log(`   Project: ${manifest.project ?? "unknown"}`);
      console.log(`   Build ID: ${manifest.build.buildId}`);
      console.log(`   Packages: ${manifest.packages.length}`);

      if (options.dryRun) {
        console.log(`\n🔍 Dry run - would update pointers for ${buildId}`);
        return;
      }

      try {
        await updatePointers({
          buildId,
          manifest,
          dryRun: false,
        });
        console.log(`\n✅ Pointers updated successfully`);
      } catch (error) {
        console.error(`\n❌ Failed to update pointers`);
        console.error(error);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("❌ Update pointers failed:", error);
  process.exit(1);
});

export { main as updatePointersMain };

