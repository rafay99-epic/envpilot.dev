import { ConvexError } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { getAuthedUser } from "../../lib/identity";

// ==========================================
// ADMIN AUTH + SHARED GUARD
// ==========================================
//
// Admin access = a signed-in WorkOS user (verified JWT via auth.config.ts)
// whose email is in the ADMIN_EMAILS env var on the Convex deployment
// (comma-separated, case-insensitive). The allowlist deliberately lives in
// the environment, not the database, so it cannot be edited through the
// admin data browser itself.

function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function getAdminUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const user = await getAuthedUser(ctx);
  if (!user || user.isBanned) return null;
  return adminEmailAllowlist().includes(user.email.toLowerCase()) ? user : null;
}

/**
 * Guard for admin queries/mutations. Throws ConvexError (survives prod
 * redaction) unless the request carries a verified identity whose email is
 * on the ADMIN_EMAILS allowlist. Returns the admin's users row so callers
 * can attribute writes to a real identity.
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const admin = await getAdminUser(ctx);
  if (!admin) throw new ConvexError("Unauthorized: admin access required");
  return admin;
}

/** Guard for admin actions (no ctx.db there — checks via an internal query). */
export async function requireAdminAction(
  ctx: ActionCtx
): Promise<{ email: string; workosId: string }> {
  const admin = await ctx.runQuery(internal.features.admin.auth.check, {});
  if (!admin) throw new ConvexError("Unauthorized: admin access required");
  return admin;
}

export const check = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admin = await getAdminUser(ctx);
    return admin ? { email: admin.email, workosId: admin.workosId } : null;
  },
});

/** Client gate: lets the SPA distinguish signed-out / signed-in-but-not-admin / admin. */
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { signedIn: false, isAdmin: false, email: null };
    const admin = await getAdminUser(ctx);
    return {
      signedIn: true,
      isAdmin: admin !== null,
      email: admin?.email ?? (identity.email as string | undefined) ?? null,
    };
  },
});

export const BROWSABLE_TABLES = [
  "users",
  "roleRegistry",
  "userPreferences",
  "organizations",
  "organizationMembers",
  "projects",
  "favoriteProjects",
  "projectMembers",
  "environmentVariables",
  "environmentVariableRequests",
  "variableVersions",
  "variablePermissions",
  "projectAccess",
  "invitations",
  "featureRequests",
  "featureVotes",
  "auditLogs",
  "subscriptions",
  "polarCustomers",
  "cliTokens",
  "environmentTemplates",
  "templateVariables",
  "permissionRevocationEvents",
  "supportTickets",
  "contactMessages",
  "tierDefinitions",
  "organizationTiers",
  "adminSettings",
  "paymentProducts",
  "processedWebhookEvents",
] as const;
