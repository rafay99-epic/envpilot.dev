import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Server-verified identity helpers — the FUTURE replacement for the
 * client-supplied `userId` args that every mutation/query currently trusts.
 *
 * ⚠️ CURRENTLY UNUSED / DORMANT. No function calls these yet. They exist so the
 * cutover (docs/CONVEX_AUTH_MIGRATION.md) is a mechanical, per-function change:
 * delete the `userId: v.id("users")` arg and read the actor from here instead.
 *
 * How it works once auth is live:
 *   1. The caller attaches a WorkOS AuthKit JWT to the Convex request
 *      (browser via ConvexProviderWithAuth; server via
 *       createAuthedConvexClient(token) — see apps/web/src/lib/convex-client.ts).
 *   2. convex/auth.config.ts tells the deployment to trust that JWT's issuer.
 *   3. `ctx.auth.getUserIdentity()` returns the verified identity, whose
 *      `subject` is the WorkOS user id (the JWT `sub` claim).
 *   4. We map that WorkOS id → the `users` row via the `by_workos_id` index —
 *      the SAME lookup the web app already does server-side through
 *      `getOrCreateConvexUser` → `api.users.getByWorkosId`.
 *
 * Until every caller attaches a token, `getUserIdentity()` returns `null`, so
 * `getAuthedUser` returns `null` and `requireAuthedUser` throws — which is why
 * NOTHING may call these until the cutover phase flips callers over in batches.
 *
 * NOTE: the JWT `subject` must equal the WorkOS user id stored in
 * `users.workosId`. If the WorkOS JWT template emits a namespaced/prefixed
 * subject, strip/normalize it here before the lookup (see migration doc).
 */

/**
 * Resolve the currently-authenticated Convex user from the request's verified
 * identity, or `null` if there is no authenticated identity (or no matching
 * users row). Never throws for the unauthenticated case — use this when auth is
 * optional. For required-auth call sites use {@link requireAuthedUser}.
 */
export async function getAuthedUser(
  ctx: MutationCtx | QueryCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // WorkOS AuthKit puts the WorkOS user id in the JWT `sub` claim, surfaced by
  // Convex as `identity.subject`. That maps 1:1 to `users.workosId`.
  const workosId = identity.subject;
  if (!workosId) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
    .first();

  return user;
}

/**
 * Like {@link getAuthedUser} but throws if there is no authenticated user.
 * This is the drop-in replacement for the client-supplied `userId` arg:
 * a converted function does `const actor = await requireAuthedUser(ctx);`
 * and uses `actor._id` where it used to use `args.userId`.
 */
export async function requireAuthedUser(
  ctx: MutationCtx | QueryCtx
): Promise<Doc<"users">> {
  const user = await getAuthedUser(ctx);
  if (!user) {
    throw new Error("Unauthenticated: no verified user identity on request");
  }
  return user;
}
