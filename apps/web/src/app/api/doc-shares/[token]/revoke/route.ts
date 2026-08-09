import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError } from "@/lib/api-errors";

/**
 * POST /api/doc-shares/[token]/revoke — kill a share immediately.
 *
 * `[token]` here is the share ID, not a share token: the dashboard revokes
 * member shares (which have no token) through the same endpoint, and the
 * Convex mutation owns the "creator, or someone who can delete this
 * project's pages" rule either way.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { token: shareId } = await params;

    await createAuthedConvexClient(accessToken).mutation(
      api.features.docs.shares.revokeShare,
      { shareId: shareId as Id<"docShares"> }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to revoke the share");
  }
}
