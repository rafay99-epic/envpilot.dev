import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  sanitizeConvexError,
  handleApiError,
  reportApiError,
} from "@/lib/api-errors";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
  organizationId: z.string().min(1, "Organization ID is required"),
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

/**
 * GET /api/projects - List all projects for the current organization
 */
export async function GET(request: Request) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    if (organizationId) {
      // Verify user is a member of the requested organization
      const membership = await checkOrganizationMembership(
        authed,
        organizationId as Id<"organizations">
      );

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // List projects for a specific organization (filtered by membership for non-admins)
      const projects = await authed.query(
        api.features.projects.queries.listWithStats,
        {
          organizationId: organizationId as Id<"organizations">,
        }
      );
      return NextResponse.json({ projects });
    } else {
      // List all projects for the user (across all their organizations)
      const projects = await authed.query(
        api.features.projects.queries.listForUser,
        {}
      );
      return NextResponse.json({ projects });
    }
  } catch (error) {
    reportApiError(error, "GET /api/projects");
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects - Create a new project
 */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createProjectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);

    const { name, slug, description, organizationId, icon, color } =
      validation.data;

    // Authorization is enforced in the Convex mutation (assertOrgAction + team_lead setting check)
    const projectId = await createAuthedConvexClient(accessToken!).mutation(
      api.features.projects.mutations.create,
      {
        name,
        slug,
        description,
        organizationId: organizationId as Id<"organizations">,
        icon,
        color,
      }
    );

    const project = await createAuthedConvexClient(accessToken!).query(
      api.features.projects.queries.getById,
      {
        projectId,
      }
    );

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    const message = sanitizeConvexError(error);

    if (message.includes("slug already exists")) {
      return NextResponse.json(
        { error: "Project slug already exists in this organization" },
        { status: 409 }
      );
    }

    return handleApiError(error, "Failed to create project");
  }
}
