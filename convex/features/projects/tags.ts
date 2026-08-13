import { ConvexError, v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createAuditLog } from "../../lib/audit";
import { assertOrgAction } from "../../lib/authz";
import { getActiveMembership } from "../../lib/authz";
import { requireAuthedUser } from "../../lib/identity";
import { rateLimiter } from "../../lib/rateLimits";

/**
 * Variable Tags — Organization-scoped tag management.
 *
 * Tags are colored labels (e.g., "Database", "AWS", "Frontend") that can
 * be assigned to environment variables for filtering and organization.
 */

// ==========================================
// CONSTANTS & HELPERS
// ==========================================

const MAX_TAGS_PER_ORG = 100;
const MAX_TAG_NAME_LENGTH = 50;
const MAX_CASCADE_UPDATES = 500;

const SYSTEM_TAGS: Array<{ name: string; color: string }> = [
  { name: "Database", color: "#3b82f6" },
  { name: "Auth", color: "#ef4444" },
  { name: "API Keys", color: "#f59e0b" },
  { name: "Frontend", color: "#10b981" },
  { name: "Backend", color: "#8b5cf6" },
  { name: "Email", color: "#ec4899" },
  { name: "Cache", color: "#06b6d4" },
  { name: "AWS", color: "#f97316" },
  { name: "Storage", color: "#6366f1" },
  { name: "Monitoring", color: "#84cc16" },
];

/** Available tag colors for the UI color picker */
export const TAG_COLORS = SYSTEM_TAGS.map((t) => t.color);

/** Validate a hex color string (e.g., "#3b82f6") */
function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/** Full variableTags doc shape, for `returns` validators */
const tagDocValidator = v.object({
  _id: v.id("variableTags"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  name: v.string(),
  color: v.string(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

/** Verify that the caller is an org member and return their role */
// The old private requireOrgMembership helper (its own slug-list checks,
// bypassing lib/authz) is folded into the central capability system:
// creation = org:create_tag, management = org:manage_tag.

// ==========================================
// QUERIES
// ==========================================

/**
 * List all non-deleted tags for an organization, sorted by name.
 * Bounded by MAX_TAGS_PER_ORG (100) enforced on creation.
 */
export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.array(tagDocValidator),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) {
      throw new ConvexError("You are not a member of this organization.");
    }

    const tags = await ctx.db
      .query("variableTags")
      .withIndex("by_organization_and_deleted_at", (q) =>
        q.eq("organizationId", args.organizationId).eq("deletedAt", undefined)
      )
      .take(MAX_TAGS_PER_ORG);

    return tags.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Create a new tag for an organization.
 * Validates name uniqueness within the org.
 */
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
  },
  returns: v.id("variableTags"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    // Auth: verify caller is a member of the org
    await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:create_tag"
    );

    // Rate limit
    await rateLimiter.limit(ctx, "tagMutate", {
      key: args.organizationId,
      throws: true,
    });

    // Check feature gate
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "variable_tags"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        "Variable tags requires a higher tier. Upgrade to enable tagging."
      );
    }

    // Validate color is a valid hex color
    if (!isValidHexColor(args.color)) {
      throw new ConvexError(
        "Invalid color format. Must be a hex color (e.g., #3b82f6)."
      );
    }

    // Validate and sanitize name
    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError("Tag name cannot be empty");
    }
    if (trimmedName.length > MAX_TAG_NAME_LENGTH) {
      throw new ConvexError(
        `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less`
      );
    }

    // Check uniqueness within org (case-insensitive) + enforce max tags limit
    const existing = await ctx.db
      .query("variableTags")
      .withIndex("by_organization_and_deleted_at", (q) =>
        q.eq("organizationId", args.organizationId).eq("deletedAt", undefined)
      )
      .take(MAX_TAGS_PER_ORG);

    if (existing.length >= MAX_TAGS_PER_ORG) {
      throw new ConvexError(
        `Maximum of ${MAX_TAGS_PER_ORG} tags per organization reached`
      );
    }

    const duplicate = existing.find(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new ConvexError(
        `Tag "${trimmedName}" already exists in this organization`
      );
    }

    const tagId = await ctx.db.insert("variableTags", {
      organizationId: args.organizationId,
      name: trimmedName,
      color: args.color,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "tag.created",
      details: { tagName: trimmedName, color: args.color },
    });

    return tagId;
  },
});

