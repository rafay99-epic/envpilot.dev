import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";
import { handleApiError } from "@/lib/api-errors";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

const addMemberSchema = z.object({
  userId: z.string().regex(CONVEX_ID_PATTERN, "Invalid user ID format"),
  role: z.enum(["viewer", "developer", "manager"]),
});

const updateRoleSchema = z.object({
  userId: z.string().regex(CONVEX_ID_PATTERN, "Invalid user ID format"),
  role: z.enum(["viewer", "developer", "manager"]),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/members - List project members
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const project = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      project.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = await convex.query(api.projectMembers.listByProject, {
      projectId: id as Id<"projects">,
    });

    // Fetch org admins who have implicit access to all projects
    const orgMembers = await convex.query(api.organizations.getMembers, {
      organizationId: project.organizationId,
    });
    const adminMembers = (orgMembers ?? [])
      .filter(
        (m): m is NonNullable<typeof m> => m != null && m.role === "admin"
      )
      .map((m) => ({
        _id: `admin_${m.userId}`,
        projectId: id,
        userId: m.userId,
        role: "admin" as const,
        addedAt: m.joinedAt,
        user: m.user,
        isOrgAdmin: true,
      }));

    // Combine: org admins first, then explicit project members
    const allMembers = [...adminMembers, ...members];

    // Also get assignable members if user can manage
    let assignableMembers = null;
    if (membership.role === "admin" || membership.role === "team_lead") {
      assignableMembers = await convex.query(
        api.projectMembers.getAssignableOrgMembers,
        {
          projectId: id as Id<"projects">,
          requestingUserId: convexUser._id,
        }
      );
    } else {
      // Check if project manager
      const projectMembership = await convex.query(
        api.projectMembers.getProjectMembership,
        {
          projectId: id as Id<"projects">,
          userId: convexUser._id,
        }
      );
      if (projectMembership?.role === "manager") {
        assignableMembers = await convex.query(
          api.projectMembers.getAssignableOrgMembers,
          {
            projectId: id as Id<"projects">,
            requestingUserId: convexUser._id,
          }
        );
      }
    }

    return NextResponse.json({ members: allMembers, assignableMembers });
  } catch (error) {
    console.error("Error fetching project members:", error);
    return NextResponse.json(
      { error: "Failed to fetch project members" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/members - Add a member to the project
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = addMemberSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    const membershipId = await convex.mutation(api.projectMembers.addMember, {
      projectId: id as Id<"projects">,
      userId: validation.data.userId as Id<"users">,
      role: validation.data.role,
      addedBy: convexUser._id,
    });

    return NextResponse.json({ membershipId }, { status: 201 });
  } catch (error) {
    console.error("Error adding project member:", error);
    return handleApiError(error, "Failed to add project member");
  }
}

/**
 * PATCH /api/projects/[id]/members - Update a member's project role
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = updateRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    await convex.mutation(api.projectMembers.updateMemberRole, {
      projectId: id as Id<"projects">,
      userId: validation.data.userId as Id<"users">,
      newRole: validation.data.role,
      updatedBy: convexUser._id,
    });

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("Error updating project member role:", error);
    return handleApiError(error, "Failed to update role");
  }
}

/**
 * DELETE /api/projects/[id]/members - Remove a member from the project
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserIdParam = searchParams.get("userId");

    if (!targetUserIdParam || !CONVEX_ID_PATTERN.test(targetUserIdParam)) {
      return NextResponse.json(
        { error: "Valid userId is required" },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    await convex.mutation(api.projectMembers.removeMember, {
      projectId: id as Id<"projects">,
      userId: targetUserIdParam as Id<"users">,
      removedBy: convexUser._id,
    });

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Error removing project member:", error);
    return handleApiError(error, "Failed to remove member");
  }
}
