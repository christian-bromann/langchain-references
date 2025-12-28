"""
Python Extractor

Uses griffe to statically parse Python source code and extract
API documentation without runtime imports.
"""

import griffe
from griffe import GriffeLoader, Object as GriffeObject
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

from .config import ExtractionConfig


# Map docstring style names to griffe parser names
DOCSTRING_STYLES = {
    "google": "google",
    "numpy": "numpy",
    "sphinx": "sphinx",
}


class PythonExtractor:
    """Extract Python API documentation using griffe."""

    def __init__(self, config: ExtractionConfig):
        """
        Initialize the extractor with configuration.

        Args:
            config: Extraction configuration options.
        """
        self.config = config
        self._loader: Optional[GriffeLoader] = None

    @property
    def loader(self) -> GriffeLoader:
        """Get or create the griffe loader."""
        if self._loader is None:
            docstring_style = DOCSTRING_STYLES.get(
                self.config.docstring_style,
                "google",
            )
            self._loader = GriffeLoader(
                docstring_parser=docstring_style,
            )
        return self._loader

    def extract(self) -> Dict[str, Any]:
        """
        Extract all symbols from the package.

        Returns:
            Dictionary containing package info and extracted symbols.
        """
        # Load the package using griffe.load() function with search_paths
        docstring_style = DOCSTRING_STYLES.get(
            self.config.docstring_style,
            "google",
        )
        package = griffe.load(
            self.config.package_name,
            search_paths=[self.config.package_path],
            docstring_parser=docstring_style,
            resolve_aliases=False,  # Don't try to resolve external aliases
        )

        # Collect all symbols
        symbols = []
        errors = []

        try:
            for obj in self._walk(package):
                try:
                    if self._should_include(obj):
                        symbol = self._extract_symbol(obj)
                        if symbol:
                            symbols.append(symbol)
                except Exception as e:
                    errors.append(str(e))
        except Exception as e:
            errors.append(f"Walk error: {e}")

        if errors:
            print(f"   ⚠️  {len(errors)} warnings during extraction")

        return {
            "package": self.config.package_name,
            "version": self._get_version(package),
            "repo": self.config.repo,
            "sha": self.config.sha,
            "symbols": symbols,
        }

    def _walk(self, obj: GriffeObject) -> Generator[GriffeObject, None, None]:
        """
        Recursively walk all objects in a module.

        Args:
            obj: The griffe object to walk.

        Yields:
            Each griffe object in the tree.
        """
        try:
            # Skip alias objects that point to external modules
            is_alias = getattr(obj, "is_alias", False)
            if is_alias:
                try:
                    # Try to access the target to see if it's resolvable
                    _ = obj.target
                except Exception:
                    # Can't resolve the alias, skip it
                    return

            yield obj

            # Get members safely
            members = getattr(obj, "members", None)
            if members:
                for name, member in list(members.items()):
                    try:
                        yield from self._walk(member)
                    except Exception:
                        # Skip members that cause errors (unresolvable aliases, etc.)
                        pass
        except Exception:
            # Skip objects that cause any errors
            pass

    def _should_include(self, obj: GriffeObject) -> bool:
        """
        Check if object should be included in output.

        Args:
            obj: The griffe object to check.

        Returns:
            True if the object should be included.
        """
        # Skip alias objects that couldn't be resolved
        if hasattr(obj, "is_alias") and obj.is_alias:
            return False

        # Skip private unless configured
        name = getattr(obj, "name", "")
        if name.startswith("_") and not self.config.include_private:
            # But allow dunder methods if include_special is True
            if self.config.include_special:
                if name.startswith("__") and name.endswith("__"):
                    return True
            return False

        # Skip excluded patterns
        obj_path = getattr(obj, "path", "")
        if self.config.exclude_patterns:
            for pattern in self.config.exclude_patterns:
                if pattern in obj_path:
                    return False

        return True

    def _extract_symbol(self, obj: GriffeObject) -> Optional[Dict[str, Any]]:
        """
        Extract symbol information from a griffe object.

        Args:
            obj: The griffe object to extract.

        Returns:
            Dictionary containing symbol information, or None if extraction fails.
        """
        try:
            kind = self._get_kind(obj)
            if kind == "unknown":
                return None

            return {
                "kind": kind,
                "name": obj.name,
                "path": obj.path,
                "signature": self._get_signature(obj),
                "docstring": self._extract_docstring(obj),
                "source": {
                    "file": str(obj.filepath) if obj.filepath else None,
                    "line": obj.lineno,
                    "end_line": obj.endlineno,
                },
                "members": self._get_member_info(obj),
                "bases": self._get_bases(obj),
                "decorators": self._get_decorators(obj),
                "is_async": getattr(obj, "is_async", False),
                "is_abstract": self._is_abstract(obj),
            }
        except Exception:
            # Silently skip objects that can't be extracted
            return None

    def _get_kind(self, obj: GriffeObject) -> str:
        """
        Map griffe kind to IR kind.

        Args:
            obj: The griffe object.

        Returns:
            The IR kind string.
        """
        kind = getattr(obj, "kind", None)
        if kind is None:
            return "unknown"

        # Convert Kind enum to string for comparison
        kind_str = str(kind.name).lower() if hasattr(kind, "name") else str(kind).lower()

        kind_map = {
            "module": "module",
            "class": "class",
            "function": "function",
            "attribute": "attribute",
            "alias": "alias",
        }

        # Check if it's a method (function inside a class)
        base_kind = kind_map.get(kind_str, "unknown")
        if base_kind == "function":
            parent = getattr(obj, "parent", None)
            if parent:
                parent_kind = getattr(parent, "kind", None)
                if parent_kind:
                    parent_kind_str = str(parent_kind.name).lower() if hasattr(parent_kind, "name") else str(parent_kind).lower()
                    if parent_kind_str == "class":
                        return "method"

        return base_kind

    def _get_signature(self, obj: GriffeObject) -> str:
        """
        Get the signature string for callable objects.

        Args:
            obj: The griffe object.

        Returns:
            The signature string, or empty string if not applicable.
        """
        try:
            if hasattr(obj, "signature"):
                return str(obj.signature)
            if hasattr(obj, "parameters"):
                params = []
                for param in obj.parameters:
                    param_str = param.name
                    if param.annotation:
                        param_str += f": {param.annotation}"
                    if param.default:
                        param_str += f" = {param.default}"
                    params.append(param_str)
                return f"({', '.join(params)})"
        except Exception:
            pass
        return ""

    def _extract_docstring(self, obj: GriffeObject) -> Dict[str, Any]:
        """
        Extract parsed docstring from a griffe object.

        Args:
            obj: The griffe object.

        Returns:
            Dictionary containing docstring information.
        """
        if not obj.docstring:
            return {"summary": "", "sections": []}

        try:
            parsed = obj.docstring.parsed

            # Get summary from first section
            summary = ""
            if parsed:
                first_section = parsed[0]
                if hasattr(first_section, "value"):
                    summary = str(first_section.value)

            # Extract all sections
            sections = []
            for section in parsed:
                section_data = self._section_to_dict(section)
                if section_data:
                    sections.append(section_data)

            return {
                "summary": summary,
                "sections": sections,
            }
        except Exception:
            # Fall back to raw docstring value
            try:
                return {"summary": str(obj.docstring.value) if obj.docstring else "", "sections": []}
            except Exception:
                return {"summary": "", "sections": []}

    def _section_to_dict(self, section) -> Optional[Dict[str, Any]]:
        """
        Convert docstring section to dictionary.

        Args:
            section: The docstring section.

        Returns:
            Dictionary representation of the section.
        """
        try:
            kind = section.kind.name.lower() if hasattr(section, "kind") else "text"

            if hasattr(section, "value"):
                value = section.value
                if isinstance(value, list):
                    # Parameters, returns, etc.
                    items = []
                    for item in value:
                        item_dict = {
                            "name": getattr(item, "name", ""),
                            "annotation": str(item.annotation) if getattr(item, "annotation", None) else None,
                            "description": getattr(item, "description", ""),
                        }
                        if hasattr(item, "default") and item.default:
                            item_dict["default"] = str(item.default)
                        items.append(item_dict)
                    return {"kind": kind, "value": items}
                else:
                    return {"kind": kind, "value": str(value)}
            return {"kind": kind, "value": str(section)}
        except Exception:
            return None

    def _get_member_names(self, obj: GriffeObject) -> List[str]:
        """Get names of members for classes/modules."""
        if hasattr(obj, "members"):
            return [name for name in obj.members.keys() if not name.startswith("_")]
        return []

    def _get_member_info(self, obj: GriffeObject) -> List[Dict[str, str]]:
        """Get member information including kinds for classes/modules."""
        members = []
        if hasattr(obj, "members"):
            for name, member in obj.members.items():
                if name.startswith("_"):
                    continue
                kind = self._get_kind(member)
                members.append({
                    "name": name,
                    "kind": kind,
                })
        return members

    def _get_bases(self, obj: GriffeObject) -> List[str]:
        """Get base classes for a class."""
        if hasattr(obj, "bases"):
            return [str(base) for base in obj.bases]
        return []

    def _get_decorators(self, obj: GriffeObject) -> List[str]:
        """Get decorator names for a callable."""
        if hasattr(obj, "decorators"):
            return [str(dec.value) for dec in obj.decorators]
        return []

    def _is_abstract(self, obj: GriffeObject) -> bool:
        """Check if a class or method is abstract."""
        decorators = self._get_decorators(obj)
        return any("abstract" in dec.lower() for dec in decorators)

    def _get_version(self, package: GriffeObject) -> str:
        """
        Try to get package version from __version__ attribute.

        Args:
            package: The package object.

        Returns:
            Version string or "unknown".
        """
        try:
            if hasattr(package, "members") and "__version__" in package.members:
                version_obj = package.members["__version__"]
                if hasattr(version_obj, "value"):
                    return str(version_obj.value).strip("'\"")
        except Exception:
            pass
        return "unknown"

