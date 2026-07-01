import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { assertOrgMembership } from "./authz";
import { createAuditLog } from "./auditHelpers";

/**
 * Environment Template Queries and Mutations
 *
 * Security Note: Template queries allow listing built-in and published templates
 * without authentication since they contain no sensitive data. Custom organization
 * templates are filtered by membership. All mutations require authentication.
 */

// ==========================================
// QUERIES
// ==========================================

/**
 * List all available templates (built-in + organization templates)
 * Built-in and published templates are accessible to all users.
 * Organization-specific templates require membership.
 */
export const listAll = query({
  args: {
    organizationId: v.optional(v.id("organizations")),
    projectType: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let templates;

    if (args.projectType) {
      // Filter by project type
      templates = (
        await ctx.db
          .query("environmentTemplates")
          .withIndex("by_project_type", (q) =>
            q.eq("projectType", args.projectType!)
          )
          .collect()
      ).filter((template) => !template.deletedAt);
    } else {
      // Get all templates
      templates = (await ctx.db.query("environmentTemplates").collect()).filter(
        (template) => !template.deletedAt
      );
    }

    // Filter to show:
    // 1. All built-in templates
    // 2. Organization's own templates
    // 3. Other published templates
    const filteredTemplates = templates.filter((template) => {
      if (template.isBuiltIn) return true;
      if (
        args.organizationId &&
        template.organizationId === args.organizationId
      )
        return true;
      if (template.isPublished) return true;
      return false;
    });

    // Fetch variables for each template
    const templatesWithVariables = await Promise.all(
      filteredTemplates.map(async (template) => {
        const variables = await ctx.db
          .query("templateVariables")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .collect();

        // Sort variables by order
        variables.sort((a, b) => a.order - b.order);

        return {
          ...template,
          variables,
        };
      })
    );

    return templatesWithVariables;
  },
});

/**
 * Get a single template by ID
 */
export const getById = query({
  args: { templateId: v.id("environmentTemplates") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template || template.deletedAt) return null;

    const variables = await ctx.db
      .query("templateVariables")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    // Sort variables by order
    variables.sort((a, b) => a.order - b.order);

    return {
      ...template,
      variables,
    };
  },
});

/**
 * List templates by organization (custom templates only)
 */
export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const templates = (
      await ctx.db
        .query("environmentTemplates")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
    ).filter((template) => !template.deletedAt);

    const templatesWithVariables = await Promise.all(
      templates.map(async (template) => {
        const variables = await ctx.db
          .query("templateVariables")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .collect();

        variables.sort((a, b) => a.order - b.order);

        return {
          ...template,
          variables,
        };
      })
    );

    return templatesWithVariables;
  },
});

/**
 * List only built-in templates
 */
export const listBuiltIn = query({
  args: {
    projectType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let templates;

    if (args.projectType) {
      templates = (
        await ctx.db
          .query("environmentTemplates")
          .withIndex("by_project_type", (q) =>
            q.eq("projectType", args.projectType!)
          )
          .collect()
      ).filter((template) => template.isBuiltIn && !template.deletedAt);
    } else {
      templates = (
        await ctx.db
          .query("environmentTemplates")
          .withIndex("by_is_built_in", (q) => q.eq("isBuiltIn", true))
          .collect()
      ).filter((template) => !template.deletedAt);
    }

    const templatesWithVariables = await Promise.all(
      templates.map(async (template) => {
        const variables = await ctx.db
          .query("templateVariables")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .collect();

        variables.sort((a, b) => a.order - b.order);

        return {
          ...template,
          variables,
        };
      })
    );

    return templatesWithVariables;
  },
});

/**
 * Search templates by name or tags
 */
