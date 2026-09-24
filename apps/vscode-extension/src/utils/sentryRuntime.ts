import * as path from "path";
import * as vscode from "vscode";
import * as Sentry from "@sentry/node";

declare const __EXTENSION_SENTRY_DSN__: string;
declare const __EXTENSION_VERSION__: string;

let initialized = false;

const EXTENSION_ROOT = path.dirname(__dirname);

export function scrubHomePath(filename: string): string {
  return filename
    .replace(/\/(?:Users|home)\/[^/]+/g, "/~")
    .replace(/C:\\Users\\[^\\]+/gi, "C:\\~");
}

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

    initialScope: { tags: { surface: "extension" } },

    tracesSampleRate: 0,

    ignoreErrors: [
      /^Canceled$/,
      "Channel has been closed",
      "fetch failed",
      "Could not reach WorkOS",
      "Client network socket disconnected",
      /\b(ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN)\b/,
      "You are not signed in.",
      "TransientAuthError",
    ],

    beforeSend(event) {
      if (isForeignUnhandled(event)) return null;
      if (event.exception?.values) {
        for (const exc of event.exception.values) {
          if (exc.stacktrace?.frames) {
            for (const frame of exc.stacktrace.frames) {
              if (frame.filename) {
                frame.filename = scrubHomePath(frame.filename);
              }
            }
          }
        }
      }
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

export function setSentryUser(userId: string): void {
  if (!initialized) return;
  Sentry.setUser({ id: userId });
}

export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

export async function closeSentry(): Promise<void> {
  if (!initialized) return;
  initialized = false;
  await Sentry.close(2000);
}
