import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_BULK_IMPORT_SIZE, isCronPaused } from "./tierLimits";
import {
  checkNumericLimit,
  checkBooleanFeature,
  countActiveVariables,
  countRotationEnabledVariables,
} from "./featureRegistry";
import {
  createAuditLog,
  logVariableAccess,
  logBulkOperation,
} from "./auditHelpers";
import { rateLimiter } from "./rateLimits";
import { authorizeVariableAccess, requireVariableAccess } from "./authHelpers";
import {
  assertOrgAction,
  getActiveVariableGrant,
  getVariableAccess,
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  toLegacyProjectRole,
} from "./authz";

/**
 * Environment Variable Queries and Mutations
 */

/**
 * Throw when a scoped developer touches environments outside their assignment
 * scope. No-op for unrestricted (undefined) scopes — see authz.ts.
 */
function assertWithinEnvironmentScope(
  scope: string[] | undefined,
  environments: string[]
): void {
  if (!isEnvironmentScopeAllowed(scope, environments)) {
    throw new Error(
      `Your access is limited to these environments: ${(scope ?? []).join(", ")}`
    );
  }
}

// ==========================================
// QUERIES
// ==========================================

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const variables = allVariables.filter(
      (variable) => variable.deletedAt === undefined
    );

    if (args.environment) {
      return variables.filter((v) =>
        v.environments.includes(args.environment!)
      );
    }

    return variables;
  },
});

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const projects = allProjects.filter(
      (project) => project.deletedAt === undefined
    );

    const variablesNested = await Promise.all(
      projects.map(async (project) => {
        const allVariables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const variables = allVariables.filter(
          (variable) => variable.deletedAt === undefined
        );

        return variables.map((variable) => ({
          ...variable,
          projectName: project.name,
          projectSlug: project.slug,
        }));
      })
    );

    return variablesNested.flat();
  },
});

/**
 * Access-aware org-wide variable listing for the global Variables page.
 *
 * Unlike listByOrganization (which returns every org vaultRef unfiltered),
 * this enumerates only the projects the caller can see (owner → all;
 * everyone else → assigned projects), applies environment scope for
 * developers, and returns vaultRef ONLY for variables the caller can
 * actually access. Variables the caller has no access to are omitted
 * entirely — the page shows keys/metadata only for what they may touch.
 *
 * Shape mirrors listByOrganization's rows (variable fields + projectName/
 * projectSlug) plus a `hasAccess`/`permission` pair, so the page's
 * filtering/search keeps working. vaultRef is present only when hasAccess.
 */
export const listOrgVariablesWithAccess = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Resolve the caller's org role — non-members get nothing.
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const orgRole = normalizeOrgRole(membership.role);
    const isOwner = orgRole === "owner";

    // Determine accessible projects and (for developers) their env scope.
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const liveProjects = allProjects.filter((p) => p.deletedAt === undefined);

    // Env scope per assigned project (only constrains developers).
    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    const accessibleProjects = isOwner
      ? liveProjects
      : liveProjects.filter((p) => assignedProjectIds.has(p._id as string));

    // Owners and assigned PMs/TLs have blanket write; developers depend on
    // per-variable grants (resolved below).
    const roleWrite =
      isOwner || orgRole === "project_manager" || orgRole === "team_lead";

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
      const environmentScope =
        orgRole === "developer"
          ? scopeByProject.get(project._id as string)
          : undefined;

      const allVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();

      // Scoped developers never receive out-of-scope variables at all.
      const variables = allVariables.filter(
        (variable) =>
          variable.deletedAt === undefined &&
          isEnvironmentScopeAllowed(environmentScope, variable.environments)
      );

      for (const variable of variables) {
        let access: "write" | "read" | null = null;
        if (roleWrite) {
          access = "write";
        } else {
          // Developer — resolve per-variable grant
          const grant = await getActiveVariableGrant(
            ctx,
            args.userId,
            variable._id
          );
          if (grant) {
            access = grant.permission === "read" ? "read" : "write";
          }
        }

        const hasAccess = access !== null;
        // Developers only ever see variables they can access; owners/PMs/TLs
        // see everything in their accessible projects (with write access).
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

export const getById = query({
  args: { variableId: v.id("environmentVariables") },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (variable?.deletedAt) return null;
    return variable;
  },
});

export const getByKey = query({
  args: {
    projectId: v.id("projects"),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const variable = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", args.projectId).eq("key", args.key)
      )
      .first();

    if (variable?.deletedAt) return null;
    return variable;
  },
});

export const getVersionHistory = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if version history is enabled for this org
    const variable = await ctx.db.get(args.variableId);
    if (!variable) return [];
    const project = await ctx.db.get(variable.projectId);
    if (!project) return [];

    // Access control: version rows carry per-version vaultRefs, so a caller
    // must have effective access to the parent variable (owner / assigned
    // PM/TL / developer with a grant, env-scope respected). Never leak
    // history for variables outside the caller's access.
    const access = await getVariableAccess(ctx, args.userId, variable);
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

