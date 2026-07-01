/**
 * Convex auth provider configuration — WorkOS AuthKit.
 *
 * ⚠️ INERT PLACEHOLDER. This file intentionally registers NO auth providers
 * right now, so it does not force any function to require auth and every
 * existing function keeps accepting a client-supplied `userId` arg exactly as
 * before. `ctx.auth.getUserIdentity()` returns `null` for all current callers.
 *
 * It must stay free of `process.env` references: the Convex CLI statically
 * scans this file at push time and REJECTS the deployment if any env var it
 * references is unset — which would block every `convex dev`/`convex deploy`
 * push until the WorkOS JWT vars exist. Keeping it env-free keeps pushes green.
 *
 * ── Activating auth (the cutover, step 1) ──────────────────────────────────
 * When you are ready to bind functions to server-verified identity:
 *   1. Create the WorkOS JWT template (see docs/CONVEX_AUTH_MIGRATION.md).
 *   2. Set WORKOS_JWT_ISSUER and WORKOS_CONVEX_APPLICATION_ID in the Convex
 *      deployment: `npx convex env set WORKOS_JWT_ISSUER <issuer-url>` etc.
 *   3. Replace the empty `providers` below with:
 *        providers: [
 *          {
 *            domain: process.env.WORKOS_JWT_ISSUER,
 *            applicationID: process.env.WORKOS_CONVEX_APPLICATION_ID,
 *          },
 *        ]
 *      `domain` is the issuer/JWKS URL Convex uses to fetch signing keys;
 *      `applicationID` is the expected `aud` claim.
 *
 * The full ordered cutover plan lives in docs/CONVEX_AUTH_MIGRATION.md.
 */
export default {
  providers: [],
};
