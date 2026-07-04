import * as Sentry from "@sentry/node";

declare const __CLI_SENTRY_DSN__: string;
declare const __CLI_VERSION__: string;

let initialized = false;

export function initSentry(): void {
  const dsn =
    typeof __CLI_SENTRY_DSN__ !== "undefined" ? __CLI_SENTRY_DSN__ : "";
  if (initialized || !dsn) return;

  Sentry.init({
    dsn,
    environment: "cli",
    release: typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0",

    // All EnvPilot surfaces report to one Sentry project; the surface tag
    // is how dashboards tell web / cli / extension events apart.
    initialScope: { tags: { surface: "cli" } },

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
  context?: Record<string, string>
): void {
  if (!initialized) return;
  Sentry.captureException(error, { tags: context });
}

export async function flushSentry(): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(2000);
}
