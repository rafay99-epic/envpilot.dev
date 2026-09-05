import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

/**
 * Break-glass authorization for the value actions, run BEFORE any vault
 * write. lib/protection.ts re-checks it inside the mutation, but by then an
 * unauthorized override has already minted or rewritten the live secret and
 * only a best-effort rollback stands between that and a silent change.
 */
export async function assertCanOverrideProtection(
  ctx: ActionCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<void> {
  const allowed: boolean = await ctx.runQuery(
    internal.features.changeRequests.queries.canOverrideProtection,
    { userId, projectId }
  );
  if (!allowed) {
    throw new ConvexError(
      "Overriding protection needs the break-glass capability. Ask an owner."
    );
  }
}
