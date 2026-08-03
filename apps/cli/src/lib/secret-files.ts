/**
 * Secret-file disk helpers.
 *
 * The implementation lives in @envpilot/secret-files, shared byte-for-byte
 * with the VS Code extension. It used to be duplicated here, which meant
 * every containment/drift fix had to land twice — and quietly did not.
 */
export {
  applyMode,
  ignoreSecretFilePaths,
  localDigest,
  modeMatches,
  numericMode,
  resolveInsideRoot,
  statusOf,
  UnsafePathError,
  writeSecretFile,
  type FileStatus,
} from "@envpilot/secret-files";
