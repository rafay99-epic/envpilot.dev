import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { AuthUser, Organization } from "@/lib/auth";
import { getPermissionsForMembershipRole } from "@/lib/auth";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  selectActiveOrganization,
  type OrganizationWithMembershipRole,
} from "@/lib/organization-context";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    const organizations = (await convex.query(api.organizations.listForUser, {
      userId: convexUser._id,
    })) as OrganizationWithMembershipRole[];

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
      role: activeOrganization?.role ?? null,
      permissions: getPermissionsForMembershipRole(activeOrganization?.role),
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    };

    // Get tier for active organization from organizationTiers table
    const activeTierData = activeOrganization
      ? await convex.query(api.tierLimits.getOrganizationLimits, {
          organizationId: activeOrganization._id as Id<"organizations">,
        })
      : null;

    const organization: Organization | null = activeOrganization
      ? {
          id: activeOrganization._id,
          name: activeOrganization.name,
          slug: activeOrganization.slug,
          tier: activeTierData?.tier ?? "free",
          role: activeOrganization.role,
          createdAt: new Date(activeOrganization.createdAt),
          updatedAt: new Date(activeOrganization.updatedAt),
        }
      : null;

    // Get tiers for all organizations
    const orgTiers = await Promise.all(
      organizations.map((org) =>
        convex.query(api.tierLimits.getOrganizationLimits, {
          organizationId: org._id as Id<"organizations">,
        })
      )
    );

    return NextResponse.json({
      user: authUser,
      organization,
      organizations: organizations.map((org, index) => ({
        id: org._id,
        name: org.name,
        slug: org.slug,
        tier: orgTiers[index]?.tier ?? "free",
        role: org.role,
      })),
      accessToken,
      impersonator: impersonator
        ? { email: impersonator.email, reason: impersonator.reason ?? null }
        : undefined,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
