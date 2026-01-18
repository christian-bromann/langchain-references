"""
IR Transformer

Transforms raw griffe extraction output into the normalized
Intermediate Representation (IR) format.
"""

import hashlib
import re
import textwrap
from typing import Any, Dict, List, Optional

from .config import ExtractionConfig


def dedent_docstring(text: str) -> str:
    """
    Dedent docstring text, handling the common case where the first line
    has no indent but subsequent lines do.

    Python docstrings often look like:
        '''First line with no indent.

            Subsequent lines indented to match code.
            More content here.
        '''

    This function removes the common leading whitespace from subsequent lines
    while preserving the first line as-is.

    Args:
        text: Docstring text that may have inconsistent indentation.

    Returns:
        Dedented text.
    """
    if not text:
        return text

    lines = text.split('\n')
    if len(lines) <= 1:
        return text.strip()

    # Find the first non-empty line
    first_line_idx = 0
    for i, line in enumerate(lines):
        if line.strip():
            first_line_idx = i
            break

    # Get first non-empty line's indent
    first_line = lines[first_line_idx]
    first_line_indent = len(first_line) - len(first_line.lstrip())

    # Find minimum indentation of subsequent non-empty lines
    min_indent = float('inf')
    for i, line in enumerate(lines):
        if i <= first_line_idx:
            continue
        if line.strip():
            indent = len(line) - len(line.lstrip())
            min_indent = min(min_indent, indent)

    # If first line has no indent but subsequent lines do, dedent subsequent lines
    if first_line_indent == 0 and min_indent != float('inf') and min_indent > 0:
        dedented_lines = []
        for i, line in enumerate(lines):
            if i <= first_line_idx:
                dedented_lines.append(line)
            elif line.strip():
                # Remove the common indentation
                dedented_lines.append(line[min_indent:] if len(line) >= min_indent else line.lstrip())
            else:
                dedented_lines.append(line)
        return '\n'.join(dedented_lines)

    # Standard case: use textwrap.dedent
    return textwrap.dedent(text)


def clean_mkdocs_admonitions(text: str) -> str:
    """
    Clean and preserve MkDocs Material admonition syntax in text.

    This function:
    - Dedents the content to remove common leading whitespace
    - Preserves admonition syntax (!!!, ???, ???+) for frontend rendering
    - Preserves fenced code blocks for inline rendering

    Args:
        text: Raw text that may contain admonition syntax.

    Returns:
        Cleaned text with admonitions and code blocks preserved for frontend rendering.
    """
    if not text:
        return text

    # First, dedent the text to remove common leading whitespace from docstrings.
    # This is crucial because Python docstrings often have indented content,
    # and the markdown parser will treat 4+ spaces as a code block.
    text = dedent_docstring(text)

    # NOTE: We intentionally preserve admonition syntax (!!!, ???, ???+)
    # The frontend will convert these to styled HTML components.

    # NOTE: We also preserve fenced code blocks so they render inline
    # with the documentation. The frontend handles syntax highlighting.

    # Clean up multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def dedent_code(code: str) -> str:
    """
    Remove common leading whitespace from code lines.

    This fixes indentation issues where code blocks have
    extra leading spaces. Handles two cases:
    1. All lines have common indentation - remove it
    2. First line has no indent, subsequent lines do - dedent subsequent lines

    Args:
        code: Code string that may have common leading whitespace.

    Returns:
        Code with common leading whitespace removed.
    """
    if not code:
        return code

    lines = code.split('\n')
    if len(lines) <= 1:
        return code.strip()

    # Check if first non-empty line has no indentation
    first_line_indent = 0
    for line in lines:
        if line.strip():
            first_line_indent = len(line) - len(line.lstrip())
            break

    # Find minimum indentation of lines after the first non-empty line
    # (ignoring empty lines)
    min_indent = float('inf')
    found_first = False
    for line in lines:
        if line.strip():
            if not found_first:
                found_first = True
                continue  # Skip first non-empty line
            indent = len(line) - len(line.lstrip())
            min_indent = min(min_indent, indent)

    # If first line has no indent but subsequent lines do, dedent subsequent lines
    if first_line_indent == 0 and min_indent != float('inf') and min_indent > 0:
        dedented_lines = []
        found_first = False
        for line in lines:
            if line.strip():
                if not found_first:
                    found_first = True
                    dedented_lines.append(line)
                else:
                    # Remove the common indentation from subsequent lines
                    dedented_lines.append(line[min_indent:] if len(line) >= min_indent else line.lstrip())
            else:
                dedented_lines.append(line)
        return '\n'.join(dedented_lines)

    # Standard case: all lines have common indentation
    min_indent = float('inf')
    for line in lines:
        if line.strip():
            indent = len(line) - len(line.lstrip())
            min_indent = min(min_indent, indent)

    if min_indent == float('inf') or min_indent == 0:
        return code

    dedented_lines = []
    for line in lines:
        if line.strip():
            dedented_lines.append(line[min_indent:])
        else:
            dedented_lines.append(line)

    return '\n'.join(dedented_lines)


