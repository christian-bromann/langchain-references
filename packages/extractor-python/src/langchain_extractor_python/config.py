"""
Extraction Configuration

Defines the configuration options for Python API extraction.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ExtractionConfig:
    """Configuration for Python extraction."""

    # Package to extract
    package_name: str
    package_path: str

    # Parsing options
    docstring_style: str = "google"  # google | numpy | sphinx
    include_private: bool = False
    include_special: bool = False

    # Filtering
    exclude_patterns: List[str] = field(default_factory=list)

    # Source info
    repo: str = ""
    sha: str = ""

    # Output options
    output_path: Optional[str] = None

    def __post_init__(self):
        """Validate configuration after initialization."""
        if not self.package_name:
            raise ValueError("package_name is required")
        if not self.package_path:
            raise ValueError("package_path is required")

        valid_styles = {"google", "numpy", "sphinx"}
        if self.docstring_style not in valid_styles:
            raise ValueError(
                f"docstring_style must be one of {valid_styles}, "
                f"got '{self.docstring_style}'"
            )

