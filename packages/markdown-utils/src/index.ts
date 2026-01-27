/**
 * Markdown Utilities
 *
 * Shared utilities for markdown processing including MkDocs admonition handling
 * and docstring dedentation.
 */

// Admonition processing
export {
  ADMONITION_ICONS,
  DEFAULT_ADMONITION_ICON,
  ADMONITION_START_MARKER,
  ADMONITION_END_MARKER,
  parseAdmonitionLine,
  convertAdmonitions,
  postProcessAdmonitions,
  processMkDocsContent,
} from "./admonitions";

// Dedent utilities
export { dedentContent, dedentPrecedingContent, normalizeFencedCodeBlocks } from "./dedent";
