import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/cli-auth";
import {
  normalizeOrgRole,
  toLegacyOrgRole,
  toLegacyProjectRole,
} from "@/lib/roles";

/**
 * GET /api/cli/projects
 * List projects in an organization
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "Missing organizationId parameter" },
      { status: 400 }
    );
  }

  try {
    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: organizationId as Id<"organizations">,
      userId: authResult.userId,
    });

    if (!membership) {
      return forbiddenResponse("You are not a member of this organization");
    }

    // Get projects (filtered to the user's assigned projects for non-owners)
    const projects = await convex.query(api.projects.listWithStats, {
      organizationId: organizationId as Id<"organizations">,
      userId: authResult.userId,
    });

    // Old CLI builds only understand the legacy role strings. Non-owners only
    // receive projects they are assigned to, so assignment is implied; owners
    // get projectRole null exactly like legacy admins did (their org role
    // already grants write access on old clients).
    const isOwner = normalizeOrgRole(membership.role) === "owner";
    const legacyUserRole = toLegacyOrgRole(membership.role);
    const legacyProjectRole = isOwner
      ? null
      : toLegacyProjectRole(membership.role, true);

    return NextResponse.json({
      success: true,
      data: projects.map((project) => ({
        _id: project._id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        icon: project.icon,
        color: project.color,
        organizationId: project.organizationId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        userRole: legacyUserRole,
        projectRole: legacyProjectRole,
      })),
    });
  } catch (error) {
    console.error("CLI projects error:", error);
    return NextResponse.json(
      { error: "Failed to list projects" },
      { status: 500 }
    );
  }
}
