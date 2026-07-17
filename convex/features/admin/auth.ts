import { v } from "convex/values";
import { query } from "../../_generated/server";

// ==========================================
// ADMIN AUTH + SHARED GUARD
// ==========================================
export function verifyAdmin(secret: string) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || secret !== adminSecret) {
    throw new Error("Unauthorized: Invalid admin secret");
  }
}

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
  "changelog",
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

export const verifySecret = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => {
    const adminSecret = process.env.ADMIN_SECRET;
    return { valid: !!adminSecret && args.secret === adminSecret };
  },
});
