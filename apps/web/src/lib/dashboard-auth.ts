import "server-only";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { AuthUser, Organization, RoleMeta } from "@/lib/auth";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import {
  ACTIVE_ORG_COOKIE_NAME,
  selectActiveOrganization,
  type OrganizationWithMembershipRole,
} from "@/lib/organization-context";
import { createLogger } from "@/lib/logger";
import { normalizeOrgRole } from "@/lib/roles";

const log = createLogger("lib/dashboard-auth");

/**
 * Everything the dashboard shell needs about the current session, as a value
 * rather than a redirect or a rendered error page.
 *
 * The dashboard layout hands the unresolved promise to AuthProvider instead of
 * awaiting it, so the shell prerenders and paints on click while this streams
 * in. That means the failure modes have to travel as data — a layout that
 * returns `<AuthErrorPage/>` mid-render can't be streamed into a client tree.
 */
export type DashboardAuthSeed =
  | {
      status: "ready";
      user: AuthUser;
      organization: Organization | null;
      actions?: string[];
      capabilities?: Record<string, boolean>;
      roleMeta?: RoleMeta | null;
      hasOtherOrganizations: boolean;
    }
  | { status: "unauthenticated" }
  | { status: "banned"; reason: string | null }
  | { status: "error"; kind: "auth" | "sync"; message: string };

export async function loadDashboardAuth(): Promise<DashboardAuthSeed> {
  // Everything below is request-bound, and `withAuth()` reads the clock
  // internally to check session expiry. Without this the prerender tries to
  // bake that in and reports the route as blocking. `io()` suspends during
  // prerendering so the session stays out of the static shell — and unlike
  // `connection()` it doesn't block the route's prefetch, which is what keeps
  // the dashboard shell instant.
  await io();

  // ─── STEP 1: Critical — session auth ──────────────────────────────────
  let user;
  let accessToken: string | undefined;
  try {
    const result = await withAuth();
    user = result.user;
    accessToken = result.accessToken;
  } catch (err) {
    log.error("auth_failure", {}, err);
    return {
      status: "error",
      kind: "auth",
      message: "We couldn't verify your identity. Please sign in again.",
    };
  }

  // proxy.ts already redirects unauthenticated traffic to WorkOS before this
  // runs, so reaching here means the session went away mid-flight.
  if (!user) {
    return { status: "unauthenticated" };
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
    return {
      status: "error",
      kind: "sync",
      message:
        "We couldn't load your account data. Please try again or contact support.",
    };
  }

  if (convexUser.isBanned) {
    return { status: "banned", reason: convexUser.banReason ?? null };
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

  return {
    status: "ready",
    user: authUser,
    organization,
    actions: initialActions,
    capabilities: initialCapabilities,
    roleMeta: initialRoleMeta,
    hasOtherOrganizations: organizations.length > 1,
  };
}
