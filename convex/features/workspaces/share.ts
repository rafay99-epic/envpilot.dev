import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import {
  activeProjectsQuery,
  activeWorkspacesQuery,
  isWorkspace,
  reachedProjects,
  WORKSPACE_KIND,
} from "../../lib/projectKind";
import { createProjectCore } from "../projects/mutations";
import { linkProjectCore } from "./mutations";
import { syncWorkspaceProtection } from "../../lib/protection";

/**
 * Sharing from a project row: one action creates or picks the group, links
 * the projects, and moves the identical copies up so the source row becomes
 * the one every picked project reads. Values are compared here and never
 * returned to the browser.
 */

type Candidate = {
  _id: Id<"projects">;
  name: string;
  row: {
    variableId: Id<"environmentVariables">;
    vaultRef: string;
    environments: string[];
    hash: string | null;
  } | null;
};

const candidatesValidator = v.object({
  source: v.object({
    key: v.string(),
    vaultRef: v.string(),
    environments: v.array(v.string()),
    hash: v.union(v.string(), v.null()),
    organizationId: v.id("organizations"),
  }),
  projects: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      row: v.union(
        v.object({
          variableId: v.id("environmentVariables"),
          vaultRef: v.string(),
          environments: v.array(v.string()),
          hash: v.union(v.string(), v.null()),
        }),
        v.null()
      ),
    })
  ),
  groups: v.array(
    v.object({
      _id: v.id("projects"),
      name: v.string(),
      memberIds: v.array(v.id("projects")),
    })
  ),
});

export const _candidates = internalQuery({
  args: {
    projectId: v.id("projects"),
    variableId: v.id("environmentVariables"),
  },
  returns: candidatesValidator,
  handler: async (ctx, args): Promise<Candidates> => {
    const actor = await requireAuthedUser(ctx);
    const source = await ctx.db.get(args.variableId);
    if (!source || source.deletedAt || source.projectId !== args.projectId) {
      throw new ConvexError("Variable not found");
    }
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt || isWorkspace(project)) {
      throw new ConvexError("Project not found");
    }
    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:manage_workspaces"
    );

    const projects: Candidate[] = [];
    for (const other of await activeProjectsQuery(
      ctx.db,
      project.organizationId
    ).collect()) {
      if (other._id === args.projectId) continue;
      // Only projects the caller could link on their own are offered.
      try {
        await assertProjectAction(
          ctx,
          actor._id,
          other._id,
          "project:manage_workspaces",
          other
        );
      } catch {
        continue;
      }
      const row = (
        await ctx.db
          .query("environmentVariables")
          .withIndex("by_project_and_key", (q) =>
            q.eq("projectId", other._id).eq("key", source.key)
          )
          .collect()
      ).find((candidate) => candidate.deletedAt === undefined);
      projects.push({
        _id: other._id,
        name: other.name,
        row: row
          ? {
              variableId: row._id,
              vaultRef: row.vaultRef,
              environments: row.environments,
              hash: await valueHash(ctx, row.vaultRef),
            }
          : null,
      });
    }

    const groups: Group[] = [];
    for (const workspace of await activeWorkspacesQuery(
      ctx.db,
      project.organizationId
    ).collect()) {
      // Read on the group means read on one of its projects.
      try {
        await assertProjectAction(
          ctx,
          actor._id,
          workspace._id,
          "project:read"
        );
      } catch {
        continue;
      }
      const members = await reachedProjects(ctx.db, workspace._id);
      groups.push({
        _id: workspace._id,
        name: workspace.name,
        memberIds: members.map((member) => member._id),
      });
    }

    return {
      source: {
        key: source.key,
        vaultRef: source.vaultRef,
        environments: source.environments,
        hash: await valueHash(ctx, source.vaultRef),
        organizationId: project.organizationId,
      },
      projects,
      groups,
    };
  },
});

const verdictValidator = v.union(
  v.literal("absent"),
  v.literal("same"),
  v.literal("different")
);
type Verdict = "absent" | "same" | "different";
type Group = { _id: Id<"projects">; name: string; memberIds: Id<"projects">[] };
type Candidates = {
  source: {
    key: string;
    vaultRef: string;
    environments: string[];
    hash: string | null;
    organizationId: Id<"organizations">;
  };
  projects: Candidate[];
  groups: Group[];
};

