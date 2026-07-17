import { MutationCtx, QueryCtx } from "../../../_generated/server";
import { Id } from "../../../_generated/dataModel";
import { assertProjectAction } from "../../../lib/authz";

// Same project/org-role resolution as the variable-request flow.
export { getProjectAndOrgRole } from "../../variables/requests/helpers";

/**
 * Non-throwing check: can this user review (approve/reject) account requests?
 * Reviewers are owners, or PMs/team leads assigned to the project — the
 * dedicated "project:review_requests" action (same as the variable flow):
 * review is a people-power, so editors (who hold project:update_account for
 * direct edits) must never pass this check.
 */
export async function canReviewAccountRequests(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<boolean> {
  try {
    await assertProjectAction(
      ctx,
      userId,
      projectId,
      "project:review_requests"
    );
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
