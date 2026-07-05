import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import * as Sentry from "@sentry/nextjs";
import { deleteSecret } from "@/lib/vault";
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
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });
    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Revoke share in Convex (admin check happens server-side; identity is
    // derived from the attached JWT).
    const result = await createAuthedConvexClient(accessToken!).mutation(
      api.sharedSecrets.revokeShare,
      {
        shareId: shareId as Id<"sharedSecrets">,
      }
    );

    // Delete from Vault (best-effort, report failures to Sentry)
    try {
      await deleteSecret(result.vaultRef);
    } catch (vaultErr) {
      Sentry.captureException(vaultErr, {
        tags: { source: "share-vault", action: "revoke-delete" },
        extra: { shareId, vaultRef: result.vaultRef },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to revoke share");
  }
}
