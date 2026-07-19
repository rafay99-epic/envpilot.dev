import { ConvexHttpClient } from "convex/browser";

/**
 * Shared ConvexHttpClient singleton for all server-side Convex calls
 * (API routes, server components, server actions).
 *
 * Previously each of 71+ API routes instantiated its own client at module
 * scope, creating 71 separate HTTP client objects with no connection reuse.
 * This module-level singleton is created once per server instance and shared.
 *
 * NEXT_PUBLIC_CONVEX_URL is inlined at build time by Next.js, so it's
 * guaranteed to be available when this module loads.
 */
export const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Per-request authenticated Convex client factory — the REQUIRED path for
 * any Convex call that runs as the signed-in user. Identity-enforced
 * functions (requireAuthedUser/getAuthedUser — e.g. projects.getById,
 * getBySlug, listByOrganization, all mutations) reject calls made through
 * the unauthenticated singleton above.
 *
 * The shared `convex` singleton must NEVER have `setAuth()` called on it:
 * it is reused across all API routes and concurrent requests, so mutating
 * its auth state per-request would leak one caller's identity into
 * another's request. Instead, bind a fresh client to the caller's token:
 *
 *   const { user, accessToken } = await withAuth();
 *   await getOrCreateConvexUser(convex, user); // users row must exist FIRST
 *   const authed = createAuthedConvexClient(accessToken!);
 *   await authed.query(api.someModule.someFn, args);
 *
 * The `token` is the WorkOS AuthKit access token (JWT) from `withAuth()`;
 * its `sub` maps to `users.workosId`, which is why the getOrCreateConvexUser
 * sync must precede the first authed call on a first-time session.
 * Reuse ONE authed client per handler — don't re-create it per call.
 */
export function createAuthedConvexClient(token: string): ConvexHttpClient {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  return client;
}
