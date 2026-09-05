import { v, ConvexError } from "convex/values";
import { mutation, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  checkBooleanFeature,
  checkNumericLimit,
  countActiveProjects,
} from "../featureRegistry/gates";
import { requireAuthedUser } from "../../lib/identity";
import {
  assertOrgAction,
  assertProjectAction,
  getRoleProfile,
  normalizeOrgRole,
  bypassesAssignment,
} from "../../lib/authz";
import { internal } from "../../_generated/api";
import {
  cancelPendingRequest,
  retenantChangeRequestsBatch,
} from "../changeRequests/mutations";

/** Rows per batch while draining a moved project's pending inbox. */
const CHANGE_REQUEST_MOVE_BATCH = 100;
/** Pending proposals one move may cancel inside its own transaction. */
const MAX_PENDING_CHANGE_REQUESTS_PER_MOVE = 500;

const PROJECT_NAME_MAX = 100;
const PROJECT_SLUG_MAX = 50;
const PROJECT_DESCRIPTION_MAX = 500;

function validateProjectInput(args: {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
}) {
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new ConvexError("Project name is required.");
    if (name.length > PROJECT_NAME_MAX) {
      throw new ConvexError("Project name must be 100 characters or less.");
    }
  }
  if (args.slug !== undefined) {
    if (!args.slug || args.slug.length > PROJECT_SLUG_MAX) {
      throw new ConvexError("Project slug must be 1 to 50 characters.");
    }
    if (!/^[a-z0-9-]+$/.test(args.slug)) {
      throw new ConvexError(
        "Project slug must contain only lowercase letters, numbers, and hyphens."
      );
    }
  }
  if (
    args.description !== undefined &&
    args.description.length > PROJECT_DESCRIPTION_MAX
  ) {
    throw new ConvexError(
      "Project description must be 500 characters or less."
    );
  }
  if (
    args.icon !== undefined &&
    args.icon !== "" &&
    !args.icon.startsWith("framework:") &&
    !/^[a-z0-9-]+$/.test(args.icon)
  ) {
    throw new ConvexError("Invalid project icon.");
  }
  if (args.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(args.color)) {
    throw new ConvexError("Project color must be a valid hex color.");
  }
}

// ==========================================
// MUTATIONS
// ==========================================

export const projectCreateArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  organizationId: v.id("organizations"),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
};

/**
 * The whole of project creation: validation, org authorization, tier limit,
 * slug uniqueness, the row, the creator assignment and the audit entry.
 *
 * Exported so the template flow creates its project through exactly this path
 * rather than a parallel copy. A second insert site would be one deploy away
 * from disagreeing with this one about who may create a project.
 */
export async function createProjectCore(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: {
    name: string;
    slug: string;
    description?: string;
    organizationId: Id<"organizations">;
    icon?: string;
    color?: string;
  }
): Promise<Id<"projects">> {
  {
    validateProjectInput(args);

    // Authorization: owners and project managers can create projects
    const { membership: creatorMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:create_project"
    );

    const now = Date.now();

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new ConvexError("Organization not found");
    }

    // Check tier limits for project creation
    const projectCount = await countActiveProjects(ctx.db, args.organizationId);
    const projectCheck = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "max_projects",
      projectCount
    );
    if (!projectCheck.allowed) {
      throw new ConvexError(projectCheck.reason!);
    }

    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_org_slug_deleted", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("slug", args.slug)
          .eq("deletedAt", undefined)
      )
      .first();

    if (existingProject) {
      throw new ConvexError("Project slug already exists in this organization");
    }

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      organizationId: args.organizationId,
      icon: args.icon,
      color: args.color,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-assign the creator to the project. Owners have implicit access to
    // every project; project managers need an explicit assignment.
    const creatorProfile = await getRoleProfile(ctx, creatorMembership.role);
    if (!bypassesAssignment(creatorProfile)) {
      await ctx.db.insert("projectMembers", {
        projectId,
        userId: actor._id,
        addedBy: actor._id,
        addedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      projectId,
      userId: actor._id,
      action: "project.created",
      details: JSON.stringify({ name: args.name, slug: args.slug }),
      createdAt: now,
    });

    return projectId;
  }
}

