import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkBooleanFeature } from "./featureRegistry";
import { createAuditLog } from "./auditHelpers";
import { rateLimiter } from "./rateLimits";

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
const CASCADE_BATCH_SIZE = 100;
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

/** Verify that the caller is an org member and return their role */
async function requireOrgMembership(
  ctx: { db: any },
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  requiredRoles?: string[]
): Promise<{ role: string }> {
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Not authorized");
  }

  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q: any) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) {
    throw new Error("Not authorized");
  }

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    throw new Error("Insufficient permissions");
  }

  return { role: membership.role };
}

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
  handler: async (ctx, args) => {
    const tags = await ctx.db
      .query("variableTags")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    return tags.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Get a single tag by ID.
 */
export const getById = query({
  args: {
    tagId: v.id("variableTags"),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.deletedAt) return null;
    return tag;
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
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Auth: verify caller is a member of the org
    await requireOrgMembership(ctx, args.createdBy, args.organizationId);

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
      throw new Error(
        "Variable tags requires a higher tier. Upgrade to enable tagging."
      );
    }

    // Validate color is a valid hex color
    if (!isValidHexColor(args.color)) {
      throw new Error(
        "Invalid color format. Must be a hex color (e.g., #3b82f6)."
      );
    }

    // Validate and sanitize name
    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new Error("Tag name cannot be empty");
    }
    if (trimmedName.length > MAX_TAG_NAME_LENGTH) {
      throw new Error(
        `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less`
      );
    }

    // Check uniqueness within org (case-insensitive) + enforce max tags limit
    const existing = await ctx.db
      .query("variableTags")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    if (existing.length >= MAX_TAGS_PER_ORG) {
      throw new Error(
        `Maximum of ${MAX_TAGS_PER_ORG} tags per organization reached`
      );
    }

    const duplicate = existing.find(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(
        `Tag "${trimmedName}" already exists in this organization`
      );
    }

    const tagId = await ctx.db.insert("variableTags", {
      organizationId: args.organizationId,
      name: trimmedName,
      color: args.color,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: args.createdBy,
      action: "org.updated",
      details: { tagCreated: trimmedName, color: args.color },
      resourceType: "organization",
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
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.deletedAt) {
      throw new Error("Tag not found");
    }

    // Auth: verify caller is admin or team_lead in the org
    await requireOrgMembership(ctx, args.updatedBy, tag.organizationId, [
      "admin",
      "team_lead",
    ]);

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
        throw new Error("Tag name cannot be empty");
      }
      if (trimmedName.length > MAX_TAG_NAME_LENGTH) {
        throw new Error(
          `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less`
        );
      }

      // Check uniqueness (exclude self)
      const existing = await ctx.db
        .query("variableTags")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", tag.organizationId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      const duplicate = existing.find(
        (t) =>
          t._id !== args.tagId &&
          t.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        throw new Error(
          `Tag "${trimmedName}" already exists in this organization`
        );
      }

      updateData.name = trimmedName;
    }

    if (args.color !== undefined) {
      if (!isValidHexColor(args.color)) {
        throw new Error(
          "Invalid color format. Must be a hex color (e.g., #3b82f6)."
        );
      }
      updateData.color = args.color;
    }

    await ctx.db.patch(args.tagId, updateData);

    await createAuditLog(ctx, {
      organizationId: tag.organizationId,
      userId: args.updatedBy,
      action: "org.updated",
      details: {
        tagUpdated: tag.name,
        newName: args.name,
        newColor: args.color,
      },
      resourceType: "organization",
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
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.deletedAt) {
      throw new Error("Tag not found");
    }

    // Auth: verify caller is admin or team_lead in the org
    await requireOrgMembership(ctx, args.deletedBy, tag.organizationId, [
      "admin",
      "team_lead",
    ]);

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

    // Cascade: strip this tag ID from all variables that reference it
    // Process in batches to avoid unbounded loops
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", tag.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    let strippedCount = 0;
    let totalProcessed = 0;

    for (const project of projects) {
      if (totalProcessed >= MAX_CASCADE_UPDATES) break;

      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(CASCADE_BATCH_SIZE);

      for (const variable of variables) {
        if (totalProcessed >= MAX_CASCADE_UPDATES) break;
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
      userId: args.deletedBy,
      action: "org.updated",
      details: {
        tagDeleted: tag.name,
        variablesAffected: strippedCount,
      },
      resourceType: "organization",
    });

    return { deleted: true, variablesAffected: strippedCount };
  },
});

/**
 * Seed system tags for an organization (called lazily or via migration).
 * Idempotent — skips tags that already exist by name.
 * Restricted to org admins only.
 */
export const seedSystemTags = mutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Auth: only admins can seed system tags
    await requireOrgMembership(ctx, args.createdBy, args.organizationId, [
      "admin",
    ]);

    // Rate limit
    await rateLimiter.limit(ctx, "tagMutate", {
      key: args.organizationId,
      throws: true,
    });

    const existing = await ctx.db
      .query("variableTags")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));
    let created = 0;

    // Respect max tags per org limit when seeding
    const availableSlots = MAX_TAGS_PER_ORG - existing.length;

    for (const tag of SYSTEM_TAGS) {
      if (created >= availableSlots) break;
      if (existingNames.has(tag.name.toLowerCase())) continue;

      await ctx.db.insert("variableTags", {
        organizationId: args.organizationId,
        name: tag.name,
        color: tag.color,
        createdBy: args.createdBy,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created, skipped: SYSTEM_TAGS.length - created };
  },
});
