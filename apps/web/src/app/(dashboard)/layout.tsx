import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { AuthProvider } from "@/components/auth";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { CommandPalette } from "@/components/command-palette";
import { UpdateBanner } from "@/components/dashboard/update-banner";
import { KeyboardShortcutsProvider } from "@/components/keyboard/keyboard-shortcuts-provider";
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

  let convexUser;
  let organizations: OrganizationWithMembershipRole[] = [];
  let activeOrganization: OrganizationWithMembershipRole | null = null;

  try {
    convexUser = await getOrCreateConvexUser(convex, {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
    });

    // Check if user is banned
    if (convexUser.isBanned) {
      return (
        <div className="dark flex min-h-screen items-center justify-center bg-[#0f172a] text-zinc-100">
          <div className="mx-auto max-w-md rounded-lg border border-red-500/20 bg-red-950/20 p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <svg
                className="h-6 w-6 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-red-400">
              Account Suspended
            </h1>
            <p className="mb-4 text-sm text-zinc-400">
              Your account has been suspended.
              {convexUser.banReason && (
                <span className="mt-2 block text-zinc-500">
                  Reason: {convexUser.banReason}
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              If you believe this is a mistake, please contact support.
            </p>
          </div>
        </div>
      );
    }

    organizations = (await convex.query(api.organizations.listForUser, {
      userId: convexUser._id,
    })) as OrganizationWithMembershipRole[];

    const cookieStore = await cookies();
    const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;
    activeOrganization = selectActiveOrganization(
      organizations,
      preferredOrgId
    );
  } catch (err) {
    // Log but don't crash — client-side auth hook will fetch the data
    console.error("Failed to load organization context in layout:", err);
  }

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

  // Look up the tier from the organizationTiers table
  let orgTier: string = "free";
  if (activeOrganization) {
    try {
      const tierData = await convex.query(
        api.tierLimits.getOrganizationLimits,
        {
          organizationId:
            activeOrganization._id as unknown as import("@convex/_generated/dataModel").Id<"organizations">,
        }
      );
      orgTier = (tierData?.tier as string) ?? "free";
    } catch {
      // Fall back to free tier if query fails
    }
  }

  const organization: Organization | null = activeOrganization
    ? {
        id: activeOrganization._id,
        name: activeOrganization.name,
        slug: activeOrganization.slug,
        tier: orgTier,
        role: activeOrganization.role,
        createdAt: new Date(activeOrganization.createdAt),
        updatedAt: new Date(activeOrganization.updatedAt),
      }
    : null;

  return (
    <AuthProvider initialUser={authUser} initialOrganization={organization}>
      <div className="dark flex min-h-screen bg-[#0f172a] text-zinc-100">
        {/* Subtle grid background */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Sidebar Navigation */}
        <DashboardNav />

        {/* Main Content */}
        <main className="relative z-10 flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
            {children}
          </div>
        </main>

        {/* Global Keyboard Shortcuts */}
        <KeyboardShortcutsProvider>
          {/* Global Search Command Palette */}
          <CommandPalette />
        </KeyboardShortcutsProvider>

        {/* Update Available Notification */}
        <UpdateBanner />
      </div>
    </AuthProvider>
  );
}
