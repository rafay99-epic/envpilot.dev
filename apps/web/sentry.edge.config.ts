// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
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

  enableLogs: true,
  sendDefaultPii: true,

  // All EnvPilot surfaces report to one Sentry project; the surface tag
  // is how dashboards tell web / cli / extension events apart.
  initialScope: { tags: { surface: "web" } },

  // Free tier: disable performance monitoring
  tracesSampleRate: 0,
});
