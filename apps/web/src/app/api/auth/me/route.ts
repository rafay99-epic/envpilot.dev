import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { AuthUser, Organization } from "@/lib/auth";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { cacheHeaders } from "@/lib/cache-headers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  selectActiveOrganization,
  type OrganizationWithMembershipRole,
} from "@/lib/organization-context";
import { normalizeOrgRole } from "@/lib/roles";
import { reportApiError } from "@/lib/api-errors";

// GET /api/auth/me - Get current authenticated user
export async function GET(request: Request) {
  try {
    const { user, impersonator, accessToken } = await withAuth();

    if (!user) {
      return NextResponse.json(
        { user: null, organization: null, accessToken: null },
        { status: 401 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
    });

    const organizations = (await createAuthedConvexClient(accessToken!).query(
      api.features.organizations.queries.listForUser,
      {}
    )) as OrganizationWithMembershipRole[];

    const url = new URL(request.url);
    const organizationIdFromQuery = url.searchParams.get("organizationId");
    const cookieStore = await cookies();
    const organizationIdFromCookie = cookieStore.get(
      ACTIVE_ORG_COOKIE_NAME
    )?.value;
    const preferredOrganizationId =
      organizationIdFromQuery ?? organizationIdFromCookie;

    const activeOrganization = selectActiveOrganization(
      organizations,
      preferredOrganizationId
    );

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
      organizationId: activeOrganization?._id ?? null,
      role: activeOrganization
        ? normalizeOrgRole(activeOrganization.role)
        : null,
      // permissions are computed from backend authz → actions[]
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    };

    // Parallel: batch-fetch all org tiers (1 query instead of N), and fetch
    // permissions for the active org. getOrgTiersBatch resolves tier names
    // only (~4 docs/org) — this route never uses the full resolved-feature
    // map that getResolvedFeaturesBatch used to compute (~60 docs/org).
    const [orgTiers, perms] = await Promise.all([
      organizations.length > 0
        ? convex.query(api.features.featureRegistry.queries.getOrgTiersBatch, {
            organizationIds: organizations.map(
              (o) => o._id as Id<"organizations">
            ),
          })
        : Promise.resolve([]),
      activeOrganization && accessToken
        ? createAuthedConvexClient(accessToken).query(
            api.features.auth.queries.getMyPermissions,
            { organizationId: activeOrganization._id as Id<"organizations"> }
          )
        : Promise.resolve({ actions: [] }),
    ]);

    const activeTierIndex = activeOrganization
      ? organizations.findIndex((o) => o._id === activeOrganization._id)
      : -1;
    const activeTierData =
      activeTierIndex >= 0 ? orgTiers[activeTierIndex] : null;

    const organization: Organization | null = activeOrganization
      ? {
          id: activeOrganization._id,
          name: activeOrganization.name,
          slug: activeOrganization.slug,
          tier: activeTierData?.tierName ?? "free",
          role: normalizeOrgRole(activeOrganization.role),
          createdAt: new Date(activeOrganization.createdAt),
          updatedAt: new Date(activeOrganization.updatedAt),
        }
      : null;

    return NextResponse.json(
      {
        user: authUser,
        organization,
        actions: perms.actions,
        organizations: organizations.map((org, index) => ({
          id: org._id,
          name: org.name,
          slug: org.slug,
          tier: orgTiers[index]?.tierName ?? "free",
          role: normalizeOrgRole(org.role),
        })),
        accessToken,
        impersonator: impersonator
          ? { email: impersonator.email, reason: impersonator.reason ?? null }
          : undefined,
      },
      { headers: cacheHeaders.privateShort }
    );
  } catch (error) {
    reportApiError(error, "GET /api/auth/me");
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
