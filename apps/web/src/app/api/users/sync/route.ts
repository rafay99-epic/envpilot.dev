import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { reportApiError } from "@/lib/api-errors";

/**
 * POST /api/users/sync - Sync current WorkOS user to Convex database
 * This creates or updates the user record in Convex
 */
export async function POST() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = await convex.mutation(api.features.users.users.upsert, {
      workosId: user.id,
      email: user.email,
      name:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`.trim()
          : user.firstName || user.lastName || undefined,
      avatarUrl: user.profilePictureUrl || undefined,
    });

    return NextResponse.json({ userId, synced: true });
  } catch (error) {
    reportApiError(error, "POST /api/users/sync");
    console.error("Error syncing user:", error);
    return NextResponse.json({ error: "Failed to sync user" }, { status: 500 });
  }
}