export const create = mutation({
  args: projectCreateArgs,
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return createProjectCore(ctx, actor, args);
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    vscodeAutoUnsyncOnClose: v.optional(v.boolean()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    validateProjectInput(args);

    // Authorization: org admins or project managers can update
    await assertProjectAction(ctx, actor._id, args.projectId, "project:update");

    const now = Date.now();
    const { projectId, ...updates } = args;

    const project = await ctx.db.get(projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    if (updates.vscodeAutoUnsyncOnClose !== undefined) {
      const gate = await checkBooleanFeature(
        ctx.db,
        project.organizationId,
        "vscode_unsync_customization"
      );
      if (!gate.allowed) {
        throw new ConvexError(
          "Customizing VS Code unsync-on-close requires a Pro plan."
        );
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.vscodeAutoUnsyncOnClose !== undefined)
      updateData.vscodeAutoUnsyncOnClose = updates.vscodeAutoUnsyncOnClose;

    await ctx.db.patch(projectId, updateData);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId,
      userId: actor._id,
      action: "project.updated",
      details: JSON.stringify(updates),
      createdAt: now,
    });

    return projectId;
  },
});

/**
 * Set or clear a member's override of the project's unsync-on-close default.
 * `value: null` clears the override (member inherits the project setting).
 * Pro-gated (vscode_unsync_customization), same permission as project update.
 */
export const setMemberUnsyncOverride = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    value: v.union(v.boolean(), v.null()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    await assertProjectAction(ctx, actor._id, args.projectId, "project:update");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    const gate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "vscode_unsync_customization"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        "Customizing VS Code unsync-on-close requires a Pro plan."
      );
    }

    const member = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();
    if (!member) {
      throw new ConvexError("User is not a member of this project.");
    }

    const now = Date.now();
    await ctx.db.patch(member._id, {
      vscodeAutoUnsyncOnClose: args.value ?? undefined,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.updated",
      details: JSON.stringify({
        memberUnsyncOverride: {
          targetUserId: args.userId,
          previous: member.vscodeAutoUnsyncOnClose ?? null,
          next: args.value,
        },
      }),
      createdAt: now,
    });

    return member._id;
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    // Authorization: only org admins can delete projects
    await assertOrgAction(
      ctx,
      actor._id,
      project.organizationId,
      "org:delete_project"
    );

    const now = Date.now();

    // Capture intent in one cheap transaction. The scheduled cascade is
    // atomic with this patch, so a successful response always has durable
    // cleanup work behind it. Project reads reject deletedAt immediately.
    await ctx.db.patch(args.projectId, {
      deletedAt: now,
      updatedAt: now,
      deletionStage: "variables",
      deletionCursor: undefined,
      deletionLeaseUntil: undefined,
      deletionAttempts: 0,
      deletionStartedBy: actor._id,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.deleted",
      details: JSON.stringify({
        cleanup: "queued",
        name: project.name,
      }),
      createdAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.features.projects.deletion.processDeletion,
      { projectId: args.projectId }
    );

    return args.projectId;
  },
});

/**
 * Move a project to another organization
 */
