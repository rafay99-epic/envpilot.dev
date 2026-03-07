import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/extension/organizations - List organizations for the authenticated user
 */
export async function GET() {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    // Get organizations where the user is a member
    const organizations = await convex.query(api.organizations.listForUser, {
      userId: convexUser._id,
    });

    // Filter out null organizations
    const validOrgs = organizations.filter(
      (org): org is NonNullable<typeof org> => org !== null,
    );

    return NextResponse.json({
      data: {
        organizations: validOrgs.map((org) => ({
          _id: org!._id,
          name: org!.name,
          slug: org!.slug,
          tier: org!.tier,
        })),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch organizations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
