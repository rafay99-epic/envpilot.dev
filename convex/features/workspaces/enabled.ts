import { v, ConvexError } from "convex/values";
import { mutation, query } from "../../_generated/server";
import type { DatabaseReader } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  assertOrgAction,
  getActiveMembership,
  getRoleProfile,
  hasCapability,
} from "../../lib/authz";
import { createAuditLog } from "../../lib/audit";
import { checkBooleanFeature } from "../featureRegistry/gates";

/**
 * Sharing is on for an org when the tier allows it AND an owner switched it
 * on. Off stops new sharing only: existing groups keep resolving, so a
 * flipped switch never breaks a pull.
 */
export async function sharingStatus(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<{ allowed: boolean; enabled: boolean }> {
  const gate = await checkBooleanFeature(db, organizationId, "workspaces");
  const org = await db.get(organizationId);
  return {
    allowed: gate.allowed,
    enabled: gate.allowed && org?.settings?.sharedVariables === true,
  };
}

export async function assertSharingEnabled(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<void> {
  const { allowed, enabled } = await sharingStatus(db, organizationId);
  if (!allowed) {
    throw new ConvexError("Sharing variables is not available on this plan.");
  }
  if (!enabled) {
    throw new ConvexError(
      "Sharing is off for this organization. An owner can turn it on in Organization settings."
    );
  }
}

export const status = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership)
      return { allowed: false, enabled: false, canToggle: false };
    const profile = await getRoleProfile(ctx, membership.role);
    return {
      ...(await sharingStatus(ctx.db, args.organizationId)),
      canToggle: hasCapability(profile, "org.manage"),
    };
  },
});

export const setEnabled = mutation({
  args: { organizationId: v.id("organizations"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    await assertOrgAction(ctx, actor._id, args.organizationId, "org:update");
    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new ConvexError("Organization not found");
    if (args.enabled) {
      const gate = await checkBooleanFeature(
        ctx.db,
        args.organizationId,
        "workspaces"
      );
      if (!gate.allowed) {
        throw new ConvexError(
          "Sharing variables is not available on this plan."
        );
      }
    }
    await ctx.db.patch(args.organizationId, {
      settings: { ...org.settings, sharedVariables: args.enabled },
      updatedAt: Date.now(),
    });
    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
      action: args.enabled ? "org.sharing_enabled" : "org.sharing_disabled",
    });
    return null;
  },
});
