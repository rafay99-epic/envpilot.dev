import { MutationCtx, QueryCtx } from "../../../_generated/server";
import { Id } from "../../../_generated/dataModel";
import { assertOrgMembership, assertProjectAction } from "../../../authz";

export async function getProjectAndOrgRole(
  ctx: MutationCtx | QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
) {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  const { membership } = await assertOrgMembership(
    ctx,
    userId,
    project.organizationId
  );

  return { project, orgRole: membership.role };
}

/**
 * Non-throwing check: can this user review (approve/reject) requests?
 * Reviewers are owners, or PMs/team leads assigned to the project.
 */
export async function canReviewRequests(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<boolean> {
  try {
    await assertProjectAction(
      ctx,
      userId,
      projectId,
      "project:update_variable"
    );
    return true;
  } catch (err) {
    console.error("variableRequests.canReviewRequests.denied", {
      projectId,
      userId,
      error: String(err),
    });
    return false;
  }
}
