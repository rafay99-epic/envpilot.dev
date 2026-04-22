// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const sentryEnabled = process.env.NODE_ENV !== "development";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: sentryEnabled,

  enableLogs: true,
  sendDefaultPii: true,

  // Free tier: disable performance monitoring
  tracesSampleRate: 0,
});
