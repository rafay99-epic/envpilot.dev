import { RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
import { MAX_PROJECT_FILES } from "./fileLimits";
import { MAX_BATCH_VARIABLES } from "./batchLimits";
import { MAX_SHARE_RECIPIENTS } from "../features/docs/shareGuards";

/**
 * Sizing inputs for the Docker bucket, named so the numbers below are DERIVED
 * rather than picked. Change these, not the bucket.
 *
 * A container start makes at most two VALUE-returning requests: the variables
 * pull, plus one file-content batch when the entrypoint runs `exec --files`.
 * The file manifest in between is metadata (no decrypt) and is charged to
 * apiMetadata instead, so it does not appear here.
 *
 * Projects whose secret files exceed one 6 MiB batch issue more than one
 * content request. That is rare, and the image retries a 429 for exactly the
 * cooldown the server asks for, so those pulls slow down instead of failing.
 */
const DOCKER_VALUE_REQUESTS_PER_START = 2;

/**
 * Containers one key is expected to start simultaneously. Sized for a rolling
 * restart of a large replica set, or a Compose stack coming up cold, on a
 * single shared credential. Per-service keys are the documented
 * recommendation, so this is deliberately generous rather than tight.
 */
const DOCKER_CONCURRENT_STARTS = 60;

/**
 * Refill window for one full fleet restart. Four minutes means a crash-looping
 * service drains the burst and then settles to a rate no healthy deployment
 * ever reaches, while a real rolling deploy never notices the bucket.
 */
const DOCKER_BURST_REFILL_MINUTES = 4;

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

  // CI/CD secret pulls: 30 per minute per API key. Deploys are
  // bursty (matrix builds fan out), so the full capacity is available as
  // a burst while the sustained rate stays modest.
  cicdPull: {
    kind: "token bucket",
    rate: 30,
    period: 60_000,
    capacity: 30,
  },

  // Docker container secret pulls. Its OWN bucket, not a share of cicdPull:
  // a fleet of containers restarting must not consume the CI pipeline's
  // budget, and a crash-looping container must not throttle deploys. Same
  // reason the Docker surface carries its own tier gate.
  //
  // capacity = DOCKER_VALUE_REQUESTS_PER_START * DOCKER_CONCURRENT_STARTS
  //          = 2 * 60 = 120 — one full fleet restart fits in a single burst.
  // rate     = capacity / DOCKER_BURST_REFILL_MINUTES per minute
  //          = 120 / 4  = 30/min, i.e. 15 sustained container starts a minute.
  //
  // capacity >> rate for the reason fileDownload documents: the burst covers
  // one legitimate cold start of any fleet this key can serve, while the slow
  // refill means a caller cannot SUSTAIN that rate. This endpoint returns
  // plaintext, so the profile being bounded is exfiltration, not CPU.
  // Documented publicly in docs/limits/rate-limits — keep the page in sync.
  dockerPull: {
    kind: "token bucket",
    rate:
      (DOCKER_VALUE_REQUESTS_PER_START * DOCKER_CONCURRENT_STARTS) /
      DOCKER_BURST_REFILL_MINUTES,
    period: 60_000,
    capacity: DOCKER_VALUE_REQUESTS_PER_START * DOCKER_CONCURRENT_STARTS,
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

  // Secret-file uploads: 20 per minute per user. Each one encrypts, writes
  // a blob and creates a vault object, so an unthrottled loop is expensive
  // in storage and in WorkOS calls, not just CPU.
  fileUpload: {
    kind: "token bucket",
    rate: 20,
    period: 60_000,
    capacity: 20,
  },

  // Secret-file content reads. Each one is a blob read plus a vault read plus
  // a decrypt, and returns PLAINTEXT.
  //
  // capacity >> rate on purpose. The CLI and the extension issue one action
  // per file, so a first pull of a Pro project (no file-count limit) is a
  // burst of hundreds — a bucket sized 60/60 aborted that pull partway
  // through with an error neither client retries. But setting rate to 600 as
  // well would have refilled as fast as it drained, licensing a SUSTAINED
  // 10 secrets/second forever, which is precisely an exfiltration profile.
  //
  // Splitting them gives the cold pull its one-off burst and then settles to
  // 1/second. A legitimate second pull moments later is served from files
  // already in sync (statusOf short-circuits, zero decrypts), so the slow
  // refill is invisible to real use and expensive to abuse.
  //
  // capacity IS the project ceiling, imported rather than restated. The write
  // path refuses the insert that would exceed it, so a cold pull of any
  // project that can exist fits in one burst by construction. `throws: true`
  // gives no retry, so a capacity below that ceiling would abort a legitimate
  // first pull partway through.
  fileDownload: {
    kind: "token bucket",
    rate: 60,
    period: 60_000,
    capacity: MAX_PROJECT_FILES,
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

  // Machine-authored documentation drafts: 30 per hour per key, burst 10.
  // Looser than machineRequestCreate because the unit of work is different:
  // an agent finishing a feature legitimately writes one page per endpoint
  // in a single burst, and a draft costs no email and no vault call. The cap
  // still exists because every draft is a human review item, and review
  // capacity — not storage — is the scarce resource here.
  // Documented publicly in docs/rate-limits — keep the page in sync.
  docCreate: {
    kind: "token bucket",
    rate: 30,
    period: 3_600_000,
    capacity: 10,
  },

  // Documentation shares: 60 emails per hour per org. Charged per RECIPIENT,
  // because the cost being bounded is outbound mail rather than rows.
  //
  // capacity must be at least MAX_SHARE_RECIPIENTS or the advertised
  // 20-recipient action could never succeed — one batch consumes 20 tokens,
  // and a bucket that never holds 20 rejects it every time.
  docShareCreate: {
    kind: "token bucket",
    rate: 60,
    period: 3_600_000,
    capacity: MAX_SHARE_RECIPIENTS,
  },

  // Passphrase attempts on a public documentation link: 10 per hour per
  // TOKEN. Keyed on the token rather than the client IP on purpose — the
  // Convex mutation is publicly callable, so any caller-supplied key would
  // let an attacker mint a fresh bucket per guess. Per-token also means one
  // attacker cannot lock every other reader out of unrelated links.
  docShareUnlock: {
    kind: "fixed window",
    rate: 10,
    period: 3_600_000,
  },

  // Successful reads of a public documentation link: 60 per hour per token.
  // Each one writes an audit row, so an unbounded read is an unbounded write.
  // Well above real reading (open, refresh, re-open) and far below flooding.
  docShareView: {
    kind: "token bucket",
    rate: 60,
    period: 3_600_000,
    capacity: 20,
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

  // Bulk variable WRITES (template creation, import): charged once per batch,
  // one token per variable.
  //
  // capacity >> the per-call variableCreate rule on purpose, and for the same
  // reason fileDownload sizes its burst to MAX_PROJECT_FILES: the batch entry
  // points refuse anything larger than MAX_BATCH_VARIABLES, so a bucket that
  // can never hold that many would reject a legal batch every single time.
  // capacity IS the ceiling, imported rather than restated.
  //
  // rate is deliberately far below capacity. The burst covers one legitimate
  // import of any size the write path accepts; the slow refill means a caller
  // cannot sustain that rate, which is what separates a real import from a
  // loop. Charged in reserveBatch and NOT inside the retryable vault step —
  // a retried step re-runs its body, so a charge in there would bill twice
  // for one transient vault failure.
  variableBatchCreate: {
    kind: "token bucket",
    rate: 120,
    period: 60_000,
    capacity: MAX_BATCH_VARIABLES,
  },

  // Bulk variable READS (export). Separate bucket from the write rule because
  // it returns PLAINTEXT for every row it touches, so its abuse profile is
  // exfiltration rather than resource exhaustion and it deserves its own
  // ceiling rather than borrowing one sized for writes.
  variableBatchRead: {
    kind: "token bucket",
    rate: 60,
    period: 60_000,
    capacity: MAX_BATCH_VARIABLES,
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

  // Manual proof-of-life sends: prevents create/remove or Send Test loops from
  // turning an organization into a channel-spam source.
  webhookTest: {
    kind: "token bucket",
    rate: 5,
    period: 60_000,
    capacity: 5,
  },

  // Security denials can be attacker-driven. Bound channel noise while the
  // audit log remains complete and authoritative.
  webhookSecurityNotification: {
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
