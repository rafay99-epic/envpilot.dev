import * as Sentry from "@sentry/nextjs";
import {
  sanitizeConvexError,
  isTierLimitError,
  isAuthorizationError,
  isConflictError,
} from "@/lib/error-messages";

/**
 * Structured JSON logger for Next.js API routes.
 *
 * Emits one JSON line per event to stdout — Vercel's log viewer parses JSON
 * automatically and lets you search/filter by field (e.g. `module:ext-auth`,
 * `event:poll_miss`, `session:4f2a1e...`). No external dependencies.
 *
 * Error-level events are also forwarded to Sentry so they surface alongside
 * uncaught exceptions in the Sentry UI.
 *
 * ## Usage
 *
 * ```ts
 * import { createLogger } from "@/lib/logger";
 *
 * const log = createLogger("ext-auth/callback");
 * log.info("request_start", { session: tokenPrefix(sessionToken) });
 * log.error("convex_write_failed", { error: message, duration_ms });
 * ```
 *
 * ## Security
 *
 * Never pass raw tokens, passwords, or secret values into `data`. Use
 * `tokenPrefix()` to log only the first 8 chars for correlation. The logger
 * does best-effort scrubbing of common sensitive keys but you should not
 * rely on it as a security boundary.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogData = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /token|secret|password|apikey|authorization/i;

/** Redact sensitive-looking values in-place (shallow). */
function scrub(data: LogData): LogData {
  const out: LogData = {};
  for (const [k, v] of Object.entries(data)) {
    if (
      SENSITIVE_KEY_PATTERN.test(k) &&
      typeof v === "string" &&
      v.length > 12
    ) {
      // Preserve prefix so records can still be correlated across logs.
      out[k] = `${v.slice(0, 8)}…[REDACTED]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Triage for caught-error causes, mirroring the server-side
 * `reportApiError` policy: expected, user-facing conditions become
 * breadcrumbs instead of alertable Issues.
 *
 * - Tier-limit / authorization / duplicate-key conflicts are handled UX
 *   (toast or inline form error), not defects.
 * - 4xx API responses were already triaged by the server route that
 *   produced them — re-capturing client-side files noise twins.
 * - In the browser, Convex function failures ("[CONVEX M/A/Q(...)]",
 *   "[CONVEX FATAL ERROR]") already reach Sentry exactly once via the
 *   ConvexReactClient logger hook (ConvexClientProvider); capturing the
 *   same failure here files a twin issue titled "Error: [CONVEX ...]".
 *   Server-side (API routes, layouts) there is no such hook, so Convex
 *   causes still capture normally there.
 */
function shouldCaptureCause(cause: Error): boolean {
  const friendly = sanitizeConvexError(cause);
  if (
    isTierLimitError(friendly) ||
    isAuthorizationError(friendly) ||
    isConflictError(friendly)
  ) {
    return false;
  }
  const status = (cause as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return false;
  }
  if (
    typeof window !== "undefined" &&
    /\[CONVEX (?:[MAQ]\(|FATAL)/.test(cause.message)
  ) {
    return false;
  }
  return true;
}

function emit(
  level: LogLevel,
  module: string,
  event: string,
  data: LogData,
  cause?: unknown
): void {
  const scrubbed = scrub(data);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module,
    event,
    ...scrubbed,
  });
  // Use the matching console method so Vercel tags the log with a severity.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  // Sentry routing:
  //
  //   error → a real Sentry Issue (alertable). Something is broken or
  //           an unexpected condition happened that the team should see.
  //           If a `cause` Error is provided we capture the exception
  //           directly so Sentry can group by stack trace; otherwise we
  //           fall back to `captureMessage` with the event name.
  //
  //   warn  → breadcrumb only (NOT an Issue). These are expected,
  //           handled conditions like rate limits, auth failures, or
  //           bad client input. They show up as context on any
  //           subsequent actual Issue but don't alert on their own.
  if (level === "error") {
    if (cause instanceof Error) {
      if (!shouldCaptureCause(cause)) {
        Sentry.addBreadcrumb({
          category: module,
          message: `${event}: ${cause.message.slice(0, 500)}`,
          level: "error",
          data: scrubbed,
        });
        return;
      }
      Sentry.captureException(cause, {
        tags: { module, event },
        extra: scrubbed,
      });
    } else {
      Sentry.captureMessage(event, {
        level: "error",
        tags: { module, event },
        extra: scrubbed,
      });
    }
  } else if (level === "warn") {
    Sentry.addBreadcrumb({
      category: module,
      message: event,
      level: "warning",
      data: scrubbed,
    });
  }
}

export interface Logger {
  debug(event: string, data?: LogData): void;
  info(event: string, data?: LogData): void;
  /** Expected / handled condition. Breadcrumb only, not an alert. */
  warn(event: string, data?: LogData): void;
  /**
   * Real failure — fires a Sentry Issue so the team gets alerted.
   *
   * Pass the original caught error as `cause` whenever you have it;
   * Sentry will then group by stack trace (much better grouping than
   * by message). For synthetic "impossible state" errors where no
   * Error instance exists, omit it.
   *
   * @example
   * try { ... }
   * catch (err) {
   *   log.error("convex_write_failed", { duration_ms: Date.now() - start }, err);
   * }
   */
  error(event: string, data?: LogData, cause?: unknown): void;
  /** Return a child logger with additional default fields merged in. */
  child(context: LogData): Logger;
}

export function createLogger(module: string, base: LogData = {}): Logger {
  return {
    debug: (event, data = {}) =>
      emit("debug", module, event, { ...base, ...data }),
    info: (event, data = {}) =>
      emit("info", module, event, { ...base, ...data }),
    warn: (event, data = {}) =>
      emit("warn", module, event, { ...base, ...data }),
    error: (event, data = {}, cause) =>
      emit("error", module, event, { ...base, ...data }, cause),
    child: (context) => createLogger(module, { ...base, ...context }),
  };
}

/** First 8 chars of a token — enough to correlate, not enough to reuse. */
export function tokenPrefix(token: string | null | undefined): string {
  if (!token) return "none";
  return token.slice(0, 8);
}

/**
 * Inspect an arbitrary error and guess whether it represents an upstream
 * rate limit. Matches both our Convex rate limiter messages and common
 * HTTP-level 429 signals.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("ratelimit") ||
    msg.includes("too many requests") ||
    msg.includes("429")
  );
}
