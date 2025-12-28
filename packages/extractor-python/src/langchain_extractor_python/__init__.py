"""
LangChain Python Extractor

A griffe-based Python API documentation extractor that generates
Intermediate Representation (IR) for the LangChain reference docs platform.
"""

__version__ = "0.1.0"

from .config import ExtractionConfig
from .extractor import PythonExtractor
from .transformer import IRTransformer

__all__ = ["ExtractionConfig", "PythonExtractor", "IRTransformer"]

