// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";

// Initialize BotID protection for high-value API endpoints.
// Each entry must match the actual HTTP method used by the server handler.
initBotId({
  protect: [
    // Variables — core secret management
    { path: "/api/variables", method: "POST" },
    { path: "/api/variables/*", method: "PATCH" },
    { path: "/api/variables/*", method: "DELETE" },
    { path: "/api/variables/bulk-delete", method: "POST" },
    { path: "/api/variables/*/rollback", method: "POST" },
    // Variable access requests
    { path: "/api/variable-requests", method: "POST" },
    { path: "/api/variable-requests/*", method: "PATCH" },
    // Projects
    { path: "/api/projects", method: "POST" },
    { path: "/api/projects/*", method: "PATCH" },
    { path: "/api/projects/*", method: "DELETE" },
    { path: "/api/projects/*/move", method: "POST" },
    { path: "/api/projects/*/members", method: "POST" },
    { path: "/api/projects/*/members", method: "PATCH" },
    { path: "/api/projects/*/members", method: "DELETE" },
    // Organizations
    { path: "/api/organizations", method: "POST" },
    { path: "/api/organizations/*", method: "PATCH" },
    { path: "/api/organizations/*", method: "DELETE" },
    { path: "/api/organizations/*/transfer", method: "POST" },
    { path: "/api/organizations/*/members", method: "POST" },
    { path: "/api/organizations/*/members", method: "PATCH" },
    { path: "/api/organizations/*/members", method: "DELETE" },
    { path: "/api/organizations/*/members/*/sessions", method: "DELETE" },
    { path: "/api/organizations/*/invitations/*", method: "POST" },
    { path: "/api/organizations/*/invitations/*", method: "DELETE" },
    { path: "/api/organizations/*/settings", method: "PATCH" },
    // Billing
    { path: "/api/billing/checkout", method: "POST" },
    { path: "/api/billing/portal", method: "POST" },
    // Invitations
    { path: "/api/invitations/*", method: "POST" },
    { path: "/api/invitations/*", method: "DELETE" },
    // Templates
    { path: "/api/templates", method: "POST" },
    { path: "/api/templates/*", method: "PATCH" },
    { path: "/api/templates/*", method: "DELETE" },
    { path: "/api/templates/seed", method: "POST" },
    // Vault operations
    { path: "/api/vault", method: "POST" },
    { path: "/api/vault", method: "PUT" },
    { path: "/api/vault", method: "DELETE" },
    { path: "/api/vault/encrypt", method: "POST" },
    { path: "/api/vault/encrypt", method: "PUT" },
    { path: "/api/vault/keys", method: "POST" },
    { path: "/api/vault/keys", method: "PUT" },
    // User profile
    { path: "/api/users/me", method: "PATCH" },
    { path: "/api/users/me/preferences", method: "PATCH" },
    { path: "/api/users/me/sessions", method: "DELETE" },
    { path: "/api/users/sync", method: "POST" },
  ],
});

Sentry.init({
  dsn: "https://24f72269c7fbd01271c7df8c6bd50744@o4509762173009920.ingest.de.sentry.io/4511055962505296",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
