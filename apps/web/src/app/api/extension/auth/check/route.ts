import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Pending auth sessions stored in memory (in production, use Redis or similar)
const pendingSessions = new Map<
  string,
  {
    userId: string;
    email: string;
    name: string | null;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    createdAt: number;
  }
>();

// Clean up expired pending sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of pendingSessions.entries()) {
    // Remove sessions older than 10 minutes
    if (now - session.createdAt > 10 * 60 * 1000) {
      pendingSessions.delete(key);
    }
  }
}, 60 * 1000); // Run every minute

export { pendingSessions };

/**
 * GET /api/extension/auth/check - Check if an auth session has been completed
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get("session");

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 },
      );
    }

    const pendingSession = pendingSessions.get(sessionToken);

    if (!pendingSession) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 },
      );
    }

    // Get the user from Convex
    const user = await convex.query(api.users.getByWorkosId, {
      workosId: pendingSession.userId,
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Remove the pending session
    pendingSessions.delete(sessionToken);

    return NextResponse.json({
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name || null,
          avatarUrl: user.avatarUrl || null,
        },
        accessToken: pendingSession.accessToken,
        refreshToken: pendingSession.refreshToken,
        expiresAt: pendingSession.expiresAt,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check auth session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