def extract_code_blocks_from_text(text: str) -> list:
    """
    Extract fenced code blocks from text.

    Args:
        text: Text that may contain fenced code blocks.

    Returns:
        List of code block contents.
    """
    if not text:
        return []

    # Find all fenced code blocks: ```python\ncode\n```
    pattern = r'```(\w*)\n([\s\S]*?)```'
    matches = re.findall(pattern, text)

    code_blocks = []
    for lang, code in matches:
        # Strip and dedent the code to fix indentation issues
        code = dedent_code(code.strip())
        if code:
            code_blocks.append({
                "code": code,
                "language": lang if lang else "python",
            })

    return code_blocks


def clean_example_content(content: str) -> str:
    """
    Clean up example content from docstrings.

    Handles:
    - MkDocs Material admonition syntax (???+ example, !!! note, etc.)
    - Fenced code blocks wrapped in HTML
    - Extracting just the code from fenced blocks

    Args:
        content: Raw example content from docstring.

    Returns:
        Cleaned code content.
    """
    if not content:
        return content

    # Remove MkDocs admonition openers: ???+ example "Example", !!! note "Note", etc.
    # These appear at the start of lines and may have quotes
    content = re.sub(
        r'^[\?\!]{3}\+?\s*\w+(?:\s+"[^"]*")?\s*$',
        '',
        content,
        flags=re.MULTILINE
    )

    # Remove HTML paragraph tags that wrap the admonition
    content = re.sub(r'<p>[\?\!]{3}\+?\s*\w+(?:\s+"[^"]*")?</p>', '', content)

    # Handle code blocks wrapped in HTML <pre><code> tags
    # Pattern: <pre><code>```language\ncode\n```\n</code></pre>
    html_code_pattern = r'<pre><code>```(\w*)\n(.*?)```\s*</code></pre>'
    html_matches = re.findall(html_code_pattern, content, re.DOTALL)
    if html_matches:
        # Extract just the code from the first match
        return html_matches[0][1].strip()

    # Handle regular fenced code blocks: ```python\ncode\n```
    # Extract code from inside the fences
    fenced_pattern = r'```\w*\n(.*?)```'
    fenced_matches = re.findall(fenced_pattern, content, re.DOTALL)
    if fenced_matches:
        # Return the code from inside the fence
        return fenced_matches[0].strip()

    # Clean up any remaining HTML tags
    content = re.sub(r'</?(?:p|pre|code)>', '', content)

    # Remove leading/trailing whitespace and normalize newlines
    content = content.strip()

    # If content is now empty after cleaning, return original
    if not content:
        return content

    return content


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
            raw_summary = docstring.get("summary", "")
            sections = docstring.get("sections", [])

            # Clean the summary (preserves code blocks for inline rendering)
            summary = clean_mkdocs_admonitions(raw_summary)

            # Build docs object
            docs = {
                "summary": summary,
            }

            # Add description from additional text sections
            # Skip text that duplicates the summary
            # Code blocks are preserved inline for frontend rendering
            description_parts = []
            for section in sections:
                if section.get("kind") == "text" and section.get("value"):
                    raw_text = section["value"]
                    # Clean MkDocs admonition syntax from description text
                    # Code blocks are preserved for inline rendering
                    text = clean_mkdocs_admonitions(raw_text)
                    # Skip if this text duplicates the summary
                    if text.strip() and text.strip() != summary.strip():
                        description_parts.append(text)
            if description_parts:
                docs["description"] = "\n\n".join(description_parts)

            # Track seen examples to avoid duplicates
            seen_examples: set = set()

            # Extract examples from dedicated Examples sections
            examples = []
            for section in sections:
                if section.get("kind") == "examples":
                    value = section.get("value", [])
                    if isinstance(value, list):
                        for ex in value:
                            if isinstance(ex, dict):
                                raw_code = ex.get("description", "")
                                cleaned_code = clean_example_content(raw_code)
                                # Dedent and dedupe
                                cleaned_code = dedent_code(cleaned_code)
                                if cleaned_code and cleaned_code not in seen_examples:
                                    examples.append({
                                        "code": cleaned_code,
                                        "language": "python",
                                    })
                                    seen_examples.add(cleaned_code)
                            else:
                                cleaned_code = clean_example_content(str(ex))
                                cleaned_code = dedent_code(cleaned_code)
                                if cleaned_code and cleaned_code not in seen_examples:
                                    examples.append({"code": cleaned_code, "language": "python"})
                                    seen_examples.add(cleaned_code)

            # Note: Inline code blocks in summary/description are now preserved there
            # and rendered by the frontend. Only dedicated Examples sections are extracted here.
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
            raw_path = source_info.get("file", "") or ""
            # Normalize the path to remove temp/cache directory prefixes
            normalized_path = self._normalize_source_path(raw_path)
            source = {
                "repo": self.config.repo,
                "sha": self.config.sha,
                "path": normalized_path,
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

            # Add type references for cross-linking
            type_refs = raw.get("type_refs", [])
            if type_refs:
                ir_symbol["typeRefs"] = [
                    {
                        "name": ref["name"],
                        **({"qualifiedName": ref["qualifiedName"]} if ref.get("qualifiedName") else {}),
                    }
                    for ref in type_refs
                    if ref.get("name")
                ]

            # Add relations for classes
            bases = raw.get("bases", [])
            if bases:
                ir_symbol["relations"] = {"extends": bases}

            # Add member references for classes/modules
            members = raw.get("members", [])
            if members and kind in ("class", "module"):
                ir_symbol["members"] = []
                for m in members:
                    member_ref = {
                        "name": m["name"] if isinstance(m, dict) else m,
                        "refId": self._generate_symbol_id(
                            m.get("kind", "unknown") if isinstance(m, dict) else "unknown",
                            f"{path}.{m['name'] if isinstance(m, dict) else m}"
                        ),
                        "kind": m.get("kind", "unknown") if isinstance(m, dict) else "unknown",
                        "visibility": "public",
                    }
                    # Include type annotation for attributes if available
                    if isinstance(m, dict) and m.get("type"):
                        member_ref["type"] = m["type"]
                    ir_symbol["members"].append(member_ref)

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

    def _normalize_source_path(self, file_path: str) -> str:
        """
        Normalize source path by removing temp/cache directory prefixes.

        Handles paths like:
        - /tmp/langchain-reference-build-cache/.../extracted/libs/pkg/file.py
        - ../../../tmp/langchain-reference-build-cache/.../extracted/libs/pkg/file.py

        Returns a clean path like:
        - libs/pkg/file.py
        """
        if not file_path:
            return ""

        # Handle paths with the extracted directory pattern
        # Match: .../extracted/libs/{package}/{rest} or .../extracted/{rest}
        extracted_match = re.search(r'/extracted/(libs/[^/]+/.*|[^/].*)$', file_path)
        if extracted_match:
            return extracted_match.group(1)

        # Handle paths with tmp directory
        tmp_match = re.search(r'(?:^|/)tmp/.*?/extracted/(libs/[^/]+/.*|[^/].*)$', file_path)
        if tmp_match:
            return tmp_match.group(1)

        # Handle paths that are already relative (don't start with / or ..)
        if not file_path.startswith('/') and not file_path.startswith('..'):
            return file_path

        # Handle paths that start with libs/
        libs_match = re.search(r'(libs/[^/]+/.*)$', file_path)
        if libs_match:
            return libs_match.group(1)

        # Last resort: just return the filename with parent directory
        parts = file_path.split('/')
        if len(parts) >= 2:
            return '/'.join(parts[-2:])

        return file_path.split('/')[-1] if '/' in file_path else file_path
