import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  projectType: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/templates/[id] - Get a single template
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const template = await convex.query(api.templates.getById, {
      templateId: id as Id<"environmentTemplates">,
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Failed to fetch template:", error);
    return NextResponse.json(
      { error: "Failed to fetch template" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/templates/[id] - Update a template
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateTemplateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get the template to check ownership
    const template = await convex.query(api.templates.getById, {
      templateId: id as Id<"environmentTemplates">,
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (template.isBuiltIn) {
      return NextResponse.json(
        { error: "Cannot modify built-in templates" },
        { status: 403 }
      );
    }

    if (!template.organizationId) {
      return NextResponse.json(
        { error: "Template has no organization" },
        { status: 400 }
      );
    }

    // Verify organization membership
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      template.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role !== "admin" && membership.role !== "team_lead") {
      return NextResponse.json(
        { error: "Insufficient permissions to update templates" },
        { status: 403 }
      );
    }

    await convex.mutation(api.templates.update, {
      templateId: id as Id<"environmentTemplates">,
      ...validation.data,
    });

    const updatedTemplate = await convex.query(api.templates.getById, {
      templateId: id as Id<"environmentTemplates">,
    });

    return NextResponse.json({ template: updatedTemplate });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update template";
    console.error("Failed to update template:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/templates/[id] - Delete a template
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get the template to check ownership
    const template = await convex.query(api.templates.getById, {
      templateId: id as Id<"environmentTemplates">,
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (template.isBuiltIn) {
      return NextResponse.json(
        { error: "Cannot delete built-in templates" },
        { status: 403 }
      );
    }

    if (!template.organizationId) {
      return NextResponse.json(
        { error: "Template has no organization" },
        { status: 400 }
      );
    }

    // Verify organization membership
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      template.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can delete templates" },
        { status: 403 }
      );
    }

    await convex.mutation(api.templates.remove, {
      templateId: id as Id<"environmentTemplates">,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete template";
    console.error("Failed to delete template:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
