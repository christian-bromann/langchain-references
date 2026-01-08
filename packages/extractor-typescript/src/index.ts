/**
 * @langchain/extractor-typescript
 *
 * TypeDoc-based TypeScript API documentation extractor that generates
 * Intermediate Representation (IR) for the LangChain reference docs platform.
 */

export { type ExtractionConfig, defaultConfig, createConfig } from "./config.js";
export { TypeScriptExtractor } from "./extractor.js";
export {
  TypeDocTransformer,
  type TypeDocReflection,
  type TypeDocProject,
  type TypeDocComment,
  type TypeDocType
} from "./transformer.js";





