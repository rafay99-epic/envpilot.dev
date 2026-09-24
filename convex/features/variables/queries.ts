import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, internalQuery, type QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { authorizeVariableAccess } from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import { resolveEffectiveVariables } from "./resolve";
import {
  getVariableAccess,
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  toLegacyProjectRole,
  getActiveMembership,
  isSuspendedMembership,
  getRoleProfile,
  bypassesAssignment,
  hasCapability,
  effectiveEnvironments,
  profileToLegacyProjectRole,
} from "../../lib/authz";
import {
  buildActiveGrantMap,
  mapVariableRow,
  resolveProjectAccessContext,
  findEnvironmentConflicts,
  validateVariableCreateFields,
} from "./helpers";

const LIST_READ_CAP = 500;

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
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
    const limit = args.limit ?? LIST_READ_CAP;

    const rows = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(limit + 1);
    if (rows.length > limit) {
      throw new ConvexError(
        `Project has more than ${limit} active variables, refusing a partial read. Contact support to raise the limit.`
      );
    }
    return args.environment
      ? rows.filter((row) => row.environments.includes(args.environment!))
      : rows;
  },
});

export const listOrgVariablesWithAccess = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return [];

    const orgRole = normalizeOrgRole(membership.role);
    const profile = await getRoleProfile(ctx, orgRole);
    const isOwner = bypassesAssignment(profile);

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const liveProjects = allProjects.filter((p) => p.deletedAt === undefined);

    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    const accessibleProjects = isOwner
      ? liveProjects
      : liveProjects.filter((p) => assignedProjectIds.has(p._id as string));

    const roleWrite =
      isOwner || hasCapability(profile, "project.variables.update");
    const roleRead = hasCapability(profile, "access.blanket_read");

    const grantByVariable = buildActiveGrantMap(
      await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect()
    );

    const perProjectLimit = args.limit ?? 500;

    const results: Array<
      Omit<Doc<"environmentVariables">, "vaultRef"> & {
        vaultRef?: string;
        projectName: string;
        projectSlug: string;
        hasAccess: boolean;
        permission: "write" | "read" | null;
      }
    > = [];

    for (const project of accessibleProjects) {
      const environmentScope = effectiveEnvironments(
        profile,
        scopeByProject.get(project._id as string)
      );

      const allVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .take(perProjectLimit);

      const variables = allVariables.filter(
        (variable) =>
          variable.deletedAt === undefined &&
          isEnvironmentScopeAllowed(environmentScope, variable.environments)
      );

      for (const variable of variables) {
        let access: "write" | "read" | null = null;
        if (roleWrite) {
          access = "write";
        } else if (roleRead) {
          access = "read";
        } else {
          const grant = grantByVariable.get(variable._id as string) ?? null;
          if (grant) {
            access =
              grant.permission === "read"
                ? "read"
                : hasCapability(profile, "access.grant_fallback")
                  ? "write"
                  : "read";
          }
        }

        const hasAccess = access !== null;
        if (!hasAccess) continue;

        const { vaultRef, ...metadata } = variable;
        results.push({
          ...metadata,
          vaultRef,
          projectName: project.name,
          projectSlug: project.slug,
          hasAccess,
          permission: access,
        });
      }
    }

    return results;
  },
});

export const listOrgVariablesWithAccessPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const empty = { page: [], isDone: true, continueCursor: "" };

    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return empty;

    const orgRole = normalizeOrgRole(membership.role);
    const profile = await getRoleProfile(ctx, orgRole);
    const isOwner = bypassesAssignment(profile);

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const liveProjects = allProjects.filter((p) => p.deletedAt === undefined);

    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    const accessibleProjects = (
      isOwner
        ? liveProjects
        : liveProjects.filter((p) => assignedProjectIds.has(p._id as string))
    )
      .slice()
      .sort((a, b) => {
        const ai = a._id as string;
        const bi = b._id as string;
        return ai < bi ? -1 : ai > bi ? 1 : 0;
      });

    const assigned = !isOwner;
    const roleAccess =
      isOwner ||
      (assigned && hasCapability(profile, "project.variables.update"));
    const roleRead = assigned && hasCapability(profile, "access.blanket_read");
    const canManagePermissions =
      isOwner ||
      (assigned && hasCapability(profile, "project.permissions.manage"));
    const projectRole = profileToLegacyProjectRole(profile, assigned);

    const grantByVariable = buildActiveGrantMap(
      await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect()
    );

    type Row = Omit<Doc<"environmentVariables">, "vaultRef"> & {
      vaultRef?: string;
      hasAccess: boolean;
      permission: "admin" | "write" | "read" | null;
      roleAccess: boolean;
      userRole: typeof orgRole;
      projectRole: typeof projectRole;
      canManagePermissions: boolean;
      projectName: string;
      projectSlug: string;
    };

    const numItems = args.paginationOpts.numItems;
    const page: Row[] = [];

    let pi = 0;
    let ic: string | null = null;
    const rawCursor = args.paginationOpts.cursor;
    if (rawCursor) {
      try {
        const parsed = JSON.parse(rawCursor) as {
          pi?: unknown;
          ic?: unknown;
        };
        if (typeof parsed.pi === "number" && parsed.pi >= 0) {
          pi = parsed.pi;
          ic = typeof parsed.ic === "string" ? parsed.ic : null;
        } else {
          pi = accessibleProjects.length;
        }
      } catch (err) {
        console.error("variables.listPaginated.parseCursorFailed", {
          field: "paginationOpts.cursor",
          organizationId: args.organizationId,
          userId: actor._id,
          error: String(err),
        });
        pi = accessibleProjects.length;
      }
    }

    let isDone = false;
    let continueCursor = "";

    if (pi >= accessibleProjects.length) {
      isDone = true;
    } else {
      const project = accessibleProjects[pi];
      const environmentScope = effectiveEnvironments(
        profile,
        scopeByProject.get(project._id as string)
      );

      const inner = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .order("desc")
        .paginate({ numItems, cursor: ic });

      for (const variable of inner.page) {
        if (variable.deletedAt !== undefined) continue;
        if (!isEnvironmentScopeAllowed(environmentScope, variable.environments))
          continue;

        const grant = grantByVariable.get(variable._id as string) ?? null;
        let access: "write" | "read" | null = null;
        if (roleAccess) {
          access = "write";
        } else if (roleRead) {
          access = "read";
        } else if (grant) {
          access =
            !assigned || grant.permission === "read"
              ? "read"
              : hasCapability(profile, "access.grant_fallback")
                ? "write"
                : "read";
        }

        if (access === null) continue;

        const effectivePermission = canManagePermissions ? "admin" : access;
        const { vaultRef, ...metadata } = variable;
        page.push({
          ...metadata,
          vaultRef,
          hasAccess: true,
          permission: effectivePermission,
          roleAccess,
          userRole: orgRole,
          projectRole,
          canManagePermissions,
          projectName: project.name,
          projectSlug: project.slug,
        });
      }

      if (inner.isDone) {
        const nextPi = pi + 1;
        isDone = nextPi >= accessibleProjects.length;
        continueCursor = isDone ? "" : JSON.stringify({ pi: nextPi, ic: null });
      } else {
        continueCursor = JSON.stringify({ pi, ic: inner.continueCursor });
      }
    }

    return { page, isDone, continueCursor };
  },
});

export const getById = query({
  args: { variableId: v.id("environmentVariables") },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (variable?.deletedAt) return null;
    return variable;
  },
});

