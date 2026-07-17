import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import {
  getRoleProfile,
  bypassesAssignment,
  hasCapability,
  isSuspendedMembership,
  type RoleProfile,
} from "../../lib/authz";
import {
  SYSTEM_PROFILES,
  SEEDED_CUSTOM_PROFILES,
} from "../../lib/roleProfiles";

// ─── Query: listAssignableRoles ───────────────────────────────────────────────
//
// Registry-driven role picker source: the active roles the caller may assign
// (invite / role change). Strictly below the caller's own resolved level;
// the owner class (org.manage) may assign every role. Replaces the web's
// hardcoded assignableRoles() list.

export const listAssignableRoles = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(
    v.object({
      slug: v.string(),
      displayName: v.string(),
      description: v.string(),
      color: v.string(),
      level: v.number(),
      // capabilities["access.env_scoped"] — drives the environment-scope
      // picker in invite/assignment UIs without shipping the full map.
      envScoped: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", actor._id)
      )
      .first();
    // Non-members and suspended members get an empty picker (fail closed).
    if (!membership || isSuspendedMembership(membership)) return [];

    const callerProfile = await getRoleProfile(ctx, membership.role);

    // Dual-mode: registry rows when seeded, built-in profiles before.
    const rows = await ctx.db.query("roleRegistry").collect();
    const profiles: RoleProfile[] =
      rows.length > 0
        ? rows
            .filter((r) => r.isActive)
            .map((r) => ({
              slug: r.slug,
              displayName: r.displayName,
              description: r.description,
              color: r.color,
              level: r.level,
              isSystem: r.isSystem,
              capabilities: r.capabilities as RoleProfile["capabilities"],
            }))
        : [
            ...Object.values(SYSTEM_PROFILES),
            ...Object.values(SEEDED_CUSTOM_PROFILES),
          ];

    const assignAll = bypassesAssignment(callerProfile);
    return profiles
      .filter((p) => assignAll || p.level < callerProfile.level)
      .sort((a, b) => b.level - a.level)
      .map((p) => ({
        slug: p.slug,
        displayName: p.displayName,
        description: p.description,
        color: p.color,
        level: p.level,
        envScoped: hasCapability(p, "access.env_scoped"),
      }));
  },
});