export const getVersion = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    // A single version row still carries a vaultRef — gate on effective
    // access to the parent variable before returning it.
    const variable = await ctx.db.get(args.variableId);
    if (!variable) return null;

    const access = await getVariableAccess(ctx, args.userId, variable);
    if (access === null) {
      throw new Error("No access to this variable");
    }

    return await ctx.db
      .query("variableVersions")
      .withIndex("by_variable_and_version", (q) =>
        q.eq("variableId", args.variableId).eq("version", args.version)
      )
      .first();
  },
});

/**
 * List variables with unified-role and per-variable access information
 *
 * Access rules (unified model — see convex/authz.ts):
 * - Owners: write access to every variable
 * - Project managers / team leads assigned to the project: write access
 * - Developers assigned to the project: value access via per-variable
 *   grants; they still see metadata (no vault refs) for ungranted variables
 * - Unassigned org members: read-only on variables explicitly shared with
 *   them via an active grant (per-variable viewer sharing)
 */
export const listWithAccess = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    // Get user's org membership to determine their unified role
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      return [];
    }

    const orgRole = normalizeOrgRole(membership.role);
    const isOwner = orgRole === "owner";

    // Assignment is a pure scope check — projectMembers.role is legacy
    // and never consulted for authorization.
    let assigned = false;
    let environmentScope: string[] | undefined;
    if (!isOwner) {
      const projectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.userId)
        )
        .first();
      assigned = !!projectMembership;
      // Environment scope only constrains assigned developers
      if (orgRole === "developer") {
        environmentScope = projectMembership?.environments;
      }
    }

    // Owners and assigned PMs/team leads have blanket write access
    const roleAccess =
      isOwner ||
      (assigned && (orgRole === "project_manager" || orgRole === "team_lead"));
    const canManagePermissions = roleAccess;
    const projectRole = toLegacyProjectRole(orgRole, assigned);

    const allVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    // Scoped developers never receive out-of-scope variables at all —
    // not even their metadata/keys
    const variables = allVariables.filter(
      (variable) =>
        variable.deletedAt === undefined &&
        isEnvironmentScopeAllowed(environmentScope, variable.environments)
    );

    const variablesWithAccess = await Promise.all(
      variables.map(async (variable) => {
        const grant = await getActiveVariableGrant(
          ctx,
          args.userId,
          variable._id
        );

        // Mirrors getVariableAccess: owner → write; assigned PM/TL → write;
        // developers per grant; unassigned grant holders capped at read.
        let access: "write" | "read" | null = null;
        if (roleAccess) {
          access = "write";
        } else if (grant) {
          access = !assigned || grant.permission === "read" ? "read" : "write";
        }

        const hasAccess = access !== null;
        const effectivePermission = roleAccess ? "admin" : access;

        // Vault refs are only returned for variables the user can access;
        // assigned members still see metadata for the rest.
        const { vaultRef, ...metadata } = variable;

        return {
          ...metadata,
          ...(hasAccess ? { vaultRef } : {}),
          hasAccess,
          permission: effectivePermission,
          roleAccess,
          userRole: orgRole,
          projectRole,
          canManagePermissions,
        };
      })
    );

    // Assigned members (and owners) may list metadata for every variable;
    // grant-only viewers see just the variables shared with them.
    if (!isOwner && !assigned) {
      return variablesWithAccess.filter((v) => v.hasAccess);
    }

    return variablesWithAccess;
  },
});

/**
 * List variable metadata (keys, versions, environments) WITHOUT vault refs.
 * Used by the VS Code extension via WebSocket subscription to detect changes
 * reactively, then fetch decrypted values via HTTP only when needed.
 */
