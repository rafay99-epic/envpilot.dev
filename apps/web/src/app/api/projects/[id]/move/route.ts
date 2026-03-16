import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/feature-flags";
import { sendProjectTransferEmail } from "@/lib/email";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    const { user } = await withAuth();
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
    const project = await convex.query(api.projects.getById, {
      projectId: id as Id<"projects">,
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Check admin in source org
    const sourceMembership = await convex.query(
      api.organizations.getMembership,
      {
        organizationId: project.organizationId,
        userId: convexUser._id,
      }
    );

    if (!sourceMembership || sourceMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can move projects" },
        { status: 403 }
      );
    }

    // Check membership in target org
    const targetMembership = await convex.query(
      api.organizations.getMembership,
      {
        organizationId: targetOrganizationId as Id<"organizations">,
        userId: convexUser._id,
      }
    );

    if (!targetMembership) {
      return NextResponse.json(
        { error: "You must be a member of the target organization" },
        { status: 403 }
      );
    }

    // Tier enforcement check
    if (isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS)) {
      const sourceOrg = await convex.query(api.organizations.getById, {
        organizationId: project.organizationId,
      });
      const targetOrg = await convex.query(api.organizations.getById, {
        organizationId: targetOrganizationId as Id<"organizations">,
      });

      if (sourceOrg?.tier !== "pro" || targetOrg?.tier !== "pro") {
        return NextResponse.json(
          {
            error:
              "Both organizations must be on the Pro plan to transfer projects",
          },
          { status: 403 }
        );
      }
    }

    // Execute the move
    await convex.mutation(api.projects.move, {
      projectId: id as Id<"projects">,
      targetOrganizationId: targetOrganizationId as Id<"organizations">,
      movedBy: convexUser._id,
      enforceTierLimits: isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS),
    });

    // Send notification email to target org admins (non-blocking)
    try {
      const targetOrg = await convex.query(api.organizations.getById, {
        organizationId: targetOrganizationId as Id<"organizations">,
      });
      const targetMembers = await convex.query(
        api.organizations.getMembers,
        {
          organizationId: targetOrganizationId as Id<"organizations">,
        }
      );

      const adminMembers = targetMembers.filter(
        (m) => m && m.role === "admin"
      );
      const userName =
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.email;

      for (const admin of adminMembers) {
        if (admin?.user?.email) {
          await sendProjectTransferEmail({
            to: admin.user.email,
            projectName: project.name,
            organizationName: targetOrg?.name || "your organization",
            transferredByName: userName,
          }).catch((err) =>
            console.warn("[EMAIL] Failed to send project transfer email:", err)
          );
        }
      }
    } catch (emailErr) {
      console.warn("[EMAIL] Error sending transfer notifications:", emailErr);
    }

    return NextResponse.json({ success: true, projectId: id });
  } catch (error) {
    console.error("Error moving project:", error);
    const message =
      error instanceof Error ? error.message : "Failed to move project";
    if (message.includes("slug already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
