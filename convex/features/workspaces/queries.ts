import { v } from "convex/values";
import { query } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
  getVariableAccess,
  assertProjectCapability,
  isEnvironmentScopeAllowed,
} from "../../lib/authz";
import {
  activeProjectsQuery,
  activeWorkspacesQuery,
  isWorkspace,
  reachedProjects,
} from "../../lib/projectKind";
import { protectedEnvironmentsIn } from "../../lib/protection";
import { resolveEffectiveVariables } from "../variables/resolve";
import { resolveProjectAccessContext } from "../variables/helpers";

/**
 * A workspace is visible to anyone who can read a project that reads it.
 * There is no member list on the workspace itself.
 */
async function visibleWorkspaces(
  ctx: Parameters<typeof getActiveMembership>[0],
  organizationId: Id<"organizations">,
  userId: Id<"users">
): Promise<Doc<"projects">[]> {
  const membership = await getActiveMembership(ctx, organizationId, userId);
  if (!membership) return [];
  const profile = await getRoleProfile(ctx, membership.role);
  const all = await activeWorkspacesQuery(ctx.db, organizationId).collect();
  if (bypassesAssignment(profile)) return all;
  const assignments = await ctx.db
    .query("projectMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const assigned = new Set(assignments.map((row) => row.projectId));
  const visible: Doc<"projects">[] = [];
  for (const workspace of all) {
    const members = await reachedProjects(ctx.db, workspace._id);
    if (members.some((member) => assigned.has(member._id))) {
      visible.push(workspace);
    }
  }
  return visible;
}

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const workspaces = await visibleWorkspaces(
      ctx,
      args.organizationId,
      actor._id
    );
    return Promise.all(
      workspaces.map(async (workspace) => {
        const [variables, members] = await Promise.all([
          ctx.db
            .query("environmentVariables")
            .withIndex("by_project_deleted", (q) =>
              q.eq("projectId", workspace._id).eq("deletedAt", undefined)
            )
            .collect(),
          reachedProjects(ctx.db, workspace._id),
        ]);
        return {
          _id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          keys: variables.map((variable) => variable.key),
          projects: members.map((member) => ({
            _id: member._id,
            name: member.name,
            slug: member.slug,
          })),
          updatedAt: workspace.updatedAt,
        };
      })
    );
  },
});

/** One workspace with its shared rows and the projects that read them. */
export const getBySlug = query({
  args: { organizationId: v.id("organizations"), slug: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const workspace = await ctx.db
      .query("projects")
      .withIndex("by_org_slug_deleted", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("slug", args.slug)
          .eq("deletedAt", undefined)
      )
      .first();
    if (!workspace || !isWorkspace(workspace)) return null;
    const visible = await visibleWorkspaces(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!visible.some((row) => row._id === workspace._id)) return null;

    const [members, variables] = await Promise.all([
      reachedProjects(ctx.db, workspace._id),
      ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", workspace._id).eq("deletedAt", undefined)
        )
        .collect(),
    ]);
    return {
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
      },
      projects: members.map((member) => ({
        _id: member._id,
        name: member.name,
        slug: member.slug,
        inheritedCount: variables.filter(
          (row) => !row.appliesTo || row.appliesTo.includes(member._id)
        ).length,
      })),
      variables: variables.map((variable) => ({
        _id: variable._id,
        key: variable.key,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        appliesTo: variable.appliesTo,
      })),
    };
  },
});

/**
 * The rows a project reads from workspaces, for the pinned block on its
 * variables page. Each row carries what the UI needs to edit in place:
 * whether this caller may, how many projects it reaches, and which of them
 * would turn the write into a change request.
 */
