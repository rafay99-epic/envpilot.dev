import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { normalizeOrgRole, toLegacyOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/extension/organizations - List organizations for the authenticated user
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get organizations where the user is a member. Identity is re-derived
    // server-side from the bearer token the request authenticated with.
    const organizations = await convex.query(
      api.organizations.listForUserForToken,
      { accessToken: auth.accessToken! }
    );

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
            // Old extension builds only understand the legacy role strings.
            role: toLegacyOrgRole(org!.role),
            // Additive: unified-model org role for new extension builds. Old
            // extension builds ignore it.
            unifiedRole: normalizeOrgRole(org!.role),
            extensionAccess: features.extension_access?.value === true,
          };
        }),
      },
    });
  } catch (error) {
    reportApiError(error, "GET /api/extension/organizations");
    const message =
      error instanceof Error ? error.message : "Failed to fetch organizations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
