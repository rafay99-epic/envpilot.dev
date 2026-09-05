import * as Sentry from "@sentry/nextjs";

// Sentry is off in local dev by default. Set NEXT_PUBLIC_SENTRY_ENABLE_DEV=true
// in .env.local to opt in locally (useful for verifying capture end to end).
const sentryEnabled =
  process.env.NODE_ENV !== "development" ||
  process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV === "true";

function isTwitterInAppBrowserConfigNoise(event: Sentry.ErrorEvent) {
  const exceptionValues = event.exception?.values ?? [];
  const messageMatches = exceptionValues.some((exception) =>
    exception.value?.includes("Can't find variable: CONFIG")
  );

  if (!messageMatches) return false;

  const stackMatches = exceptionValues.some((exception) =>
    exception.stacktrace?.frames?.some((frame) => {
      const fn = frame.function ?? "";
      return fn === "updateGapFiller" || fn === "updateFooterPositions";
    })
  );

  const browserName =
    event.contexts?.browser?.name ?? event.tags?.["browser.name"];
  const isTwitterBrowser = browserName === "Twitter";

  return stackMatches || isTwitterBrowser;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: sentryEnabled,

  enableLogs: true,

  // All EnvPilot surfaces report to one Sentry project; the surface tag
  // is how dashboards tell web / cli / extension events apart.
  initialScope: { tags: { surface: "web" } },

  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  beforeSend(event) {
    if (isTwitterInAppBrowserConfigNoise(event)) {
      return null;
    }

    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((bc) => {
        if (bc.data) {
          for (const key of Object.keys(bc.data)) {
            if (/value|secret|token|password|key/i.test(key)) {
              bc.data[key] = "[REDACTED]";
            }
          }
        }
        return bc;
      });
    }
    return event;
  },

  ignoreErrors: [
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "AbortError",
    "ChunkLoadError",
    // Browser network failures (offline, blocked, dev server down)
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource",
  ],
});

export const onRouterTransitionStart = sentryEnabled
  ? Sentry.captureRouterTransitionStart
  : () => {};
