import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * Server-verified identity helpers — the replacement for the client-supplied
 * `userId` args that mutations/queries used to trust.
 *
 * ✅ ACTIVE since the auth cutover (docs/CONVEX_AUTH_MIGRATION.md):
 * convex/auth.config.ts registers the WorkOS AuthKit JWT providers and
 * every function derives its actor from `requireAuthedUser` / `getAuthedUser`.
 * Since the Stage 2 device-flow cutover the CLI and VS Code extension attach a
 * WorkOS JWT (device flow) and call these same helpers — the old
 * `requireBearerUser` bridge and every `*ForToken` variant have been removed.
 *
 * How it works:
 *   1. The caller attaches a WorkOS AuthKit JWT to the Convex request
 *      (browser via ConvexProviderWithAuth; server via
 *       createAuthedConvexClient(token) — see apps/web/src/lib/convex-client.ts).
 *   2. convex/auth.config.ts tells the deployment to trust that JWT's issuer.
 *   3. `ctx.auth.getUserIdentity()` returns the verified identity, whose
 *      `subject` is the WorkOS user id (the JWT `sub` claim).
 *   4. We map that WorkOS id → the `users` row via the `by_workos_id` index —
 *      the SAME lookup the web app already does server-side through
 *      `getOrCreateConvexUser` → `api.features.users.users.getByWorkosId`.
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
    // ConvexError: prod redacts plain Error to "Server Error", and the web
    // client's transient-auth-race triage matches on this exact text.
    throw new ConvexError(
      "Unauthenticated: no verified user identity on request"
    );
  }
  return user;
}
