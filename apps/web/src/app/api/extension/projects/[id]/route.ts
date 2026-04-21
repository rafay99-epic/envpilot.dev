import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { checkOrganizationMembership } from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";

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
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: projectId } = await params;

    const convexUser = auth.convexUser;

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
      project.organizationId
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
