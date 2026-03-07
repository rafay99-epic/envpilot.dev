import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
} from "@/lib/convex-helpers";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/extension/projects/[id] - Get a specific project
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: projectId } = await params;

    const convexUser = await getOrCreateConvexUser(convex, user);

    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<"projects">,
    });

    if (!project || project.deletedAt) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check membership
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      project.organizationId,
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      data: {
        project: {
          _id: project._id,
          name: project.name,
          slug: project.slug,
          description: project.description || null,
          organizationId: project.organizationId,
          icon: project.icon || null,
          color: project.color || null,
        },
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
