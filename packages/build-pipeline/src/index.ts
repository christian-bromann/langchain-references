/**
 * Library exports for @langchain/build-pipeline
 *
 * These utilities can be used programmatically for custom build pipelines.
 */

// Tarball utilities
export {
  fetchTarball,
  fetchMultiple,
  getLatestSha,
  getCacheBaseDir,
  type FetchOptions,
  type FetchResult,
} from "./tarball.js";

// Upload utilities
export {
  uploadIR,
  cleanupOldBuilds,
  type UploadOptions,
  type UploadResult,
} from "./upload.js";

// Pointer management
export {
  updatePointers,
  updateKV, // Alias for backwards compatibility
  getLatestBuildId,
  getBuildMetadata,
  getLatestPackageVersion,
  getBuildHistory,
  markBuildFailed,
  type PointerUpdateOptions,
  type BuildMetadata,
  type LatestPointer,
  type LatestBuildPointer,
  type BuildHistory,
} from "./pointers.js";

// Version discovery
export {
  discoverVersions,
  parseVersionFromTag,
  tagMatchesPattern,
  filterToMinorVersions,
  fetchGitTags,
  createDiscoveryOptions,
  type VersionDiscoveryOptions,
} from "./version-discovery.js";

// Changelog fetching
export {
  fetchDeployedChangelog,
  type DeployedChangelog,
} from "./changelog-fetcher.js";

// Changelog generation
export {
  incrementalBuild,
  fullChangelogBuild,
  extractVersionsParallel,
  annotateLatestIR,
  type ChangelogBuildResult,
  type IncrementalBuildOptions,
} from "./changelog-generator.js";

// Diff engine
export {
  computeVersionDelta,
  detectChanges,
  detectMemberChanges,
  detectMemberSnapshotChanges,
  detectParamChanges,
  type MinimalIR,
} from "./diff-engine.js";

// Snapshot utilities
export {
  createSnapshot,
  createMemberSnapshot,
  createParamSnapshot,
  createTypeParamSnapshot,
  renderSnapshot,
  snapshotsEqual,
} from "./snapshot.js";

