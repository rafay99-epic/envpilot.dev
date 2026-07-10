import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { AuthProvider } from "@/components/auth";
import { AuthErrorPage } from "@/components/auth/auth-error-page";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { AuthUser, Organization } from "@/lib/auth";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  selectActiveOrganization,
  type OrganizationWithMembershipRole,
} from "@/lib/organization-context";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/dashboard/layout");

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ─── STEP 1: Critical — session auth ──────────────────────────────────
  let user;
  let accessToken: string | undefined;
  try {
    const result = await withAuth();
    user = result.user;
    accessToken = result.accessToken;
  } catch (err) {
    log.error("auth_failure", {}, err);
    return (
      <AuthErrorPage
        error={err instanceof Error ? err : undefined}
        message="We couldn't verify your identity. Please sign in again."
      />
    );
  }

  if (!user) {
    redirect("/sign-in");
  }

  // ─── STEP 2: Critical — Convex user sync ──────────────────────────────
  let convexUser;
  try {
    convexUser = await getOrCreateConvexUser(convex, {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
    });
  } catch (err) {
    log.error("convex_user_sync_failed", { userId: user.id }, err);
    return (
      <AuthErrorPage
        error={err instanceof Error ? err : undefined}
        title="Account Sync Error"
        message="We couldn't load your account data. Please try again or contact support."
      />
    );
  }

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

  // ─── STEP 3: Non-critical — org and tier data ────────────────────────
  let organizations: OrganizationWithMembershipRole[] = [];
  let activeOrganization: OrganizationWithMembershipRole | null = null;
  let orgTier = "free";

  try {
    const cookieStore = await cookies();
    const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;

    // Parallel fetch: org list + tier for the cookie-hinted active org.
    // Previously these ran sequentially, adding a round-trip on every dashboard
    // navigation. If the cookie matches the actual active org (the common case),
    // we avoid a waterfall.
    const [orgList, tierByGuess] = await Promise.all([
      createAuthedConvexClient(accessToken!).query(
        api.features.organizations.queries.listForUser,
        {}
      ) as Promise<OrganizationWithMembershipRole[]>,
      preferredOrgId
        ? convex
            .query(api.features.featureRegistry.queries.getResolvedFeatures, {
              organizationId:
                preferredOrgId as unknown as import("@convex/_generated/dataModel").Id<"organizations">,
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    organizations = orgList;
    activeOrganization = selectActiveOrganization(
      organizations,
      preferredOrgId
    );

    // Use the parallel-fetched tier only if the cookie matched the resolved
    // active org. Otherwise fall back to "free" and let the client fetch via
    // /api/auth/me — avoids another server round-trip on the layout.
    if (
      activeOrganization &&
      tierByGuess &&
      activeOrganization._id === preferredOrgId
    ) {
      orgTier = tierByGuess.tierName ?? "free";
    }
  } catch (err) {
    // Log but don't crash — client-side auth hook will fetch the data
    log.error(
      "organization_context_load_failed",
      { userId: user.id, email: user.email },
      err
    );
  }

  // ─── Build AuthUser / Organization and render ────────────────────────
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    profilePictureUrl: user.profilePictureUrl ?? null,
    organizationId: activeOrganization?._id ?? null,
    role: activeOrganization?.role ?? null,
    // permissions are computed from backend authz via /api/auth/me → actions[]
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };

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
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
