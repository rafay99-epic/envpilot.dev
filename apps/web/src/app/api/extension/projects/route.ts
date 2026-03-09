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

      const projects = await convex.query(api.projects.listByOrganization, {
        organizationId: organizationId as Id<"organizations">,
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
          })),
        },
      });
    }

    // Get all organizations the user belongs to
    const organizations = await convex.query(api.organizations.listForUser, {
      userId: convexUser._id,
    });

    const allProjects = await Promise.all(
      organizations
        .filter((org): org is NonNullable<typeof org> => org !== null)
        .map(async (org) => {
          const projects = await convex.query(api.projects.listByOrganization, {
            organizationId: org._id,
          });
          return projects;
        })
    );

    const flatProjects = allProjects.flat();

    return NextResponse.json({
      data: {
        projects: flatProjects.map((project) => ({
          _id: project._id,
          name: project.name,
          slug: project.slug,
          description: project.description || null,
          organizationId: project.organizationId,
          icon: project.icon || null,
          color: project.color || null,
        })),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
