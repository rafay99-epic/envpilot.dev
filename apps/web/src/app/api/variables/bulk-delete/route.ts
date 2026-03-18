import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const bulkDeleteSchema = z.object({
  variableIds: z.array(z.string()).min(1).max(50),
  projectId: z.string(),
});

export async function POST(request: Request) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bulkDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { variableIds, projectId } = parsed.data;

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Verify project exists and get org
    const { organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">
    );

    if (!organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check permission (admin or team_lead can bulk delete)
    if (membership.role !== "admin" && membership.role !== "team_lead") {
      return NextResponse.json(
        { error: "Insufficient permissions to delete variables" },
        { status: 403 }
      );
    }

    const result = await convex.mutation(api.variables.bulkDelete, {
      variableIds: variableIds as Id<"environmentVariables">[],
      deletedBy: convexUser._id,
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to bulk delete variables";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
