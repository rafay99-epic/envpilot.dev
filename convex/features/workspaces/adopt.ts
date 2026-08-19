import { v, ConvexError } from "convex/values";
import {
  action,
  internalQuery,
  internalMutation,
  type ActionCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { isWorkspace } from "../../lib/projectKind";

/**
 * Adoption: pulling variables a workspace's projects ALREADY duplicate up into
 * the workspace, so they become one shared row.
 *
 * This is what makes the feature usable on a real account rather than only a
 * fresh one. Someone whose projects each carry their own copy of the same
 * eight credentials cannot simply add those keys to a workspace — strict
 * inheritance refuses the write, because the member projects already own
 * them. Adoption resolves it: keep ONE row, re-parent it to the workspace,
 * soft-delete the duplicates.
 *
 * Nothing is re-encrypted and no .env anywhere changes. The surviving row
 * keeps its vaultRef, its version history and its rotation settings, so every
 * project's next pull returns exactly what it returned before. The duplicates
 * are soft-deleted, so a wrong call is recoverable from each project's trash.
 *
 * Only IDENTICAL duplicates are adopted. Same key with different values, or a
 * different environment set, is reported and skipped — merging those would
 * silently change what a project deploys.
 */

const MAX_SCAN_ROWS = 2000;

type CandidateRow = {
  variableId: Id<"environmentVariables">;
  projectId: Id<"projects">;
  projectName: string;
  vaultRef: string;
  environments: string[];
  createdAt: number;
};

type Verdict = { adoptable: true } | { adoptable: false; reason: string };

type Candidates = {
  memberCount: number;
  duplicates: { key: string; rows: CandidateRow[] }[];
  truncated: boolean;
};

type ScanResult = {
  memberCount: number;
  truncated: boolean;
  groups: {
    key: string;
    environments: string[];
    projectNames: string[];
    adoptable: boolean;
    reason?: string;
  }[];
};

type AdoptResult = {
  adopted: string[];
  skipped: { key: string; reason: string }[];
};

/**
 * Every duplicated key across the workspace's member projects, with the
 * caller's authorization already enforced.
 *
 * Adoption deletes rows in the member projects and creates one in the
 * workspace, so it demands exactly those rights: delete on each project it
 * touches, create on the workspace.
 */
export const _collectCandidates = internalQuery({
  args: { workspaceId: v.id("projects") },
  handler: async (ctx, args): Promise<Candidates> => {
    const actor = await requireAuthedUser(ctx);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace || workspace.deletedAt || !isWorkspace(workspace)) {
      throw new ConvexError("Workspace not found");
    }

    await assertProjectAction(
      ctx,
      actor._id,
      args.workspaceId,
      "project:create_variable"
    );

    const memberships = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const byKey = new Map<string, CandidateRow[]>();
    let scanned = 0;

    for (const membership of memberships) {
      const project = await ctx.db.get(membership.projectId);
      if (!project || project.deletedAt) continue;

      await assertProjectAction(
        ctx,
        actor._id,
        membership.projectId,
        "project:delete_variable"
      );

      const rows = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", membership.projectId).eq("deletedAt", undefined)
        )
        .take(Math.max(0, MAX_SCAN_ROWS - scanned));
      scanned += rows.length;

      for (const row of rows) {
        const group = byKey.get(row.key) ?? [];
        group.push({
          variableId: row._id,
          projectId: row.projectId,
          projectName: project.name,
          vaultRef: row.vaultRef,
          environments: row.environments,
          createdAt: row.createdAt,
        });
        byKey.set(row.key, group);
      }

      if (scanned >= MAX_SCAN_ROWS) break;
    }

    // A key held by only one member project is not a duplicate. Adopting it
    // would move that project's private variable into a shared space, which
    // is a different decision than de-duplicating.
    const duplicates = [...byKey.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, rows }));

    return {
      memberCount: memberships.length,
      duplicates,
      truncated: scanned >= MAX_SCAN_ROWS,
    };
  },
});

/**
 * Report which duplicated keys can be adopted. Values are compared here, in
 * the action, and NEVER returned to the caller — only a verdict.
 */
export const scanDuplicates = action({
  args: { workspaceId: v.id("projects") },
  returns: v.object({
    memberCount: v.number(),
    truncated: v.boolean(),
    groups: v.array(
      v.object({
        key: v.string(),
        environments: v.array(v.string()),
        projectNames: v.array(v.string()),
        adoptable: v.boolean(),
        reason: v.optional(v.string()),
      })
    ),
  }),
  handler: async (ctx, args): Promise<ScanResult> => {
    const collected: Candidates = await ctx.runQuery(
      internal.features.workspaces.adopt._collectCandidates,
      { workspaceId: args.workspaceId }
    );

    const groups = await Promise.all(
      collected.duplicates.map(async (duplicate) => {
        const verdict = await evaluateGroup(ctx, duplicate.rows);
        return {
          key: duplicate.key,
          environments: duplicate.rows[0].environments,
          projectNames: duplicate.rows.map((row) => row.projectName),
          adoptable: verdict.adoptable,
          reason: verdict.adoptable ? undefined : verdict.reason,
        };
      })
    );

    return {
      memberCount: collected.memberCount,
      truncated: collected.truncated,
      groups,
    };
  },
});

