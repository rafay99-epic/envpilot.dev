import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { z } from "zod";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/users/me/preferences - Get current user's preferences
 */
export async function GET() {
  try {
    const { user, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);
    const preferences = await createAuthedConvexClient(accessToken!).query(
      api.userPreferences.getByUserId,
      {}
    );

    return NextResponse.json(preferences);
  } catch (error) {
    reportApiError(error, "GET /api/users/me/preferences");
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
      rotationReminders: z.boolean().optional(),
    })
    .optional(),
  keyboardShortcuts: z.record(z.string(), z.string()).optional(),
});

/**
 * PATCH /api/users/me/preferences - Update current user's preferences
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user, accessToken } = await withAuth();

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

    // Ensure the `users` row exists so the session JWT resolves server-side.
    await getOrCreateConvexUser(convex, user);

    await createAuthedConvexClient(accessToken!).mutation(
      api.userPreferences.upsert,
      {
        emailNotifications: validation.data.emailNotifications,
        keyboardShortcuts: validation.data.keyboardShortcuts,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    reportApiError(error, "PATCH /api/users/me/preferences");
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
