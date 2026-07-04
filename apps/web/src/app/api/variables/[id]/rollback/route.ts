import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { normalizeOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

const rollbackSchema = z.object({
  targetVersion: z.number().int().positive(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/variables/[id]/rollback - Rollback a variable to a previous version
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const validation = rollbackSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { targetVersion } = validation.data;

    const convexUser = await getOrCreateConvexUser(convex, user);

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    if (!variable) {
      return NextResponse.json(
        { error: "Variable not found" },
        { status: 404 }
      );
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
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

    // Rollback is an owner-only power feature (org:rollback_variable)
    if (normalizeOrgRole(membership.role) !== "owner") {
      return NextResponse.json(
        { error: "Only the organization owner can rollback variables" },
        { status: 403 }
      );
    }

    // valueRestored is false when the target is a legacy version written
    // before value updates minted distinct vault objects — those rollbacks
    // only restore metadata, not the secret value.
    const { valueRestored } = await convex.mutation(api.variables.rollback, {
      variableId: id as Id<"environmentVariables">,
      targetVersion,
      rolledBackBy: convexUser._id,
    });

    const updatedVariable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    return NextResponse.json({ variable: updatedVariable, valueRestored });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to rollback variable";

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    reportApiError(error, "POST /api/variables/[id]/rollback");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
