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
import { handleApiError } from "@/lib/api-errors";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";

const updateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100).optional(),
  description: z.string().max(500).optional(),
  icon: z
    .string()
    .refine(
      (val) => !val || val.startsWith("framework:") || /^[a-z0-9-]+$/.test(val),
      "Invalid icon value"
    )
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code")
    .optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id] - Get a single project
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the project
    const project = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get or create the Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Verify user is a member of the project's organization
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      project.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Owners bypass assignment; everyone else needs a project assignment
    if (normalizeOrgRole(membership.role) !== "owner") {
      const projectMembership = await convex.query(
        api.projectMembers.getProjectMembership,
        {
          projectId: id as Id<"projects">,
          userId: convexUser._id,
        }
      );

      if (!projectMembership) {
        return NextResponse.json(
          { error: "You do not have access to this project" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id] - Update a project
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = updateProjectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Get the project first to check organization
    const existingProject = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get or create the Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Verify user is a member of the project's organization
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      existingProject.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Project update requires owner or project_manager (project:update).
    // Convex enforces project-assignment scoping for non-owners.
    if (roleLevel(membership.role) < ROLE_LEVEL.project_manager) {
      return NextResponse.json(
        { error: "Insufficient permissions to update projects" },
        { status: 403 }
      );
    }

    const { name, description, icon, color } = validation.data;

    await convex.mutation(api.projects.update, {
      projectId: id as Id<"projects">,
      name,
      description,
      icon,
      color,
      updatedBy: convexUser._id,
    });

    const project = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Error updating project:", error);
    return handleApiError(error, "Failed to update project");
  }
}

/**
 * DELETE /api/projects/[id] - Delete a project (soft delete)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the project first to check organization
    const existingProject = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get or create the Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Verify user is a member of the project's organization
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      existingProject.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Deleting a project is owner-only (org:delete_project)
    if (normalizeOrgRole(membership.role) !== "owner") {
      return NextResponse.json(
        { error: "Only the organization owner can delete projects" },
        { status: 403 }
      );
    }

    await convex.mutation(api.projects.remove, {
      projectId: id as Id<"projects">,
      deletedBy: convexUser._id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return handleApiError(error, "Failed to delete project");
  }
}