export const getVersionHistory = query({
  args: {
    variableId: v.id("environmentVariables"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const variable = await ctx.db.get(args.variableId);
    if (!variable) return [];
    const project = await ctx.db.get(variable.projectId);
    if (!project) return [];

    const access = await getVariableAccess(ctx, actor._id, variable);
    if (access === null) {
      throw new Error("No access to this variable");
    }

    const versionHistoryCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "variable_version_history"
    );
    if (!versionHistoryCheck.allowed) {
      return [];
    }

    const versions = await ctx.db
      .query("variableVersions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .order("desc")
      .take(args.limit ?? 50);

    const versionsWithUsers = await Promise.all(
      versions.map(async (version) => {
        const user = await ctx.db.get(version.changedBy);
        return {
          ...version,
          changedByUser: user ? { name: user.name, email: user.email } : null,
        };
      })
    );

    return versionsWithUsers;
  },
});

async function listWithAccessCore(
  ctx: QueryCtx,
  args: { projectId: Id<"projects">; userId: Id<"users">; limit?: number }
): Promise<{
  variables: ReturnType<typeof mapVariableRow>[];
  truncatedAt: number | undefined;
}> {
  const resolved = await resolveProjectAccessContext(
    ctx,
    args.projectId,
    args.userId
  );
  if (!resolved) {
    return { variables: [], truncatedAt: undefined };
  }
  const { access } = resolved;

  const limit = args.limit ?? LIST_READ_CAP;

  const resolvedRows = (
    await resolveEffectiveVariables(ctx, { projectId: args.projectId })
  ).map((row) =>
    row.source.kind === "own" ? row : { ...row, projectId: args.projectId }
  );
  const inherited = new Set(
    resolvedRows.filter((row) => row.source.kind !== "own").map((r) => r._id)
  );

  const truncatedAt = resolvedRows.length > limit ? limit : undefined;
  const allVariables = resolvedRows.slice(0, limit);

  const variables = allVariables.filter((variable) =>
    isEnvironmentScopeAllowed(access.environmentScope, variable.environments)
  );

  const variablesWithAccess = variables.map((variable) => {
    const mapped = mapVariableRow(variable, access);
    return inherited.has(variable._id)
      ? {
          ...mapped,
          permission: mapped.hasAccess ? ("read" as const) : null,
          canManagePermissions: false,
        }
      : mapped;
  });

  if (!access.isOwner && !access.assigned) {
    return {
      variables: variablesWithAccess.filter((v) => v.hasAccess),
      truncatedAt,
    };
  }

  return { variables: variablesWithAccess, truncatedAt };
}

export const listWithAccess = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { variables } = await listWithAccessCore(ctx, {
      ...args,
      userId: actor._id,
    });
    return variables;
  },
});

export const hiddenByScope = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    scope: v.union(v.array(v.string()), v.null()),
    hiddenKeys: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (
      !resolved ||
      !resolved.access.assigned ||
      !resolved.access.environmentScope
    ) {
      return { scope: null, hiddenKeys: [] };
    }
    const { environmentScope } = resolved.access;

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(LIST_READ_CAP);

    const hiddenKeys: string[] = [];
    for (const variable of variables) {
      if (hiddenKeys.length >= 100) break;
      if (!isEnvironmentScopeAllowed(environmentScope, variable.environments)) {
        hiddenKeys.push(variable.key);
      }
    }
    return { scope: environmentScope, hiddenKeys };
  },
});

export const _listWithAccessCapped = internalQuery({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return listWithAccessCore(ctx, { ...args, userId: actor._id });
  },
});

