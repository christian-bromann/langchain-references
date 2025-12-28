"""
CLI Interface

Command-line interface for the Python API extractor.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .config import ExtractionConfig
from .extractor import PythonExtractor
from .transformer import IRTransformer


def main(args: Optional[list] = None) -> int:
    """
    Main entry point for the CLI.

    Args:
        args: Command line arguments (defaults to sys.argv).

    Returns:
        Exit code (0 for success, non-zero for failure).
    """
    parser = argparse.ArgumentParser(
        description="Extract Python API documentation to IR format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  extract-python --package langchain_core --path ./libs/core --output ir.json
  extract-python --package langchain --path ./libs/langchain --repo langchain-ai/langchain --sha abc123
        """,
    )

    parser.add_argument(
        "--package",
        required=True,
        help="Package name to extract (e.g., langchain_core)",
    )
    parser.add_argument(
        "--path",
        required=True,
        help="Path to the package source directory",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON file path",
    )
    parser.add_argument(
        "--repo",
        default="",
        help="Repository URL (e.g., langchain-ai/langchain)",
    )
    parser.add_argument(
        "--sha",
        default="",
        help="Git commit SHA",
    )
    parser.add_argument(
        "--docstring-style",
        default="google",
        choices=["google", "numpy", "sphinx"],
        help="Docstring style to parse (default: google)",
    )
    parser.add_argument(
        "--include-private",
        action="store_true",
        help="Include private members (starting with _)",
    )
    parser.add_argument(
        "--include-special",
        action="store_true",
        help="Include special methods (dunder methods)",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Patterns to exclude (can be specified multiple times)",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Output raw extraction data without IR transformation",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )

    parsed_args = parser.parse_args(args)

    try:
        # Create configuration
        config = ExtractionConfig(
            package_name=parsed_args.package,
            package_path=parsed_args.path,
            docstring_style=parsed_args.docstring_style,
            include_private=parsed_args.include_private,
            include_special=parsed_args.include_special,
            exclude_patterns=parsed_args.exclude,
            repo=parsed_args.repo,
            sha=parsed_args.sha,
        )

        if parsed_args.verbose:
            print(f"Extracting: {config.package_name}")
            print(f"Source path: {config.package_path}")
            print(f"Docstring style: {config.docstring_style}")
            print(f"Repository: {config.repo}")
            print(f"SHA: {config.sha}")
            print()

        # Run extraction
        extractor = PythonExtractor(config)
        raw_data = extractor.extract()

        if parsed_args.verbose:
            print(f"Extracted {len(raw_data['symbols'])} symbols")

        # Transform to IR unless --raw is specified
        if parsed_args.raw:
            output_data = raw_data
        else:
            transformer = IRTransformer(config)
            output_data = transformer.transform(raw_data)

            if parsed_args.verbose:
                print(f"Transformed to {len(output_data['symbols'])} IR symbols")

        # Write output
        output_path = Path(parsed_args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"✅ Extracted {len(output_data['symbols'])} symbols to {parsed_args.output}")
        return 0

    except ValueError as e:
        print(f"❌ Configuration error: {e}", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"❌ File not found: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"❌ Extraction failed: {e}", file=sys.stderr)
        if parsed_args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

