# @langchain/build-pipeline

IR build pipeline for LangChain Reference Docs. This package orchestrates the extraction, transformation, and upload of API documentation from source repositories.

## Overview

The build pipeline:

1. **Fetches** source code tarballs from GitHub repositories
2. **Extracts** API documentation using language-specific extractors (Python/TypeScript)
3. **Transforms** the extracted data into the IR (Intermediate Representation) format
4. **Uploads** artifacts to Vercel Blob storage
5. **Updates** build pointers for serving the documentation

## Installation

This package is part of the LangChain Reference Docs monorepo and is not published to npm.

```bash
# Install dependencies from the monorepo root
pnpm install
```

## CLI Commands

### build-ir

The main build command that orchestrates the entire pipeline.

```bash
# Build a specific config file
pnpm build:ir --config ./configs/langchain-typescript.json

# Build all configs for a project
pnpm build:ir --project langchain

# Build all configs for a language
pnpm build:ir --language typescript

# Build a specific project+language combination
pnpm build:ir --project langgraph --language typescript

# Build everything
pnpm build:ir --all

# Local build (skip cloud uploads)
pnpm build:ir --config ./configs/langchain-typescript.json --local

# With version history tracking
pnpm build:ir --config ./configs/langchain-typescript.json --with-versions
```

#### Options

| Option              | Description                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `--config <path>`   | Build a specific configuration file                               |
| `--project <name>`  | Build all configs for a project (langchain, langgraph, deepagent) |
| `--language <lang>` | Build all configs for a language (python, typescript)             |
| `--all`             | Build all project/language combinations                           |
| `--sha <sha>`       | Git SHA to use (defaults to latest main)                          |
| `--output <path>`   | Output directory for IR artifacts (default: ./ir-output)          |
| `--cache <path>`    | Cache directory for tarballs (default: system temp)               |
| `--local`           | Local-only mode (skip all cloud uploads)                          |
| `--skip-upload`     | Skip upload to Vercel Blob                                        |
| `--skip-pointers`   | Skip updating build pointers                                      |
| `--with-versions`   | Enable version history tracking                                   |
| `--full`            | Force full rebuild of version history                             |
| `-v, --verbose`     | Enable verbose output                                             |

### sync-versions

Fetches and caches version metadata from GitHub tags for changelog generation.

```bash
# Sync all projects
pnpm sync-versions

# Sync specific project
pnpm sync-versions --project langchain

# Force full refresh
pnpm sync-versions --full
```

### fetch-tarball

Downloads and extracts source tarballs from GitHub.

```bash
# Fetch a specific SHA
pnpm fetch-tarball --repo langchain-ai/langchainjs --sha abc123

# Fetch latest main
pnpm fetch-tarball --repo langchain-ai/langchainjs
```

## Programmatic Usage

The package also exports utilities for custom build pipelines:

```typescript
import {
  // Tarball utilities
  fetchTarball,
  fetchMultiple,
  getLatestSha,
  getCacheBaseDir,

  // Upload utilities
  uploadIR,
  cleanupOldBuilds,

  // Pointer management
  updatePointers,
  getLatestBuildId,
  getBuildMetadata,

  // Version discovery
  discoverVersions,
  parseVersionFromTag,

  // Changelog generation
  incrementalBuild,
  fullChangelogBuild,
  annotateLatestIR,

  // Diff engine
  computeVersionDelta,
  detectChanges,

  // Snapshot utilities
  createSnapshot,
  snapshotsEqual,
} from "@langchain/build-pipeline";
```

### Example: Custom Build

```typescript
import { fetchTarball, getLatestSha, uploadIR, updatePointers } from "@langchain/build-pipeline";

async function customBuild() {
  const repo = "langchain-ai/langchainjs";
  const sha = await getLatestSha(repo);

  // Fetch source
  const fetchResult = await fetchTarball({
    repo,
    sha,
    output: "/tmp/cache",
  });

  console.log(`Source extracted to: ${fetchResult.extractedPath}`);

  // Run your custom extraction logic...

  // Upload results (package-level)
  await uploadIR({
    buildId: "my-build-id",
    irOutputPath: "./ir-output/packages/pkg_py_langchain_openai/my-build-id",
    packageLevel: true,
    packageId: "pkg_py_langchain_openai",
  });
}
```

## Configuration Files

Build configurations are JSON files in the `configs/` directory:

```json
{
  "project": "langchain",
  "language": "typescript",
  "repo": "langchain-ai/langchainjs",
  "packages": [
    {
      "name": "@langchain/core",
      "path": "libs/langchain-core",
      "entryPoints": ["src/index.ts"],
      "versioning": {
        "tagPattern": "@langchain/core@*",
        "maxVersions": 10,
        "minVersion": "0.3.0"
      }
    }
  ]
}
```

## Environment Variables

| Variable                | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| `GITHUB_TOKEN`          | GitHub personal access token for API access (recommended) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token for uploads                     |
| `BLOB_URL`              | Vercel Blob storage URL                                   |
| `BLOB_BASE_URL`         | Base URL for fetching existing changelogs                 |

## Architecture

```txt
src/
├── commands/           # CLI command implementations
│   ├── build-ir.ts     # Main build orchestration
│   ├── fetch-tarball.ts # Source fetching command
│   └── sync-versions.ts # Version metadata sync
├── lib/                # Reusable library modules
│   ├── tarball.ts      # Tarball fetching and extraction
│   ├── upload.ts       # Vercel Blob uploads
│   ├── pointers.ts     # Build pointer management
│   ├── version-discovery.ts # Git tag discovery
│   ├── changelog-fetcher.ts # Deployed changelog fetching
│   ├── changelog-generator.ts # Changelog generation
│   ├── diff-engine.ts  # Symbol diffing logic
│   └── snapshot.ts     # Symbol snapshot creation
└── index.ts            # Package exports
```

## Development

```bash
# Build the package
pnpm build

# Watch mode
pnpm dev

# Type checking
pnpm typecheck

# Run commands directly (without building)
pnpm tsx src/commands/build-ir.ts --help
```

## Related Packages

- `@langchain/ir-schema` - TypeScript types for the IR format
- `@langchain/extractor-typescript` - TypeScript API extractor
- `@langchain/extractor-python` - Python API extractor