export const move = mutation({
  args: {
    projectId: v.id("projects"),
    targetOrganizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    if (project.organizationId === args.targetOrganizationId) {
      throw new ConvexError("Project is already in the target organization");
    }

    const sourceOrg = await ctx.db.get(project.organizationId);
    if (!sourceOrg) {
      throw new ConvexError("Source organization not found");
    }

    const targetOrg = await ctx.db.get(args.targetOrganizationId);
    if (!targetOrg) {
      throw new ConvexError("Target organization not found");
    }

    // Authorization: moving a project removes it from the source org
    // (delete-level power) and creates it in the target org (create-level power)
    await assertOrgAction(
      ctx,
      actor._id,
      project.organizationId,
      "org:delete_project"
    );
    await assertOrgAction(
      ctx,
      actor._id,
      args.targetOrganizationId,
      "org:create_project"
    );

    // Check if target org has room for another project
    const targetProjectCount = await countActiveProjects(
      ctx.db,
      args.targetOrganizationId
    );
    const moveCheck = await checkNumericLimit(
      ctx.db,
      args.targetOrganizationId,
      "max_projects",
      targetProjectCount
    );
    if (!moveCheck.allowed) {
      throw new ConvexError(
        `Target organization has reached its project limit. ${moveCheck.reason}`
      );
    }

    // Check slug uniqueness in target org
    const existingSlug = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q
          .eq("organizationId", args.targetOrganizationId)
          .eq("slug", project.slug)
      )
      .collect()
      .then((rows) => rows.find((doc) => doc.deletedAt === undefined) ?? null);

    if (existingSlug) {
      throw new ConvexError(
        `A project with slug "${project.slug}" already exists in the target organization`
      );
    }

    // Move the project
    await ctx.db.patch(args.projectId, {
      organizationId: args.targetOrganizationId,
      updatedAt: now,
    });

    const targetOwners = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.targetOrganizationId)
      )
      .collect()
      .then((members) =>
        members.filter((member) => normalizeOrgRole(member.role) === "owner")
      );
    const transferredByName = actor.name || actor.email;
    for (const owner of targetOwners) {
      const user = await ctx.db.get(owner.userId);
      if (!user?.email) continue;
      await ctx.scheduler.runAfter(
        0,
        internal.features.emails.emails.sendProjectTransferEmailInternal,
        {
          to: user.email,
          projectName: project.name,
          organizationName: targetOrg.name,
          transferredByName,
        }
      );
    }

    // Clean up source org relationships
    // Delete project members
    let removedMembers = 0;
    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const member of projectMembers) {
      await ctx.db.delete(member._id);
      removedMembers++;
    }

    // Revoke project access tokens
    let revokedTokens = 0;
    const accessTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));
    for (const token of accessTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: token.userId,
        reason: "Project moved to another organization",
        revokedBy: actor._id,
        revokedAt: now,
        acknowledged: false,
        expiresAt: revocationExpiresAt,
      });
      revokedTokens++;
    }

    // Deactivate variable permissions
    let deactivatedPermissions = 0;
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    for (const variable of variables) {
      const permissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
        .collect()
        .then((rows) => rows.filter((doc) => doc.isActive === true));
      for (const perm of permissions) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: actor._id,
        });
        deactivatedPermissions++;
      }
    }

    // Cancel pending variable requests
    let canceledRequests = 0;
    const pendingRequests = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .collect();
    for (const req of pendingRequests) {
      await ctx.db.patch(req._id, {
        status: "canceled",
        reviewReason: "Project moved to another organization",
        reviewedBy: actor._id,
        reviewedAt: now,
        updatedAt: now,
      });
      canceledRequests++;
    }

    // Protected-environment proposals: cancel the pending ones (their staged
    // secrets are purged with them), so the source org keeps no live approval
    // work. Canceling takes a row out of the pending range, so the batched
    // read drains it, but the transaction still has to fit: past the cap the
    // move is refused rather than half-applied.
    let canceledChangeRequests = 0;
    for (;;) {
      const pendingChangeRequests = await ctx.db
        .query("changeRequests")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "pending")
        )
        .take(CHANGE_REQUEST_MOVE_BATCH);
      if (pendingChangeRequests.length === 0) break;
      if (
        canceledChangeRequests + pendingChangeRequests.length >
        MAX_PENDING_CHANGE_REQUESTS_PER_MOVE
      ) {
        throw new ConvexError(
          `Drain the change request inbox below ${MAX_PENDING_CHANGE_REQUESTS_PER_MOVE} pending requests before moving this project`
        );
      }
      for (const request of pendingChangeRequests) {
        await cancelPendingRequest(
          ctx,
          request,
          actor._id,
          "Project moved to another organization"
        );
        canceledChangeRequests++;
      }
    }
    // Reviewed history moves with the project. Up to one batch moves in this
    // transaction so an ordinary inbox is consistent the moment the move
    // commits; only a larger history is finished by scheduled batches, during
    // which those rows are visible to neither organization.
    const retenanted = await retenantChangeRequestsBatch(
      ctx,
      args.projectId,
      args.targetOrganizationId,
      MAX_PENDING_CHANGE_REQUESTS_PER_MOVE
    );
    if (retenanted >= MAX_PENDING_CHANGE_REQUESTS_PER_MOVE) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.changeRequests.mutations.retenantChangeRequests,
        {
          projectId: args.projectId,
          organizationId: args.targetOrganizationId,
        }
      );
    }

    // Audit log in source org
    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.moved",
      details: JSON.stringify({
        targetOrganizationId: args.targetOrganizationId,
        targetOrganizationName: targetOrg.name,
        removedMembers,
        revokedTokens,
        deactivatedPermissions,
        canceledRequests,
        canceledChangeRequests,
      }),
      createdAt: now,
    });

    // Audit log in target org
    await ctx.db.insert("auditLogs", {
      organizationId: args.targetOrganizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.moved",
      details: JSON.stringify({
        sourceOrganizationId: project.organizationId,
        sourceOrganizationName: sourceOrg.name,
        variableCount: variables.length,
      }),
      createdAt: now,
    });

    return args.projectId;
  },
});