export const search = query({
  args: {
    query: v.string(),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const searchLower = args.query.toLowerCase();

    // Get all accessible templates
    const allTemplates = (
      await ctx.db.query("environmentTemplates").collect()
    ).filter((template) => !template.deletedAt);

    // Filter by access and search query
    const matchingTemplates = allTemplates.filter((template) => {
      // Check access
      const hasAccess =
        template.isBuiltIn ||
        template.isPublished ||
        (args.organizationId &&
          template.organizationId === args.organizationId);

      if (!hasAccess) return false;

      // Check search match
      const nameMatch = template.name.toLowerCase().includes(searchLower);
      const descMatch = template.description
        .toLowerCase()
        .includes(searchLower);
      const tagMatch = template.tags.some((tag) =>
        tag.toLowerCase().includes(searchLower)
      );
      const typeMatch = template.projectType
        .toLowerCase()
        .includes(searchLower);

      return nameMatch || descMatch || tagMatch || typeMatch;
    });

    const templatesWithVariables = await Promise.all(
      matchingTemplates.map(async (template) => {
        const variables = await ctx.db
          .query("templateVariables")
          .withIndex("by_template", (q) => q.eq("templateId", template._id))
          .collect();

        variables.sort((a, b) => a.order - b.order);

        return {
          ...template,
          variables,
        };
      })
    );

    return templatesWithVariables;
  },
});

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Create a new custom template
 * Requires authentication and organization membership with at least the
 * team_lead role (owner / project_manager / team_lead).
 * The createdBy parameter must match a valid user who is a member of the organization.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    projectType: v.string(),
    icon: v.string(),
    color: v.string(),
    version: v.optional(v.string()),
    tags: v.array(v.string()),
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    isPublished: v.optional(v.boolean()),
    variables: v.array(
      v.object({
        key: v.string(),
        description: v.string(),
        defaultValue: v.optional(v.string()),
        placeholder: v.optional(v.string()),
        environments: v.array(v.string()),
        isSensitive: v.boolean(),
        isRequired: v.boolean(),
        category: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate input lengths
    if (args.name.length > 100) {
      throw new Error("Template name must be 100 characters or less");
    }
    if (args.description.length > 500) {
      throw new Error("Template description must be 500 characters or less");
    }
    if (args.variables.length > 50) {
      throw new Error("Template cannot have more than 50 variables");
    }

    // Verify user exists
    const user = await ctx.db.get(args.createdBy);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify organization exists
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Verify user has at least the team_lead role in the organization
    await assertOrgMembership(
      ctx,
      args.createdBy,
      args.organizationId,
      "team_lead"
    );

    // Check for duplicate variable keys within the template
    const variableKeys = new Set<string>();
    for (const variable of args.variables) {
      if (variableKeys.has(variable.key)) {
        throw new Error(`Duplicate variable key: ${variable.key}`);
      }
      variableKeys.add(variable.key);
    }

    // Create the template
    const templateId = await ctx.db.insert("environmentTemplates", {
      name: args.name,
      description: args.description,
      projectType: args.projectType,
      icon: args.icon,
      color: args.color,
      version: args.version,
      tags: args.tags,
      isBuiltIn: false,
      organizationId: args.organizationId,
      createdBy: args.createdBy,
      isPublished: args.isPublished ?? false,
      createdAt: now,
      updatedAt: now,
    });

    // Create the template variables
    for (let i = 0; i < args.variables.length; i++) {
      const variable = args.variables[i];
      await ctx.db.insert("templateVariables", {
        templateId,
        key: variable.key,
        description: variable.description,
        defaultValue: variable.defaultValue,
        placeholder: variable.placeholder,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        isRequired: variable.isRequired,
        category: variable.category,
        order: i,
      });
    }

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: args.createdBy,
      action: "template.created",
      details: {
        templateName: args.name,
        projectType: args.projectType,
        variableCount: args.variables.length,
        isPublished: args.isPublished ?? false,
      },
    });

    return templateId;
  },
});

/**
 * Update an existing template
 * Requires at least the project_manager role in the template's organization.
 */
export const update = mutation({
  args: {
    templateId: v.id("environmentTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    projectType: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    version: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    isPublished: v.optional(v.boolean()),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template || template.deletedAt) {
      throw new Error("Template not found");
    }

    if (template.isBuiltIn) {
      throw new Error("Cannot modify built-in templates");
    }

    if (!template.organizationId) {
      throw new Error("Template has no organization");
    }

    // Verify user has at least the project_manager role in the organization
    await assertOrgMembership(
      ctx,
      args.updatedBy,
      template.organizationId,
      "project_manager"
    );

    const { templateId, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.projectType !== undefined)
      updateData.projectType = updates.projectType;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.version !== undefined) updateData.version = updates.version;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.isPublished !== undefined)
      updateData.isPublished = updates.isPublished;

    await ctx.db.patch(templateId, updateData);

    await createAuditLog(ctx, {
      organizationId: template.organizationId,
      userId: args.updatedBy,
      action: "template.updated",
      details: {
        templateName: template.name,
        updatedFields: Object.keys(updateData).filter((k) => k !== "updatedAt"),
      },
    });

    return templateId;
  },
});

/**
 * Add a variable to a template
 * Requires at least the project_manager role in the template's organization.
 */
