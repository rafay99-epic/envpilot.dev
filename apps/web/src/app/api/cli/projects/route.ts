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
import { reportApiError } from "@/lib/api-errors";

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
    const unifiedRole = normalizeOrgRole(membership.role);
    const isOwner = unifiedRole === "owner";
    const isDeveloper = unifiedRole === "developer";
    const legacyUserRole = toLegacyOrgRole(membership.role);
    const legacyProjectRole = isOwner
      ? null
      : toLegacyProjectRole(membership.role, true);

    // Additive unified fields. Owners are implicitly assigned to every
    // project (no scope). For non-owners, listWithStats already filters to
    // assigned projects, but we look up the projectMembers row per project to
    // confirm assignment and read a developer's environment scope.
    const unifiedByProject = new Map<
      string,
      { assigned: boolean; environmentScope: string[] | null }
    >();
    await Promise.all(
      projects.map(async (project) => {
        if (isOwner) {
          unifiedByProject.set(project._id, {
            assigned: true,
            environmentScope: null,
          });
          return;
        }
        const projectMembership = await convex.query(
          api.projectMembers.getProjectMembership,
          {
            projectId: project._id as Id<"projects">,
            userId: authResult.userId!,
          }
        );
        unifiedByProject.set(project._id, {
          assigned: projectMembership !== null,
          environmentScope: isDeveloper
            ? (projectMembership?.environments ?? null)
            : null,
        });
      })
    );

    return NextResponse.json({
      success: true,
      data: projects.map((project) => {
        const unified = unifiedByProject.get(project._id) ?? {
          assigned: isOwner,
          environmentScope: null,
        };
        return {
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
          // Additive unified-model fields for new CLIs. Old CLIs ignore them.
          unifiedRole,
          assigned: unified.assigned,
          environmentScope: unified.environmentScope,
        };
      }),
    });
  } catch (error) {
    reportApiError(error, "GET /api/cli/projects");
    console.error("CLI projects error:", error);
    return NextResponse.json(
      { error: "Failed to list projects" },
      { status: 500 }
    );
  }
}
