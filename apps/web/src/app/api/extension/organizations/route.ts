import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { authenticateExtensionRequest } from "@/lib/extension-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/extension/organizations - List organizations for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const convexUser = auth.convexUser;

    // Get organizations where the user is a member
    const organizations = await convex.query(api.organizations.listForUser, {
      userId: convexUser._id,
    });

    // Filter out null organizations
    const validOrgs = organizations.filter(
      (org): org is NonNullable<typeof org> => org !== null
    );

    // Get tiers for all organizations from organizationTiers table
    const orgTiers = await Promise.all(
      validOrgs.map((org) =>
        convex.query(api.featureRegistry.getResolvedFeatures, {
          organizationId: org!._id,
        })
      )
    );

    return NextResponse.json({
      data: {
        organizations: validOrgs.map((org, index) => {
          const features = orgTiers[index]?.features ?? {};
          return {
            _id: org!._id,
            name: org!.name,
            slug: org!.slug,
            tier: orgTiers[index]?.tierName ?? "free",
            role: org!.role || "member",
            extensionAccess: features.extension_access?.value === true,
          };
        }),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch organizations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
