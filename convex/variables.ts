import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getTierLimits, MAX_BULK_IMPORT_SIZE } from "./tierLimits";
import {
  createAuditLog,
  logVariableAccess,
  logBulkOperation,
  logSecurityEvent,
} from "./auditHelpers";
import { rateLimiter } from "./rateLimits";
import { authorizeVariableAccess } from "./authHelpers";

/**
 * Environment Variable Queries and Mutations
 */

// ==========================================
// QUERIES
// ==========================================

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

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
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const variablesNested = await Promise.all(
      projects.map(async (project) => {
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();

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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
    version: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("variableVersions")
      .withIndex("by_variable_and_version", (q) =>
        q.eq("variableId", args.variableId).eq("version", args.version)
      )
      .first();
  },
});

/**
 * List variables with role-based and per-variable access information
 *
 * Access rules:
 * - Admins: Full access to all variables
 * - Team Leads: Full access to all variables
 * - Members: Only variables with explicit per-variable permissions
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

    // Get user's org membership to determine their role
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      return [];
    }

    const isOrgAdmin = membership.role === "admin";

    // For non-admins, check project membership
    let projectRole: string | null = null;
    if (!isOrgAdmin) {
      const projectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.userId)
        )
        .first();

      if (!projectMembership) {
        return []; // No project access
      }
      projectRole = projectMembership.role;
    }

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const variablesWithAccess = await Promise.all(
      variables.map(async (variable) => {
        const permission = await ctx.db
          .query("variablePermissions")
          .withIndex("by_variable_and_user", (q) =>
            q.eq("variableId", variable._id).eq("userId", args.userId)
          )
          .filter((q) => q.eq(q.field("isActive"), true))
          .first();

        const now = Date.now();
        const isPermissionValid =
          permission && (!permission.expiresAt || permission.expiresAt > now);

        // Determine access based on org role + project role
        let hasAccess = false;
        let effectivePermission: string | null = null;
        let roleAccess = false;
        let canManagePermissions = false;

        if (isOrgAdmin) {
          // Org admins: full access to everything
          hasAccess = true;
          roleAccess = true;
          canManagePermissions = true;
          effectivePermission = "admin";
        } else if (projectRole === "manager") {
          // Project managers: full read/write + manage permissions
          hasAccess = true;
          roleAccess = true;
          canManagePermissions = true;
          effectivePermission = "admin";
        } else if (projectRole === "developer") {
          // Developers: can read all variables
          hasAccess = true;
          roleAccess = true;
          effectivePermission = isPermissionValid
            ? permission.permission
            : "read";
        } else if (projectRole === "viewer") {
          // Viewers: only variables with explicit per-variable permissions
          hasAccess = !!isPermissionValid;
          effectivePermission = isPermissionValid
            ? permission.permission
            : null;
        }

        // Explicit permission overrides role-based access
        if (isPermissionValid) {
          effectivePermission = permission.permission;
          hasAccess = true;
        }

        return {
          ...variable,
          hasAccess,
          permission: effectivePermission,
          roleAccess,
          userRole: membership.role,
          projectRole,
          canManagePermissions,
        };
      })
    );

    // Filter out variables the user can't access
    if (!isOrgAdmin && projectRole !== "manager") {
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
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

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
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const searchLower = args.searchTerm.toLowerCase();
    const results = [];

    for (const project of projects) {
      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

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
      projectId: string;
      projectName: string;
      projectSlug: string;
      projectIcon?: string;
      projectColor?: string;
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
    }> = [];

    // Get all org memberships for this user
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Pre-fetch project memberships once (used for non-admin/non-team-lead roles)
    const allProjectMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Group project memberships by org (resolved lazily)
    const projectMembershipsByOrg = new Map<
      string,
      Array<{ projectId: Id<"projects">; role: string }>
    >();
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

    for (const pm of allProjectMemberships) {
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
        if (!projectMembershipsByOrg.has(orgId)) {
          projectMembershipsByOrg.set(orgId, []);
        }
        projectMembershipsByOrg.get(orgId)!.push({
          projectId: pm.projectId,
          role: pm.role,
        });
      }
    }

    for (const membership of memberships) {
      const org = await ctx.db.get(membership.organizationId);
      if (!org) continue;

      const isAdmin = membership.role === "admin";
      const isTeamLead = membership.role === "team_lead";

      // Get projects accessible to this user in this org
      let projectsWithRole: Array<{
        _id: Id<"projects">;
        name: string;
        slug: string;
        icon?: string;
        color?: string;
        projectRole?: string;
      }> = [];

      if (isAdmin || isTeamLead) {
        // Admins and team leads can see all projects
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId)
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        projectsWithRole = projects.map((p) => ({
          _id: p._id,
          name: p.name,
          slug: p.slug,
          icon: p.icon,
          color: p.color,
        }));
      } else {
        // Members: use pre-fetched project memberships
        const orgPMs =
          projectMembershipsByOrg.get(membership.organizationId) ?? [];
        for (const pm of orgPMs) {
          const project = resolvedProjects.get(pm.projectId);
          if (project) {
            projectsWithRole.push({
              _id: project._id,
              name: project.name,
              slug: project.slug,
              icon: project.icon,
              color: project.color,
              projectRole: pm.role,
            });
          }
        }
      }

      for (const project of projectsWithRole) {
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();

        const matches = variables.filter(
          (v) =>
            v.key.toLowerCase().includes(searchLower) ||
            v.description?.toLowerCase().includes(searchLower) ||
            v.environments?.some((e) => e.toLowerCase().includes(searchLower))
        );

        for (const variable of matches) {
          // RBAC: admins and team leads always have access
          let hasAccess = isAdmin || isTeamLead;

          if (!hasAccess) {
            const role = project.projectRole;
            if (role === "manager" || role === "developer") {
              hasAccess = true;
            } else if (role === "viewer") {
              // Viewers need explicit per-variable permission
              const perm = await ctx.db
                .query("variablePermissions")
                .withIndex("by_variable_and_user", (q) =>
                  q.eq("variableId", variable._id).eq("userId", args.userId)
                )
                .filter((q) => q.eq(q.field("isActive"), true))
                .first();
              hasAccess =
                !!perm && (!perm.expiresAt || perm.expiresAt > Date.now());
            }
          }

          if (hasAccess) {
            results.push({
              _id: variable._id as string,
              key: variable.key,
              description: variable.description,
              environments: variable.environments,
              isSensitive: variable.isSensitive,
              projectId: project._id as string,
              projectName: project.name,
              projectSlug: project.slug,
              projectIcon: project.icon,
              projectColor: project.color,
              organizationId: org._id as string,
              organizationName: org.name,
              organizationSlug: org.slug,
            });
          }

          if (results.length >= 50) break;
        }
        if (results.length >= 50) break;
      }
      if (results.length >= 50) break;
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
    enforceTierLimits: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const enforce = args.enforceTierLimits ?? true;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization: verify caller has permission
    await authorizeVariableAccess(ctx, {
      userId: args.createdBy,
      organizationId: project.organizationId,
      projectId: args.projectId,
      requiredOrgRoles: ["admin", "team_lead"],
      requiredProjectRoles: ["manager", "developer"],
    });

    // Rate limit: prevent excessive variable creation
    await rateLimiter.limit(ctx, "variableCreate", {
      key: project.organizationId,
      throws: true,
    });

    // Check tier limits for variable creation
    const org = await ctx.db.get(project.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const limits = getTierLimits(org.tier, enforce);
    if (limits.maxVariablesPerProject !== null) {
      const variableCount = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      if (variableCount.length >= limits.maxVariablesPerProject) {
        throw new Error(
          `Variable limit reached (${variableCount.length}/${limits.maxVariablesPerProject}). Upgrade to Pro for unlimited variables.`
        );
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { variableId, updatedBy, changeReason, ...updates } = args;

    const variable = await ctx.db.get(variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: verify caller has permission
    await authorizeVariableAccess(ctx, {
      userId: updatedBy,
      organizationId: project.organizationId,
      projectId: variable.projectId,
      requiredOrgRoles: ["admin", "team_lead"],
      requiredProjectRoles: ["manager", "developer"],
    });

    const newVersion = variable.version + 1;

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

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId,
      userId: updatedBy,
      action: "variable.updated",
      details: {
        key: variable.key,
        newVersion,
        previousVersion: variable.version,
        changeReason,
        fieldsUpdated: Object.keys(updates).filter(
          (k) => updates[k as keyof typeof updates] !== undefined
        ),
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

    // Authorization: verify caller has permission
    await authorizeVariableAccess(ctx, {
      userId: args.deletedBy,
      organizationId: project.organizationId,
      projectId: variable.projectId,
      requiredOrgRoles: ["admin", "team_lead"],
      requiredProjectRoles: ["manager"],
    });

    await ctx.db.patch(args.variableId, {
      deletedAt: now,
      updatedAt: now,
    });

    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

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

    // Authorization: verify caller has permission
    await authorizeVariableAccess(ctx, {
      userId: args.deletedBy,
      organizationId: project.organizationId,
      projectId: firstVariable.projectId,
      requiredOrgRoles: ["admin", "team_lead"],
      requiredProjectRoles: ["manager"],
    });

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
      const permissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variableId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

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

    // Authorization: verify caller has permission
    await authorizeVariableAccess(ctx, {
      userId: args.restoredBy,
      organizationId: project.organizationId,
      projectId: variable.projectId,
      requiredOrgRoles: ["admin", "team_lead"],
      requiredProjectRoles: ["manager"],
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

    // Authorization: admin only
    await authorizeVariableAccess(ctx, {
      userId: args.rolledBackBy,
      organizationId: project.organizationId,
      projectId: variable.projectId,
      requiredOrgRoles: ["admin"],
    });

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

    // Authorization: any member with project access
    await authorizeVariableAccess(ctx, {
      userId: args.accessedBy,
      organizationId: project.organizationId,
      projectId: variable.projectId,
      requiredOrgRoles: ["admin", "team_lead", "member"],
      requiredProjectRoles: ["manager", "developer", "viewer"],
    });

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
    enforceTierLimits: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const enforce = args.enforceTierLimits ?? true;

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

    // Authorization: verify caller has permission
    await authorizeVariableAccess(ctx, {
      userId: args.createdBy,
      organizationId: project.organizationId,
      projectId: args.projectId,
      requiredOrgRoles: ["admin", "team_lead"],
      requiredProjectRoles: ["manager", "developer"],
    });

    // Rate limit: bulk import is expensive
    await rateLimiter.limit(ctx, "bulkImport", {
      key: project.organizationId,
      throws: true,
    });

    // Check tier limits for bulk import feature
    const org = await ctx.db.get(project.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const limits = getTierLimits(org.tier, enforce);

    // Check if bulk import is enabled for this tier
    if (!limits.bulkImportEnabled) {
      throw new Error(
        "Bulk import requires Pro tier. Upgrade to import variables in bulk."
      );
    }

    // Check variable count limits (if applicable)
    if (limits.maxVariablesPerProject !== null) {
      const existingVariables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      const newVariablesCount = args.variables.length;
      const totalAfterImport = existingVariables.length + newVariablesCount;

      if (totalAfterImport > limits.maxVariablesPerProject) {
        throw new Error(
          `Cannot import ${newVariablesCount} variables. Limit is ${limits.maxVariablesPerProject}, you have ${existingVariables.length}. Upgrade to Pro for unlimited variables.`
        );
      }
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