async function valueHash(
  ctx: Pick<QueryCtx, "db">,
  vaultRef: string
): Promise<string | null> {
  const row = await ctx.db
    .query("vaultValueHashes")
    .withIndex("by_vault_ref", (q) => q.eq("vaultRef", vaultRef))
    .first();
  return row?.hash ?? null;
}

/** Same environments and same value. Hashes decide; the vault is read only
 * for rows written before hashes existed. */
async function verdicts(
  ctx: Pick<ActionCtx, "runAction">,
  source: { vaultRef: string; environments: string[]; hash: string | null },
  projects: Candidate[]
): Promise<Map<Id<"projects">, Verdict>> {
  const out = new Map<Id<"projects">, Verdict>();
  let sourceValue: string | null | undefined;
  const readSource = async () =>
    (sourceValue ??= await ctx.runAction(
      internal.features.vault.vault.readSecret,
      { vaultRef: source.vaultRef }
    ));
  for (const project of projects) {
    if (!project.row) {
      out.set(project._id, "absent");
      continue;
    }
    const sameEnvironments =
      project.row.environments.length === source.environments.length &&
      project.row.environments.every((env) =>
        source.environments.includes(env)
      );
    if (!sameEnvironments) {
      out.set(project._id, "different");
      continue;
    }
    if (source.hash !== null && project.row.hash !== null) {
      out.set(
        project._id,
        source.hash === project.row.hash ? "same" : "different"
      );
      continue;
    }
    const value = await ctx
      .runAction(internal.features.vault.vault.readSecret, {
        vaultRef: project.row.vaultRef,
      })
      .catch(() => null);
    out.set(
      project._id,
      value !== null && value === (await readSource()) ? "same" : "different"
    );
  }
  return out;
}

