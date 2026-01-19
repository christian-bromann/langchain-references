# @langchain/extractor-go

Go API documentation extractor for the LangChain Reference Documentation platform.

## Overview

This package extracts API documentation from Go source files and transforms it into the Intermediate Representation (IR) format used by the LangChain reference docs.

## Requirements

- **Node.js** 18+
- **Go** 1.21+ (for parsing Go source files)

### Installing Go

```bash
# macOS
brew install go

# Ubuntu/Debian
sudo apt install golang-go

# Windows (using scoop)
scoop install go

# Verify installation
go version
```

> **Note**: The build pipeline will skip Go extraction if Go is not installed and log a warning.

## Installation

```bash
pnpm add @langchain/extractor-go
```

## Usage

### CLI

```bash
# Extract Go package to IR format
extract-go \
  --package langsmith \
  --path ./path/to/go/src \
  --output ./output/symbols.json \
  --repo langchain-ai/langsmith-go \
  --sha abc123
```

### Programmatic

```typescript
import { GoExtractor, GoTransformer, createConfig } from "@langchain/extractor-go";

const config = createConfig({
  packageName: "langsmith",
  packagePath: "./path/to/go/src",
  repo: "langchain-ai/langsmith-go",
  sha: "abc123",
});

const extractor = new GoExtractor(config);
const parsed = await extractor.extract();

const transformer = new GoTransformer(parsed, config);
const symbols = transformer.transform();
```

## Features

- Parses Go source files using regex-based extraction
- Uses `go doc` command for documentation extraction when available
- Extracts structs, interfaces, functions, and methods
- Extracts constants and variables
- Converts Go documentation to Markdown
- Generates IR-compatible symbol records

## Output Format

The extractor produces a `symbols.json` file containing:

```json
{
  "package": {
    "packageId": "pkg_go_langsmith",
    "displayName": "LangSmith Go",
    "language": "go",
    "ecosystem": "go",
    "version": "1.0.0"
  },
  "symbols": [
    {
      "id": "pkg_go_langsmith:Client",
      "name": "Client",
      "kind": "class",
      "language": "go",
      "signature": "type Client struct",
      "summary": "Client for LangSmith API",
      "members": [...]
    }
  ]
}
```

## Symbol Kind Mapping

| Go Construct | IR Kind |
| ------------ | ------- |
| struct | class |
| interface | interface |
| func (top-level) | function |
| method (with receiver) | method (member) |
| type alias | type |
| const | variable |
| var | variable |
