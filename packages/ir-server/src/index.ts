#!/usr/bin/env tsx
/**
 * IR Server Entry Point
 *
 * Local development server that mimics Vercel Blob storage for IR data.
 * This allows the web app to use the same HTTP-based loading in development.
 *
 * Usage:
 *   pnpm serve-ir                    # Start with defaults
 *   PORT=4000 pnpm serve-ir          # Custom port
 *   VERBOSE=true pnpm serve-ir       # Enable request logging
 */

import path from "path";
import url from "url";
import { startServer } from "./server.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Configuration from environment
const port = parseInt(process.env.PORT || "3001", 10);
const verbose = process.env.VERBOSE === "true" || process.env.VERBOSE === "1";

// ir-output is at the repository root
// From packages/ir-server/src/, go up 3 levels to root
const irOutputPath = path.resolve(__dirname, "..", "..", "..", "ir-output");

startServer({
  port,
  irOutputPath,
  verbose,
});
