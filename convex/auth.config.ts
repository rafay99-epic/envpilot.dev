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
 * ⚠️ TEMPORARY EMERGENCY FIX: the client id is HARDCODED below instead of read
 * from `process.env.WORKOS_CLIENT_ID`. This removes deploy-time env resolution
 * as a failure source — a prior prod deploy had frozen the providers against a
 * stale/mismatched client id, causing "No auth provider found matching the
 * given token". The WorkOS client id is a PUBLIC value (already baked into the
 * CLI/extension), so hardcoding it is not a secret leak.
 *
 * ⚠️ MUST read the env var FIRST: this file is deployed to BOTH the staging/dev
 * and prod Convex deployments, which trust DIFFERENT WorkOS clients (dev =
 * staging `client_01KHWD…6RSW9`, prod = `client_01KHWD…75944`). A pure hardcode
 * makes dev trust the PROD client, so every dev CLI/extension/web JWT (issued
 * for the staging client) fails to verify → "No auth provider found matching
 * the given token" → login broken on dev. Reading `process.env.WORKOS_CLIENT_ID`
 * lets each deployment use its OWN client (dev has staging set; prod has prod
 * set or falls back to the prod hardcode), fixing dev without breaking the prod
 * emergency fix. Each deployment MUST have WORKOS_CLIENT_ID set (the Convex CLI
 * rejects a push that references an unset env var).
 */
const clientId =
  process.env.WORKOS_CLIENT_ID || "client_01KHWDD75944NBADKY0ANTRXR8";

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
