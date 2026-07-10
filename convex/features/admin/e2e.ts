import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/**
 * E2E environment provisioning — internal-only (never client-callable),
 * invoked with a deploy key: `bunx convex run features/admin/e2e:ensureE2EUserPro`.
 *
 * Puts the e2e test account on the pro tier so the shared fixture org has
 * unlimited projects/variables/accounts. The Playwright suite runs its
 * workers against per-worker fixture projects; on the free tier the
 * max_projects (3) and max_variables_per_project (50) caps would block that
 * scale — and tier gating itself is not what the suite asserts (specs
 * self-skip when a feature is gated). Idempotent: safe to run on every CI
 * deploy.
 */
export const ensureE2EUserPro = internalMutation({
  args: { email: v.string() },
  returns: v.object({
    updated: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (!user) {
      // The users row is created on first sign-in; a fresh e2e deployment
      // that has never run auth.setup won't have it yet. Don't fail the
      // deploy pipeline over ordering — the free-tier caps only bite once
      // the account has accumulated fixtures, and the next run heals it.
      return { updated: false, reason: `no user with email ${args.email}` };
    }

    const tierDef = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", "pro"))
      .first();
    if (!tierDef) {
      throw new Error(
        'tier "pro" is not seeded on this deployment — run the seed-tiers migration first'
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("userTiers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existing) {
      if (existing.tier === "pro")
        return { updated: false, reason: "already pro" };
      await ctx.db.patch(existing._id, {
        tier: "pro",
        updatedAt: now,
        reason: "e2e.fixture_provisioning",
      });
    } else {
      await ctx.db.insert("userTiers", {
        userId: user._id,
        tier: "pro",
        updatedAt: now,
        reason: "e2e.fixture_provisioning",
      });
    }
    return { updated: true };
  },
});
