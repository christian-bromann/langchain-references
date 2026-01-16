/**
 * IR Server - Express server that serves IR data locally
 *
 * This server mimics Vercel Blob storage URL structure, allowing
 * the web app to use the same HTTP-based loading in development
 * as it does in production.
 *
 * URL structure:
 * - /ir/packages/{packageId}/{buildId}/symbols.json
 * - /ir/packages/{packageId}/{buildId}/package.json
 * - /pointers/packages/{language}/{package}.json
 * - /pointers/index-{project}-{language}.json
 */

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import fs from "fs";

export interface ServerOptions {
  /** Port to listen on (default: 3001) */
  port: number;
  /** Path to ir-output directory */
  irOutputPath: string;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Create and configure the Express server
 */
export function createServer(options: ServerOptions): Express {
  const app = express();

  // Enable CORS for all origins (needed for Next.js dev server)
  app.use(cors());

  // Request logging
  if (options.verbose) {
    app.use(morgan("dev"));
  } else {
    // Minimal logging - only log non-200 responses
    app.use(
      morgan("dev", {
        skip: (_req: Request, res: Response) => res.statusCode < 400,
      })
    );
  }

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Rewrite scoped npm package paths
  // Blob storage URLs like /pointers/packages/javascript/@langchain/core.json
  // need to be mapped to local files: /pointers/packages/javascript/langchain__core.json
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Match scoped package pointer requests: /pointers/packages/{lang}/@scope/name.json
    const match = req.path.match(/^\/pointers\/packages\/(python|javascript)\/(@[^/]+)\/(.+\.json)$/);
    if (match) {
      const [, lang, scope, file] = match;
      // Transform @langchain/core.json to langchain__core.json
      const sanitizedName = scope.replace(/^@/, "") + "__" + file.replace(/\.json$/, "");
      req.url = `/pointers/packages/${lang}/${sanitizedName}.json`;
    }
    next();
  });

  // Serve static files from ir-output directory
  // The files are stored directly in ir-output/ but we serve them as if they're at the root
  app.use(
    express.static(options.irOutputPath, {
      // Set appropriate headers for JSON files
      setHeaders: (res: Response, filePath: string) => {
        if (filePath.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json");
        }
        // Cache for development - short TTL
        res.setHeader("Cache-Control", "public, max-age=60");
      },
    })
  );

  // 404 handler with helpful message
  app.use((req: Request, res: Response) => {
    const requestedPath = path.join(options.irOutputPath, req.path);

    // Check if it's a directory listing request
    if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()) {
      try {
        const files = fs.readdirSync(requestedPath);
        res.json({
          error: "Directory listing",
          path: req.path,
          files: files.slice(0, 20), // Limit to first 20
          total: files.length,
        });
        return;
      } catch {
        // Fall through to 404
      }
    }

    res.status(404).json({
      error: "Not found",
      path: req.path,
      hint: `File not found at ${requestedPath}. Run 'pnpm pull-ir' to download IR data.`,
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[ir-server] Error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  });

  return app;
}

/**
 * Start the server
 */
export function startServer(options: ServerOptions): void {
  const app = createServer(options);

  // Verify ir-output directory exists
  if (!fs.existsSync(options.irOutputPath)) {
    console.warn(`\n⚠️  IR output directory not found: ${options.irOutputPath}`);
    console.warn("   Run 'pnpm pull-ir' to download IR data.\n");
  }

  app.listen(options.port, () => {
    console.log(`\n🚀 IR Server running at http://localhost:${options.port}`);
    console.log(`   Serving files from: ${options.irOutputPath}`);
    console.log(`\n   Set BLOB_URL=http://localhost:${options.port} in your .env.local\n`);
  });
}
