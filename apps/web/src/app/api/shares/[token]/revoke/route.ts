import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import * as Sentry from "@sentry/nextjs";
import { deleteSecret } from "@/lib/vault";
import { handleApiError } from "@/lib/api-errors";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * DELETE /api/shares/[token]/revoke - Revoke a shared secret
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { user } = await withAuth();
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

    // Revoke share in Convex (admin check happens server-side)
    const result = await convex.mutation(api.sharedSecrets.revokeShare, {
      shareId: shareId as Id<"sharedSecrets">,
      userId: convexUser._id,
    });

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