export const addVariable = mutation({
  args: {
    templateId: v.id("environmentTemplates"),
    key: v.string(),
    description: v.string(),
    defaultValue: v.optional(v.string()),
    placeholder: v.optional(v.string()),
    environments: v.array(v.string()),
    isSensitive: v.boolean(),
    isRequired: v.boolean(),
    category: v.string(),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template || template.deletedAt) {
      throw new Error("Template not found");
    }

    if (template.isBuiltIn) {
      throw new Error("Cannot modify built-in templates");
    }

    if (!template.organizationId) {
      throw new Error("Template has no organization");
    }

    // Verify user has at least the project_manager role in the organization
    await assertOrgMembership(
      ctx,
      args.updatedBy,
      template.organizationId,
      "project_manager"
    );

    // Check for duplicate key
    const existing = await ctx.db
      .query("templateVariables")
      .withIndex("by_template_and_key", (q) =>
        q.eq("templateId", args.templateId).eq("key", args.key)
      )
      .first();

    if (existing) {
      throw new Error(
        `Variable with key "${args.key}" already exists in this template`
      );
    }

    // Get current max order
    const existingVariables = await ctx.db
      .query("templateVariables")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    const maxOrder = existingVariables.reduce(
      (max, v) => Math.max(max, v.order),
      -1
    );

    const variableId = await ctx.db.insert("templateVariables", {
      templateId: args.templateId,
      key: args.key,
      description: args.description,
      defaultValue: args.defaultValue,
      placeholder: args.placeholder,
      environments: args.environments,
      isSensitive: args.isSensitive,
      isRequired: args.isRequired,
      category: args.category,
      order: maxOrder + 1,
    });

    // Update template timestamp
    await ctx.db.patch(args.templateId, { updatedAt: Date.now() });

    await createAuditLog(ctx, {
      organizationId: template.organizationId,
      userId: args.updatedBy,
      action: "template.updated",
      details: {
        templateName: template.name,
        variableAdded: args.key,
      },
    });

    return variableId;
  },
});

/**
 * Update a template variable
 * Requires at least the project_manager role in the template's organization.
 */
export const updateVariable = mutation({
  args: {
    variableId: v.id("templateVariables"),
    key: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultValue: v.optional(v.string()),
    placeholder: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    isSensitive: v.optional(v.boolean()),
    isRequired: v.optional(v.boolean()),
    category: v.optional(v.string()),
    order: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    const template = await ctx.db.get(variable.templateId);
    if (!template || template.deletedAt) {
      throw new Error("Template not found");
    }

    if (template.isBuiltIn) {
      throw new Error("Cannot modify built-in templates");
    }

    if (!template.organizationId) {
      throw new Error("Template has no organization");
    }

    // Verify user has at least the project_manager role in the organization
    await assertOrgMembership(
      ctx,
      args.updatedBy,
      template.organizationId,
      "project_manager"
    );

    const { variableId, ...updates } = args;
    const updateData: Record<string, unknown> = {};

    if (updates.key !== undefined) updateData.key = updates.key;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.defaultValue !== undefined)
      updateData.defaultValue = updates.defaultValue;
    if (updates.placeholder !== undefined)
      updateData.placeholder = updates.placeholder;
    if (updates.environments !== undefined)
      updateData.environments = updates.environments;
    if (updates.isSensitive !== undefined)
      updateData.isSensitive = updates.isSensitive;
    if (updates.isRequired !== undefined)
      updateData.isRequired = updates.isRequired;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.order !== undefined) updateData.order = updates.order;

    await ctx.db.patch(variableId, updateData);

    // Update template timestamp
    await ctx.db.patch(variable.templateId, { updatedAt: Date.now() });

    await createAuditLog(ctx, {
      organizationId: template.organizationId,
      userId: args.updatedBy,
      action: "template.updated",
      details: {
        templateName: template.name,
        variableUpdated: variable.key,
        updatedFields: Object.keys(updateData),
      },
    });

    return variableId;
  },
});

/**
 * Remove a variable from a template
 * Requires at least the project_manager role in the template's organization.
 */
export const removeVariable = mutation({
  args: {
    variableId: v.id("templateVariables"),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    const template = await ctx.db.get(variable.templateId);
    if (!template || template.deletedAt) {
      throw new Error("Template not found");
    }

    if (template.isBuiltIn) {
      throw new Error("Cannot modify built-in templates");
    }

    if (!template.organizationId) {
      throw new Error("Template has no organization");
    }

    // Verify user has at least the project_manager role in the organization
    await assertOrgMembership(
      ctx,
      args.updatedBy,
      template.organizationId,
      "project_manager"
    );

    await ctx.db.delete(args.variableId);

    // Update template timestamp
    await ctx.db.patch(variable.templateId, { updatedAt: Date.now() });

    await createAuditLog(ctx, {
      organizationId: template.organizationId,
      userId: args.updatedBy,
      action: "template.updated",
      details: {
        templateName: template.name,
        variableRemoved: variable.key,
      },
    });

    return args.variableId;
  },
});

