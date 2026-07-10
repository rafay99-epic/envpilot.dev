import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError } from "@/lib/api-errors";

/**
 * DELETE /api/shares/[token]/revoke - Revoke a shared secret
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { token: shareId } = await params;

    // Resolve Convex user
    const convexUser = await convex.query(
      api.features.users.users.getByWorkosId,
      {
        workosId: user.id,
      }
    );
    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Revoke the share (admin check server-side; identity from the JWT) and
    // best-effort delete its Vault object in one composed Convex action — the
    // vault crypto now lives entirely in Convex.
    await createAuthedConvexClient(accessToken!).action(
      api.features.variables.share.revokeAndPurge,
      {
        shareId: shareId as Id<"sharedSecrets">,
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to revoke share");
  }
}
