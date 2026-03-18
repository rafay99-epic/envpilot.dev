import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { verifyNotBot } from "@/lib/botid";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const updateRequestSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  reviewReason: z.string().max(500).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/variable-requests/[id]
 * - approve/reject: admin/team_lead
 * - cancel: requester (or admin/team_lead)
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

    const { user } = await withAuth();
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

    const { action, reviewReason } = validation.data;
    const convexUser = await getOrCreateConvexUser(convex, user);
    const requestId = id as Id<"environmentVariableRequests">;

    const existingRequest = await convex.query(api.variableRequests.getById, {
      requestId,
      userId: convexUser._id,
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: "Variable request not found" },
        { status: 404 }
      );
    }

    if (action === "cancel") {
      await convex.mutation(api.variableRequests.cancel, {
        requestId,
        canceledBy: convexUser._id,
      });
    } else {
      await convex.mutation(api.variableRequests.review, {
        requestId,
        reviewedBy: convexUser._id,
        action,
        reviewReason,
      });
    }

    const updatedRequest = await convex.query(api.variableRequests.getById, {
      requestId,
      userId: convexUser._id,
    });

    return NextResponse.json({ request: updatedRequest });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update variable request";

    if (
      message.includes("Not authorized") ||
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

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