export const listMetadataByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const variables = allVariables.filter(
      (variable) => variable.deletedAt === undefined
    );

    const filtered = args.environment
      ? variables.filter((v) => v.environments.includes(args.environment!))
      : variables;

    return filtered.map((v) => ({
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

export const search = query({
  args: {
    organizationId: v.id("organizations"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const projects = allProjects.filter(
      (project) => project.deletedAt === undefined
    );

    const searchLower = args.searchTerm.toLowerCase();
    const results = [];

    for (const project of projects) {
      const allVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const variables = allVariables.filter(
        (variable) => variable.deletedAt === undefined
      );

      const matches = variables.filter(
        (v) =>
          v.key.toLowerCase().includes(searchLower) ||
          v.description?.toLowerCase().includes(searchLower)
      );

      results.push(
        ...matches.map((v) => ({
          ...v,
          projectName: project.name,
          projectSlug: project.slug,
        }))
      );
    }

    return results;
  },
});

export const globalSearchWithAccess = query({
  args: {
    userId: v.id("users"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate user exists
    const user = await ctx.db.get(args.userId);
    if (!user) return [];

    const searchLower = args.searchTerm.toLowerCase();
    const results: Array<{
      _id: string;
      key: string;
      description?: string;
      environments?: string[];
      isSensitive?: boolean;
      tagIds?: string[];
      tags?: Array<{ _id: string; name: string; color: string }>;
      projectId: string;
      projectName: string;
      projectSlug: string;
      projectIcon?: string;
      projectColor?: string;
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
    }> = [];

    // Pre-fetch tag cache for resolving tag names during search
    const tagCache = new Map<
      string,
      { _id: string; name: string; color: string }
    >();

    const cacheTagsFor = async (variable: Doc<"environmentVariables">) => {
      if (!variable.tagIds) return;
      for (const tagId of variable.tagIds) {
        const tagIdStr = tagId as string;
        if (!tagCache.has(tagIdStr)) {
          const tag = await ctx.db.get(tagId);
          if (tag && !tag.deletedAt) {
            tagCache.set(tagIdStr, {
              _id: tagIdStr,
              name: tag.name,
              color: tag.color,
            });
          }
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

    // Get all org memberships for this user
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Pre-fetch project assignments once. projectMembers is a pure scope
    // assignment — its legacy role field is never consulted.
    const allProjectMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Group project assignments by org (resolved lazily)
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

    // Environment scope per assignment (constrains developers only)
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

    // Projects already covered by role/assignment access (used to avoid
    // double-processing in the grant-holder pass below)
    const coveredProjectIds = new Set<string>();

    for (const membership of memberships) {
      const org = await ctx.db.get(membership.organizationId);
      if (!org) continue;

      const orgRole = normalizeOrgRole(membership.role);
      const isOwner = orgRole === "owner";

      // Metadata visibility: owners see all org projects, everyone else
      // sees the projects they are assigned to.
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

        const allVariables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const variables = allVariables.filter(
          (variable) => variable.deletedAt === undefined
        );

        // Resolve tags for variables in this project batch
        for (const variable of variables) {
          await cacheTagsFor(variable);
        }

        // Scoped developers never receive out-of-scope variables at all —
        // not even their metadata/keys
        const environmentScope =
          orgRole === "developer"
            ? scopeByProject.get(project._id as string)
            : undefined;

        const matches = variables.filter(
          (variable) =>
            isEnvironmentScopeAllowed(
              environmentScope,
              variable.environments
            ) && matchesSearch(variable)
        );

        for (const variable of matches) {
          // Owners and assigned project members may list variable metadata
          const resolvedTags = resolveTagsFor(variable);

          results.push({
            _id: variable._id as string,
            key: variable.key,
            description: variable.description,
            environments: variable.environments,
            isSensitive: variable.isSensitive,
            tagIds: variable.tagIds as string[] | undefined,
            tags: resolvedTags.length > 0 ? resolvedTags : undefined,
            projectId: project._id as string,
            projectName: project.name,
            projectSlug: project.slug,
            projectIcon: project.icon,
            projectColor: project.color,
            organizationId: org._id as string,
            organizationName: org.name,
            organizationSlug: org.slug,
          });

          if (results.length >= 50) break;
        }
        if (results.length >= 50) break;
      }
      if (results.length >= 50) break;
    }

    // Per-variable viewer sharing: grant holders may list metadata for
    // variables explicitly shared with them, even without an assignment.
    if (results.length < 50) {
      const grants = await ctx.db
        .query("variablePermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", args.userId).eq("isActive", true)
        )
        .collect();

      const now = Date.now();
      const memberOrgIds = new Set(
        memberships.map((m) => m.organizationId as string)
      );
      const seenVariableIds = new Set(results.map((r) => r._id));

      for (const grant of grants) {
        if (results.length >= 50) break;
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

        await cacheTagsFor(variable);
        if (!matchesSearch(variable)) continue;

        const resolvedTags = resolveTagsFor(variable);

        results.push({
          _id: variable._id as string,
          key: variable.key,
          description: variable.description,
          environments: variable.environments,
          isSensitive: variable.isSensitive,
          tagIds: variable.tagIds as string[] | undefined,
          tags: resolvedTags.length > 0 ? resolvedTags : undefined,
          projectId: project._id as string,
          projectName: project.name,
          projectSlug: project.slug,
          projectIcon: project.icon,
          projectColor: project.color,
          organizationId: org._id as string,
          organizationName: org.name,
          organizationSlug: org.slug,
        });
        seenVariableIds.add(variable._id as string);
      }
    }

    return results;
  },
});

// ==========================================
// MUTATIONS
// ==========================================

export const create = mutation({
  args: {
    key: v.string(),
    vaultRef: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    projectId: v.id("projects"),
    isSensitive: v.optional(v.boolean()),
    createdBy: v.id("users"),
    rotationFrequencyDays: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead / developer
    const { orgRole, environmentScope } = await authorizeVariableAccess(ctx, {
      userId: args.createdBy,
      projectId: args.projectId,
      action: "project:create_variable",
    });

    // Environment scope: scoped developers may only create variables whose
    // environments all fall inside their assignment scope
    assertWithinEnvironmentScope(environmentScope, args.environments);

    // Rate limit: prevent excessive variable creation
    await rateLimiter.limit(ctx, "variableCreate", {
      key: project.organizationId,
      throws: true,
    });

    // Check tier limits for variable creation
    const varCount = await countActiveVariables(ctx.db, args.projectId);
    const varCheck = await checkNumericLimit(
      ctx.db,
      project.organizationId,
      "max_variables_per_project",
      varCount
    );
    if (!varCheck.allowed) {
      throw new Error(varCheck.reason!);
    }

    // Validate rotation frequency bounds
    if (args.rotationFrequencyDays !== undefined) {
      if (args.rotationFrequencyDays < 0 || args.rotationFrequencyDays > 3650) {
        throw new Error("Rotation frequency must be between 0 and 3650 days");
      }
    }

    // If rotation is requested, check boolean gate + numeric limit
    if (args.rotationFrequencyDays && args.rotationFrequencyDays > 0) {
      const rotationCheck = await checkBooleanFeature(
        ctx.db,
        project.organizationId,
        "secret_rotation"
      );
      if (!rotationCheck.allowed) {
        throw new Error(
          "Secret rotation requires a higher tier. Upgrade to enable rotation schedules."
        );
      }

      // Check rotation-enabled variable limit
      const currentRotationCount = await countRotationEnabledVariables(
        ctx.db,
        project.organizationId
      );
      const limitCheck = await checkNumericLimit(
        ctx.db,
        project.organizationId,
        "secret_rotation_limit",
        currentRotationCount
      );
      if (!limitCheck.allowed) {
        throw new Error(
          `Rotation-enabled variable limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your tier for more.`
        );
      }
    }

    // Validate and deduplicate tagIds
    const validatedTagIds =
      args.tagIds && args.tagIds.length > 0
        ? [...new Set(args.tagIds)]
        : undefined;

    if (validatedTagIds && validatedTagIds.length > 0) {
      if (validatedTagIds.length > 10) {
        throw new Error("A variable can have at most 10 tags");
      }

      for (const tagId of validatedTagIds) {
        const tag = await ctx.db.get(tagId);
        if (!tag || tag.deletedAt) {
          throw new Error(`Tag not found: ${tagId}`);
        }
        if (tag.organizationId !== project.organizationId) {
          throw new Error("Tag does not belong to this organization");
        }
      }
    }

    const existingVariable = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", args.projectId).eq("key", args.key)
      )
      .first();

    if (existingVariable && !existingVariable.deletedAt) {
      throw new Error("Variable key already exists in this project");
    }

    // Build rotation fields if rotation is enabled
    const rotationFields:
      | {
          rotationFrequencyDays: number;
          expiresAt: number;
          lastRotatedAt: number;
          rotationStatus: "active";
        }
      | Record<string, never> =
      args.rotationFrequencyDays && args.rotationFrequencyDays > 0
        ? {
            rotationFrequencyDays: args.rotationFrequencyDays,
            expiresAt: now + args.rotationFrequencyDays * 24 * 60 * 60 * 1000,
            lastRotatedAt: now,
            rotationStatus: "active" as const,
          }
        : {};

    const variableId = await ctx.db.insert("environmentVariables", {
      key: args.key,
      vaultRef: args.vaultRef,
      description: args.description,
      environments: args.environments,
      projectId: args.projectId,
      isSensitive: args.isSensitive ?? false,
      createdBy: args.createdBy,
      lastModifiedBy: args.createdBy,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...rotationFields,
      ...(validatedTagIds && validatedTagIds.length > 0
        ? { tagIds: validatedTagIds }
        : {}),
    });

    await ctx.db.insert("variableVersions", {
      variableId,
      version: 1,
      vaultRef: args.vaultRef,
      description: args.description,
      environments: args.environments,
      changedBy: args.createdBy,
      changeReason: "Initial creation",
      createdAt: now,
    });

    // Developers have no blanket write access — an automatic grant keeps
    // write access to the variables they create.
    if (orgRole === "developer") {
      await ctx.db.insert("variablePermissions", {
        variableId,
        userId: args.createdBy,
        permission: "write",
        grantedBy: args.createdBy,
        grantedAt: now,
        isActive: true,
      });
    }

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      variableId,
      userId: args.createdBy,
      action: "variable.created",
      details: {
        key: args.key,
        environments: args.environments,
        isSensitive: args.isSensitive ?? false,
        rotationFrequencyDays: args.rotationFrequencyDays,
      },
      involvesSensitiveData: args.isSensitive ?? false,
      resourceType: "variable",
    });

    return variableId;
  },
});

export const update = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    vaultRef: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    isSensitive: v.optional(v.boolean()),
    updatedBy: v.id("users"),
    changeReason: v.optional(v.string()),
    rotationFrequencyDays: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const {
      variableId,
      updatedBy,
      changeReason,
      rotationFrequencyDays,
      tagIds: rawTagIds,
      ...updates
    } = args;

    const variable = await ctx.db.get(variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: effective write access — owner, assigned PM/team lead,
    // or a developer holding a write grant on this variable
    await requireVariableAccess(ctx, updatedBy, variable, "write");

    // Environment scope: getVariableAccess already blocks scoped developers
    // from touching out-of-scope variables, but the NEW environments must
    // also stay inside the scope — a scoped developer must not be able to
    // move a variable into production
    if (updates.environments !== undefined) {
      const editorMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", project.organizationId).eq("userId", updatedBy)
        )
        .first();

      if (
        editorMembership &&
        normalizeOrgRole(editorMembership.role) === "developer"
      ) {
        const editorAssignment = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", variable.projectId).eq("userId", updatedBy)
          )
          .first();

        assertWithinEnvironmentScope(
          editorAssignment?.environments,
          updates.environments
        );
      }
    }

    // Validate rotation frequency bounds
    if (rotationFrequencyDays !== undefined) {
      if (rotationFrequencyDays < 0 || rotationFrequencyDays > 3650) {
        throw new Error("Rotation frequency must be between 0 and 3650 days");
      }
    }

    // If rotation is being set/changed, check boolean gate + numeric limit
    if (rotationFrequencyDays !== undefined && rotationFrequencyDays > 0) {
      const rotationCheck = await checkBooleanFeature(
        ctx.db,
        project.organizationId,
        "secret_rotation"
      );
      if (!rotationCheck.allowed) {
        throw new Error(
          "Secret rotation requires a higher tier. Upgrade to enable rotation schedules."
        );
      }

      // Check rotation limit only when enabling rotation on a variable that didn't have it
      const alreadyHasRotation =
        variable.rotationFrequencyDays !== undefined &&
        variable.rotationFrequencyDays > 0;
      if (!alreadyHasRotation) {
        const currentRotationCount = await countRotationEnabledVariables(
          ctx.db,
          project.organizationId
        );
        const limitCheck = await checkNumericLimit(
          ctx.db,
          project.organizationId,
          "secret_rotation_limit",
          currentRotationCount
        );
        if (!limitCheck.allowed) {
          throw new Error(
            `Rotation-enabled variable limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your tier for more.`
          );
        }
      }
    }

    // Validate and deduplicate tagIds if provided
    const tagIds =
      rawTagIds !== undefined ? [...new Set(rawTagIds)] : undefined;

    if (tagIds !== undefined) {
      if (tagIds.length > 10) {
        throw new Error("A variable can have at most 10 tags");
      }

      for (const tId of tagIds) {
        const tag = await ctx.db.get(tId);
        if (!tag || tag.deletedAt) {
          throw new Error(`Tag not found: ${tId}`);
        }
        if (tag.organizationId !== project.organizationId) {
          throw new Error("Tag does not belong to this organization");
        }
      }
    }

    const newVersion = variable.version + 1;
    const isValueRotated = updates.vaultRef !== undefined;

    const updateData: Record<string, unknown> = {
      updatedAt: now,
      lastModifiedBy: updatedBy,
      version: newVersion,
    };

    if (updates.vaultRef !== undefined) updateData.vaultRef = updates.vaultRef;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.environments !== undefined)
      updateData.environments = updates.environments;
    if (updates.isSensitive !== undefined)
      updateData.isSensitive = updates.isSensitive;
    if (tagIds !== undefined)
      updateData.tagIds = tagIds.length > 0 ? tagIds : undefined;

    // Handle rotation frequency changes
    if (rotationFrequencyDays !== undefined) {
      if (rotationFrequencyDays === 0) {
        // Disable rotation — clear all rotation fields
        updateData.rotationFrequencyDays = undefined;
        updateData.expiresAt = undefined;
        updateData.lastRotatedAt = undefined;
        updateData.rotationStatus = undefined;
        updateData.lastReminderSentAt = undefined;
      } else {
        updateData.rotationFrequencyDays = rotationFrequencyDays;
      }
    }

    // Determine the effective rotation frequency after this update
    const effectiveFreqDays =
      rotationFrequencyDays !== undefined
        ? rotationFrequencyDays
        : variable.rotationFrequencyDays;

    // If the secret value is being rotated and rotation schedule is active, reset the timer
    if (isValueRotated && effectiveFreqDays && effectiveFreqDays > 0) {
      updateData.lastRotatedAt = now;
      updateData.expiresAt = now + effectiveFreqDays * 24 * 60 * 60 * 1000;
      updateData.rotationStatus = "active";
      updateData.lastReminderSentAt = undefined;
    } else if (
      effectiveFreqDays &&
      effectiveFreqDays > 0 &&
      rotationFrequencyDays !== undefined &&
      rotationFrequencyDays > 0
    ) {
      // Frequency changed without a value rotation — recompute from lastRotatedAt
      const baseTime = variable.lastRotatedAt ?? now;
      updateData.expiresAt = baseTime + effectiveFreqDays * 24 * 60 * 60 * 1000;
      if (!variable.lastRotatedAt) {
        updateData.lastRotatedAt = now;
      }
      // Recompute status
      const expiresAt = updateData.expiresAt as number;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (expiresAt <= now) {
        updateData.rotationStatus = "expired";
      } else if (expiresAt <= now + sevenDays) {
        updateData.rotationStatus = "expiring_soon";
      } else {
        updateData.rotationStatus = "active";
      }
    }

    await ctx.db.patch(variableId, updateData);

    await ctx.db.insert("variableVersions", {
      variableId,
      version: newVersion,
      vaultRef: updates.vaultRef ?? variable.vaultRef,
      description: updates.description ?? variable.description,
      environments: updates.environments ?? variable.environments,
      changedBy: updatedBy,
      changeReason,
      createdAt: now,
    });

    // Use "variable.rotated" if the value was changed on a rotation-enabled variable
    const auditAction =
      isValueRotated && variable.rotationFrequencyDays
        ? ("variable.rotated" as const)
        : ("variable.updated" as const);

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId,
      userId: updatedBy,
      action: auditAction,
      details: {
        key: variable.key,
        newVersion,
        previousVersion: variable.version,
        changeReason,
        fieldsUpdated: Object.keys(updates).filter(
          (k) => updates[k as keyof typeof updates] !== undefined
        ),
        rotationFrequencyDays:
          rotationFrequencyDays ?? variable.rotationFrequencyDays,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
    });

    return variableId;
  },
});

