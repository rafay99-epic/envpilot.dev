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
 * Per-request authenticated Convex client factory — DORMANT until the auth
 * cutover (see docs/CONVEX_AUTH_MIGRATION.md).
 *
 * The shared `convex` singleton above must NEVER have `setAuth()` called on it:
 * it is reused across all 71+ API routes and concurrent requests, so mutating
 * its auth state per-request would leak one caller's identity into another's
 * request. When a route needs to make an *authenticated* Convex call on behalf
 * of the signed-in user, create a fresh client bound to that caller's token:
 *
 *   const { accessToken } = await withAuth();
 *   const authed = createAuthedConvexClient(accessToken);
 *   await authed.mutation(api.someModule.someFn, { ...argsWithoutUserId });
 *
 * The `token` is the WorkOS AuthKit access token (JWT) from `withAuth()`.
 * Until convex/auth.config.ts is active AND functions read identity via
 * convex/identity.ts, passing a token here is harmless — functions still
 * accept their existing `userId` args and ignore the request identity.
 *
 * This factory is intentionally NOT wired into any route yet.
 */
export function createAuthedConvexClient(token: string): ConvexHttpClient {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  return client;
}
