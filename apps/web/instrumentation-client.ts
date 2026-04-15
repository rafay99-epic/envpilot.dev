import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";
import { BOTID_PROTECTED_ROUTES } from "@/lib/botid-protected-routes";

initBotId({
  protect: BOTID_PROTECTED_ROUTES,
});

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enableLogs: true,

  // Free tier: disable performance monitoring and session replay
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Scrub sensitive data before sending to Sentry
  beforeSend(event) {
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

  // Filter out noisy browser errors that aren't actionable
  ignoreErrors: [
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "AbortError",
    "ChunkLoadError",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