/**
 * Update an existing tag (rename or recolor).
 * Requires org membership (admin or team_lead).
 */
export const update = mutation({
  args: {
    tagId: v.id("variableTags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: v.id("variableTags"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.deletedAt) {
      throw new ConvexError("Tag not found");
    }

    // Auth: verify caller is admin or team_lead in the org
    await assertOrgAction(ctx, actor._id, tag.organizationId, "org:manage_tag");

    // Rate limit
    await rateLimiter.limit(ctx, "tagMutate", {
      key: tag.organizationId,
      throws: true,
    });

    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName) {
        throw new ConvexError("Tag name cannot be empty");
      }
      if (trimmedName.length > MAX_TAG_NAME_LENGTH) {
        throw new ConvexError(
          `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less`
        );
      }

      // Check uniqueness (exclude self)
      const existing = await ctx.db
        .query("variableTags")
        .withIndex("by_organization_and_deleted_at", (q) =>
          q.eq("organizationId", tag.organizationId).eq("deletedAt", undefined)
        )
        .take(MAX_TAGS_PER_ORG);

      const duplicate = existing.find(
        (t) =>
          t._id !== args.tagId &&
          t.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        throw new ConvexError(
          `Tag "${trimmedName}" already exists in this organization`
        );
      }

      updateData.name = trimmedName;
    }

    if (args.color !== undefined) {
      if (!isValidHexColor(args.color)) {
        throw new ConvexError(
          "Invalid color format. Must be a hex color (e.g., #3b82f6)."
        );
      }
      updateData.color = args.color;
    }

    await ctx.db.patch(args.tagId, updateData);

    await createAuditLog(ctx, {
      organizationId: tag.organizationId,
      userId: actor._id,
      action: "tag.updated",
      details: {
        tagName: tag.name,
        newName: args.name,
        newColor: args.color,
      },
    });

    return args.tagId;
  },
});

/**
 * Soft-delete a tag and strip it from all variables that reference it.
 * Cascade updates are batched to avoid unbounded loops.
 */
export const remove = mutation({
  args: {
    tagId: v.id("variableTags"),
  },
  returns: v.object({ deleted: v.boolean(), variablesAffected: v.number() }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.deletedAt) {
      throw new ConvexError("Tag not found");
    }

    // Auth: verify caller is admin or team_lead in the org
    await assertOrgAction(ctx, actor._id, tag.organizationId, "org:manage_tag");

    // Rate limit
    await rateLimiter.limit(ctx, "tagMutate", {
      key: tag.organizationId,
      throws: true,
    });

    // Soft-delete the tag
    await ctx.db.patch(args.tagId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Cascade: strip this tag ID from all active variables. Refuse oversized
    // cascades atomically instead of deleting the tag and leaving dangling IDs.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization_and_deleted_at", (q) =>
        q.eq("organizationId", tag.organizationId).eq("deletedAt", undefined)
      )
      .take(MAX_CASCADE_UPDATES + 1);

    if (projects.length > MAX_CASCADE_UPDATES) {
      throw new ConvexError(
        "This tag is used across too many projects to delete safely. Contact support."
      );
    }

    let strippedCount = 0;
    let totalProcessed = 0;

    for (const project of projects) {
      const remaining = MAX_CASCADE_UPDATES - totalProcessed;
      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .take(remaining + 1);

      if (variables.length > remaining) {
        throw new ConvexError(
          "This tag is used across too many variables to delete safely. Contact support."
        );
      }

      for (const variable of variables) {
        totalProcessed++;

        if (variable.tagIds && variable.tagIds.includes(args.tagId)) {
          const newTagIds = variable.tagIds.filter(
            (id: Id<"variableTags">) => id !== args.tagId
          );
          await ctx.db.patch(variable._id, {
            tagIds: newTagIds.length > 0 ? newTagIds : undefined,
          });
          strippedCount++;
        }
      }
    }

    await createAuditLog(ctx, {
      organizationId: tag.organizationId,
      userId: actor._id,
      action: "tag.deleted",
      details: {
        tagName: tag.name,
        variablesAffected: strippedCount,
      },
    });

    return { deleted: true, variablesAffected: strippedCount };
  },
});
