import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().min(1, "Description is required").max(500),
  projectType: z.string().min(1, "Project type is required"),
  icon: z.string().min(1, "Icon is required"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format"),
  version: z.string().optional(),
  tags: z.array(z.string()).default([]),
  organizationId: z.string().min(1, "Organization ID is required"),
  isPublished: z.boolean().optional().default(false),
  variables: z
    .array(
      z.object({
        key: z
          .string()
          .min(1, "Key is required")
          .regex(/^[A-Z][A-Z0-9_]*$/, "Key must be uppercase with underscores"),
        description: z.string().min(1, "Description is required"),
        defaultValue: z.string().optional(),
        placeholder: z.string().optional(),
        environments: z
          .array(z.enum(["development", "staging", "production"]))
          .min(1),
        isSensitive: z.boolean(),
        isRequired: z.boolean(),
        category: z.string().min(1, "Category is required"),
      })
    )
    .default([]),
});

/**
 * GET /api/templates - List all available templates
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectType = searchParams.get("projectType");
    const organizationId = searchParams.get("organizationId");
    const builtInOnly = searchParams.get("builtInOnly") === "true";
    const search = searchParams.get("search");

    // If searching, use the search query
    if (search) {
      const templates = await convex.query(api.templates.search, {
        query: search,
        organizationId: organizationId as Id<"organizations"> | undefined,
      });
      return NextResponse.json({ templates });
    }

    // If built-in only, use the built-in query
    if (builtInOnly) {
      const templates = await convex.query(api.templates.listBuiltIn, {
        projectType: projectType || undefined,
      });
      return NextResponse.json({ templates });
    }

    // Otherwise, list all available templates
    const templates = await convex.query(api.templates.listAll, {
      organizationId: organizationId as Id<"organizations"> | undefined,
      projectType: projectType || undefined,
    });

    return NextResponse.json({ templates });
  } catch (error) {
    reportApiError(error, "GET /api/templates");
    console.error("Failed to fetch templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates - Create a new custom template
 */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Verify organization membership
    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      data.organizationId as Id<"organizations">
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Template creation requires owner or project_manager
    if (roleLevel(membership.role) < ROLE_LEVEL.project_manager) {
      return NextResponse.json(
        { error: "Insufficient permissions to create templates" },
        { status: 403 }
      );
    }

    const templateId = await convex.mutation(api.templates.create, {
      name: data.name,
      description: data.description,
      projectType: data.projectType,
      icon: data.icon,
      color: data.color,
      version: data.version,
      tags: data.tags,
      organizationId: data.organizationId as Id<"organizations">,
      createdBy: convexUser._id,
      isPublished: data.isPublished,
      variables: data.variables,
    });

    const template = await convex.query(api.templates.getById, { templateId });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    reportApiError(error, "POST /api/templates");
    const message =
      error instanceof Error ? error.message : "Failed to create template";
    console.error("Failed to create template:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
