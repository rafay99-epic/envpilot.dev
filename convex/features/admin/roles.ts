import { v, ConvexError } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { verifyAdmin } from "./auth";
import { CAPABILITIES, CAPABILITY_KEYS } from "../../lib/capabilities";

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,30}$/;
// Legacy values normalizeOrgRole rewrites BEFORE registry lookup (admin →
// the full OWNER profile), and system slugs are seed-owned — a custom row
// claiming one pre-seed would shadow the built-in profile in getRoleProfile.
// Never allow any of them as custom slugs.
const RESERVED_SLUGS = new Set([
  "admin",
  "member",
  "owner",
  "project_manager",
  "team_lead",
  "developer",
]);
// Custom-role hierarchy bounds: strictly below owner (100) and above the
// fail-closed 0 so the owner can always manage every assignable role.
const MIN_CUSTOM_LEVEL = 1;
const MAX_CUSTOM_LEVEL = 99;

function validateCapabilityKeys(capabilities: Record<string, boolean>) {
  const unknown = Object.keys(capabilities).filter(
    (key) => !(CAPABILITY_KEYS as string[]).includes(key)
  );
  if (unknown.length > 0) {
    throw new ConvexError(`Unknown capability keys: ${unknown.join(", ")}`);
  }
}

/** All roles sorted by sortOrder, with member + pending invitation counts */
export const listRoles = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const roles = await ctx.db.query("roleRegistry").collect();

    // ponytail: full-table collects — fine at admin-panel scale, index by
    // role slug if orgs ever hold tens of thousands of members
    const members = await ctx.db.query("organizationMembers").collect();
    const invitations = await ctx.db.query("invitations").collect();

    const memberCounts: Record<string, number> = {};
    for (const m of members) {
      memberCounts[m.role] = (memberCounts[m.role] ?? 0) + 1;
    }
    const pendingInviteCounts: Record<string, number> = {};
    for (const i of invitations) {
      if (i.status !== "pending") continue;
      pendingInviteCounts[i.role] = (pendingInviteCounts[i.role] ?? 0) + 1;
    }

    return roles
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((role) => ({
        ...role,
        memberCount: memberCounts[role.slug] ?? 0,
        pendingInvitationCount: pendingInviteCounts[role.slug] ?? 0,
      }));
  },
});

/** The code-defined capability catalog (lib/capabilities.ts) */
export const listCapabilities = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => {
    verifyAdmin(args.secret);
    return CAPABILITY_KEYS.map((key) => ({ key, ...CAPABILITIES[key] }));
  },
});

