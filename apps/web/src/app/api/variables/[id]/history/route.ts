import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/variables/[id]/history - Get version history for a variable
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    // Validate and constrain limit to prevent DoS attacks (1-100 range)
    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 50 : rawLimit, 1), 100);

    const convexUser = await getOrCreateConvexUser(convex, user);

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<"environmentVariables">,
    });

    if (!variable) {
      return NextResponse.json(
        { error: "Variable not found" },
        { status: 404 },
      );
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId,
    );

    if (!organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId,
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role === "member") {
      const accessibleVariables = await convex.query(
        api.variables.listWithAccess,
        {
          projectId: variable.projectId,
          userId: convexUser._id,
        },
      );

      const canAccessVariable = accessibleVariables.some(
        (entry) => entry._id === variable._id && entry.hasAccess,
      );

      if (!canAccessVariable) {
        return NextResponse.json(
          { error: "You do not have access to this variable" },
          { status: 403 },
        );
      }
    }

    const history = await convex.query(api.variables.getVersionHistory, {
      variableId: id as Id<"environmentVariables">,
      limit,
    });

    return NextResponse.json({ history });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch variable history" },
      { status: 500 },
    );
  }
}