export const remove = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead
    await authorizeVariableAccess(ctx, {
      userId: args.deletedBy,
      projectId: variable.projectId,
      action: "project:delete_variable",
    });

    await ctx.db.patch(args.variableId, {
      deletedAt: now,
      updatedAt: now,
    });

    const allPermissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .collect();
    const permissions = allPermissions.filter((perm) => perm.isActive);

    for (const perm of permissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
        revokedBy: args.deletedBy,
      });
    }

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.deletedBy,
      action: "variable.deleted",
      details: {
        key: variable.key,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        permissionsRevoked: permissions.length,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
      severity: "warning",
    });

    return args.variableId;
  },
});

export const bulkDelete = mutation({
  args: {
    variableIds: v.array(v.id("environmentVariables")),
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.variableIds.length === 0) {
      throw new Error("No variables specified");
    }
    if (args.variableIds.length > MAX_BULK_IMPORT_SIZE) {
      throw new Error(
        `Cannot bulk delete more than ${MAX_BULK_IMPORT_SIZE} variables at once`
      );
    }

    // Look up the first variable to determine project/org for authorization
    const firstVariable = await ctx.db.get(args.variableIds[0]);
    if (!firstVariable || firstVariable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(firstVariable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead
    await authorizeVariableAccess(ctx, {
      userId: args.deletedBy,
      projectId: firstVariable.projectId,
      action: "project:delete_variable",
    });

    // Check bulk_delete feature gate
    const bulkDeleteCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "bulk_delete"
    );
    if (!bulkDeleteCheck.allowed) {
      throw new Error("Bulk delete is not available on your current tier.");
    }

    let deletedCount = 0;
    const deletedKeys: string[] = [];

    for (const variableId of args.variableIds) {
      const variable = await ctx.db.get(variableId);
      if (!variable || variable.deletedAt) continue;

      // Ensure all variables belong to the same project
      if (variable.projectId !== firstVariable.projectId) {
        throw new Error("All variables must belong to the same project");
      }

      // Soft delete
      await ctx.db.patch(variableId, {
        deletedAt: now,
        updatedAt: now,
      });

      // Revoke active permissions
      const allPermissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variableId))
        .collect();
      const permissions = allPermissions.filter((perm) => perm.isActive);

      for (const perm of permissions) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: args.deletedBy,
        });
      }

      deletedKeys.push(variable.key);
      deletedCount++;
    }

    // Audit log
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: firstVariable.projectId,
      userId: args.deletedBy,
      action: "variable.deleted",
      details: {
        bulkOperation: true,
        deletedCount,
        deletedKeys,
        projectName: project.name,
      },
      resourceType: "variable",
      severity: "warning",
    });

    return { deletedCount };
  },
});