/**
 * Adopt the named keys. The comparison is re-run server side rather than
 * trusting the earlier scan — the browser chooses WHICH keys to adopt, it
 * never gets to assert that they match.
 */
export const adoptKeys = action({
  args: {
    workspaceId: v.id("projects"),
    keys: v.array(v.string()),
  },
  returns: v.object({
    adopted: v.array(v.string()),
    skipped: v.array(v.object({ key: v.string(), reason: v.string() })),
  }),
  handler: async (ctx, args): Promise<AdoptResult> => {
    const collected: Candidates = await ctx.runQuery(
      internal.features.workspaces.adopt._collectCandidates,
      { workspaceId: args.workspaceId }
    );

    const wanted = new Set(args.keys);
    const adopted: string[] = [];
    const skipped: { key: string; reason: string }[] = [];

    for (const duplicate of collected.duplicates) {
      if (!wanted.has(duplicate.key)) continue;

      const verdict = await evaluateGroup(ctx, duplicate.rows);
      if (!verdict.adoptable) {
        skipped.push({ key: duplicate.key, reason: verdict.reason });
        continue;
      }

      // Oldest row survives: it carries the longest version history, so
      // keeping it loses the least.
      const ordered = [...duplicate.rows].sort(
        (a, b) => a.createdAt - b.createdAt
      );

      await ctx.runMutation(internal.features.workspaces.adopt._applyAdoption, {
        workspaceId: args.workspaceId,
        survivorId: ordered[0].variableId,
        duplicateIds: ordered.slice(1).map((row) => row.variableId),
        key: duplicate.key,
      });
      adopted.push(duplicate.key);
    }

    return { adopted, skipped };
  },
});

export const _applyAdoption = internalMutation({
  args: {
    workspaceId: v.id("projects"),
    survivorId: v.id("environmentVariables"),
    duplicateIds: v.array(v.id("environmentVariables")),
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace || !isWorkspace(workspace)) {
      throw new ConvexError("Workspace not found");
    }

    const survivor = await ctx.db.get(args.survivorId);
    if (!survivor || survivor.deletedAt) {
      throw new ConvexError(`"${args.key}" is no longer available to adopt.`);
    }

    const now = Date.now();

    // Duplicates go FIRST. Re-parenting before deleting them would leave the
    // workspace row and the project rows both live for an instant, which is
    // exactly the duplicate pair the resolver refuses to serve.
    for (const duplicateId of args.duplicateIds) {
      const duplicate = await ctx.db.get(duplicateId);
      if (!duplicate || duplicate.deletedAt) continue;
      await ctx.db.patch(duplicateId, { deletedAt: now, updatedAt: now });
    }

    await ctx.db.patch(args.survivorId, {
      projectId: args.workspaceId,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: workspace.organizationId,
      projectId: args.workspaceId,
      userId: survivor.lastModifiedBy,
      action: "workspace.variable_adopted",
      details: JSON.stringify({
        key: args.key,
        workspace: workspace.name,
        duplicatesRemoved: args.duplicateIds.length,
      }),
      createdAt: now,
    });

    return null;
  },
});

/**
 * Is every row in this group the same variable wearing a different project id?
 * Same value and same environment set, or it is not a duplicate.
 */
async function evaluateGroup(
  ctx: ActionCtx,
  rows: CandidateRow[]
): Promise<Verdict> {
  const first = rows[0];

  const sameEnvironments = rows.every(
    (row) =>
      row.environments.length === first.environments.length &&
      row.environments.every((environment) =>
        first.environments.includes(environment)
      )
  );
  if (!sameEnvironments) {
    return {
      adoptable: false,
      reason: "Different environments in each project",
    };
  }

  const values = await Promise.all(
    rows.map((row) =>
      ctx
        .runAction(internal.features.vault.vault.readSecret, {
          vaultRef: row.vaultRef,
        })
        .catch(() => null)
    )
  );

  if (values.some((value) => value === null)) {
    return { adoptable: false, reason: "A value could not be read" };
  }
  if (values.some((value) => value !== values[0])) {
    return { adoptable: false, reason: "Values differ between projects" };
  }

  return { adoptable: true };
}
