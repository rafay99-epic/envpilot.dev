import * as Sentry from "@sentry/node";

declare const __EXTENSION_SENTRY_DSN__: string;
declare const __EXTENSION_VERSION__: string;

let initialized = false;

export function initSentry(): void {
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

    // Free tier: disable performance monitoring
    tracesSampleRate: 0,

    beforeSend(event) {
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
  await Sentry.close(2000);
}
