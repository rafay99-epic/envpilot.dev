/**
 * Compat barrel — preserves the public `api.shareValues.*` paths.
 * Implementation lives in features/variables/share.ts.
 */
export {
  createWithPayload,
  verifyOtpAndReveal,
  revokeAndPurge,
} from "./features/variables/share";
