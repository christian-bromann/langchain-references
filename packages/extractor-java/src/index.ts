/**
 * @langchain/extractor-java
 *
 * Java API documentation extractor that generates Intermediate Representation (IR)
 * for the LangChain reference docs platform.
 */

export { type JavaExtractorConfig, defaultConfig, createConfig, validateConfig } from "./config.js";
export {
  JavaExtractor,
  type JavaType,
  type JavaMethod,
  type JavaField,
  type JavaConstructor,
  type JavaParameter,
  type JavaTypeParameter,
  type ExtractionResult,
} from "./extractor.js";
export {
  JavaTransformer,
  type SymbolRecord,
  type MemberRecord,
  type Parameter,
  type ReturnType,
  type SourceLocation,
  type TypeParameter,
} from "./transformer.js";
