/**
 * Sentry implementation, bundled as a separate chunk (dist/sentry.js).
 * Loaded lazily by ./sentry.ts so @sentry/node (the bulk of the extension
 * bundle) never blocks activation. Do not import this module directly —
 * go through ./sentry.ts.
 */
import * as path from "path";
import * as vscode from "vscode";
import * as Sentry from "@sentry/node";

declare const __EXTENSION_SENTRY_DSN__: string;
declare const __EXTENSION_VERSION__: string;

let initialized = false;

// This chunk lives at <extension root>/dist/sentry.js, so its parent dir is
// the installed extension folder — the one path prefix that is ours.
const EXTENSION_ROOT = path.dirname(__dirname);

/**
 * The Node SDK's uncaught-exception / unhandled-rejection hooks are process
 * wide, and the extension host is one process shared with every installed
 * extension. Drop a global-handler event unless a frame comes from our
 * bundle; otherwise we report other extensions' crashes as ours.
 */
function isForeignUnhandled(event: Sentry.ErrorEvent): boolean {
  const values = event.exception?.values ?? [];
  const unhandled = values.some((exc) => exc.mechanism?.handled === false);
  if (!unhandled) return false;
  return !values.some((exc) =>
    exc.stacktrace?.frames?.some((frame) =>
      frame.filename?.startsWith(EXTENSION_ROOT + path.sep)
    )
  );
}

export function initSentry(): void {
  // Respect VS Code's global telemetry opt-out — this is a hard requirement
  // for marketplace listings. When the user has telemetry disabled we must
  // never initialize Sentry (or send anything to it).
  if (!vscode.env.isTelemetryEnabled) return;

  const dsn =
    typeof __EXTENSION_SENTRY_DSN__ !== "undefined"
      ? __EXTENSION_SENTRY_DSN__
      : "";
  if (initialized || !dsn) return;

  Sentry.init({
    dsn,
    environment: "vscode-extension",
    release:
      typeof __EXTENSION_VERSION__ !== "undefined"
        ? __EXTENSION_VERSION__
        : "0.0.0",

    // All EnvPilot surfaces (web, CLI, extension) share one Sentry project —
    // this tag is how events are told apart.
    initialScope: { tags: { surface: "extension" } },

    // Free tier: disable performance monitoring
    tracesSampleRate: 0,

    // VS Code lifecycle noise, not actionable application errors:
    // - CancellationError ("Canceled") fires whenever a pending operation is
    //   cancelled, e.g. a window reload or the extension host shutting down.
    // - "Channel has been closed" fires when an IPC channel to the extension
    //   host is torn down mid-request during shutdown/reload.
    // Anchored regex so we only drop the exact VS Code message, not any
    // error that happens to mention "Canceled" as part of a longer message.
    ignoreErrors: [
      /^Canceled$/,
      "Channel has been closed",
      // Offline / flaky network: WorkOS refresh and Convex socket failures
      // are retried by the token manager and the socket's own backoff.
      "fetch failed",
      "Could not reach WorkOS",
      "Client network socket disconnected",
      /\b(ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)\b/,
      // Fire-and-forget reports run at shutdown even when signed out.
      "You are not signed in.",
    ],

    beforeSend(event) {
      if (isForeignUnhandled(event)) return null;
      // Strip home directory paths from stack frames for privacy
      if (event.exception?.values) {
        for (const exc of event.exception.values) {
          if (exc.stacktrace?.frames) {
            for (const frame of exc.stacktrace.frames) {
              if (frame.filename) {
                frame.filename = frame.filename.replace(
                  /\/Users\/[^/]+/g,
                  "/~"
                );
                frame.filename = frame.filename.replace(
                  /C:\\Users\\[^\\]+/g,
                  "C:\\~"
                );
              }
            }
          }
        }
      }
      // Never send request bodies (may contain env variable values)
      if (event.request?.data) {
        event.request.data = "[REDACTED]";
      }
      return event;
    },
  });
  initialized = true;
}

export function captureError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (!initialized) return;
  Sentry.captureException(error, { extra: context });
}

export function setSentryUser(userId: string, email?: string): void {
  if (!initialized) return;
  Sentry.setUser({ id: userId, email });
}

export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

export async function closeSentry(): Promise<void> {
  if (!initialized) return;
  // Reset the guard so a later initSentry() call (e.g. the user re-enables
  // telemetry mid-session) actually re-initializes the client instead of
  // silently no-oping forever.
  initialized = false;
  await Sentry.close(2000);
}