export const listWithAccessPaginated = query({
  args: {
    projectId: v.id("projects"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) {
      return {
        page: [],
        isDone: true,
        continueCursor: args.paginationOpts.cursor ?? "",
      };
    }
    const { access } = resolved;

    const result = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const pageVariables = result.page.filter(
      (variable) =>
        variable.deletedAt === undefined &&
        isEnvironmentScopeAllowed(
          access.environmentScope,
          variable.environments
        )
    );

    const mappedPage = pageVariables.map((variable) =>
      mapVariableRow(variable, access)
    );

    const finalPage =
      !access.isOwner && !access.assigned
        ? mappedPage.filter((v) => v.hasAccess)
        : mappedPage;

    return {
      page: finalPage,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const searchInProject = query({
  args: {
    projectId: v.id("projects"),
    searchTerm: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) return { results: [], truncated: false };
    const { access } = resolved;

    const searchLower = args.searchTerm.trim().toLowerCase();
    if (searchLower === "") return { results: [], truncated: false };

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .collect();

    const tagIds = new Set<string>();
    for (const variable of variables) {
      for (const id of variable.tagIds ?? []) tagIds.add(id as string);
    }
    const tagNameById = new Map<string, string>();
    await Promise.all(
      [...tagIds].map(async (id) => {
        const tag = await ctx.db.get(id as Id<"variableTags">);
        if (tag && !tag.deletedAt) tagNameById.set(id, tag.name.toLowerCase());
      })
    );

    const matches = variables.filter((variable) => {
      if (
        !isEnvironmentScopeAllowed(
          access.environmentScope,
          variable.environments
        )
      ) {
        return false;
      }
      if (
        args.environment &&
        !variable.environments.includes(args.environment)
      ) {
        return false;
      }
      const tagMatch = (variable.tagIds ?? []).some((id) =>
        tagNameById.get(id as string)?.includes(searchLower)
      );
      return (
        variable.key.toLowerCase().includes(searchLower) ||
        variable.description?.toLowerCase().includes(searchLower) ||
        tagMatch
      );
    });

    const mapped = matches
      .map((variable) => mapVariableRow(variable, access))
      .filter((v) => access.isOwner || access.assigned || v.hasAccess)
      .sort((a, b) => a.key.localeCompare(b.key));

    const RESULT_LIMIT = 100;
    return {
      results: mapped.slice(0, RESULT_LIMIT),
      truncated: mapped.length > RESULT_LIMIT,
    };
  },
});

export const listMetadataByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) {
      return [];
    }
    const { access } = resolved;
    const limit = args.limit ?? LIST_READ_CAP;
    const variables = await resolveEffectiveVariables(ctx, {
      projectId: args.projectId,
      environment: args.environment,
    });

    if (variables.length > limit) {
      throw new ConvexError(
        `Project has more than ${limit} active variables, refusing a partial read. Contact support to raise the limit.`
      );
    }

    return variables
      .filter(
        (v) =>
          isEnvironmentScopeAllowed(access.environmentScope, v.environments) &&
          (access.isOwner ||
            access.assigned ||
            access.grantByVariable.has(v._id))
      )
      .map((v) => ({
        _id: v._id,
        key: v.key,
        environments: v.environments,
        isSensitive: v.isSensitive,
        version: v.version,
        updatedAt: v.updatedAt,
        description: v.description,
      }));
  },
});

