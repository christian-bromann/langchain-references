# LangChain TypeScript Extractor

A TypeDoc-based TypeScript/JavaScript API documentation extractor that generates Intermediate Representation (IR) for the LangChain reference docs platform.

## Installation

```bash
pnpm install
pnpm build
```

## Usage

### CLI

```bash
extract-typescript \
  --package @langchain/core \
  --path /path/to/langchainjs/libs/langchain-core \
  --output output.json \
  --repo langchain-ai/langchainjs \
  --sha abc123
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--package` | Package name (required) | - |
| `--path` | Path to package source (required) | - |
| `--output` | Output JSON file (required) | - |
| `--repo` | Repository URL | "" |
| `--sha` | Git commit SHA | "" |
| `--entry-points` | Entry points (space-separated) | `src/index.ts` |
| `--tsconfig` | Path to tsconfig.json | `tsconfig.json` |
| `--include-private` | Include private members | false |
| `--include-internal` | Include @internal members | false |
| `--raw` | Output raw TypeDoc JSON | false |
| `-v, --verbose` | Enable verbose output | false |

### Programmatic API

```typescript
import {
  createConfig,
  TypeScriptExtractor,
  TypeDocTransformer,
} from "@langchain/extractor-typescript";

const config = createConfig({
  packageName: "@langchain/core",
  packagePath: "/path/to/langchainjs/libs/langchain-core",
  repo: "langchain-ai/langchainjs",
  sha: "abc123",
});

const extractor = new TypeScriptExtractor(config);
const rawJson = await extractor.extractToJson();

const transformer = new TypeDocTransformer(
  rawJson,
  config.packageName,
  config.repo,
  config.sha
);

const irSymbols = transformer.transform();
```

## Features

- Uses TypeDoc for accurate TypeScript type extraction
- Generates IR-compatible output
- Source location tracking with GitHub links
- Full JSDoc/TSDoc comment parsing
- Type parameter and generic support
- Class inheritance and interface implementation tracking



