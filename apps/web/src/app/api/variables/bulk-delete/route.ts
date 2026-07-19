import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

const bulkDeleteSchema = z.object({
  variableIds: z.array(z.string()).min(1).max(50),
  projectId: z.string(),
});

export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();

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
      createAuthedConvexClient(accessToken!),
      projectId as Id<"projects">
    );

    if (!organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Bulk delete requires owner / project_manager / team_lead (Convex
    // enforces project-assignment scoping for non-owners).
    if (roleLevel(membership.role) < ROLE_LEVEL.team_lead) {
      return NextResponse.json(
        { error: "Insufficient permissions to delete variables" },
        { status: 403 }
      );
    }

    const result = await createAuthedConvexClient(accessToken!).mutation(
      api.features.variables.mutations.bulkDelete,
      {
        variableIds: variableIds as Id<"environmentVariables">[],
      }
    );

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    reportApiError(err, "POST /api/variables/bulk-delete");
    const message =
      err instanceof Error ? err.message : "Failed to bulk delete variables";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
