import { MutationCtx, QueryCtx } from "../../../_generated/server";
import { Id } from "../../../_generated/dataModel";
import { assertProjectAction } from "../../../lib/authz";

// Same project/org-role resolution as the variable-request flow.
export { getProjectAndOrgRole } from "../../variables/requests/helpers";

/**
 * Non-throwing check: can this user review (approve/reject) account requests?
 * Reviewers are owners, or PMs/team leads assigned to the project — the same
 * set that holds "project:update_account" (mirror of the variable flow's
 * canReviewRequests, which keys off "project:update_variable").
 */
export async function canReviewAccountRequests(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<boolean> {
  try {
    await assertProjectAction(ctx, userId, projectId, "project:update_account");
    return true;
  } catch (err) {
    console.error("accountRequests.canReviewAccountRequests.denied", {
      projectId,
      userId,
      error: String(err),
    });
    return false;
  }
}
