/**
 * TypeScript Extractor
 *
 * Uses TypeDoc to generate JSON output from TypeScript source code.
 */

import * as td from "typedoc";
import path from "path";
import fs from "fs/promises";
import { glob } from "tinyglobby";
import { ExtractionConfig, validateConfig } from "./config.js";

/**
 * Minimal tsconfig for TypeDoc when project tsconfig is not usable.
 */
const MINIMAL_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2022", "DOM"],
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    declaration: false,
    noEmit: true,
  },
  include: ["src/**/*"],
  exclude: ["node_modules", "dist"],
};

/**
 * Extract entry points from package.json exports field.
 */
async function discoverEntryPointsFromExports(
  packagePath: string
): Promise<string[]> {
  try {
    const packageJsonPath = path.join(packagePath, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(content);

    const entryPoints: string[] = [];

    if (packageJson.exports) {
      const extractInput = (obj: unknown): string | undefined => {
        if (typeof obj === "string") return obj;
        if (typeof obj === "object" && obj !== null) {
          const record = obj as Record<string, unknown>;
          // Look for 'input' field first (used by langchainjs)
          if (typeof record.input === "string") return record.input;
          // Then try 'import' or 'require'
          if (typeof record.import === "object" && record.import !== null) {
            const importObj = record.import as Record<string, unknown>;
            if (typeof importObj.default === "string" && importObj.default.endsWith(".ts")) {
              return importObj.default;
            }
          }
          // Recursively check sub-objects
          for (const value of Object.values(record)) {
            const result = extractInput(value);
            if (result && result.endsWith(".ts")) return result;
          }
        }
        return undefined;
      };

      for (const [, value] of Object.entries(packageJson.exports)) {
        const input = extractInput(value);
        if (input && input.endsWith(".ts")) {
          // Normalize path (remove leading ./)
          const normalized = input.replace(/^\.\//, "");
          if (!entryPoints.includes(normalized)) {
            entryPoints.push(normalized);
          }
        }
      }
    }

    return entryPoints;
  } catch {
    return [];
  }
}

/**
 * Resolve entry points - handles "auto" discovery and glob patterns.
 */
async function resolveEntryPoints(
  packagePath: string,
  entryPoints: string[]
): Promise<string[]> {
  const resolved: string[] = [];

  for (const ep of entryPoints) {
    if (ep === "auto") {
      // Auto-discover from package.json exports
      const discovered = await discoverEntryPointsFromExports(packagePath);
      if (discovered.length > 0) {
        resolved.push(...discovered);
      } else {
        // Fallback to src/*.ts
        const globbed = await glob(["src/*.ts", "src/**/index.ts"], {
          cwd: packagePath,
          ignore: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
        });
        resolved.push(...globbed);
      }
    } else if (ep.includes("*")) {
      // Glob pattern
      const globbed = await glob([ep], {
        cwd: packagePath,
        ignore: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"],
      });
      resolved.push(...globbed);
    } else {
      resolved.push(ep);
    }
  }

  // Remove duplicates
  return [...new Set(resolved)];
}

/**
 * TypeScript API extractor using TypeDoc.
 */
export class TypeScriptExtractor {
  private config: ExtractionConfig;

  constructor(config: ExtractionConfig) {
    validateConfig(config);
    this.config = config;
  }

  /**
   * Check if a tsconfig is usable (exists and doesn't have problematic extends).
   */
  private async isTsconfigUsable(tsconfigPath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(tsconfigPath, "utf-8");
      const tsconfig = JSON.parse(content);

      // Check if it extends a path that doesn't exist
      if (tsconfig.extends) {
        const extendsPath = path.resolve(path.dirname(tsconfigPath), tsconfig.extends);
        try {
          await fs.access(extendsPath);
        } catch {
          // Extended config doesn't exist
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a temporary tsconfig for extraction.
   */
  private async createTempTsconfig(): Promise<string> {
    const tempPath = path.join(this.config.packagePath, ".typedoc-tsconfig.json");

    // Customize include paths based on entry points
    const config = {
      ...MINIMAL_TSCONFIG,
      include: this.config.entryPoints.map((ep) => {
        const dir = path.dirname(ep);
        return dir ? `${dir}/**/*` : "**/*";
      }),
    };

    await fs.writeFile(tempPath, JSON.stringify(config, null, 2));
    return tempPath;
  }

  /**
   * Clean up temporary files.
   */
  private async cleanup(tempTsconfigPath?: string): Promise<void> {
    if (tempTsconfigPath) {
      try {
        await fs.unlink(tempTsconfigPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract API documentation and return TypeDoc project reflection.
   */
  async extract(): Promise<td.ProjectReflection | null> {
    let tsconfigPath: string | undefined;
    let tempTsconfigPath: string | undefined;

    // Resolve entry points (handles "auto" and glob patterns)
    const resolvedEntryPoints = await resolveEntryPoints(
      this.config.packagePath,
      this.config.entryPoints
    );

    if (resolvedEntryPoints.length === 0) {
      throw new Error("No entry points found for extraction");
    }

    // Check if project's tsconfig is usable
    const projectTsconfigPath = this.config.tsconfig
      ? path.join(this.config.packagePath, this.config.tsconfig)
      : path.join(this.config.packagePath, "tsconfig.json");

    if (await this.isTsconfigUsable(projectTsconfigPath)) {
      tsconfigPath = projectTsconfigPath;
    } else {
      // Create a temporary minimal tsconfig
      console.log("   ⚠️  Project tsconfig not usable, using minimal config");
      tempTsconfigPath = await this.createTempTsconfig();
      tsconfigPath = tempTsconfigPath;
    }

    try {
      const app = await td.Application.bootstrapWithPlugins({
        entryPoints: resolvedEntryPoints.map((ep) =>
          path.join(this.config.packagePath, ep)
        ),
        tsconfig: tsconfigPath,

        // Filtering options
        excludePrivate: this.config.excludePrivate,
        excludeInternal: this.config.excludeInternal,
        excludeExternals: this.config.excludeExternals,

        // Skip type checking for speed (we're just extracting docs)
        skipErrorChecking: true,

        // Don't require node_modules
        excludeNotDocumented: false,

        // Suppress console output
        logLevel: "Warn",
      });

      const project = await app.convert();

      if (!project) {
        throw new Error("TypeDoc conversion failed - no project returned");
      }

      return project;
    } finally {
      await this.cleanup(tempTsconfigPath);
    }
  }

  /**
   * Extract API documentation and return as serialized JSON object.
   */
  async extractToJson(): Promise<object> {
    const project = await this.extract();
    if (!project) {
      throw new Error("No project to serialize");
    }

    const app = await td.Application.bootstrapWithPlugins({});
    const serializer = app.serializer;
    return serializer.projectToObject(project, process.cwd() as td.NormalizedPath);
  }

  /**
   * Get package information from package.json.
   */
  async getPackageInfo(): Promise<{ name: string; version: string }> {
    try {
      const packageJsonPath = path.join(this.config.packagePath, "package.json");
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);
      return {
        name: packageJson.name || this.config.packageName,
        version: packageJson.version || "unknown",
      };
    } catch {
      return {
        name: this.config.packageName,
        version: "unknown",
      };
    }
  }
}
