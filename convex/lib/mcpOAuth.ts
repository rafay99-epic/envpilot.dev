import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { checkBooleanFeature } from "../features/featureRegistry/gates";
import { isSuspendedMembership } from "./authz";
import { mcpTokenConfig, verifyMcpAccessToken } from "./mcpToken";

export type OAuthPrincipal = { workosId: string; clientId?: string };

export async function verifyOAuthToken(token: string): Promise<OAuthPrincipal> {
  const config = mcpTokenConfig(process.env);
  if (!config) {
    throw new ConvexError("Sign-in with OAuth is not enabled on this server");
  }
  const claims = await verifyMcpAccessToken(token, config);
  if (!claims) throw new ConvexError("Invalid or expired access token");
  return { workosId: claims.workosId, clientId: claims.clientId };
}

export function oauthRateKey(principal: OAuthPrincipal): string {
  return `oauth:${principal.workosId}`;
}

export async function requireOAuthUser(
  ctx: QueryCtx,
  workosId: string
): Promise<Doc<"users">> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_id", (q) => q.eq("workosId", workosId))
    .first();
  if (!user) throw new ConvexError("No Envpilot account matches this sign-in");
  return user;
}

export async function requireMcpGate(
  ctx: QueryCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const gate = await checkBooleanFeature(ctx.db, organizationId, "mcp_server");
  if (!gate.allowed) {
    throw new ConvexError(
      "The MCP server is not included in this organization's plan"
    );
  }
}

export async function resolveOAuthOrganization(
  ctx: QueryCtx,
  userId: Id<"users">,
  slug: string | undefined
): Promise<Doc<"organizations">> {
  const memberships = (
    await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).filter((m) => !isSuspendedMembership(m));
  const organizations = (
    await Promise.all(memberships.map((m) => ctx.db.get(m.organizationId)))
  ).filter((org): org is Doc<"organizations"> => org !== null);

  const organization =
    slug !== undefined
      ? organizations.find((org) => org.slug === slug)
      : organizations.length === 1
        ? organizations[0]
        : undefined;
  if (!organization) {
    if (slug !== undefined) throw new ConvexError("Organization not found");
    if (organizations.length === 0) {
      throw new ConvexError("This account is not a member of any organization");
    }
    throw new ConvexError(
      `This account belongs to several organizations. Pass organization as one of: ${organizations
        .map((org) => org.slug)
        .join(", ")}`
    );
  }

  await requireMcpGate(ctx, organization._id);
  return organization;
}
