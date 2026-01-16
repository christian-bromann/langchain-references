#!/usr/bin/env node
/**
 * Upload IR Command
 *
 * Uploads IR artifacts for a single package to Vercel Blob storage.
 * This is a standalone CLI wrapper for the uploadIR function.
 *
 * Usage:
 *   upload-ir --build-id <buildId> --ir-path <path> --package-id <packageId>
 *
 * Example:
 *   upload-ir --build-id abc123 --ir-path ./ir-output/packages/pkg_py_langchain_openai/abc123 --package-id pkg_py_langchain_openai
 */

import { Command } from "commander";
import { uploadIR } from "../upload.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("upload-ir")
    .description("Upload IR artifacts for a package to Vercel Blob storage")
    .requiredOption("--build-id <buildId>", "Build ID for the artifacts")
    .requiredOption("--ir-path <path>", "Path to the IR output directory")
    .requiredOption("--package-id <packageId>", "Package ID (e.g., pkg_py_langchain_openai)")
    .option("--dry-run", "Print what would be uploaded without making changes")
    .action(
      async (options: { buildId: string; irPath: string; packageId: string; dryRun?: boolean }) => {
        console.log(`\n☁️ Uploading IR artifacts for package: ${options.packageId}`);
        console.log(`   Build ID: ${options.buildId}`);
        console.log(`   Source path: ${options.irPath}`);

        if (options.dryRun) {
          console.log("   (dry-run mode - no actual uploads)\n");
        }

        try {
          const result = await uploadIR({
            buildId: options.buildId,
            irOutputPath: options.irPath,
            packageLevel: true,
            packageId: options.packageId,
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
      },
    );

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("❌ Upload failed:", error);
  process.exit(1);
});

export { main as uploadIrMain };
