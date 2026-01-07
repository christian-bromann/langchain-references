/**
 * TypeScript Extractor
 *
 * Uses TypeDoc to generate JSON output from TypeScript source code.
 */

import * as td from "typedoc";
import * as ts from "typescript";
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
 * Check if a file path is a TypeScript source file (not a .d.ts declaration file)
 */
function isSourceTsFile(filePath: string): boolean {
  return filePath.endsWith(".ts") && !filePath.endsWith(".d.ts");
}

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
            if (typeof importObj.default === "string" && isSourceTsFile(importObj.default)) {
              return importObj.default;
            }
          }
          // Recursively check sub-objects
          for (const value of Object.values(record)) {
            const result = extractInput(value);
            if (result && isSourceTsFile(result)) return result;
          }
        }
        return undefined;
      };

      for (const [, value] of Object.entries(packageJson.exports)) {
        const input = extractInput(value);
        if (input && isSourceTsFile(input)) {
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
 * Try to resolve a tsconfig using TypeScript's resolution (handles package specifiers like @langchain/tsconfig).
 * Returns the parsed config if successful, or null if resolution fails.
 */
function tryResolveTsconfig(
  tsconfigPath: string,
  workingDir?: string
): { config: ts.ParsedCommandLine; error?: undefined } | { config?: undefined; error: string } {
  const absoluteTsconfigPath = path.resolve(tsconfigPath);
  const configDir = path.dirname(absoluteTsconfigPath);

  // Use the package directory as the base for resolution, not the cwd
  // This is important for monorepos where node_modules is at a different level
  const resolveDir = workingDir ? path.resolve(workingDir) : configDir;

  // Create a custom CompilerHost that resolves from the package directory
  const customSys: ts.System = {
    ...ts.sys,
    getCurrentDirectory: () => resolveDir,
  };

  const configFile = ts.readConfigFile(absoluteTsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    return { error: ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n") };
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    customSys,
    configDir,
    undefined,
    absoluteTsconfigPath
  );

  // Check for errors (especially unresolved extends)
  const fatalErrors = parsed.errors.filter(
    (e) => e.category === ts.DiagnosticCategory.Error
  );

  if (fatalErrors.length > 0) {
    const messages = fatalErrors
      .map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n"))
      .join("; ");
    return { error: messages };
  }

  return { config: parsed };
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
   * Check if a tsconfig is usable by attempting full resolution including extends.
   * Uses TypeScript's built-in resolution which handles package specifiers.
   */
  private isTsconfigUsable(tsconfigPath: string): boolean {
    try {
      // Pass the package path as the working directory for proper module resolution
      const result = tryResolveTsconfig(tsconfigPath, this.config.packagePath);
      if (result.error) {
        console.log(`   ⚠️  tsconfig resolution failed: ${result.error}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error checking tsconfig:", error);
      return false;
    }
  }

  /**
   * Create a temporary tsconfig for extraction, optionally merging with original tsconfig settings.
   */
  private async createTempTsconfig(originalTsconfigPath?: string): Promise<string> {
    const tempPath = path.join(this.config.packagePath, ".typedoc-tsconfig.json");

    // Start with minimal config
    let config: Record<string, unknown> = {
      ...MINIMAL_TSCONFIG,
      include: this.config.entryPoints.map((ep) => {
        const dir = path.dirname(ep);
        return dir ? `${dir}/**/*` : "**/*";
      }),
    };

    // Try to merge settings from original tsconfig (without extends)
    if (originalTsconfigPath) {
      try {
        const content = await fs.readFile(originalTsconfigPath, "utf-8");
        const { config: originalConfig } = ts.parseConfigFileTextToJson(originalTsconfigPath, content);
        if (originalConfig) {
          // Merge compilerOptions from original, but keep our essential overrides
          const originalCompilerOptions = originalConfig.compilerOptions || {};
          config = {
            compilerOptions: {
              ...originalCompilerOptions,
              // Essential overrides for extraction
              skipLibCheck: true,
              noEmit: true,
              declaration: false,
            },
            include: originalConfig.include || config.include,
            exclude: originalConfig.exclude || MINIMAL_TSCONFIG.exclude,
            // Explicitly omit 'extends' to avoid resolution issues
          };
        }
      } catch {
        // Fall back to minimal config if we can't read original
      }
    }

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

    if (this.isTsconfigUsable(projectTsconfigPath)) {
      tsconfigPath = projectTsconfigPath;
    } else {
      // Create a temporary tsconfig, merging settings from original if possible
      console.log("   ⚠️  Project tsconfig not usable, creating merged config without extends");
      tempTsconfigPath = await this.createTempTsconfig(projectTsconfigPath);
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