/** Create a custom (non-system) role */
export const createRole = mutation({
  args: {
    secret: v.string(),
    slug: v.string(),
    displayName: v.string(),
    description: v.string(),
    color: v.string(),
    level: v.number(),
    capabilities: v.record(v.string(), v.boolean()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (!SLUG_PATTERN.test(args.slug)) {
      throw new ConvexError(
        "Slug must start with a letter and contain only lowercase letters, digits, and underscores (2-31 chars)"
      );
    }
    if (RESERVED_SLUGS.has(args.slug)) {
      throw new ConvexError(
        `"${args.slug}" is a reserved legacy slug and cannot be used for a custom role.`
      );
    }
    if (
      args.level < MIN_CUSTOM_LEVEL ||
      args.level > MAX_CUSTOM_LEVEL ||
      !Number.isInteger(args.level)
    ) {
      throw new ConvexError(
        `Role level must be an integer between ${MIN_CUSTOM_LEVEL} and ${MAX_CUSTOM_LEVEL} (owner is always 100).`
      );
    }
    const existing = await ctx.db
      .query("roleRegistry")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) {
      throw new ConvexError(`A role with slug "${args.slug}" already exists`);
    }
    validateCapabilityKeys(args.capabilities);

    const roles = await ctx.db.query("roleRegistry").collect();
    const now = Date.now();
    const id = await ctx.db.insert("roleRegistry", {
      slug: args.slug,
      displayName: args.displayName,
      description: args.description,
      color: args.color,
      level: args.level,
      isSystem: false,
      isActive: true,
      sortOrder: Math.max(0, ...roles.map((r) => r.sortOrder + 1)),
      capabilities: args.capabilities,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`[admin] role created: ${args.slug} (level ${args.level})`);
    return id;
  },
});

/** Edit display metadata; level is editable for non-system roles only */
export const updateRoleMeta = mutation({
  args: {
    secret: v.string(),
    roleId: v.id("roleRegistry"),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    level: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const targetRole = await ctx.db.get(args.roleId);
    if (!targetRole) throw new ConvexError("Role not found");
    // System-role identity (name, description, color, level, sort) is
    // code-defined and re-synced by every seed — accepting an edit here
    // would silently revert on the next deploy. Capabilities are the only
    // editable surface for system roles (via the matrix).
    if (targetRole.isSystem) {
      throw new ConvexError(
        "System role identity is code-defined. Only capabilities are editable."
      );
    }
    if (
      args.level !== undefined &&
      (args.level < MIN_CUSTOM_LEVEL ||
        args.level > MAX_CUSTOM_LEVEL ||
        !Number.isInteger(args.level))
    ) {
      throw new ConvexError(
        `Role level must be an integer between ${MIN_CUSTOM_LEVEL} and ${MAX_CUSTOM_LEVEL} (owner is always 100).`
      );
    }
    await ctx.db.patch(args.roleId, {
      ...(args.displayName !== undefined && { displayName: args.displayName }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.color !== undefined && { color: args.color }),
      ...(args.sortOrder !== undefined && { sortOrder: args.sortOrder }),
      ...(args.level !== undefined && { level: args.level }),
      updatedAt: Date.now(),
    });
    console.log(`[admin] role meta updated: ${targetRole.slug}`);
  },
});

/** Toggle one capability on any role except Owner (single-key, race-free) */
export const updateRoleCapabilities = mutation({
  args: {
    secret: v.string(),
    roleId: v.id("roleRegistry"),
    key: v.string(),
    granted: v.boolean(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new ConvexError("Role not found");
    // Owner is the only locked matrix: it must always hold every capability
    // (org.manage included) — an editable owner is a bricked-org hazard.
    // Other system roles are editable; the seed MERGES, so edits survive.
    if (role.slug === "owner") {
      throw new ConvexError("The Owner capability matrix is locked.");
    }
    // System roles ship to every organization — they must never become
    // owner-class. Deliberate owner-class delegates are CUSTOM roles.
    if (args.key === "org.manage" && args.granted && role.isSystem) {
      throw new ConvexError(
        "System roles cannot hold org.manage. Create a custom role for owner-class delegation."
      );
    }
    validateCapabilityKeys({ [args.key]: args.granted });
    // Single-key patch over a FRESH read: two quick toggles in the panel
    // can't revert each other via a stale client-side snapshot.
    await ctx.db.patch(args.roleId, {
      capabilities: { ...role.capabilities, [args.key]: args.granted },
      updatedAt: Date.now(),
    });
    // Structured log — the durable record in the Convex dashboard for a
    // platform-global policy change (roleRegistry has no org for auditLogs).
    console.log(
      `[admin][role-capability] ${role.slug}: ${args.key} ${
        args.granted ? "GRANTED" : "REVOKED"
      } (was ${role.capabilities[args.key] === true ? "granted" : "absent/false"})`
    );
  },
});

/** Activate/deactivate a non-system role; deactivation blocked while in use */
export const setRoleActive = mutation({
  args: {
    secret: v.string(),
    roleId: v.id("roleRegistry"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const role = await ctx.db.get(args.roleId);
    if (!role) throw new ConvexError("Role not found");
    if (role.isSystem) {
      throw new ConvexError("System roles cannot be deactivated");
    }
    if (!args.isActive) {
      const members = await ctx.db.query("organizationMembers").collect();
      const memberCount = members.filter((m) => m.role === role.slug).length;
      const invitations = await ctx.db.query("invitations").collect();
      const inviteCount = invitations.filter(
        (i) => i.status === "pending" && i.role === role.slug
      ).length;
      if (memberCount > 0 || inviteCount > 0) {
        throw new ConvexError(
          `Cannot deactivate "${role.displayName}": ${memberCount} member(s) and ${inviteCount} pending invitation(s) still hold this role`
        );
      }
    }
    await ctx.db.patch(args.roleId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    console.log(
      `[admin] role ${args.isActive ? "activated" : "deactivated"}: ${role.slug}`
    );
  },
});
