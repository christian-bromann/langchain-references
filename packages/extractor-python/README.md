# LangChain Python Extractor

A griffe-based Python API documentation extractor that generates Intermediate Representation (IR) for the LangChain reference docs platform.

## Installation

```bash
pip install -e .
```

## Usage

### CLI

```bash
extract-python \
  --package langchain_core \
  --path /path/to/langchain/libs/core \
  --output output.json \
  --repo langchain-ai/langchain \
  --sha abc123
```

### Python API

```python
from langchain_extractor_python import ExtractionConfig, PythonExtractor, IRTransformer

config = ExtractionConfig(
    package_name="langchain_core",
    package_path="/path/to/langchain/libs/core",
    repo="langchain-ai/langchain",
    sha="abc123",
)

extractor = PythonExtractor(config)
raw_data = extractor.extract()

transformer = IRTransformer(config)
ir_symbols = transformer.transform(raw_data)
```

## Features

- Static parsing using griffe (no runtime imports required)
- Google-style docstring support
- Generates IR-compatible output
- Source location tracking