export const globalSearchWithAccess = query({
  args: {
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const RESULT_LIMIT = 50;

    const searchLower = args.searchTerm.toLowerCase();
    const results: Array<{
      _id: string;
      key: string;
      environments?: string[];
      isSensitive?: boolean;
      tags?: Array<{ _id: string; name: string; color: string }>;
      projectName: string;
      projectSlug: string;
      projectColor?: string;
      organizationName: string;
    }> = [];

    const tagCache = new Map<
      string,
      { _id: string; name: string; color: string }
    >();

    const preloadTags = async (vars: Doc<"environmentVariables">[]) => {
      const missing = new Set<string>();
      for (const variable of vars) {
        if (!variable.tagIds) continue;
        for (const tagId of variable.tagIds) {
          const tagIdStr = tagId as string;
          if (!tagCache.has(tagIdStr)) missing.add(tagIdStr);
        }
      }
      if (missing.size === 0) return;
      const fetched = await Promise.all(
        [...missing].map((id) => ctx.db.get(id as Id<"variableTags">))
      );
      for (const tag of fetched) {
        if (tag && !tag.deletedAt) {
          tagCache.set(tag._id as string, {
            _id: tag._id as string,
            name: tag.name,
            color: tag.color,
          });
        }
      }
    };

    const resolveTagsFor = (variable: Doc<"environmentVariables">) => {
      const resolvedTags: Array<{ _id: string; name: string; color: string }> =
        [];
      if (variable.tagIds) {
        for (const tagId of variable.tagIds) {
          const cached = tagCache.get(tagId as string);
          if (cached) resolvedTags.push(cached);
        }
      }
      return resolvedTags;
    };

    const matchesSearch = (variable: Doc<"environmentVariables">) => {
      const tagNames =
        variable.tagIds
          ?.map((id) => tagCache.get(id as string)?.name ?? "")
          .filter(Boolean) ?? [];
      return (
        variable.key.toLowerCase().includes(searchLower) ||
        variable.description?.toLowerCase().includes(searchLower) ||
        variable.environments?.some((e) =>
          e.toLowerCase().includes(searchLower)
        ) ||
        tagNames.some((name) => name.toLowerCase().includes(searchLower))
      );
    };

    const memberships = (
      await ctx.db
        .query("organizationMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect()
    ).filter((m) => !isSuspendedMembership(m));

    const allProjectMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    const assignedProjectsByOrg = new Map<string, Array<Id<"projects">>>();
    const resolvedProjects = new Map<
      string,
      {
        _id: Id<"projects">;
        name: string;
        slug: string;
        icon?: string;
        color?: string;
        organizationId: string;
        deletedAt?: number;
      }
    >();

    const scopeByProject = new Map<string, string[] | undefined>();

    for (const pm of allProjectMemberships) {
      scopeByProject.set(pm.projectId as string, pm.environments);
      if (!resolvedProjects.has(pm.projectId)) {
        const project = await ctx.db.get(pm.projectId);
        if (project) {
          resolvedProjects.set(pm.projectId, {
            _id: project._id,
            name: project.name,
            slug: project.slug,
            icon: project.icon,
            color: project.color,
            organizationId: project.organizationId,
            deletedAt: project.deletedAt,
          });
        }
      }
      const project = resolvedProjects.get(pm.projectId);
      if (project && !project.deletedAt) {
        const orgId = project.organizationId;
        if (!assignedProjectsByOrg.has(orgId)) {
          assignedProjectsByOrg.set(orgId, []);
        }
        assignedProjectsByOrg.get(orgId)!.push(pm.projectId);
      }
    }

    const coveredProjectIds = new Set<string>();

    for (const membership of memberships) {
      const org = await ctx.db.get(membership.organizationId);
      if (!org) continue;

      const orgRole = normalizeOrgRole(membership.role);
      const searchProfile = await getRoleProfile(ctx, orgRole);
      const isOwner = bypassesAssignment(searchProfile);

      let accessibleProjects: Array<{
        _id: Id<"projects">;
        name: string;
        slug: string;
        icon?: string;
        color?: string;
      }> = [];

      if (isOwner) {
        const allOrgProjects = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId)
          )
          .collect();
        accessibleProjects = allOrgProjects
          .filter((p) => p.deletedAt === undefined)
          .map((p) => ({
            _id: p._id,
            name: p.name,
            slug: p.slug,
            icon: p.icon,
            color: p.color,
          }));
      } else {
        const assignedIds =
          assignedProjectsByOrg.get(membership.organizationId) ?? [];
        for (const projectId of assignedIds) {
          const project = resolvedProjects.get(projectId);
          if (project) {
            accessibleProjects.push({
              _id: project._id,
              name: project.name,
              slug: project.slug,
              icon: project.icon,
              color: project.color,
            });
          }
        }
      }

      for (const project of accessibleProjects) {
        coveredProjectIds.add(project._id as string);

        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project_deleted", (q) =>
            q.eq("projectId", project._id).eq("deletedAt", undefined)
          )
          .collect();

        await preloadTags(variables);

        const environmentScope = effectiveEnvironments(
          searchProfile,
          scopeByProject.get(project._id as string)
        );

        const matches = variables.filter(
          (variable) =>
            isEnvironmentScopeAllowed(
              environmentScope,
              variable.environments
            ) && matchesSearch(variable)
        );

        for (const variable of matches) {
          const resolvedTags = resolveTagsFor(variable);

          results.push({
            _id: variable._id as string,
            key: variable.key,
            environments: variable.environments,
            isSensitive: variable.isSensitive,
            tags: resolvedTags.length > 0 ? resolvedTags : undefined,
            projectName: project.name,
            projectSlug: project.slug,
            projectColor: project.color,
            organizationName: org.name,
          });

          if (results.length >= RESULT_LIMIT) break;
        }
        if (results.length >= RESULT_LIMIT) break;
      }
      if (results.length >= RESULT_LIMIT) break;
    }

    if (results.length < RESULT_LIMIT) {
      const grants = await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", actor._id).eq("isActive", true)
        )
        .collect();

      const now = Date.now();
      const memberOrgIds = new Set(
        memberships.map((m) => m.organizationId as string)
      );
      const seenVariableIds = new Set(results.map((r) => r._id));

      for (const grant of grants) {
        if (results.length >= RESULT_LIMIT) break;
        if (grant.expiresAt && grant.expiresAt <= now) continue;
        if (seenVariableIds.has(grant.variableId as string)) continue;

        const variable = await ctx.db.get(grant.variableId);
        if (!variable || variable.deletedAt) continue;
        if (coveredProjectIds.has(variable.projectId as string)) continue;

        const project = await ctx.db.get(variable.projectId);
        if (!project || project.deletedAt) continue;
        if (!memberOrgIds.has(project.organizationId as string)) continue;

        const org = await ctx.db.get(project.organizationId);
        if (!org) continue;

        await preloadTags([variable]);
        if (!matchesSearch(variable)) continue;

        const resolvedTags = resolveTagsFor(variable);

        results.push({
          _id: variable._id as string,
          key: variable.key,
          environments: variable.environments,
          isSensitive: variable.isSensitive,
          tags: resolvedTags.length > 0 ? resolvedTags : undefined,
          projectName: project.name,
          projectSlug: project.slug,
          projectColor: project.color,
          organizationName: org.name,
        });
        seenVariableIds.add(variable._id as string);
      }
    }

    return results;
  },
});

