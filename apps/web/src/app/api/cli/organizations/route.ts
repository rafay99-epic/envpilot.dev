import { NextRequest, NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  getUserOrganizations,
} from "@/lib/cli-auth";
import { normalizeOrgRole, toLegacyOrgRole } from "@/lib/roles";

/**
 * GET /api/cli/organizations
 * List organizations for the authenticated user
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex);

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error);
  }

  try {
    const organizations = await getUserOrganizations(convex, authResult.userId);

    // Get tiers for all organizations from organizationTiers table
    const orgTiers = await Promise.all(
      organizations.map((org) =>
        convex.query(api.featureRegistry.getResolvedFeatures, {
          organizationId: org._id,
        })
      )
    );

    return NextResponse.json({
      success: true,
      data: organizations.map((org, index) => ({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        tier: orgTiers[index]?.tierName ?? "free",
        // Old CLI builds only understand the legacy role strings.
        role: toLegacyOrgRole(org.role),
        // Additive: unified-model org role for new CLIs. Old CLIs ignore it.
        unifiedRole: normalizeOrgRole(org.role),
        description: org.description,
        logoUrl: org.logoUrl,
      })),
    });
  } catch (error) {
    console.error("CLI organizations error:", error);
    return NextResponse.json(
      { error: "Failed to list organizations" },
      { status: 500 }
    );
  }
}
