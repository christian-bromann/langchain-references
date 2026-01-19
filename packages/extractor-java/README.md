# @langchain/extractor-java

Java API documentation extractor for the LangChain Reference Documentation platform.

## Overview

This package extracts API documentation from Java source files and transforms it into the Intermediate Representation (IR) format used by the LangChain reference docs.

## Requirements

- **Node.js** 18+
- **Java** 11+ (for parsing Java source files)

### Installing Java

```bash
# macOS
brew install openjdk@17

# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# Windows (using scoop)
scoop install openjdk17

# Verify installation
java -version
```

> **Note**: The build pipeline will skip Java extraction if Java is not installed and log a warning.

## Installation

```bash
pnpm add @langchain/extractor-java
```

## Usage

### CLI

```bash
# Extract Java package to IR format
extract-java \
  --package langsmith \
  --path ./path/to/java/src \
  --output ./output/symbols.json \
  --repo langchain-ai/langsmith-java \
  --sha abc123
```

### Programmatic

```typescript
import { JavaExtractor, JavaTransformer, createConfig } from "@langchain/extractor-java";

const config = createConfig({
  packageName: "langsmith",
  packagePath: "./path/to/java/src",
  repo: "langchain-ai/langsmith-java",
  sha: "abc123",
});

const extractor = new JavaExtractor(config);
const parsed = await extractor.extract();

const transformer = new JavaTransformer(parsed, config);
const symbols = transformer.transform();
```

## Features

- Parses Java source files using java-parser
- Extracts classes, interfaces, enums, and records
- Extracts methods, fields, and constructors
- Converts Javadoc to Markdown
- Generates IR-compatible symbol records

## Output Format

The extractor produces a `symbols.json` file containing:

```json
{
  "package": {
    "packageId": "pkg_java_langsmith",
    "displayName": "LangSmith Java",
    "language": "java",
    "ecosystem": "java",
    "version": "1.0.0"
  },
  "symbols": [
    {
      "id": "pkg_java_langsmith:Client",
      "name": "Client",
      "kind": "class",
      "language": "java",
      "signature": "public class Client",
      "summary": "Main client for LangSmith API",
      "members": [...]
    }
  ]
}
```

## Symbol Kind Mapping

| Java Construct | IR Kind |
|----------------|---------|
| class | class |
| interface | interface |
| enum | enum |
| record | class |
| annotation | type |
| method | method (member) |
| field | property (member) |
| constructor | constructor (member) |
