import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { checkOrganizationMembership } from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/extension/projects - List projects for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    const convexUser = auth.convexUser;

    if (organizationId) {
      // Check membership for specific organization
      const membership = await checkOrganizationMembership(
        convex,
        convexUser._id,
        organizationId as Id<"organizations">
      );

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Use membership-aware query for project listing
      const projects = await convex.query(api.projects.listWithStats, {
        organizationId: organizationId as Id<"organizations">,
        userId: convexUser._id,
      });

      return NextResponse.json({
        data: {
          projects: projects.map((project) => ({
            _id: project._id,
            name: project.name,
            slug: project.slug,
            description: project.description || null,
            organizationId: project.organizationId,
            icon: project.icon || null,
            color: project.color || null,
            userRole: project.userRole ?? null,
            projectRole: project.projectRole ?? null,
          })),
        },
      });
    }

    // Get all projects the user has access to (across all orgs)
    const userProjects = await convex.query(api.projects.listForUser, {
      userId: convexUser._id,
    });

    return NextResponse.json({
      data: {
        projects: userProjects.map(
          (project: {
            _id: string;
            name: string;
            slug: string;
            description?: string;
            organizationId: string;
            icon?: string;
            color?: string;
            userRole?: string;
            projectRole?: string | null;
          }) => ({
            _id: project._id,
            name: project.name,
            slug: project.slug,
            description: project.description || null,
            organizationId: project.organizationId,
            icon: project.icon || null,
            color: project.color || null,
            userRole: project.userRole ?? null,
            projectRole: project.projectRole ?? null,
          })
        ),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
