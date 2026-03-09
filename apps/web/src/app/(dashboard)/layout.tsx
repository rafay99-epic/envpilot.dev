import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { AuthProvider } from "@/components/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import type { AuthUser, Organization } from "@/lib/auth";
import { getPermissionsForMembershipRole } from "@/lib/auth";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  selectActiveOrganization,
  type OrganizationWithMembershipRole,
} from "@/lib/organization-context";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check
  const { user } = await withAuth();

  if (!user) {
    redirect("/sign-in");
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

  const cookieStore = await cookies();
  const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;
  const activeOrganization = selectActiveOrganization(
    organizations,
    preferredOrgId,
  );

  // Transform to our AuthUser type
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

  const organization: Organization | null = activeOrganization
    ? {
        id: activeOrganization._id,
        name: activeOrganization.name,
        slug: activeOrganization.slug,
        tier: activeOrganization.tier,
        role: activeOrganization.role,
        createdAt: new Date(activeOrganization.createdAt),
        updatedAt: new Date(activeOrganization.updatedAt),
      }
    : null;

  return (
    <AuthProvider initialUser={authUser} initialOrganization={organization}>
      <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Sidebar Navigation */}
        <DashboardNav />

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto px-4 py-8 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