export const restore = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    restoredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    if (!variable.deletedAt) {
      throw new Error("Variable is not deleted");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead
    await authorizeVariableAccess(ctx, {
      userId: args.restoredBy,
      projectId: variable.projectId,
      action: "project:delete_variable",
    });

    await ctx.db.patch(args.variableId, {
      deletedAt: undefined,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.restoredBy,
      action: "variable.restored",
      details: {
        key: variable.key,
        deletedAt: variable.deletedAt,
        restoredAt: now,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
    });

    return args.variableId;
  },
});

export const rollback = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    targetVersion: v.number(),
    rolledBackBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const targetVersionRecord = await ctx.db
      .query("variableVersions")
      .withIndex("by_variable_and_version", (q) =>
        q.eq("variableId", args.variableId).eq("version", args.targetVersion)
      )
      .first();

    if (!targetVersionRecord) {
      throw new Error("Target version not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner only
    await assertOrgAction(
      ctx,
      args.rolledBackBy,
      project.organizationId,
      "org:rollback_variable"
    );

    const newVersion = variable.version + 1;

    await ctx.db.patch(args.variableId, {
      vaultRef: targetVersionRecord.vaultRef,
      description: targetVersionRecord.description,
      environments: targetVersionRecord.environments,
      version: newVersion,
      lastModifiedBy: args.rolledBackBy,
      updatedAt: now,
    });

    await ctx.db.insert("variableVersions", {
      variableId: args.variableId,
      version: newVersion,
      vaultRef: targetVersionRecord.vaultRef,
      description: targetVersionRecord.description,
      environments: targetVersionRecord.environments,
      changedBy: args.rolledBackBy,
      changeReason: `Rolled back to version ${args.targetVersion}`,
      createdAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.rolledBackBy,
      action: "variable.rollback",
      details: {
        key: variable.key,
        rollbackToVersion: args.targetVersion,
        previousVersion: variable.version,
        newVersion,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
    });

    return args.variableId;
  },
});

