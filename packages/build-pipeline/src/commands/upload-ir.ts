#!/usr/bin/env node
/**
 * Upload IR Command
 *
 * Uploads IR artifacts from a local directory to Vercel Blob storage.
 * This is a standalone CLI wrapper for the uploadIR function.
 *
 * Usage:
 *   upload-ir --build-id <buildId> --ir-path <path>
 *
 * Example:
 *   upload-ir --build-id abc123 --ir-path ./ir-output/abc123
 */

import { Command } from "commander";
import { uploadIR } from "../upload.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("upload-ir")
    .description("Upload IR artifacts to Vercel Blob storage")
    .requiredOption("--build-id <buildId>", "Build ID for the artifacts")
    .requiredOption("--ir-path <path>", "Path to the IR output directory")
    .option("--dry-run", "Print what would be uploaded without making changes")
    .action(async (options: { buildId: string; irPath: string; dryRun?: boolean }) => {
      console.log(`\n☁️ Uploading IR artifacts for build: ${options.buildId}`);
      console.log(`   Source path: ${options.irPath}`);

      if (options.dryRun) {
        console.log("   (dry-run mode - no actual uploads)\n");
      }

      try {
        const result = await uploadIR({
          buildId: options.buildId,
          irOutputPath: options.irPath,
          dryRun: options.dryRun || false,
        });

        console.log(`\n✅ Upload complete!`);
        console.log(`   Files: ${result.files}`);
        console.log(`   Total size: ${(result.totalSize / 1024).toFixed(1)} KB`);
        console.log(`   Uploaded at: ${result.uploadedAt}`);
      } catch (error) {
        console.error(`\n❌ Upload failed:`, error);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("❌ Upload failed:", error);
  process.exit(1);
});

export { main as uploadIrMain };
