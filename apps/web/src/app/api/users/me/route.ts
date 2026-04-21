import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { z } from "zod";

/**
 * GET /api/users/me - Get current user's Convex ID and details
 */
export async function GET() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get or create the Convex user
    const convexUser = await getOrCreateConvexUser(convex, user);

    return NextResponse.json({
      convexUserId: convexUser._id,
      workosId: user.id,
      email: convexUser.email,
      name: convexUser.name,
      avatarUrl: convexUser.avatarUrl,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

const profileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

/**
 * PATCH /api/users/me - Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = profileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName } = validation.data;
    const convexUser = await getOrCreateConvexUser(convex, user);

    const name = `${firstName} ${lastName}`.trim();

    await convex.mutation(api.users.updateProfile, {
      userId: convexUser._id,
      callerUserId: convexUser._id,
      name,
    });

    return NextResponse.json({ success: true, name });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