/**
 * Soft delete a template
 * Requires at least the project_manager role in the template's organization.
 */
export const remove = mutation({
  args: {
    templateId: v.id("environmentTemplates"),
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    if (template.isBuiltIn) {
      throw new Error("Cannot delete built-in templates");
    }

    if (!template.organizationId) {
      throw new Error("Template has no organization");
    }

    // Verify user has at least the project_manager role in the organization
    await assertOrgMembership(
      ctx,
      args.deletedBy,
      template.organizationId,
      "project_manager"
    );

    await ctx.db.patch(args.templateId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await createAuditLog(ctx, {
      organizationId: template.organizationId,
      userId: args.deletedBy,
      action: "template.deleted",
      details: {
        templateName: template.name,
        projectType: template.projectType,
      },
    });

    return args.templateId;
  },
});

/**
 * Duplicate a template (for customization)
 * Requires at least the team_lead role in the destination organization
 * (same rule as creating a template).
 */
export const duplicate = mutation({
  args: {
    templateId: v.id("environmentTemplates"),
    newName: v.string(),
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const sourceTemplate = await ctx.db.get(args.templateId);
    if (!sourceTemplate || sourceTemplate.deletedAt) {
      throw new Error("Source template not found");
    }

    // Verify user has at least the team_lead role in the destination org
    await assertOrgMembership(
      ctx,
      args.createdBy,
      args.organizationId,
      "team_lead"
    );

    const now = Date.now();

    // Create the new template
    const newTemplateId = await ctx.db.insert("environmentTemplates", {
      name: args.newName,
      description: sourceTemplate.description,
      projectType: sourceTemplate.projectType,
      icon: sourceTemplate.icon,
      color: sourceTemplate.color,
      version: sourceTemplate.version,
      tags: [...sourceTemplate.tags],
      isBuiltIn: false,
      organizationId: args.organizationId,
      createdBy: args.createdBy,
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    });

    // Copy all variables
    const sourceVariables = await ctx.db
      .query("templateVariables")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    for (const variable of sourceVariables) {
      await ctx.db.insert("templateVariables", {
        templateId: newTemplateId,
        key: variable.key,
        description: variable.description,
        defaultValue: variable.defaultValue,
        placeholder: variable.placeholder,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        isRequired: variable.isRequired,
        category: variable.category,
        order: variable.order,
      });
    }

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: args.createdBy,
      action: "template.created",
      details: {
        templateName: args.newName,
        duplicatedFrom: args.templateId,
        sourceTemplateName: sourceTemplate.name,
        variableCount: sourceVariables.length,
      },
    });

    return newTemplateId;
  },
});

/**
 * Seed built-in templates from constants
 * This is an internal mutation - only callable from other Convex functions
 * or via the Convex dashboard, not from client code.
 */
export const seedBuiltInTemplates = internalMutation({
  args: {
    templates: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        projectType: v.string(),
        icon: v.string(),
        color: v.string(),
        version: v.optional(v.string()),
        tags: v.array(v.string()),
        variables: v.array(
          v.object({
            key: v.string(),
            description: v.string(),
            defaultValue: v.optional(v.string()),
            placeholder: v.optional(v.string()),
            environments: v.array(v.string()),
            isSensitive: v.boolean(),
            isRequired: v.boolean(),
            category: v.string(),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const createdIds: string[] = [];

    for (const templateData of args.templates) {
      // Check if a built-in template with the same name already exists
      const existingTemplates = (
        await ctx.db
          .query("environmentTemplates")
          .withIndex("by_is_built_in", (q) => q.eq("isBuiltIn", true))
          .collect()
      ).filter(
        (template) => template.name === templateData.name && !template.deletedAt
      );

      if (existingTemplates.length > 0) {
        // Skip if already exists
        continue;
      }

      // Create the template
      const templateId = await ctx.db.insert("environmentTemplates", {
        name: templateData.name,
        description: templateData.description,
        projectType: templateData.projectType,
        icon: templateData.icon,
        color: templateData.color,
        version: templateData.version,
        tags: templateData.tags,
        isBuiltIn: true,
        isPublished: true,
        createdAt: now,
        updatedAt: now,
      });

      // Create the template variables
      for (let i = 0; i < templateData.variables.length; i++) {
        const variable = templateData.variables[i];
        await ctx.db.insert("templateVariables", {
          templateId,
          key: variable.key,
          description: variable.description,
          defaultValue: variable.defaultValue,
          placeholder: variable.placeholder,
          environments: variable.environments,
          isSensitive: variable.isSensitive,
          isRequired: variable.isRequired,
          category: variable.category,
          order: i,
        });
      }

      createdIds.push(templateId);
    }

    return createdIds;
  },
});
