/**
 * @langchain/extractor-go
 *
 * Go API documentation extractor that generates Intermediate Representation (IR)
 * for the LangChain reference docs platform.
 */

export { type GoExtractorConfig, defaultConfig, createConfig, validateConfig } from "./config.js";
export {
  GoExtractor,
  type GoType,
  type GoMethod,
  type GoField,
  type GoConst,
  type GoParameter,
  type ExtractionResult,
} from "./extractor.js";
export {
  GoTransformer,
  type SymbolRecord,
  type MemberRecord,
  type Parameter,
  type ReturnType,
  type SourceLocation,
  type TypeParameter,
} from "./transformer.js";
