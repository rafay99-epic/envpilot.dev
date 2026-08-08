/**
 * Shared authorization and lookup helpers for project documentation.
 *
 * Docs sit at project granularity, deliberately: a project's members already
 * hold that project's secrets, so gating its documentation more tightly than
 * its credentials would be theatre. There is no per-doc grant table and no
 * per-doc ACL.
 *
 * Two rules the whole feature rests on:
 *   1. DRAFTS ARE PRIVATE to their author (plus roles that can publish).
 *      A draft is unreviewed, possibly agent-written text; the human
 *      publication gate is what keeps it out of teammates' hands and out of
 *      every MCP read.
 *   2. PUBLISHING IS A HUMAN ACT. No code path outside a dashboard mutation
 *      may set `status: "published"`.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  bypassesAssignment,
  getActiveMembership,
  getRoleProfile,
  hasCapability,
} from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";

/** Ceiling on a single project's doc listing — structural, not a tier limit. */
export const MAX_DOC_ROWS = 500;

export type DocAccess = {
  project: Doc<"projects">;
  /** May create drafts and edit their own. Every project member can. */
  canWrite: boolean;
  /** May publish anyone's draft and edit anyone's page (Team Lead+). */
  canManage: boolean;
};

/**
 * Resolve a caller's access to a project's docs, or throw.
 *
 * Visibility mirrors `projects.canViewProject`: active org membership, and
 * roles without the assignment bypass need an explicit projectMembers row.
 * `project.permissions.manage` is the same capability that governs minting a
 * project-scoped API key — i.e. the authority to widen who can read a
 * project — so it is the right gate for publishing someone else's draft.
 */
export async function requireDocAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<DocAccess> {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt !== undefined) {
    throw new ConvexError("Project not found");
  }

  const membership = await getActiveMembership(
    ctx,
    project.organizationId,
    userId
  );
  if (!membership) throw new ConvexError("Project not found");

  const profile = await getRoleProfile(ctx, membership.role);
  if (!bypassesAssignment(profile)) {
    const assignment = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", projectId).eq("userId", userId)
      )
      .first();
    if (!assignment) throw new ConvexError("Project not found");
  }

  return {
    project,
    canWrite: true,
    canManage: hasCapability(profile, "project.permissions.manage"),
  };
}

/**
 * Tier gate. Kept OUT of `_authorizeRequest` on purpose: that core derives
 * its gate from the surface alone (`mcp_server` / `public_api`) and its
 * `gateFeature` argument is a closed two-literal union, so a third feature
 * key cannot ride it. Callers check here, the same shape `cicd/pull.ts` uses.
 */
export async function requireDocsFeature(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const gate = await checkBooleanFeature(
    ctx.db,
    organizationId,
    "project_docs"
  );
  if (!gate.allowed) {
    throw new ConvexError(
      gate.reason ?? "Project documentation requires a higher tier."
    );
  }
}

/** Whether `userId` may see this specific doc row. Drafts are private. */
export function canSeeDoc(
  doc: Doc<"docs">,
  userId: Id<"users">,
  access: DocAccess
): boolean {
  if (doc.deletedAt !== undefined) return false;
  if (doc.status === "published") return true;
  return doc.authorId === userId || access.canManage;
}

/** Whether `userId` may edit or publish this doc. */
export function canEditDoc(
  doc: Doc<"docs">,
  userId: Id<"users">,
  access: DocAccess
): boolean {
  return doc.authorId === userId || access.canManage;
}

/**
 * Resolve a unique slug within a project, ignoring soft-deleted rows.
 * Appends -2, -3, … on collision. `excludeId` lets an update keep its own.
 */
export async function uniqueSlug(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  base: string,
  excludeId?: Id<"docs">
): Promise<string> {
  for (let suffix = 1; suffix < 200; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const clash = await ctx.db
      .query("docs")
      .withIndex("by_project_and_slug", (q) =>
        q.eq("projectId", projectId).eq("slug", candidate)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();
    if (!clash || clash._id === excludeId) return candidate;
  }
  throw new ConvexError("Could not allocate a unique slug for this title");
}