export const logAccess = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    accessedBy: v.id("users"),
    accessType: v.union(
      v.literal("view"),
      v.literal("copy"),
      v.literal("export")
    ),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    environment: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: anyone with effective access to this variable
    // (role-based write, or an active read/write grant)
    await requireVariableAccess(ctx, args.accessedBy, variable, "read");

    await logVariableAccess(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.accessedBy,
      accessType: args.accessType,
      variableKey: variable.key,
      isSensitive: variable.isSensitive,
      environment: args.environment,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      sessionId: args.sessionId,
    });

    return true;
  },
});

export const bulkCreate = mutation({
  args: {
    projectId: v.id("projects"),
    variables: v.array(
      v.object({
        key: v.string(),
        vaultRef: v.string(),
        description: v.optional(v.string()),
        environments: v.array(v.string()),
        isSensitive: v.optional(v.boolean()),
      })
    ),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Enforce maximum bulk import size to prevent DoS
    if (args.variables.length > MAX_BULK_IMPORT_SIZE) {
      throw new Error(
        `Bulk import is limited to ${MAX_BULK_IMPORT_SIZE} variables at a time. Please split your import into smaller batches.`
      );
    }

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead / developer
    const { orgRole, environmentScope } = await authorizeVariableAccess(ctx, {
      userId: args.createdBy,
      projectId: args.projectId,
      action: "project:create_variable",
    });

    // Environment scope: scoped developers may only import variables whose
    // environments all fall inside their assignment scope — validate the
    // whole batch up front so nothing is partially imported
    if (environmentScope) {
      for (const varData of args.variables) {
        assertWithinEnvironmentScope(environmentScope, varData.environments);
      }
    }

    // Rate limit: bulk import is expensive
    await rateLimiter.limit(ctx, "bulkImport", {
      key: project.organizationId,
      throws: true,
    });

    // Check tier limits for bulk import feature
    const bulkCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "bulk_import"
    );
    if (!bulkCheck.allowed) {
      throw new Error(
        "Bulk import requires a higher tier. Upgrade to import variables in bulk."
      );
    }

    // Check variable count limits (if applicable)
    const existingVarCount = await countActiveVariables(ctx.db, args.projectId);
    // checkNumericLimit uses `currentCount < limit` (pre-action semantics).
    // For bulk import, pass totalAfterImport - 1 so that exactly filling
    // the quota is allowed (e.g., 10 existing + 5 import vs limit 15 → ok).
    const totalAfterImport = existingVarCount + args.variables.length;
    const varLimitCheck = await checkNumericLimit(
      ctx.db,
      project.organizationId,
      "max_variables_per_project",
      totalAfterImport - 1
    );
    if (!varLimitCheck.allowed) {
      throw new Error(
        `Cannot import ${args.variables.length} variables. ${varLimitCheck.reason}`
      );
    }

    const createdIds = [];

    for (const varData of args.variables) {
      const existing = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_and_key", (q) =>
          q.eq("projectId", args.projectId).eq("key", varData.key)
        )
        .first();

      if (existing && !existing.deletedAt) {
        continue;
      }

      const variableId = await ctx.db.insert("environmentVariables", {
        key: varData.key,
        vaultRef: varData.vaultRef,
        description: varData.description,
        environments: varData.environments,
        projectId: args.projectId,
        isSensitive: varData.isSensitive ?? false,
        createdBy: args.createdBy,
        lastModifiedBy: args.createdBy,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("variableVersions", {
        variableId,
        version: 1,
        vaultRef: varData.vaultRef,
        description: varData.description,
        environments: varData.environments,
        changedBy: args.createdBy,
        changeReason: "Bulk import",
        createdAt: now,
      });

      // Developers have no blanket write access — an automatic grant keeps
      // write access to the variables they create.
      if (orgRole === "developer") {
        await ctx.db.insert("variablePermissions", {
          variableId,
          userId: args.createdBy,
          permission: "write",
          grantedBy: args.createdBy,
          grantedAt: now,
          isActive: true,
        });
      }

      createdIds.push(variableId);
    }

    // Log bulk import operation with detailed tracking
    await logBulkOperation(ctx, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.createdBy,
      action: "variable.bulk_imported",
      details: {
        totalCount: args.variables.length,
        successCount: createdIds.length,
        skippedCount: args.variables.length - createdIds.length,
        affectedItems: args.variables.map((v) => v.key),
        sensitiveCount: args.variables.filter((v) => v.isSensitive).length,
      },
    });

    return createdIds;
  },
});

