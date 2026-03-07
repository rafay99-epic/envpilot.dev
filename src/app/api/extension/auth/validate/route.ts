import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/extension/auth/validate - Validate the current auth session
 */
export async function GET() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json(
        { data: { valid: false, reason: "Not authenticated" } },
        { status: 200 },
      );
    }

    await getOrCreateConvexUser(convex, user);

    return NextResponse.json({
      data: { valid: true },
    });
  } catch {
    return NextResponse.json(
      { data: { valid: false, reason: "Validation failed" } },
      { status: 200 },
    );
  }
}
