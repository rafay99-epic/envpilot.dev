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
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";

const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

// Project membership is a pure assignment in the unified RBAC model —
// what a user can do in the project is derived from their org role.
// Developers can additionally be scoped to a subset of environments.
const environmentsSchema = z
  .array(z.enum(["development", "staging", "production"]))
  .min(1, "Select at least one environment");

const addMemberSchema = z.object({
  userId: z.string().regex(CONVEX_ID_PATTERN, "Invalid user ID format"),
  // Developer environment scope — omitted means unrestricted access.
  environments: environmentsSchema.optional(),
});

const setEnvironmentsSchema = z.object({
  userId: z.string().regex(CONVEX_ID_PATTERN, "Invalid user ID format"),
  // Providing an array sets the scope; omitting it clears the restriction.
  environments: environmentsSchema.optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/members - List project members
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const project = await convex.query(api.features.projects.queries.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      project.organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = await convex.query(
      api.features.projects.members.listByProject,
      {
        projectId: id as Id<"projects">,
      }
    );

    // Fetch org owners who have implicit access to all projects
    const orgMembers = await convex.query(
      api.features.organizations.queries.getMembers,
      {
        organizationId: project.organizationId,
      }
    );
    const ownerMembers = (orgMembers ?? [])
      .filter(
        (m): m is NonNullable<typeof m> =>
          m != null && normalizeOrgRole(m.role) === "owner"
      )
      .map((m) => ({
        _id: `owner_${m.userId}`,
        projectId: id,
        userId: m.userId,
        role: "owner" as const,
        addedAt: m.joinedAt,
        user: m.user,
        isOrgAdmin: true, // legacy field name kept for response compatibility
      }));

    // Combine: org owners first, then explicit project members
    const allMembers = [...ownerMembers, ...members];

    // Also get assignable members if user can manage (owner / project_manager /
    // team_lead — Convex enforces project-assignment scoping for non-owners).
    let assignableMembers = null;
    if (roleLevel(membership.role) >= ROLE_LEVEL.team_lead) {
      assignableMembers = await createAuthedConvexClient(accessToken!).query(
        api.features.projects.members.getAssignableOrgMembers,
        {
          projectId: id as Id<"projects">,
        }
      );
    }

    return NextResponse.json({ members: allMembers, assignableMembers });
  } catch (error) {
    reportApiError(error, "GET /api/projects/[id]/members");
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
    const { user, accessToken } = await withAuth();
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

    const membershipId = await createAuthedConvexClient(accessToken!).mutation(
      api.features.projects.members.addMember,
      {
        projectId: id as Id<"projects">,
        userId: validation.data.userId as Id<"users">,
        // Developer environment scope — omitted means unrestricted.
        ...(validation.data.environments
          ? { environments: validation.data.environments }
          : {}),
      }
    );

    return NextResponse.json({ membershipId }, { status: 201 });
  } catch (error) {
    console.error("Error adding project member:", error);
    return handleApiError(error, "Failed to add project member");
  }
}

/**
 * PATCH /api/projects/[id]/members - Set a developer's environment scope.
 *
 * Project-level roles no longer exist; the only per-member setting on a
 * project is the environment scope for developer targets. Providing
 * `environments` (non-empty) restricts the member to those environments;
 * omitting it clears the restriction (unrestricted access).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = setEnvironmentsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization (actor can manage target, target must be a developer)
    // is enforced in the Convex mutation.
    await createAuthedConvexClient(accessToken!).mutation(
      api.features.projects.members.setMemberEnvironments,
      {
        projectId: id as Id<"projects">,
        userId: validation.data.userId as Id<"users">,
        ...(validation.data.environments
          ? { environments: validation.data.environments }
          : {}),
      }
    );

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("Error updating member environment scope:", error);
    return handleApiError(error, "Failed to update environment access");
  }
}

/**
 * DELETE /api/projects/[id]/members - Remove a member from the project
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
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

    await createAuthedConvexClient(accessToken!).mutation(
      api.features.projects.members.removeMember,
      {
        projectId: id as Id<"projects">,
        userId: targetUserIdParam as Id<"users">,
      }
    );

    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Error removing project member:", error);
    return handleApiError(error, "Failed to remove member");
  }
}
