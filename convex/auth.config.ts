/**
 * Convex auth provider configuration — WorkOS AuthKit (ACTIVE).
 *
 * Convex verifies WorkOS-issued JWTs against these providers and surfaces the
 * verified identity to functions via `ctx.auth.getUserIdentity()`, whose
 * `subject` is the WorkOS user id (`user_...`) — the join key for
 * `users.workosId` used by convex/identity.ts.
 *
 * Two providers because WorkOS issues tokens under two issuers (per the
 * official Convex + AuthKit guide, docs.convex.dev/auth/authkit):
 *  - `https://api.workos.com/` — carries an `aud` claim, so `applicationID`
 *    pins it to this app's client id.
 *  - `https://api.workos.com/user_management/<client id>` — AuthKit session
 *    access tokens. No `aud` claim, but the issuer itself embeds the client
 *    id, so tokens are already application-scoped.
 *
 * ⚠️ WORKOS_CLIENT_ID must be set in the Convex deployment BEFORE this file
 * is pushed (`npx convex env set WORKOS_CLIENT_ID client_...`) — the Convex
 * CLI statically scans this file at push time and rejects the deployment if a
 * referenced env var is unset. Set it on prod before the first prod deploy of
 * this config.
 */
const clientId = process.env.WORKOS_CLIENT_ID;

export default {
  providers: [
    {
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      applicationID: clientId,
    },
    {
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
