import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { z } from "zod";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/users/me/preferences - Get current user's preferences
 */
export async function GET() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);
    const preferences = await convex.query(api.userPreferences.getByUserId, {
      userId: convexUser._id,
    });

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

const preferencesSchema = z.object({
  emailNotifications: z
    .object({
      variableChanges: z.boolean(),
      memberUpdates: z.boolean(),
      accessRequests: z.boolean(),
      securityAlerts: z.boolean(),
    })
    .optional(),
});

/**
 * PATCH /api/users/me/preferences - Update current user's preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = preferencesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    await convex.mutation(api.userPreferences.upsert, {
      userId: convexUser._id,
      callerUserId: convexUser._id,
      emailNotifications: validation.data.emailNotifications,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