export const listInheritedForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) return [];
    const { access } = resolved;
    const rows = await resolveEffectiveVariables(ctx, {
      projectId: args.projectId,
    });

    const membersByWorkspace = new Map<Id<"projects">, Doc<"projects">[]>();
    const out = [];
    for (const row of rows) {
      if (row.source.kind !== "workspace") continue;
      if (
        !isEnvironmentScopeAllowed(access.environmentScope, row.environments)
      ) {
        continue;
      }
      const workspaceId = row.source.workspaceId;
      let members = membersByWorkspace.get(workspaceId);
      if (!members) {
        members = await reachedProjects(ctx.db, workspaceId);
        membersByWorkspace.set(workspaceId, members);
      }
      const reached = members.filter(
        (member) => !row.appliesTo || row.appliesTo.includes(member._id)
      );
      const level = await getVariableAccess(ctx, actor._id, row);
      if (level === null) continue;
      const workspace = await ctx.db.get(workspaceId);
      const canDelete =
        level === "write" &&
        (await assertProjectCapability(
          ctx,
          actor._id,
          workspaceId,
          "project.variables.delete",
          workspace
        )
          .then(() => true)
          .catch(() => false));
      const protectedEnvironments = [
        ...new Set(
          reached.flatMap((member) =>
            protectedEnvironmentsIn(member, row.environments)
          )
        ),
      ];
      out.push({
        _id: row._id,
        key: row.key,
        description: row.description,
        environments: row.environments,
        isSensitive: row.isSensitive,
        version: row.version,
        updatedAt: row.updatedAt,
        vaultRef: row.vaultRef,
        rotationFrequencyDays: row.rotationFrequencyDays,
        tagIds: row.tagIds,
        appliesTo: row.appliesTo,
        canEdit: level === "write",
        canDelete,
        protectedEnvironments,
        workspace: {
          _id: workspaceId,
          name: row.source.name,
          slug: workspace?.slug ?? "",
        },
        reached: reached.map((member) => member.name),
        reachedIds: reached.map((member) => member._id),
        protectedIn: reached
          .filter(
            (member) =>
              protectedEnvironmentsIn(member, row.environments).length > 0
          )
          .map((member) => member.name),
      });
    }
    return out;
  },
});

/** key -> ids of active projects that hold an active row with that key. */
async function keyOwners(
  ctx: Parameters<typeof getActiveMembership>[0],
  organizationId: Id<"organizations">
): Promise<Map<string, Set<Id<"projects">>>> {
  const owners = new Map<string, Set<Id<"projects">>>();
  // Every active row per project: the tier cap bounds each read, and a
  // partial scan would hide duplicates without saying so.
  for (const project of await activeProjectsQuery(
    ctx.db,
    organizationId
  ).collect()) {
    const rows = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", project._id).eq("deletedAt", undefined)
      )
      .collect();
    for (const row of rows) {
      const set = owners.get(row.key) ?? new Set();
      set.add(project._id);
      owners.set(row.key, set);
    }
  }
  return owners;
}

/**
 * Keys this project owns that other projects in the org also own. Feeds the
 * "same key in N projects" tag; the share sheet re-checks values server side.
 */
export const duplicateKeys = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved || !(resolved.access.isOwner || resolved.access.assigned)) {
      return [];
    }
    const owners = await keyOwners(ctx, resolved.project.organizationId);
    const out: { key: string; others: number }[] = [];
    for (const [key, projects] of owners) {
      if (projects.has(args.projectId) && projects.size > 1) {
        out.push({ key, others: projects.size - 1 });
      }
    }
    return out;
  },
});

/** Org-wide duplicate summary for the dashboard banner and settings page. */
export const duplicateKeysForOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return [];
    const profile = await getRoleProfile(ctx, membership.role);
    if (!bypassesAssignment(profile)) return [];
    const owners = await keyOwners(ctx, args.organizationId);
    const out: { key: string; projectIds: Id<"projects">[] }[] = [];
    for (const [key, projects] of owners) {
      if (projects.size > 1) out.push({ key, projectIds: [...projects] });
    }
    return out;
  },
});
