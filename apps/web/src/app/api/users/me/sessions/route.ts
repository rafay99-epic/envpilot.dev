import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/users/me/sessions - Get current user's active sessions
 */
export async function GET() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);
    const sessions = await convex.query(api.users.getOwnSessions, {
      userId: convexUser._id,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    reportApiError(error, "GET /api/users/me/sessions");
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/me/sessions - Revoke all active sessions
 */
export async function DELETE() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);
    const result = await convex.mutation(api.users.revokeOwnSessions, {
      userId: convexUser._id,
      callerUserId: convexUser._id,
    });

    return NextResponse.json({ success: true, revoked: result.revoked });
  } catch (error) {
    reportApiError(error, "DELETE /api/users/me/sessions");
    console.error("Error revoking sessions:", error);
    return NextResponse.json(
      { error: "Failed to revoke sessions" },
      { status: 500 }
    );
  }
}