// ==========================================
// SECRET ROTATION & EXPIRY
// ==========================================

/**
 * List variables expiring within 7 days for the dashboard widget.
 */
export const listExpiringVariables = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify caller is a member of the organization
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const rotationCheck = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "secret_rotation"
    );
    if (!rotationCheck.allowed) return [];

    const orgRole = normalizeOrgRole(membership.role);
    const isOwner = orgRole === "owner";

    // Non-owners only see expiring variables in projects they're assigned to,
    // and developers are further constrained by their environment scope.
    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const projects = allProjects.filter(
      (project) =>
        project.deletedAt === undefined &&
        (isOwner || assignedProjectIds.has(project._id as string))
    );

    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const results: Array<{
      _id: Id<"environmentVariables">;
      key: string;
      projectName: string;
      projectId: Id<"projects">;
      expiresAt: number;
      rotationStatus: string;
      rotationFrequencyDays: number;
    }> = [];

    for (const project of projects) {
      const environmentScope =
        orgRole === "developer"
          ? scopeByProject.get(project._id as string)
          : undefined;

      const allVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      // Scoped developers never receive out-of-scope variables.
      const variables = allVariables.filter(
        (variable) =>
          variable.deletedAt === undefined &&
          isEnvironmentScopeAllowed(environmentScope, variable.environments)
      );

      for (const v of variables) {
        if (
          v.expiresAt &&
          v.expiresAt <= sevenDaysFromNow &&
          v.rotationFrequencyDays
        ) {
          results.push({
            _id: v._id,
            key: v.key,
            projectName: project.name,
            projectId: project._id,
            expiresAt: v.expiresAt,
            rotationStatus: v.rotationStatus ?? "active",
            rotationFrequencyDays: v.rotationFrequencyDays,
          });
        }
      }
    }

    return results.sort((a, b) => a.expiresAt - b.expiresAt);
  },
});

