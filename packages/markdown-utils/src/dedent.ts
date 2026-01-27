/**
 * Dedent Utilities
 *
 * Utilities for handling indentation in docstrings and markdown content.
 * These are essential for correctly parsing MkDocs admonitions and fenced code blocks
 * from Python/Java/Go docstrings that have varying indentation patterns.
 */

/**
 * Dedent content preceding a code block that shares its indentation level.
 * This handles the case where both explanatory text and code blocks are
 * indented under a section header.
 *
 * @param lines - Array of lines to process
 * @param indent - The indentation level to remove
 * @returns Array of processed lines
 */
export function dedentPrecedingContent(lines: string[], indent: number): string[] {
  if (indent === 0) return lines;

  const result: string[] = [];

  // Process lines in reverse to find where the indented section starts
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      result.unshift(line);
      continue;
    }

    const lineIndent = line.length - line.trimStart().length;

    // Stop when we hit a section header or content with less indentation
    if (lineIndent < indent) {
      // This line and everything before it keeps original indentation
      result.unshift(...lines.slice(0, i + 1));
      break;
    }

    // This line is part of the indented section - dedent it
    if (lineIndent >= indent) {
      result.unshift(line.slice(indent));
    } else {
      result.unshift(line);
    }
  }

  return result;
}

/**
 * Normalize fenced code blocks to ensure they're properly recognized by markdown.
 *
 * Handles the case where fenced code blocks are indented (e.g., under section headers
 * in docstrings). If a fenced code block is indented, markdown treats it as an
 * indented code block and shows the ``` markers literally.
 *
 * This function:
 * 1. Detects indented fenced code blocks
 * 2. Removes the indentation from the fence markers and content
 * 3. Also dedents the paragraph text before the code block (which has the same indent)
 *
 * @param content - The content to normalize
 * @returns The normalized content with code blocks at column 0
 */
export function normalizeFencedCodeBlocks(content: string): string {
  if (!content) return content;

  const lines = content.split("\n");
  const result: string[] = [];

  let inFencedBlock = false;
  let fenceIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect fenced code block start (may be indented)
    if (!inFencedBlock && /^(`{3,}|~{3,})/.test(trimmed)) {
      inFencedBlock = true;
      fenceIndent = line.length - line.trimStart().length;

      // If the code block is indented, we need to also dedent preceding content
      // that has the same indentation level (it's part of the same "section")
      if (fenceIndent > 0) {
        // Look back and dedent any content with the same indentation
        const dedentedPreceding = dedentPrecedingContent(result, fenceIndent);
        result.length = 0;
        result.push(...dedentedPreceding);
      }

      // Output fence at column 0
      result.push(trimmed);
      continue;
    }

    // Detect fenced code block end
    if (inFencedBlock && /^(`{3,}|~{3,})$/.test(trimmed)) {
      inFencedBlock = false;
      // Output fence at column 0
      result.push(trimmed);
      continue;
    }

    // Inside fenced block: remove the fence's indentation from content
    if (inFencedBlock) {
      if (line.length >= fenceIndent) {
        result.push(line.slice(fenceIndent));
      } else {
        result.push(line.trimStart());
      }
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Dedent content that may have inconsistent indentation from docstrings.
 *
 * Python docstrings often have the first line with no indent but subsequent
 * lines indented. This causes markdown parsers to treat indented content as
 * code blocks (4+ spaces = preformatted code in markdown).
 *
 * This function preserves relative indentation structure needed for admonition
 * parsing. It only removes common leading indentation.
 *
 * @param content - The content to dedent
 * @param normalize - If true, also normalizes fenced code blocks. Set to false
 *                    when admonition processing will happen after this call.
 * @returns The dedented content
 *
 * @example
 * ```typescript
 * // Python docstring with inconsistent indent
 * const input = `Summary line.
 *     More content here.
 *     And more.`;
 *
 * dedentContent(input);
 * // Returns:
 * // "Summary line.
 * // More content here.
 * // And more."
 * ```
 */
export function dedentContent(content: string, normalize = true): string {
  if (!content) return content;

  const lines = content.split("\n");
  if (lines.length <= 1) {
    return content.trim();
  }

  // Find the first non-empty line
  let firstLineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      firstLineIdx = i;
      break;
    }
  }

  const firstLine = lines[firstLineIdx];
  const firstLineIndent = firstLine.length - firstLine.trimStart().length;

  // Find minimum indentation of subsequent non-empty lines
  let minIndent = Infinity;
  for (let i = firstLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim()) {
      const indent = line.length - line.trimStart().length;
      minIndent = Math.min(minIndent, indent);
    }
  }

  // If first line has no indent but subsequent lines do, dedent subsequent lines
  if (firstLineIndent === 0 && minIndent !== Infinity && minIndent > 0) {
    const dedentedLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i <= firstLineIdx) {
        dedentedLines.push(line);
      } else if (line.trim()) {
        // Remove the common indentation
        dedentedLines.push(line.length >= minIndent ? line.slice(minIndent) : line.trimStart());
      } else {
        dedentedLines.push(line);
      }
    }
    const result = dedentedLines.join("\n");
    // Only normalize fenced code blocks if requested
    return normalize ? normalizeFencedCodeBlocks(result) : result;
  }

  // Standard case: find common indent across all non-empty lines
  minIndent = Infinity;
  for (const line of lines) {
    if (line.trim()) {
      const indent = line.length - line.trimStart().length;
      minIndent = Math.min(minIndent, indent);
    }
  }

  if (minIndent === Infinity || minIndent === 0) {
    // Even with no common indent, we may have indented code blocks
    return normalize ? normalizeFencedCodeBlocks(content) : content;
  }

  // Remove common indentation from all lines
  const dedentedLines = lines.map((line) => {
    if (line.trim()) {
      return line.slice(minIndent);
    }
    return line;
  });

  const result = dedentedLines.join("\n");
  return normalize ? normalizeFencedCodeBlocks(result) : result;
}
