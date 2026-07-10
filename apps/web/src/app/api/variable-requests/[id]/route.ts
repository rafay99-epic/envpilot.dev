import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { reportApiError } from "@/lib/api-errors";

const updateRequestSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  reviewReason: z.string().max(500).optional(),
  // Reviewer's environment override — only meaningful for action "approve".
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1)
    .optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/variable-requests/[id]
 * - approve/reject: owner/project_manager/team_lead (enforced in Convex)
 * - cancel: requester (or owner/project_manager/team_lead)
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { action, reviewReason, environments } = validation.data;
    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken!);
    const requestId = id as Id<"environmentVariableRequests">;

    const existingRequest = await authed.query(
      api.features.variables.requests.queries.getById,
      {
        requestId,
      }
    );

    if (!existingRequest) {
      return NextResponse.json(
        { error: "Variable request not found" },
        { status: 404 }
      );
    }

    if (action === "cancel") {
      await authed.mutation(api.features.variables.requests.mutations.cancel, {
        requestId,
      });
    } else {
      await authed.mutation(api.features.variables.requests.mutations.review, {
        requestId,
        action,
        reviewReason,
        environments: action === "approve" ? environments : undefined,
      });
    }

    const updatedRequest = await authed.query(
      api.features.variables.requests.queries.getById,
      {
        requestId,
      }
    );

    return NextResponse.json({ request: updatedRequest });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update variable request";

    if (
      message.includes("Not authorized") ||
      message.includes("Insufficient") ||
      message.includes("Only admins and team leads")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (
      message.includes("already been") ||
      message.includes("pending requests")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    reportApiError(error, "PATCH /api/variable-requests/[id]");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
