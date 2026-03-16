// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,
  includeLocalVariables: true,
  enableLogs: true,

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
