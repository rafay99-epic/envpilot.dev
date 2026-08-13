import { ConvexError } from "convex/values";
import { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { resolveFeatureValue } from "../featureRegistry/resolver";
import { requireAuthedUser } from "../../lib/identity";
import {
  getActiveMembership,
  getRoleProfile,
  hasCapability,
} from "../../lib/authz";

/**
 * SERVER-SIDE AUTHORIZATION for the audit surface. Historically these
 * queries had NO backend auth (client-side RequireRole only) — any
 * authenticated user could read any org's audit trail. Every audit query
 * now calls this first: caller must be an active org member whose role
 * holds org.audit.view (owner/PM by default via seeds; TL included).
 */
/**
 * Same check as {@link assertAuditAccess}, but answers instead of throwing.
 * For reads whose failure mode should be "render nothing" rather than "kill
 * the page" — the settings provenance line, not the audit log itself.
 */
export async function hasAuditAccess(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">
): Promise<boolean> {
  const actor = await requireAuthedUser(ctx);
  const membership = await getActiveMembership(ctx, organizationId, actor._id);
  if (!membership) return false;
  const profile = await getRoleProfile(ctx, membership.role);
  return hasCapability(profile, "org.audit.view");
}

export async function assertAuditAccess(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const actor = await requireAuthedUser(ctx);
  const membership = await getActiveMembership(ctx, organizationId, actor._id);
  if (!membership) {
    throw new ConvexError("Not a member of this organization");
  }
  const profile = await getRoleProfile(ctx, membership.role);
  if (!hasCapability(profile, "org.audit.view")) {
    throw new ConvexError(
      "Viewing audit logs requires the audit capability (project manager and above by default)."
    );
  }
}

/**
 * Get the audit log retention cutoff timestamp for an organization.
 * Returns null if no retention limit applies (unlimited).
 */
export async function getRetentionCutoff(
  db: any,
  organizationId: Id<"organizations">
): Promise<number | null> {
  const resolved = await resolveFeatureValue(
    db,
    organizationId,
    "audit_log_retention_days"
  );
  const days = resolved.value as number | null;
  if (days === null) return null; // unlimited
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
