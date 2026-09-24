import { query } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthedUser } from "../../lib/identity";
import { resolveProjectAccessContext } from "../variables/helpers";
import {
  MAX_WORKSPACES_PER_PROJECT,
  resolveEffectiveVariables,
} from "../variables/resolve";

export const projectVersion = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      user._id
    );
    if (!resolved) return null;
    const { access } = resolved;
    if (
      !access.isOwner &&
      !access.assigned &&
      access.grantByVariable.size === 0
    ) {
      return null;
    }

    let latest = resolved.project.updatedAt;
    for (const row of await resolveEffectiveVariables(ctx, {
      projectId: args.projectId,
    })) {
      latest = Math.max(latest, row.updatedAt);
    }

    const workspaces = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(MAX_WORKSPACES_PER_PROJECT);
    for (const projectId of [
      args.projectId,
      ...workspaces.map((w) => w.workspaceId),
    ]) {
      const lastDeleted = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", projectId).gt("deletedAt", 0)
        )
        .order("desc")
        .first();
      latest = Math.max(latest, lastDeleted?.updatedAt ?? 0);
    }

    for (const row of await ctx.db
      .query("projectFiles")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .collect()) {
      latest = Math.max(latest, row.updatedAt);
    }
    const lastDeletedFile = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gt("deletedAt", 0)
      )
      .order("desc")
      .first();
    return Math.max(latest, lastDeletedFile?.updatedAt ?? 0);
  },
});
