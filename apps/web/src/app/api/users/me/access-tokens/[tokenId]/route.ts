import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * DELETE /api/users/me/access-tokens/[tokenId]
 * Revoke an access token.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { tokenId } = await params;

    if (!tokenId) {
      return NextResponse.json({ error: "Missing tokenId" }, { status: 400 });
    }

    await convex.mutation(api.accessTokens.revoke, {
      tokenId: tokenId as Id<"accessTokens">,
      userId: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking access token:", error);
    const message =
      error instanceof Error ? error.message : "Failed to revoke access token";

    // Map domain errors to meaningful HTTP status codes
    const status = message.includes("not found")
      ? 404
      : message.includes("only revoke your own") ||
          message.includes("not a member")
        ? 403
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
