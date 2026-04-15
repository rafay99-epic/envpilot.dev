// Routes protected by BotID client instrumentation.
// Keep this in sync with handlers that call verifyNotBot().
export const BOTID_PROTECTED_ROUTES = [
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
];
