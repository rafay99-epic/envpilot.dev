import * as Sentry from "@sentry/nextjs";

const sentryEnabled = process.env.NODE_ENV !== "development";

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
  ],
});

export const onRouterTransitionStart = sentryEnabled
  ? Sentry.captureRouterTransitionStart
  : () => {};