export const getDeleted = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    try {
      await authorizeVariableAccess(ctx, {
        userId: actor._id,
        projectId: args.projectId,
        action: "project:delete_variable",
        preloadedProject: project,
      });
    } catch {
      return [];
    }

    const cutoff = Date.now() - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const deletedVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gte("deletedAt", cutoff)
      )
      .order("desc")
      .take(100);

    const rows = deletedVariables.map((variable) => ({
      _id: variable._id,
      key: variable.key,
      deletedAt: variable.deletedAt as number,
      environments: variable.environments,
      sharedFrom: undefined as string | undefined,
    }));

    const memberships = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const membership of memberships) {
      const workspace = await ctx.db.get(membership.workspaceId);
      if (!workspace || workspace.deletedAt) continue;
      try {
        await authorizeVariableAccess(ctx, {
          userId: actor._id,
          projectId: workspace._id,
          action: "project:delete_variable",
          preloadedProject: workspace,
        });
      } catch {
        continue;
      }
      const shared = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", workspace._id).gte("deletedAt", cutoff)
        )
        .order("desc")
        .take(100);
      for (const variable of shared) {
        if (
          variable.appliesTo &&
          !variable.appliesTo.includes(args.projectId)
        ) {
          continue;
        }
        rows.push({
          _id: variable._id,
          key: variable.key,
          deletedAt: variable.deletedAt as number,
          environments: variable.environments,
          sharedFrom: workspace.name,
        });
      }
    }
    return rows.sort((a, b) => b.deletedAt - a.deletedAt);
  },
});

export const validateCreateFieldsInternal = internalQuery({
  args: {
    projectId: v.id("projects"),
    rotationFrequencyDays: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }
    await validateVariableCreateFields(ctx.db, {
      organizationId: project.organizationId,
      rotationFrequencyDays: args.rotationFrequencyDays,
      tagIds: args.tagIds,
    });
    return null;
  },
});

export const getEnvironmentConflictsInternal = internalQuery({
  args: {
    projectId: v.id("projects"),
    key: v.string(),
    environments: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      source: v.union(
        v.object({ kind: v.literal("self") }),
        v.object({
          kind: v.literal("workspace"),
          workspaceId: v.id("projects"),
          name: v.string(),
        }),
        v.object({
          kind: v.literal("member"),
          projectId: v.id("projects"),
          name: v.string(),
        })
      ),
      environments: v.array(v.string()),
    })
  ),
  handler: async (ctx, args) =>
    findEnvironmentConflicts(ctx, {
      projectId: args.projectId,
      key: args.key,
      environments: args.environments,
    }),
});
