import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { createLogger } from "@/lib/logger";
import { reportApiError } from "@/lib/api-errors";
import { normalizeOrgRole } from "@/lib/roles";

const log = createLogger("api/projects/move");

const moveProjectSchema = z.object({
  targetOrganizationId: z.string().min(1, "Target organization ID is required"),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/move - Move a project to another organization
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user, accessToken } = await withAuth();
    const { id } = await params;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = moveProjectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { targetOrganizationId } = validation.data;

    // Get the project
    const project = await createAuthedConvexClient(accessToken!).query(
      api.features.projects.queries.getById,
      {
        projectId: id as Id<"projects">,
      }
    );

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);

    // Check admin in source org
    const sourceMembership = await authed.query(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );

    if (
      !sourceMembership ||
      normalizeOrgRole(sourceMembership.role) !== "owner"
    ) {
      return NextResponse.json(
        { error: "Only the organization owner can move projects" },
        { status: 403 }
      );
    }

    // Check membership in target org
    const targetMembership = await authed.query(
      api.features.organizations.queries.getMembership,
      {
        organizationId: targetOrganizationId as Id<"organizations">,
      }
    );

    if (
      !targetMembership ||
      normalizeOrgRole(targetMembership.role) !== "owner"
    ) {
      return NextResponse.json(
        { error: "You must be the owner of the target organization" },
        { status: 403 }
      );
    }

    // Execute the move (tier enforcement is handled server-side in the mutation)
    await authed.mutation(api.features.projects.mutations.move, {
      projectId: id as Id<"projects">,
      targetOrganizationId: targetOrganizationId as Id<"organizations">,
    });

    // Send notification email to target org admins (non-blocking)
    try {
      const targetOrg = await convex.query(
        api.features.organizations.queries.getById,
        {
          organizationId: targetOrganizationId as Id<"organizations">,
        }
      );
      const targetMembers = await convex.query(
        api.features.organizations.queries.getMembers,
        {
          organizationId: targetOrganizationId as Id<"organizations">,
        }
      );

      const adminMembers = targetMembers.filter(
        (m) => m && normalizeOrgRole(m.role) === "owner"
      );
      const userName =
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.email;

      for (const admin of adminMembers) {
        if (admin?.user?.email) {
          await convex
            .action(api.features.emails.emails.sendProjectTransferEmail, {
              to: admin.user.email,
              projectName: project.name,
              organizationName: targetOrg?.name || "your organization",
              transferredByName: userName,
            })
            .catch((err: unknown) =>
              log.error(
                "project_transfer_email_failed",
                { projectId: id, targetOrganizationId },
                err
              )
            );
        }
      }
    } catch (emailErr) {
      log.error(
        "project_transfer_notification_failed",
        { projectId: id, targetOrganizationId },
        emailErr
      );
    }

    return NextResponse.json({ success: true, projectId: id });
  } catch (error) {
    console.error("Error moving project:", error);
    const message =
      error instanceof Error ? error.message : "Failed to move project";
    if (message.includes("slug already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    reportApiError(error, "POST /api/projects/[id]/move");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
