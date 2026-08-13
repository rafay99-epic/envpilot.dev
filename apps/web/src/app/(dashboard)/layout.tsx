import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { AuthProvider } from "@/components/auth";
import { AccessNotices } from "@/components/auth/AccessNotices";
import { AuthErrorPage } from "@/components/auth/auth-error-page";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { AuthUser, Organization, RoleMeta } from "@/lib/auth";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  selectActiveOrganization,
  type OrganizationWithMembershipRole,
} from "@/lib/organization-context";
import { createLogger } from "@/lib/logger";
import { normalizeOrgRole } from "@/lib/roles";

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
      <div className="dark flex min-h-screen items-center justify-center bg-[#0f172a] text-ink">
        <div className="mx-auto max-w-md rounded-lg border border-danger-line bg-danger-soft p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
            <svg
              className="h-6 w-6 text-danger"
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
          <h1 className="mb-2 text-xl font-semibold text-danger">
            Account Suspended
          </h1>
          <p className="mb-4 text-sm text-ink-muted">
            Your account has been suspended.
            {convexUser.banReason && (
              <span className="mt-2 block text-ink-subtle">
                Reason: {convexUser.banReason}
              </span>
            )}
          </p>
          <p className="text-xs text-ink-subtle">
            If you believe this is a mistake, please contact support.
          </p>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Non-critical — org, tier, and permission data ───────────
  let organizations: OrganizationWithMembershipRole[] = [];
  let activeOrganization: OrganizationWithMembershipRole | null = null;
  let orgTier = "free";
  let initialActions: string[] | undefined;
  let initialCapabilities: Record<string, boolean> | undefined;
  let initialRoleMeta: RoleMeta | null | undefined;

  try {
    const cookieStore = await cookies();
    const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;
    const preferredOrgIdTyped = preferredOrgId as
      | import("@convex/_generated/dataModel").Id<"organizations">
      | undefined;

    // Parallel fetch: org list + tier + permissions for the cookie-hinted
    // active org. The tier/permission guesses are used only when the cookie
    // matches the resolved active org (the common case); on a miss the
    // client falls back to /api/auth/me. Passing `actions` into the
    // AuthProvider is what lets the client SKIP its mount-time
    // /api/auth/me refetch — without it, every hard load duplicated this
    // entire chain (getByWorkosId + listForUser + tiers + permissions).
    const [orgList, tierByGuess, permsByGuess] = await Promise.all([
      createAuthedConvexClient(accessToken!).query(
        api.features.organizations.queries.listForUser,
        {}
      ) as Promise<OrganizationWithMembershipRole[]>,
      preferredOrgIdTyped
        ? convex
            .query(api.features.featureRegistry.queries.getOrgTiersBatch, {
              organizationIds: [preferredOrgIdTyped],
            })
            .catch(() => null)
        : Promise.resolve(null),
      preferredOrgIdTyped
        ? createAuthedConvexClient(accessToken!)
            .query(api.features.auth.queries.getMyPermissions, {
              organizationId: preferredOrgIdTyped,
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    organizations = orgList;
    activeOrganization = selectActiveOrganization(
      organizations,
      preferredOrgId
    );

    // Use the parallel-fetched tier/permissions only if the cookie matched
    // the resolved active org. Otherwise fall back and let the client fetch
    // via /api/auth/me — avoids another server round-trip on the layout.
    if (activeOrganization && activeOrganization._id === preferredOrgId) {
      if (tierByGuess?.[0]) {
        orgTier = tierByGuess[0].tierName ?? "free";
      }
      if (permsByGuess) {
        initialActions = permsByGuess.actions;
        initialCapabilities = permsByGuess.capabilities;
        initialRoleMeta = permsByGuess.roleMeta;
      }
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
    // Normalized for parity with /api/auth/me — now that initialActions can
    // suppress the client refetch, this role persists for the whole session
    role: activeOrganization ? normalizeOrgRole(activeOrganization.role) : null,
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
        role: normalizeOrgRole(activeOrganization.role),
        createdAt: new Date(activeOrganization.createdAt),
        updatedAt: new Date(activeOrganization.updatedAt),
      }
    : null;

  return (
    <AuthProvider
      initialUser={authUser}
      initialOrganization={organization}
      initialActions={initialActions}
      initialCapabilities={initialCapabilities}
      initialRoleMeta={initialRoleMeta}
    >
      <AccessNotices
        activeOrganizationId={activeOrganization?._id ?? null}
        hasOtherOrganizations={organizations.length > 1}
      />
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
