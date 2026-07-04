// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Sentry is off in local dev by default. Set NEXT_PUBLIC_SENTRY_ENABLE_DEV=true
// in .env.local to opt in locally (useful for verifying capture end to end).
const sentryEnabled =
  process.env.NODE_ENV !== "development" ||
  process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV === "true";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: sentryEnabled,

  sendDefaultPii: true,
  includeLocalVariables: true,
  enableLogs: true,

  // All EnvPilot surfaces report to one Sentry project; the surface tag
  // is how dashboards tell web / cli / extension events apart.
  initialScope: { tags: { surface: "web" } },

  // Free tier: disable performance monitoring
  tracesSampleRate: 0,

  // Scrub sensitive data from server events (secret values, auth tokens)
  beforeSend(event) {
    // Remove request bodies that might contain secret values
    if (event.request?.data) {
      try {
        const data =
          typeof event.request.data === "string"
            ? JSON.parse(event.request.data)
            : event.request.data;
        for (const key of Object.keys(data)) {
          if (/value|secret|token|password|apiKey|cookie/i.test(key)) {
            data[key] = "[REDACTED]";
          }
        }
        event.request.data = data;
      } catch {
        // If we can't parse, redact the entire body
        event.request.data = "[REDACTED]";
      }
    }
    // Remove cookies and authorization headers
    if (event.request?.headers) {
      delete event.request.headers["cookie"];
      delete event.request.headers["authorization"];
    }
    return event;
  },
});
