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
                "type_refs": self._extract_type_refs(obj),
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

    def _is_invalid_repr(self, value: str) -> bool:
        """
        Check if a string looks like a Python repr of an object rather than a valid value.

        Args:
            value: The string to check.

        Returns:
            True if the string appears to be an invalid repr (bound method, function, etc.)
        """
        if not value:
            return False
        # Strip whitespace for checking
        stripped = value.strip()
        # Check for common invalid repr patterns
        invalid_patterns = [
            "<bound method",
            "<function",
            "<class",
            "<module",
            "<built-in",
            "<lambda",
        ]
        return any(pattern in stripped for pattern in invalid_patterns)

    def _get_signature(self, obj: GriffeObject) -> str:
        """
        Get the signature string for callable objects.

        Args:
            obj: The griffe object.

        Returns:
            The signature string, or empty string if not applicable.
        """
        try:
            # Check if this object has parameters (functions, methods, classes with __init__)
            if not hasattr(obj, "parameters"):
                return ""

            # Verify parameters is actually iterable with parameter objects
            parameters = obj.parameters
            if parameters is None:
                return ""

            # Check if parameters looks like a bound method or other non-iterable
            params_repr = repr(parameters)
            if self._is_invalid_repr(params_repr):
                return ""

            params = []
            has_positional_only = False
            has_keyword_only = False
            positional_only_added = False
            keyword_only_added = False

            for param in parameters:
                # Verify this is a real parameter object
                if not hasattr(param, "name"):
                    continue

                # Get the parameter kind - normalize to lowercase with underscores
                kind_str = str(param.kind).lower() if hasattr(param, "kind") else ""

                # Check for positional-only (handles both "positional_only" and "positional-only")
                is_positional_only = "positional_only" in kind_str or "positional-only" in kind_str
                # Check for keyword-only
                is_keyword_only = "keyword_only" in kind_str or "keyword-only" in kind_str
                # Check for *args
                is_var_positional = "var_positional" in kind_str or "var-positional" in kind_str
                # Check for **kwargs
                is_var_keyword = "var_keyword" in kind_str or "var-keyword" in kind_str

                # Handle positional-only separator
                if is_positional_only:
                    has_positional_only = True
                elif has_positional_only and not positional_only_added:
                    # Add the / separator after positional-only params
                    params.append("/")
                    positional_only_added = True

                # Handle keyword-only separator (but not if we just added *args)
                if is_keyword_only and not has_keyword_only and not is_var_positional:
                    has_keyword_only = True
                    if not keyword_only_added:
                        params.append("*")
                        keyword_only_added = True

                # Handle *args and **kwargs
                if is_var_positional:
                    param_str = f"*{param.name}"
                    keyword_only_added = True  # *args implicitly starts keyword-only section
                elif is_var_keyword:
                    param_str = f"**{param.name}"
                else:
                    param_str = param.name

                # Add type annotation if present
                if param.annotation:
                    # Ensure annotation is converted to string properly
                    annotation_str = str(param.annotation) if param.annotation else ""
                    # Skip if it looks like a bound method or other non-type string
                    if annotation_str and not self._is_invalid_repr(annotation_str):
                        param_str += f": {annotation_str}"

                # Add default value if present
                if param.default is not None:
                    default_str = str(param.default) if param.default is not None else ""
                    # Skip if it looks like a bound method or other non-value string
                    if default_str and not self._is_invalid_repr(default_str):
                        param_str += f" = {default_str}"

                params.append(param_str)

            # Add trailing / for positional-only params if they're the last params
            if has_positional_only and not positional_only_added:
                params.append("/")

            # Build signature with function/method name and return type
            name = obj.name if hasattr(obj, "name") else ""
            params_str = ",\n    ".join(params) if params else ""

            if params:
                signature = f"{name}(\n    {params_str},\n)"
            else:
                signature = f"{name}()"

            # Add return type if available
            if hasattr(obj, "returns") and obj.returns:
                # Ensure returns is converted to string properly
                returns_str = str(obj.returns) if obj.returns else ""
                # Skip if it looks like a bound method or other non-type string
                if returns_str and not self._is_invalid_repr(returns_str):
                    signature += f" -> {returns_str}"

            # Final validation: ensure signature doesn't contain any invalid patterns
            if self._is_invalid_repr(signature):
                # Something went wrong, return empty to fall back gracefully
                return ""

            return signature
        except Exception:
            pass
        return ""

    def _extract_type_refs(self, obj: GriffeObject) -> List[Dict[str, Any]]:
        """
        Extract type references from parameters and return type for cross-linking.

        Args:
            obj: The griffe object.

        Returns:
            List of type reference dictionaries with name and qualifiedName.
        """
        type_refs = []
        seen_names: set = set()

        # Built-in types and common primitives to skip
        builtins = {
            "str", "int", "float", "bool", "None", "bytes", "object",
            "list", "dict", "set", "tuple", "type", "Any", "Optional",
            "Union", "List", "Dict", "Set", "Tuple", "Type", "Callable",
            "Iterable", "Iterator", "Generator", "Sequence", "Mapping",
            "Literal", "TypeVar", "Generic", "Protocol", "ClassVar",
            "Awaitable", "Coroutine", "AsyncIterator", "AsyncGenerator",
            "Self", "NoReturn", "Never", "Final", "Annotated",
        }

        def extract_type_names_from_expr(expr, obj_context) -> None:
            """Recursively extract type names from a griffe expression."""
            if expr is None:
                return

            expr_type = type(expr).__name__

            # Handle ExprName - simple type reference like "GraphSchema"
            if expr_type == "ExprName":
                name = getattr(expr, "name", str(expr))
                if name and name not in builtins and name not in seen_names:
                    seen_names.add(name)

                    # Try to resolve to qualified name
                    qualified_name = None

                    # Check if this expr has a canonical path
                    if hasattr(expr, "canonical_path"):
                        try:
                            canonical = expr.canonical_path
                            # Only use if it's a real path (not just the name itself)
                            if canonical and "." in canonical:
                                qualified_name = canonical
                        except Exception:
                            pass

                    # Try to find in parent scope
                    if not qualified_name:
                        try:
                            current = obj_context
                            while current:
                                if hasattr(current, "members") and name in current.members:
                                    member = current.members[name]
                                    if hasattr(member, "path"):
                                        qualified_name = member.path
                                        break
                                current = getattr(current, "parent", None)
                        except Exception:
                            pass

                    type_refs.append({
                        "name": name,
                        "qualifiedName": qualified_name,
                    })

            # Handle ExprBinOp - union types like "A | B"
            elif expr_type == "ExprBinOp":
                if hasattr(expr, "left"):
                    extract_type_names_from_expr(expr.left, obj_context)
                if hasattr(expr, "right"):
                    extract_type_names_from_expr(expr.right, obj_context)

            # Handle ExprSubscript - generic types like "List[A]" or "Dict[K, V]"
            elif expr_type == "ExprSubscript":
                # The base type (e.g., "List" in "List[A]")
                if hasattr(expr, "left"):
                    extract_type_names_from_expr(expr.left, obj_context)
                # The type parameters
                if hasattr(expr, "slice"):
                    slice_val = expr.slice
                    if isinstance(slice_val, (list, tuple)):
                        for item in slice_val:
                            extract_type_names_from_expr(item, obj_context)
                    else:
                        extract_type_names_from_expr(slice_val, obj_context)

            # Handle ExprTuple - multiple items like in "Dict[K, V]"
            elif expr_type == "ExprTuple":
                if hasattr(expr, "elements"):
                    for elem in expr.elements:
                        extract_type_names_from_expr(elem, obj_context)

            # Handle string annotations (forward references)
            elif isinstance(expr, str):
                if expr.isidentifier() and expr not in builtins and expr not in seen_names:
                    seen_names.add(expr)
                    type_refs.append({
                        "name": expr,
                        "qualifiedName": None,
                    })

        try:
            # Extract from parameters
            if hasattr(obj, "parameters"):
                for param in obj.parameters:
                    if hasattr(param, "annotation") and param.annotation:
                        extract_type_names_from_expr(param.annotation, obj)

            # Extract from return type
            if hasattr(obj, "returns") and obj.returns:
                extract_type_names_from_expr(obj.returns, obj)

            # Extract from base classes
            if hasattr(obj, "bases"):
                for base in obj.bases:
                    extract_type_names_from_expr(base, obj)

        except Exception:
            pass

        return type_refs

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
