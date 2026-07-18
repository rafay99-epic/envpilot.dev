import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * Rate limiter configuration for Envpilot backend.
 *
 * Uses @convex-dev/rate-limiter component to protect against
 * brute force, DoS, and abuse of expensive operations.
 *
 * Apply via: await rateLimiter.limit(ctx, "ruleName", { key: "identifier" })
 * The call throws a ConvexError if the rate limit is exceeded.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // ==========================================
  // AUTH ENDPOINTS (strict — prevent brute force)
  // ==========================================

  // CI/CD secret pulls: 30 per minute per service token. Deploys are
  // bursty (matrix builds fan out), so the full capacity is available as
  // a burst while the sustained rate stays modest.
  cicdPull: {
    kind: "token bucket",
    rate: 30,
    period: 60_000,
    capacity: 30,
  },

  // Public API metadata reads (REST + MCP): 120 per minute per key. No
  // vault decrypt, so a much higher ceiling than value/account pulls
  // (which reuse cicdPull's per-key semantics — see PLAN §2).
  apiMetadata: {
    kind: "token bucket",
    rate: 120,
    period: 60_000,
    capacity: 120,
  },

  // Machine-originated variable requests: 5 per hour per key, burst 2.
  // Each create fans out a reviewer email — a retry-looping agent must be
  // blocked before it becomes reviewer alert fatigue. A standing cap on
  // open pendings per key lives in the mutation (requests/mutations.ts).
  // Documented publicly in docs/rate-limits — keep the page in sync.
  machineRequestCreate: {
    kind: "token bucket",
    rate: 5,
    period: 3_600_000,
    capacity: 2,
  },

  // CLI device code generation: 5 per minute per device
  cliAuthInitiate: {
    kind: "token bucket",
    rate: 5,
    period: 60_000,
    capacity: 5,
  },

  // CLI auth polling: 20 per minute per session code
  cliAuthPoll: {
    kind: "token bucket",
    rate: 20,
    period: 60_000,
    capacity: 20,
  },

  // Token validation: 30 per minute per token
  tokenValidation: {
    kind: "token bucket",
    rate: 30,
    period: 60_000,
    capacity: 30,
  },

  // ==========================================
  // RESOURCE CREATION (per-org)
  // ==========================================

  // Variable create/update: 30 per minute per org
  variableCreate: {
    kind: "token bucket",
    rate: 30,
    period: 60_000,
    capacity: 30,
  },

  variableUpdate: {
    kind: "token bucket",
    rate: 30,
    period: 60_000,
    capacity: 30,
  },

  // Bulk import: 2 per minute per org (expensive operation)
  bulkImport: {
    kind: "token bucket",
    rate: 2,
    period: 60_000,
    capacity: 2,
  },

  // Tag create/update/delete: 20 per minute per org
  tagMutate: {
    kind: "token bucket",
    rate: 20,
    period: 60_000,
    capacity: 20,
  },

  // ==========================================
  // SEARCH & INVITATIONS (per-org)
  // ==========================================

  // User search: 20 per minute per org
  userSearch: {
    kind: "token bucket",
    rate: 20,
    period: 60_000,
    capacity: 20,
  },

  // Invitation creation: 10 per minute per org
  invitationCreate: {
    kind: "token bucket",
    rate: 10,
    period: 60_000,
    capacity: 10,
  },

  // ==========================================
  // GLOBAL LIMITS
  // ==========================================

  // Organization creation: 3 per hour per user
  orgCreate: {
    kind: "fixed window",
    rate: 3,
    period: 3_600_000,
  },

  // Extension linking: 10 per minute per user
  extensionLink: {
    kind: "token bucket",
    rate: 10,
    period: 60_000,
    capacity: 10,
  },

  // ==========================================
  // SECRET SHARING
  // ==========================================

  // Share creation: 10 per hour per org
  shareCreate: {
    kind: "fixed window",
    rate: 10,
    period: 3_600_000,
  },

  // Email verification: 3 per minute per token (prevent email spam)
  shareVerifyEmail: {
    kind: "token bucket",
    rate: 3,
    period: 60_000,
    capacity: 3,
  },

  // OTP verification: 5 per minute per token (brute-force prevention)
  shareVerifyOtp: {
    kind: "token bucket",
    rate: 5,
    period: 60_000,
    capacity: 5,
  },
});
