/**
 * Authorization helpers. Docs sit at project granularity — members already
 * hold the project's secrets, so a per-doc ACL would be theatre.
 *
 * Two rules the feature rests on: drafts are private to their author (plus
 * publishers), and publishing only ever happens in a dashboard mutation.
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
import {
  checkBooleanFeature,
  checkCountedLimit,
  countOrgDocs,
  countProjectDocs,
} from "../featureRegistry/gates";

/** Ceiling on a single project's doc listing — structural, not a tier limit. */
export const MAX_DOC_ROWS = 500;

export type DocAccess = {
  project: Doc<"projects">;
  /** May author a page. `project.docs.create`. */
  canCreate: boolean;
  /** May edit a page written by someone else. `project.docs.update`. */
  canEditAny: boolean;
  /** May publish or unpublish. `project.docs.publish`. */
  canPublish: boolean;
  /** May trash or restore a page. `project.docs.delete`. */
  canDelete: boolean;
  /** May hand a published page to a teammate. `project.docs.share`. */
  canShare: boolean;
  /** May mint a public preview link. `project.docs.share.external`. */
  canShareExternal: boolean;
};

/**
 * Resolve a caller's access to a project's docs, or throw.
 *
 * Visibility mirrors `projects.canViewProject`: active org membership, and
 * roles without the assignment bypass need an explicit projectMembers row.
 *
 * Every power beyond reading comes from the role registry — the same
 * capability catalog every other resource uses, editable from the admin
 * panel. Docs previously granted write to every member unconditionally and
 * borrowed `project.permissions.manage` for publishing, which meant the
 * feature sat outside the role system it was supposed to obey.
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
    canCreate: hasCapability(profile, "project.docs.create"),
    canEditAny: hasCapability(profile, "project.docs.update"),
    canPublish: hasCapability(profile, "project.docs.publish"),
    canDelete: hasCapability(profile, "project.docs.delete"),
    canShare: hasCapability(profile, "project.docs.share"),
    canShareExternal: hasCapability(profile, "project.docs.share.external"),
  };
}

/** Tier gate. Cannot ride `_authorizeRequest` (its gate arg is a closed
 *  two-literal union), so callers check here — the cicd/pull.ts shape. */
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

/** Whether `userId` may see this specific doc row. Drafts are private to
 *  their author plus whoever can publish or edit anyone's page. */
export function canSeeDoc(
  doc: Doc<"docs">,
  userId: Id<"users">,
  access: DocAccess
): boolean {
  if (doc.deletedAt !== undefined) return false;
  if (doc.status === "published") return true;
  return doc.authorId === userId || access.canPublish || access.canEditAny;
}

/**
 * Whether `userId` may edit this doc's CONTENT. Authoring a page always
 * carries the right to revise it; editing someone else's needs the
 * capability. Publishing and deleting are separate capabilities — see
 * `canPublishDoc` / `canDeleteDoc`.
 */
export function canEditDoc(
  doc: Doc<"docs">,
  userId: Id<"users">,
  access: DocAccess
): boolean {
  if (doc.authorId === userId) return access.canCreate;
  return access.canEditAny;
}

/** Publishing is its own capability — writing a page is not permission to
 *  make it readable by the whole team and by every docs-scoped agent. */
export function canPublishDoc(access: DocAccess): boolean {
  return access.canPublish;
}

/**
 * Trashing and restoring. Your own DRAFT follows your create right — an
 * unpublished page nobody else can see is still yours to throw away, and
 * without that branch the trash would list drafts their author could never
 * restore. The moment a page is published it belongs to the team, so
 * removing it needs the delete capability no matter who wrote it.
 */
export function canDeleteDoc(
  doc: Doc<"docs">,
  userId: Id<"users">,
  access: DocAccess
): boolean {
  if (doc.status === "draft" && doc.authorId === userId) {
    return access.canCreate;
  }
  return access.canDelete;
}

/** Unique slug within a project, ignoring soft-deleted rows. */
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

/**
 * Both count limits, checked before a page is created or restored.
 *
 * Two ceilings because they bound different things: per-project keeps one
 * project from becoming a wiki, per-org keeps the free tier's total honest
 * across its projects. `null` on either means unlimited.
 */
export async function requireDocCapacity(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
  projectId: Id<"projects">
): Promise<void> {
  const perProject = await checkCountedLimit(
    ctx.db,
    project.organizationId,
    "max_docs_per_project",
    (limit) => countProjectDocs(ctx.db, projectId, limit)
  );
  if (!perProject.allowed) {
    throw new ConvexError(
      `This project has reached its documentation limit (${perProject.current}/${perProject.limit}). Delete a page or upgrade for unlimited pages.`
    );
  }

  const perOrg = await checkCountedLimit(
    ctx.db,
    project.organizationId,
    "max_docs_per_org",
    (limit) => countOrgDocs(ctx.db, project.organizationId, limit)
  );
  if (!perOrg.allowed) {
    throw new ConvexError(
      `Your organization has reached its documentation limit (${perOrg.current}/${perOrg.limit}). Delete a page or upgrade for unlimited pages.`
    );
  }
}