export const preview = action({
  args: {
    projectId: v.id("projects"),
    variableId: v.id("environmentVariables"),
  },
  returns: v.object({
    key: v.string(),
    projects: v.array(
      v.object({
        _id: v.id("projects"),
        name: v.string(),
        verdict: verdictValidator,
      })
    ),
    groups: candidatesValidator.fields.groups,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    key: string;
    projects: { _id: Id<"projects">; name: string; verdict: Verdict }[];
    groups: Group[];
  }> => {
    const found: Candidates = await ctx.runQuery(
      internal.features.workspaces.share._candidates,
      args
    );
    const byProject = await verdicts(ctx, found.source, found.projects);
    return {
      key: found.source.key,
      projects: found.projects.map((project) => ({
        _id: project._id,
        name: project.name,
        verdict: byProject.get(project._id) ?? "absent",
      })),
      groups: found.groups,
    };
  },
});

export const share = action({
  args: {
    projectId: v.id("projects"),
    variableId: v.id("environmentVariables"),
    projectIds: v.array(v.id("projects")),
    group: v.union(
      v.object({ workspaceId: v.id("projects") }),
      v.object({ name: v.string() })
    ),
  },
  returns: v.union(
    v.object({ workspaceId: v.id("projects") }),
    v.object({
      workspaceId: v.id("projects"),
      requested: v.literal(true),
      requestId: v.id("changeRequests"),
    })
  ),
  handler: async (ctx, args): Promise<ShareResult> => {
    const found: Candidates = await ctx.runQuery(
      internal.features.workspaces.share._candidates,
      { projectId: args.projectId, variableId: args.variableId }
    );
    const picked = found.projects.filter((project) =>
      args.projectIds.includes(project._id)
    );
    if (picked.length !== args.projectIds.length) {
      throw new ConvexError("Pick projects you can manage.");
    }
    const byProject = await verdicts(ctx, found.source, picked);
    const different = picked.find(
      (project) => byProject.get(project._id) === "different"
    );
    if (different) {
      throw new ConvexError(
        `"${different.name}" has a different value for ${found.source.key}. Resolve that first or leave it out.`
      );
    }

    const linked: Linked = await ctx.runMutation(
      internal.features.workspaces.share._link,
      {
        organizationId: found.source.organizationId,
        sourceProjectId: args.projectId,
        projectIds: args.projectIds,
        group: args.group,
      }
    );
    // A group that already reaches projects the caller did not pick keeps
    // the new row scoped to the picked ones.
    const existing = found.groups.find((g) => g._id === linked.workspaceId);
    const selected = [args.projectId, ...args.projectIds];
    const outsiders = (existing?.memberIds ?? []).some(
      (id) => !selected.includes(id)
    );
    const duplicateIds = picked.flatMap((project) =>
      project.row ? [project.row.variableId] : []
    );
    try {
      return await adoptOrRequest(ctx, {
        workspaceId: linked.workspaceId,
        survivorId: args.variableId,
        duplicateIds,
        key: found.source.key,
        environments: found.source.environments,
        appliesTo: outsiders ? selected : undefined,
      });
    } catch (error) {
      await ctx.runMutation(internal.features.workspaces.share._unlink, linked);
      throw error;
    }
  },
});

export type ShareResult =
  | { workspaceId: Id<"projects"> }
  | {
      workspaceId: Id<"projects">;
      requested: true;
      requestId: Id<"changeRequests">;
    };

/**
 * Adopt now, or file a `share` change request when the group (already
 * linked, so its protection is the members' union) protects one of the
 * row's environments. Same rule as any other production write.
 */
export async function adoptOrRequest(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    workspaceId: Id<"projects">;
    survivorId: Id<"environmentVariables">;
    duplicateIds: Id<"environmentVariables">[];
    key: string;
    environments: string[];
    appliesTo: Id<"projects">[] | undefined;
  }
): Promise<ShareResult> {
  const protectedEnvs: string[] = await ctx.runQuery(
    internal.features.changeRequests.queries.protectedEnvironmentsForWrite,
    { projectId: args.workspaceId, environments: args.environments }
  );
  if (protectedEnvs.length > 0) {
    const requestId: Id<"changeRequests"> = await ctx.runMutation(
      internal.features.changeRequests.mutations.createStaged,
      {
        projectId: args.workspaceId,
        resourceType: "variable",
        kind: "share",
        targetId: args.survivorId,
        environments: args.environments,
        payload: JSON.stringify({
          key: args.key,
          environments: args.environments,
          duplicateIds: args.duplicateIds,
          appliesTo: args.appliesTo,
        }),
        label: args.key,
        source: "web",
      }
    );
    return { workspaceId: args.workspaceId, requested: true, requestId };
  }
  await ctx.runMutation(internal.features.workspaces.adopt._applyAdoption, {
    workspaceId: args.workspaceId,
    survivorId: args.survivorId,
    duplicateIds: args.duplicateIds,
    key: args.key,
    appliesTo: args.appliesTo,
  });
  return { workspaceId: args.workspaceId };
}

type Linked = {
  workspaceId: Id<"projects">;
  created: boolean;
  linked: Id<"projects">[];
};

export const _link = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceProjectId: v.id("projects"),
    projectIds: v.array(v.id("projects")),
    group: v.union(
      v.object({ workspaceId: v.id("projects") }),
      v.object({ name: v.string() })
    ),
  },
  returns: v.object({
    workspaceId: v.id("projects"),
    created: v.boolean(),
    linked: v.array(v.id("projects")),
  }),
  handler: async (ctx, args): Promise<Linked> => {
    const actor = await requireAuthedUser(ctx);
    const created = "name" in args.group;
    const workspaceId =
      "workspaceId" in args.group
        ? args.group.workspaceId
        : await createProjectCore(ctx, actor, {
            name: args.group.name,
            slug: `${slugify(args.group.name)}-${Date.now().toString(36)}`,
            organizationId: args.organizationId,
            kind: WORKSPACE_KIND,
          });
    const members = new Set(
      (await reachedProjects(ctx.db, workspaceId)).map((m) => m._id)
    );
    const linked: Id<"projects">[] = [];
    for (const projectId of [args.sourceProjectId, ...args.projectIds]) {
      if (members.has(projectId)) continue;
      await linkProjectCore(ctx, actor, { workspaceId, projectId });
      linked.push(projectId);
    }
    return { workspaceId, created, linked };
  },
});