/**
 * Get rotation history for a variable from audit logs.
 */
export const getRotationHistory = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify caller has access to the variable's organization
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) return [];

    const project = await ctx.db.get(variable.projectId);
    if (!project) return [];

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .order("desc")
      .collect();

    return logs
      .filter(
        (log) =>
          log.action === "variable.rotated" ||
          log.action === "variable.expired" ||
          log.action === "variable.rotation_reminder_sent"
      )
      .slice(0, 50);
  },
});

/**
 * Internal mutation called by the hourly cron to process
 * rotation expiry — transitions statuses and sends reminder emails.
 */
export const processRotationExpiry = internalMutation({
  handler: async (ctx) => {
    // Check if this cron is paused from admin panel
    const paused = await isCronPaused(ctx.db, "cron_pause_rotation_expiry");
    if (paused) return;

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    // Fetch all variables and filter in JS — deletedAt is an optional field,
    // so the non-deleted check happens after collection
    const allDocs = await ctx.db.query("environmentVariables").collect();
    const allVars = allDocs.filter((doc) => doc.deletedAt === undefined);

    const rotatingVariables = allVars.filter(
      (v) =>
        v.expiresAt !== undefined &&
        v.rotationFrequencyDays !== undefined &&
        v.rotationFrequencyDays > 0
    );

    let expired = 0;
    let expiringSoon = 0;

    for (const variable of rotatingVariables) {
      const expiresAt = variable.expiresAt!;

      // Expired: transition to "expired"
      if (expiresAt <= now && variable.rotationStatus !== "expired") {
        const patchData: Record<string, unknown> = {
          rotationStatus: "expired",
          updatedAt: now,
        };

        const project = await ctx.db.get(variable.projectId);
        if (project) {
          await createAuditLog(ctx, {
            organizationId: project.organizationId,
            projectId: variable.projectId,
            variableId: variable._id,
            userId: variable.lastModifiedBy,
            action: "variable.expired",
            details: {
              key: variable.key,
              expiresAt,
              rotationFrequencyDays: variable.rotationFrequencyDays,
              automated: true,
            },
            resourceType: "variable",
            severity: "warning",
          });

          // Send expiry email if not already reminded recently
          if (
            !variable.lastReminderSentAt ||
            now - variable.lastReminderSentAt > oneDay
          ) {
            patchData.lastReminderSentAt = now;
            await ctx.scheduler.runAfter(
              0,
              internal.emails.sendRotationReminderEmail,
              {
                variableName: variable.key,
                projectName: project.name,
                organizationId: project.organizationId,
                expiresAt,
                reminderType: "expired" as const,
              }
            );
          }
        }
        await ctx.db.patch(variable._id, patchData);
        expired++;
        continue;
      }

      // Expiring soon: transition to "expiring_soon"
      if (
        expiresAt <= now + sevenDays &&
        expiresAt > now &&
        variable.rotationStatus === "active"
      ) {
        const patchData: Record<string, unknown> = {
          rotationStatus: "expiring_soon",
          updatedAt: now,
        };

        const project = await ctx.db.get(variable.projectId);
        if (project) {
          // Send 7-day reminder if not already sent
          if (
            !variable.lastReminderSentAt ||
            now - variable.lastReminderSentAt > oneDay
          ) {
            patchData.lastReminderSentAt = now;
            await ctx.scheduler.runAfter(
              0,
              internal.emails.sendRotationReminderEmail,
              {
                variableName: variable.key,
                projectName: project.name,
                organizationId: project.organizationId,
                expiresAt,
                reminderType: "7_days" as const,
              }
            );
          }
        }
        await ctx.db.patch(variable._id, patchData);
        expiringSoon++;
        continue;
      }

      // 1-day reminder for already "expiring_soon" variables
      if (
        variable.rotationStatus === "expiring_soon" &&
        expiresAt <= now + oneDay &&
        expiresAt > now
      ) {
        const project = await ctx.db.get(variable.projectId);
        if (
          project &&
          (!variable.lastReminderSentAt ||
            now - variable.lastReminderSentAt > oneDay)
        ) {
          await ctx.db.patch(variable._id, { lastReminderSentAt: now });
          await ctx.scheduler.runAfter(
            0,
            internal.emails.sendRotationReminderEmail,
            {
              variableName: variable.key,
              projectName: project.name,
              organizationId: project.organizationId,
              expiresAt,
              reminderType: "1_day" as const,
            }
          );
        }
      }
    }

    return { processed: rotatingVariables.length, expired, expiringSoon };
  },
});
