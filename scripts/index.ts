/**
 * @langchain/scripts
 *
 * Build pipeline scripts for LangChain Reference Docs.
 */

export { fetchTarball, getLatestSha, fetchMultiple } from "./fetch-tarball.js";
export type { FetchOptions, FetchResult } from "./fetch-tarball.js";

export { uploadIR, cleanupOldBuilds } from "./upload-ir.js";
export type { UploadOptions, UploadResult } from "./upload-ir.js";

export {
  updatePointers,
  updateKV, // Alias for backwards compatibility
  getLatestBuildId,
  getBuildMetadata,
  getLatestPackageVersion,
  getBuildHistory,
  markBuildFailed,
} from "./update-kv.js";
export type { PointerUpdateOptions, BuildMetadata, LatestPointer } from "./update-kv.js";
// Backwards compatibility alias
export type { PointerUpdateOptions as KVUpdateOptions } from "./update-kv.js";