export const _unlink = internalMutation({
  args: {
    workspaceId: v.id("projects"),
    created: v.boolean(),
    linked: v.array(v.id("projects")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await requireAuthedUser(ctx);
    for (const projectId of args.linked) {
      const membership = await ctx.db
        .query("workspaceProjects")
        .withIndex("by_workspace_and_project", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("projectId", projectId)
        )
        .first();
      if (membership) await ctx.db.delete(membership._id);
    }
    // A group minted seconds ago with nothing in it has nothing to cascade.
    if (args.created) await ctx.db.delete(args.workspaceId);
    else await syncWorkspaceProtection(ctx, args.workspaceId, actor._id);
    return null;
  },
});

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "shared"
  );
}

/**
 * Stop one project reading a group. With `keepCopies` the current values are
 * written into the project first so its next pull is unchanged.
 */
export const unshare = action({
  args: {
    workspaceId: v.id("projects"),
    projectId: v.id("projects"),
    keepCopies: v.boolean(),
  },
  returns: v.object({
    copied: v.array(v.string()),
    pending: v.array(v.string()),
    failed: v.array(v.object({ key: v.string(), reason: v.string() })),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    copied: string[];
    pending: string[];
    failed: { key: string; reason: string }[];
  }> => {
    const rows: InheritedRow[] = await ctx.runQuery(
      internal.features.workspaces.share._inheritedRows,
      { workspaceId: args.workspaceId, projectId: args.projectId }
    );
    const values: string[] = args.keepCopies
      ? await Promise.all(
          rows.map((row) =>
            ctx.runAction(internal.features.vault.vault.readSecret, {
              vaultRef: row.vaultRef,
            })
          )
        )
      : [];

    // Unlink before copying: while the link exists the copy is refused as a
    // duplicate of the row it replaces.
    await ctx.runMutation(api.features.workspaces.mutations.removeProject, {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
    });

    const copied: string[] = [];
    const pending: string[] = [];
    const failed: { key: string; reason: string }[] = [];
    for (const [index, row] of rows.entries()) {
      if (!args.keepCopies) break;
      try {
        const result = await ctx.runAction(
          api.features.variables.values.createWithValue,
          {
            projectId: args.projectId,
            key: row.key,
            value: values[index],
            environments: row.environments,
            isSensitive: row.isSensitive,
            description: row.description,
            rotationFrequencyDays: row.rotationFrequencyDays,
            tagIds: row.tagIds,
            source: "web",
          }
        );
        // A protected environment turns the copy into a change request.
        if ("requested" in result) pending.push(row.key);
        else copied.push(row.key);
      } catch (error) {
        failed.push({
          key: row.key,
          reason: error instanceof Error ? error.message : "Copy failed",
        });
      }
    }
    await ctx.runMutation(internal.features.workspaces.share._deleteIfEmpty, {
      workspaceId: args.workspaceId,
    });
    return { copied, pending, failed };
  },
});

type InheritedRow = {
  key: string;
  vaultRef: string;
  environments: string[];
  isSensitive: boolean;
  description?: string;
  rotationFrequencyDays?: number;
  tagIds?: Id<"variableTags">[];
};

export const _inheritedRows = internalQuery({
  args: { workspaceId: v.id("projects"), projectId: v.id("projects") },
  handler: async (ctx, args): Promise<InheritedRow[]> => {
    const actor = await requireAuthedUser(ctx);
    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:manage_workspaces"
    );
    const rows = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.workspaceId).eq("deletedAt", undefined)
      )
      .collect();
    return rows
      .filter((row) => !row.appliesTo || row.appliesTo.includes(args.projectId))
      .map((row) => ({
        key: row.key,
        vaultRef: row.vaultRef,
        environments: row.environments,
        isSensitive: row.isSensitive,
        description: row.description,
        rotationFrequencyDays: row.rotationFrequencyDays,
        tagIds: row.tagIds,
      }));
  },
});

/** The last project leaving takes the group with it. */
export const _deleteIfEmpty = internalMutation({
  args: { workspaceId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await requireAuthedUser(ctx);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace || workspace.deletedAt || !isWorkspace(workspace)) {
      return null;
    }
    const remaining = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    if (remaining) return null;
    const now = Date.now();
    await ctx.db.patch(args.workspaceId, {
      deletedAt: now,
      updatedAt: now,
      deletionStage: "variables",
      deletionCursor: undefined,
      deletionLeaseUntil: undefined,
      deletionAttempts: 0,
      deletionStartedBy: actor._id,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.features.projects.deletion.processDeletion,
      { projectId: args.workspaceId }
    );
    return null;
  },
});
