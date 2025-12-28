"""
IR Transformer

Transforms raw griffe extraction output into the normalized
Intermediate Representation (IR) format.
"""

import hashlib
from typing import Any, Dict, List, Optional

from .config import ExtractionConfig


class IRTransformer:
    """Transform extracted Python symbols to IR format."""

    def __init__(self, config: ExtractionConfig):
        """
        Initialize the transformer.

        Args:
            config: Extraction configuration.
        """
        self.config = config
        self.package_id = self._generate_package_id()

    def _generate_package_id(self) -> str:
        """Generate a unique package ID."""
        # Normalize package name (replace hyphens with underscores)
        normalized = self.config.package_name.replace("-", "_").replace(".", "_")
        return f"pkg_py_{normalized}"

    def transform(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform raw extraction data to IR format.

        Args:
            raw_data: Raw data from PythonExtractor.

        Returns:
            IR-formatted data.
        """
        symbols = []
        for raw_symbol in raw_data.get("symbols", []):
            ir_symbol = self._transform_symbol(raw_symbol)
            if ir_symbol:
                symbols.append(ir_symbol)

        return {
            "package": {
                "packageId": self.package_id,
                "displayName": self.config.package_name,
                "publishedName": self.config.package_name,
                "language": "python",
                "ecosystem": "python",
                "version": raw_data.get("version", "unknown"),
                "repo": {
                    "owner": self._get_repo_owner(),
                    "name": self._get_repo_name(),
                    "sha": self.config.sha,
                    "path": self.config.package_path,
                },
            },
            "symbols": symbols,
        }

    def _transform_symbol(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Transform a single symbol to IR format.

        Args:
            raw: Raw symbol data.

        Returns:
            IR-formatted symbol, or None if invalid.
        """
        try:
            kind = raw.get("kind", "unknown")
            name = raw.get("name", "")
            path = raw.get("path", "")

            if not name or kind == "unknown":
                return None

            symbol_id = self._generate_symbol_id(kind, path)
            canonical_url = self._generate_url(kind, path)

            # Extract documentation
            docstring = raw.get("docstring", {})
            summary = docstring.get("summary", "")
            sections = docstring.get("sections", [])

            # Build docs object
            docs = {
                "summary": summary,
            }

            # Add description from additional text sections
            description_parts = []
            for section in sections:
                if section.get("kind") == "text" and section.get("value"):
                    description_parts.append(section["value"])
            if description_parts:
                docs["description"] = "\n\n".join(description_parts)

            # Extract examples
            examples = []
            for section in sections:
                if section.get("kind") == "examples":
                    value = section.get("value", [])
                    if isinstance(value, list):
                        for ex in value:
                            if isinstance(ex, dict):
                                examples.append({
                                    "code": ex.get("description", ""),
                                    "language": "python",
                                })
                            else:
                                examples.append({"code": str(ex), "language": "python"})
            if examples:
                docs["examples"] = examples

            # Check for deprecation
            for section in sections:
                if section.get("kind") == "deprecated":
                    docs["deprecated"] = {
                        "isDeprecated": True,
                        "message": section.get("value", ""),
                    }

            # Extract parameters
            params = self._extract_params(sections)

            # Extract returns
            returns = self._extract_returns(sections)

            # Build source info
            source_info = raw.get("source", {})
            source = {
                "repo": self.config.repo,
                "sha": self.config.sha,
                "path": source_info.get("file", ""),
                "line": source_info.get("line", 0),
            }
            if source_info.get("end_line"):
                source["endLine"] = source_info["end_line"]

            # Build the IR symbol
            ir_symbol = {
                "id": symbol_id,
                "packageId": self.package_id,
                "language": "python",
                "kind": kind,
                "name": name,
                "qualifiedName": path,
                "display": {
                    "name": name,
                    "qualified": path,
                },
                "signature": raw.get("signature", ""),
                "docs": docs,
                "source": source,
                "urls": {
                    "canonical": canonical_url,
                },
                "tags": {
                    "stability": self._infer_stability(docs),
                    "visibility": "public",
                    "isAsync": raw.get("is_async", False),
                    "isAbstract": raw.get("is_abstract", False),
                },
            }

            # Add optional fields
            if params:
                ir_symbol["params"] = params

            if returns:
                ir_symbol["returns"] = returns

            # Add relations for classes
            bases = raw.get("bases", [])
            if bases:
                ir_symbol["relations"] = {"extends": bases}

            # Add member references for classes/modules
            members = raw.get("members", [])
            if members and kind in ("class", "module"):
                ir_symbol["members"] = [
                    {
                        "name": m["name"] if isinstance(m, dict) else m,
                        "refId": self._generate_symbol_id(
                            m.get("kind", "unknown") if isinstance(m, dict) else "unknown",
                            f"{path}.{m['name'] if isinstance(m, dict) else m}"
                        ),
                        "kind": m.get("kind", "unknown") if isinstance(m, dict) else "unknown",
                        "visibility": "public",
                    }
                    for m in members
                ]

            return ir_symbol

        except Exception as e:
            print(f"Warning: Failed to transform symbol: {e}")
            return None

    def _generate_symbol_id(self, kind: str, path: str) -> str:
        """Generate a unique symbol ID."""
        # Create a hash of the path for uniqueness
        path_hash = hashlib.md5(path.encode()).hexdigest()[:8]
        normalized_path = path.replace(".", "_")
        return f"sym_py_{kind}_{normalized_path}_{path_hash}"

    def _generate_url(self, kind: str, path: str) -> str:
        """Generate the canonical URL for a symbol."""
        # Convert qualified path to URL path
        parts = path.split(".")
        package_name = self.config.package_name.replace("-", "_")

        if kind == "class":
            return f"/python/{package_name}/classes/{parts[-1]}/"
        elif kind == "function":
            return f"/python/{package_name}/functions/{parts[-1]}/"
        elif kind == "module":
            return f"/python/{package_name}/modules/{'/'.join(parts[1:])}/"
        else:
            return f"/python/{package_name}/{kind}s/{parts[-1]}/"

    def _get_repo_owner(self) -> str:
        """Extract repository owner from repo string."""
        if "/" in self.config.repo:
            return self.config.repo.split("/")[0]
        return ""

    def _get_repo_name(self) -> str:
        """Extract repository name from repo string."""
        if "/" in self.config.repo:
            return self.config.repo.split("/")[1]
        return self.config.repo

    def _extract_params(self, sections: List[Dict]) -> List[Dict[str, Any]]:
        """Extract parameters from docstring sections."""
        params = []
        for section in sections:
            if section.get("kind") in ("parameters", "args", "arguments"):
                value = section.get("value", [])
                if isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            param = {
                                "name": item.get("name", ""),
                                "type": item.get("annotation", "Any"),
                                "required": item.get("default") is None,
                            }
                            if item.get("description"):
                                param["description"] = item["description"]
                            if item.get("default"):
                                param["default"] = item["default"]
                            params.append(param)
        return params

    def _extract_returns(self, sections: List[Dict]) -> Optional[Dict[str, Any]]:
        """Extract return type from docstring sections."""
        for section in sections:
            if section.get("kind") in ("returns", "return"):
                value = section.get("value", [])
                if isinstance(value, list) and value:
                    item = value[0]
                    if isinstance(item, dict):
                        return {
                            "type": item.get("annotation", "Any"),
                            "description": item.get("description", ""),
                        }
                elif isinstance(value, str):
                    return {"type": "Any", "description": value}
        return None

    def _infer_stability(self, docs: Dict[str, Any]) -> str:
        """Infer stability from documentation."""
        if docs.get("deprecated"):
            return "deprecated"

        summary = docs.get("summary", "").lower()
        description = docs.get("description", "").lower()
        text = summary + " " + description

        if "experimental" in text:
            return "experimental"
        if "beta" in text:
            return "beta"

        return "stable"

