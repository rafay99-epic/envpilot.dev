"use client";

import { useState, use, useId, useReducer, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useConvex, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Users } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { ConfirmDialog, DrawerPanel, ProjectIcon } from "@/components/ui";
import { EnvironmentScopeSelector } from "@/components/members/environment-scope-selector";
import { scopeToPayload } from "@/components/members/environment-scope";
import {
  initialInvitePanelState,
  invitePanelReducer,
  type SearchUser,
} from "@/components/members/invite-panel-state";
import {
  initialMemberSessionsState,
  memberSessionsReducer,
} from "@/components/members/member-sessions-state";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import {
  usePagination,
  useConvexUser,
  useAssignableRoles,
  useOrganizationBySlug,
  useOrganizationMembers,
} from "@/hooks";
import { RequireRole, useAuthContext } from "@/components/auth";
import { useEnforcementEnabled } from "@/hooks/useTierLimits";
import { useFeatureGate } from "@/hooks";
import { LimitWarning } from "@/components/tier/FeatureGate";
import { SuspendMemberDialog } from "@/components/members/SuspendMemberDialog";
import type { Id } from "@convex/_generated/dataModel";
import {
  normalizeOrgRole,
  roleLevel,
  roleLabel,
  roleBadgeColor,
  ROLE_LEVEL,
  ROLE_FALLBACK_COLOR,
  ORG_ROLE_DESCRIPTIONS,
  ENV_SCOPED_ROLE_FALLBACK,
  type OrgRole,
} from "@/lib/roles";
import { createLogger } from "@/lib/logger";
import { formatDate } from "@/lib/format";
import { useTimeZone } from "@/hooks/useTimeZone";

const log = createLogger("app/dashboard/organization-members");

export default function OrganizationMembersPage(props: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <RequireRole minimum="team_lead">
      <OrganizationMembersPageContent {...props} />
    </RequireRole>
  );
}

function OrganizationMembersPageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);
  // Imperative client: this runs per keystroke inside an async handler, not
  // as a subscription, so useQuery is the wrong shape here.
  const convex = useConvex();
  const timeZone = useTimeZone();
  // Names the project checkbox group in the invite drawer, which has no single
  // input to attach a <label> to.
  const projectAssignmentLabelId = useId();

  // ---------------------------------------------------------------------------
  // Convex queries — real-time via WebSocket, no fetch() round-trip
  // ---------------------------------------------------------------------------
  const org = useOrganizationBySlug(slug);
  const orgId = org?._id;

  const membersData = useOrganizationMembers(orgId);
  const invitationsData = useQuery(
    // The requesting user is derived server-side from the browser's verified
    // JWT identity (requireAuthedUser). convexUserId is kept only as an
    // auth-ready skip gate so the query waits until identity is resolvable.
    api.features.organizations.invitations.listPendingByOrganization,
    orgId && convexUserId ? { organizationId: orgId } : "skip"
  );
  const projectsData = useQuery(
    api.features.projects.queries.listByOrganization,
    orgId ? { organizationId: orgId } : "skip"
  );
  // Registry roles the caller may assign — drives the invite / role-change
  // pickers and supplies badge metadata (displayName + color).
  const assignable = useAssignableRoles(orgId) ?? [];
  const roleMetaBySlug = new Map(assignable.map((r) => [r.slug, r]));

  /** Badge label + classes: registry meta first, seeded fallback otherwise. */
  function roleBadge(role: string): { label: string; classes: string } {
    const slug = normalizeOrgRole(role);
    const meta = roleMetaBySlug.get(slug);
    return {
      label: meta?.displayName ?? roleLabel(slug),
      classes: roleBadgeColor(
        meta?.color ?? ROLE_FALLBACK_COLOR[slug] ?? "zinc"
      ),
    };
  }

  // Derive loading state from Convex query readiness
  const isLoading = org === undefined || membersData === undefined;

  // Safe accessors — never null after loading
  const members = (membersData ?? []) as Array<{
    _id: string;
    userId: string;
    role: string;
    joinedAt: number;
    status?: "active" | "suspended";
    suspendedAt?: number;
    user: { _id: string; email: string; name?: string; avatarUrl?: string };
  }>;
  const invitations = (invitationsData ?? []) as Array<{
    _id: string;
    email: string;
    role: string;
    expiresAt: number;
    createdAt: number;
    invitedByUser?: { name?: string; email: string };
  }>;
  const projects = (projectsData ?? []) as Array<{
    _id: string;
    name: string;
    slug: string;
    icon?: string;
    color?: string;
  }>;

  // Derive current user's role from the members list
  const currentUserMember = convexUserId
    ? members.find((m) => m.userId === (convexUserId as string))
    : undefined;
  const userRole = currentUserMember?.role;

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Security hold: which member the suspend dialog targets (null = closed).
  const [suspendTarget, setSuspendTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  // Open/closed is a toggle the header button owns — the drawer's contents are
  // the machine below.
  const [showInviteModal, setShowInviteModal] = useState(false);
  // Every field of the invite drawer: form, submission and email typeahead.
  const [invite, dispatchInvite] = useReducer(
    invitePanelReducer,
    initialInvitePanelState
  );
  // Re-entry guard for the submit handler. `invite.isSubmitting` disables the
  // button, but only from the next render, so a second submit in the same tick
  // still reads the stale `false` and sends a duplicate invitation.
  const invitingRef = useRef(false);
  // The invite panel renders one checkbox per project and asks each one
  // whether it is selected, so the lookup happens once per row.
  const selectedProjectIdSet = new Set(invite.projectIds);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [sessions, dispatchSessions] = useReducer(
    memberSessionsReducer,
    initialMemberSessionsState
  );

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const enforcing = useEnforcementEnabled();
  const totalMemberSlots = members.length + invitations.length;
  const memberLimitGate = useFeatureGate(
    orgId ? (orgId as Id<"organizations">) : undefined,
    "max_team_members",
    { currentCount: totalMemberSlots }
  );
  const memberLimitReached = enforcing && !memberLimitGate.allowed;
  const memberLimit =
    typeof memberLimitGate.limit === "number" ? memberLimitGate.limit : null;

  // ---------------------------------------------------------------------------
  // Mutation handlers — keep API fetch for server-side auth; Convex reactivity
  // auto-updates queries after backend data changes (no manual refetch needed)
  // ---------------------------------------------------------------------------

  // Environment scoping only applies to env-scopeable roles (registry
  // capability access.env_scoped) with project assignments. All environments
  // checked = unrestricted = send nothing.
  const inviteRoleEnvScoped =
    roleMetaBySlug.get(invite.role)?.envScoped ??
    ENV_SCOPED_ROLE_FALLBACK.has(invite.role);
  const inviteEnvScopeApplies =
    inviteRoleEnvScoped && invite.projectIds.length > 0;

  function resetInviteForm() {
    setShowInviteModal(false);
    dispatchInvite({ kind: "form-reset" });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (invitingRef.current) return;
    invitingRef.current = true;
    dispatchInvite({ kind: "submit-started" });

    const environments = inviteEnvScopeApplies
      ? scopeToPayload(invite.environmentScope)
      : undefined;

    try {
      const response = await fetch(`/api/organizations/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invite.email,
          role: invite.role,
          ...(invite.role !== "owner" && invite.projectIds.length > 0
            ? { projectIds: invite.projectIds }
            : {}),
          ...(environments ? { environments } : {}),
        }),
      });

      const data = await response.json();

      // Falls through rather than returning early: the guard and the
      // submitting flag are released after this try/catch, and an early
      // return would skip both and leave the form permanently disabled.
      if (!response.ok) {
        if (data.code !== "TIER_LIMIT_REACHED") {
          throw new Error(data.error || "Failed to send invitation");
        }
        dispatchInvite({
          kind: "submit-failed",
          error:
            "Team member limit reached. Upgrade to Pro for unlimited team members.",
        });
      } else {
        resetInviteForm();

        if (data.emailSent) {
          setNotice("Invitation sent successfully! Email delivered.");
        } else {
          setNotice(
            `Invitation created, but email could not be sent${data.emailError ? `: ${data.emailError}` : ""}. Share the invitation link manually.`
          );
        }
        setTimeout(() => setNotice(null), 8000);
        // No manual refetch — Convex reactivity updates invitations query automatically
      }
    } catch (err) {
      log.error(
        "organization_invite_failed",
        {
          slug,
          email: invite.email,
          inviteRole: invite.role,
          projectIds: invite.projectIds,
        },
        err
      );
      dispatchInvite({
        kind: "submit-failed",
        error: err instanceof Error ? err.message : "An error occurred",
      });
    }
    // Released after the try/catch rather than in a finally block: the catch
    // swallows, so this runs on both paths, and React Compiler bails on any
    // function containing a try statement with a finalizer.
    invitingRef.current = false;
    dispatchInvite({ kind: "submit-settled" });
  }

  async function handleRoleChange(userId: string, newRole: OrgRole) {
    try {
      const response = await fetch(`/api/organizations/${slug}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update role");
      }
      // No manual state update — Convex reactivity updates members query
    } catch (err) {
      log.error(
        "member_role_update_failed",
        { slug, userId, newRole, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }

  function handleReinstateMember(userId: string) {
    setConfirmDialog({
      isOpen: true,
      title: "Reinstate Access",
      message:
        "Restore this member's access? Their role, projects, and permissions were kept during the hold, so everything returns exactly as it was. They will need to sign in again.",
      onConfirm: async () => {
        try {
          const response = await fetch(
            `/api/organizations/${slug}/members/${userId}/suspend`,
            { method: "DELETE" }
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to reinstate member");
          }
        } catch (err) {
          log.error(
            "member_reinstate_failed",
            { slug, userId, organizationId: orgId },
            err
          );
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      },
    });
  }

  function handleRemoveMember(userId: string) {
    setConfirmDialog({
      isOpen: true,
      title: "Remove Member",
      message:
        "Are you sure you want to remove this member? They will lose access to all organization resources.",
      onConfirm: async () => {
        try {
          const response = await fetch(
            `/api/organizations/${slug}/members?userId=${userId}`,
            {
              method: "DELETE",
            }
          );

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to remove member");
          }
          // No manual state update — Convex reactivity updates members query
        } catch (err) {
          log.error(
            "member_remove_failed",
            { slug, userId, organizationId: orgId },
            err
          );
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      },
    });
  }

  // Called straight from the input's change handler, never from a dependency
  // array, so there is nothing for a useCallback to stabilise. React Compiler
  // caches it anyway.
  async function searchUsers(query: string) {
    if (query.length < 2) {
      dispatchInvite({ kind: "search-cleared" });
      return;
    }

    dispatchInvite({ kind: "search-started" });
    try {
      const results = await convex.query(
        api.features.users.users.searchForInvite,
        {
          searchTerm: query,
          organizationId: orgId as Id<"organizations">,
          limit: 5,
        }
      );
      dispatchInvite({
        kind: "search-succeeded",
        results: results.map((u) => ({
          _id: u._id,
          email: u.email,
          name: u.name,
          avatarUrl: u.avatarUrl,
          // The picker's field names; the query returns the same two facts.
          isMember: u.isMember,
          hasPendingInvitation: u.hasPendingInvitation,
        })),
      });
    } catch (err) {
      log.error(
        "member_search_failed",
        { slug, organizationId: orgId, query },
        err
      );
    }
    dispatchInvite({ kind: "search-settled" });
  }

  function handleEmailChange(value: string) {
    dispatchInvite({ kind: "email-changed", email: value });

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(value);
    }, 300);
  }

  function selectUser(user: SearchUser) {
    dispatchInvite({ kind: "suggestion-selected", email: user.email });
  }

  async function toggleSessions(userId: string) {
    if (sessions.expandedUserId === userId) {
      dispatchSessions({ kind: "panel-collapsed" });
      return;
    }

    dispatchSessions({ kind: "panel-expanded", userId });

    try {
      const response = await fetch(
        `/api/organizations/${slug}/members/${userId}/sessions`
      );
      if (response.ok) {
        const data = await response.json();
        dispatchSessions({ kind: "sessions-loaded", sessions: data });
      } else {
        const data = await response.json();
        setError(data.error || "Failed to fetch sessions");
      }
    } catch (err) {
      log.error(
        "member_sessions_fetch_failed",
        { slug, userId, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    }
    dispatchSessions({ kind: "load-settled" });
  }

  async function handleRevokeSession(
    userId: string,
    type: "cli" | "extension" | "all",
    sessionId?: string
  ) {
    dispatchSessions({ kind: "revoke-started" });
    try {
      const response = await fetch(
        `/api/organizations/${slug}/members/${userId}/sessions`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, sessionId }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to revoke session");
      }

      setNotice(
        type === "all"
          ? "All sessions revoked successfully. Notification email sent."
          : "Session revoked successfully. Notification email sent."
      );
      setTimeout(() => setNotice(null), 5000);

      // Refresh the sessions list without closing the panel. Its own catch:
      // the revoke already succeeded, so a failed refresh must neither leave
      // the list spinning nor report the revoke as failed.
      dispatchSessions({ kind: "reload-started" });
      try {
        const refreshRes = await fetch(
          `/api/organizations/${slug}/members/${userId}/sessions`
        );
        if (refreshRes.ok) {
          dispatchSessions({
            kind: "sessions-loaded",
            sessions: await refreshRes.json(),
          });
        }
      } catch (refreshErr) {
        log.error(
          "member_sessions_refresh_failed",
          { slug, userId, organizationId: orgId },
          refreshErr
        );
      }
      dispatchSessions({ kind: "load-settled" });
    } catch (err) {
      log.error(
        "member_session_revoke_failed",
        { slug, userId, type, sessionId, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    }
    dispatchSessions({ kind: "revoke-settled" });
  }

  function handleCancelInvitation(invitationId: string) {
    setConfirmDialog({
      isOpen: true,
      title: "Cancel Invitation",
      message:
        "Are you sure you want to cancel this invitation? The invite link will no longer work.",
      onConfirm: async () => {
        try {
          const response = await fetch(
            `/api/organizations/${slug}/invitations/${invitationId}`,
            {
              method: "DELETE",
            }
          );

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to cancel invitation");
          }
          // No manual state update — Convex reactivity updates invitations query
        } catch (err) {
          log.error(
            "invitation_cancel_failed",
            { slug, invitationId, organizationId: orgId },
            err
          );
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      },
    });
  }

  async function handleResendInvitation(invitationId: string) {
    try {
      const response = await fetch(
        `/api/organizations/${slug}/invitations/${invitationId}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to resend invitation");
      }
      // No manual refetch — Convex reactivity handles updates
    } catch (err) {
      log.error(
        "invitation_resend_failed",
        { slug, invitationId, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }

  const membersPagination = usePagination(members, { pageSize: 10 });
  const invitationsPagination = usePagination(invitations, { pageSize: 10 });

  // Unified role gates — legacy role values are normalized via normalizeOrgRole
  const hasRole = !!currentUserMember;
  // org:invite_member — owner, project_manager, team_lead
  const canInvite = hasRole && roleLevel(userRole) >= ROLE_LEVEL.team_lead;
  // org:change_role — owner only
  const canChangeRoles = hasRole && normalizeOrgRole(userRole) === "owner";
  // org:remove_member / org:view_sessions — owner, project_manager
  const canRemoveMembers =
    hasRole && roleLevel(userRole) >= ROLE_LEVEL.project_manager;
  const canManageSessions = canRemoveMembers;
  const inviteRoleOptions = assignable;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-4 w-32 animate-pulse rounded bg-surface-raised/60" />
            <div className="mt-4 h-8 w-44 animate-pulse rounded bg-surface-raised" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-surface-raised/40" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-raised" />
        </div>
        {/* Members list skeleton */}
        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b px-6 py-4 border-line">
            <div className="h-5 w-24 animate-pulse rounded bg-surface-raised" />
          </div>
          <div className="divide-y divide-line">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-surface-raised" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 animate-pulse rounded bg-surface-raised" />
                    <div className="h-3 w-40 animate-pulse rounded bg-surface-raised/40" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-24 animate-pulse rounded-lg bg-surface-raised/60" />
                  <div className="h-8 w-8 animate-pulse rounded bg-surface-raised/40" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-xl border p-6 border-danger-line bg-danger-soft">
          <p className="text-danger">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href={`/organizations/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-ink-faint hover:text-ink"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to {org?.name}
        </Link>
        <div className="mt-4">
          <PageHeader
            icon={Users}
            title="Team Members"
            description={<>Manage who has access to {org?.name}.</>}
            actions={
              canInvite ? (
                <button
                  onClick={() => setShowInviteModal(true)}
                  disabled={memberLimitReached}
                  title={
                    memberLimitReached
                      ? `Team member limit reached (${totalMemberSlots}/${memberLimit}). Upgrade to Pro for unlimited members.`
                      : undefined
                  }
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    memberLimitReached
                      ? "cursor-not-allowed bg-ink text-ink-muted"
                      : "bg-ink text-ink-inverse hover:bg-ink-muted"
                  }`}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Invite Member
                </button>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Member limit warning */}
      {enforcing && memberLimit !== null && (
        <LimitWarning
          current={totalMemberSlots}
          limit={memberLimit}
          resourceName="team members"
        />
      )}

      {notice && (
        <div
          className={`rounded-lg border p-4 ${
            notice.includes("could not be sent")
              ? "border-warning-line bg-warning-soft"
              : "border-accent-line bg-accent-soft"
          }`}
        >
          <p
            className={`text-sm ${
              notice.includes("could not be sent")
                ? "text-warning"
                : "text-accent"
            }`}
          >
            {notice}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border p-4 border-danger-line bg-danger-soft">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Members List */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="border-b px-6 py-4 border-line">
          <h2 className="font-semibold text-ink">Members ({members.length})</h2>
        </div>
        <AnimatedList
          className="divide-y divide-line"
          pageKey={membersPagination.currentPage}
        >
          {membersPagination.pageItems.map((member) => (
            <div key={member._id}>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  {member.user.avatarUrl ? (
                    <Image
                      src={member.user.avatarUrl}
                      alt={member.user.name || member.user.email}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised">
                      <span className="text-sm font-semibold text-ink-muted">
                        {(member.user.name || member.user.email)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-ink">
                      {member.user.name || "Unnamed User"}
                      {member.status === "suspended" && (
                        <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium bg-danger-soft text-danger">
                          Suspended
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {member.user.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {canChangeRoles ? (
                    <select
                      value={normalizeOrgRole(member.role)}
                      onChange={(e) =>
                        handleRoleChange(
                          member.user._id,
                          e.target.value as OrgRole
                        )
                      }
                      aria-label={`Organization role for ${member.user.name || member.user.email}`}
                      className="rounded-lg border px-3 py-1.5 text-sm border-line bg-surface-raised text-ink"
                    >
                      {assignable.map((role) => (
                        <option key={role.slug} value={role.slug}>
                          {role.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        roleBadge(member.role).classes
                      }`}
                    >
                      {roleBadge(member.role).label}
                    </span>
                  )}
                  {canManageSessions && (
                    <button
                      onClick={() => toggleSessions(member.user._id)}
                      className={`rounded-md p-1.5 transition-colors ${
                        sessions.expandedUserId === member.user._id
                          ? "bg-surface-raised text-ink"
                          : "text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
                      }`}
                      title="Manage sessions"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  )}
                  {canRemoveMembers &&
                    member.userId !== (convexUserId as string) &&
                    normalizeOrgRole(member.role) !== "owner" &&
                    (member.status === "suspended" ? (
                      <button
                        onClick={() => handleReinstateMember(member.user._id)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
                        title="Reinstate access"
                      >
                        Reinstate
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          setSuspendTarget({
                            userId: member.user._id,
                            name: member.user.name || member.user.email,
                          })
                        }
                        className="text-ink-muted hover:text-warning"
                        title="Suspend access (security hold)"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                          />
                        </svg>
                      </button>
                    ))}
                  {canRemoveMembers && (
                    <button
                      onClick={() => handleRemoveMember(member.user._id)}
                      aria-label={`Remove ${member.user.name || member.user.email} from the organization`}
                      className="text-ink-muted hover:text-danger"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable Sessions Panel */}
              {sessions.expandedUserId === member.user._id && (
                <div className="border-t px-6 py-4 border-line bg-canvas">
                  {sessions.isLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-line-strong" />
                      <span className="ml-2 text-sm text-ink-subtle">
                        Loading sessions...
                      </span>
                    </div>
                  ) : sessions.data ? (
                    <div className="space-y-4">
                      {/* CLI Tokens */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          CLI Tokens ({sessions.data.cliTokens.length})
                        </h4>
                        {sessions.data.cliTokens.length === 0 ? (
                          <p className="mt-2 text-sm text-ink-subtle">
                            No active CLI sessions.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {sessions.data.cliTokens.map((token) => (
                              <div
                                key={token._id}
                                className="flex items-center justify-between rounded-lg border px-4 py-3 border-line bg-surface"
                              >
                                <div className="flex items-center gap-3">
                                  <svg
                                    className="h-4 w-4 text-ink-muted"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <div>
                                    <p className="text-sm font-medium text-ink">
                                      {token.deviceName}
                                    </p>
                                    <p className="text-xs text-ink-muted">
                                      Created{" "}
                                      {formatDate(token.createdAt, timeZone)}
                                      {token.lastUsedAt &&
                                        ` · Last used ${formatDate(token.lastUsedAt, timeZone)}`}
                                      {" · "}
                                      <span className="font-mono">
                                        {token.tokenPreview}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: "Revoke CLI Token",
                                      message: `Revoke the CLI token for "${token.deviceName}"? The user will need to re-authenticate.`,
                                      onConfirm: () =>
                                        handleRevokeSession(
                                          member.user._id,
                                          "cli",
                                          token._id
                                        ),
                                    })
                                  }
                                  disabled={sessions.isRevoking}
                                  className="rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 text-danger hover:bg-danger-soft"
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Extension Sessions */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          VS Code Extension (
                          {sessions.data.extensionSessions.length})
                        </h4>
                        {sessions.data.extensionSessions.length === 0 ? (
                          <p className="mt-2 text-sm text-ink-subtle">
                            No active extension sessions.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {sessions.data.extensionSessions.map((session) => (
                              <div
                                key={session._id}
                                className="flex items-center justify-between rounded-lg border px-4 py-3 border-line bg-surface"
                              >
                                <div className="flex items-center gap-3">
                                  <svg
                                    className="h-4 w-4 text-ink-muted"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <div>
                                    <p className="text-sm font-medium text-ink">
                                      {session.projectName}
                                    </p>
                                    <p className="text-xs text-ink-muted">
                                      {session.deviceName} · Linked{" "}
                                      {formatDate(session.createdAt, timeZone)}
                                      {session.lastUsedAt &&
                                        ` · Last used ${formatDate(session.lastUsedAt, timeZone)}`}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: "Revoke Extension Session",
                                      message: `Revoke the extension link for "${session.projectName}" on "${session.deviceName}"? The extension will lose access immediately.`,
                                      onConfirm: () =>
                                        handleRevokeSession(
                                          member.user._id,
                                          "extension",
                                          session._id
                                        ),
                                    })
                                  }
                                  disabled={sessions.isRevoking}
                                  className="rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 text-danger hover:bg-danger-soft"
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Revoke All Button */}
                      {(sessions.data.cliTokens.length > 0 ||
                        sessions.data.extensionSessions.length > 0) && (
                        <div className="flex justify-end border-t pt-3 border-line">
                          <button
                            onClick={() =>
                              setConfirmDialog({
                                isOpen: true,
                                title: "Revoke All Sessions",
                                message: `Revoke all CLI and extension sessions for ${member.user.name || member.user.email}? They will be immediately logged out of all devices and will need to re-authenticate. A notification email will be sent.`,
                                onConfirm: () =>
                                  handleRevokeSession(member.user._id, "all"),
                              })
                            }
                            disabled={sessions.isRevoking}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 bg-danger hover:bg-danger"
                          >
                            {sessions.isRevoking
                              ? "Revoking..."
                              : "Revoke All Sessions"}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </AnimatedList>
        <Pagination
          currentPage={membersPagination.currentPage}
          totalPages={membersPagination.totalPages}
          hasNextPage={membersPagination.hasNextPage}
          hasPrevPage={membersPagination.hasPrevPage}
          onNextPage={membersPagination.nextPage}
          onPrevPage={membersPagination.prevPage}
          onGoToPage={membersPagination.goToPage}
          startIndex={membersPagination.startIndex}
          endIndex={membersPagination.endIndex}
          totalItems={membersPagination.totalItems}
        />
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b px-6 py-4 border-line">
            <h2 className="font-semibold text-ink">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <AnimatedList
            className="divide-y divide-line"
            pageKey={invitationsPagination.currentPage}
          >
            {invitationsPagination.pageItems.map((invitation) => (
              <div
                key={invitation._id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-soft">
                    <svg
                      className="h-5 w-5 text-warning"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-ink">{invitation.email}</p>
                    <p className="text-sm text-ink-muted">
                      Invited {formatDate(invitation.createdAt, timeZone)} ·
                      Expires {formatDate(invitation.expiresAt, timeZone)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      roleBadge(invitation.role).classes
                    }`}
                  >
                    {roleBadge(invitation.role).label}
                  </span>
                  {canInvite && (
                    <>
                      <button
                        onClick={() => handleResendInvitation(invitation._id)}
                        className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-muted"
                        title="Resend invitation"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleCancelInvitation(invitation._id)}
                        className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
                        title="Cancel invitation"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </AnimatedList>
          <Pagination
            currentPage={invitationsPagination.currentPage}
            totalPages={invitationsPagination.totalPages}
            hasNextPage={invitationsPagination.hasNextPage}
            hasPrevPage={invitationsPagination.hasPrevPage}
            onNextPage={invitationsPagination.nextPage}
            onPrevPage={invitationsPagination.prevPage}
            onGoToPage={invitationsPagination.goToPage}
            startIndex={invitationsPagination.startIndex}
            endIndex={invitationsPagination.endIndex}
            totalItems={invitationsPagination.totalItems}
          />
        </div>
      )}

      {/* Security-hold (suspend) dialog */}
      {suspendTarget && orgId && (
        <SuspendMemberDialog
          open={!!suspendTarget}
          onClose={() => setSuspendTarget(null)}
          organizationId={orgId as string}
          slug={slug}
          targetUserId={suspendTarget.userId}
          targetName={suspendTarget.name}
          onError={setError}
        />
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((d) => ({ ...d, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="Confirm"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Invite Side Panel — slides in from the right */}
      <DrawerPanel
        isOpen={showInviteModal}
        onClose={resetInviteForm}
        title="Invite Team Member"
        side="right"
        width="md"
        preventClose={invite.isSubmitting}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {invite.error && (
            <div className="rounded-lg border p-3 border-danger-line bg-danger-soft">
              <p className="text-sm text-danger">{invite.error}</p>
            </div>
          )}
          <div className="relative">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-ink"
            >
              Email Address
            </label>
            <div className="relative mt-2">
              <input
                ref={searchInputRef}
                type="email"
                id="email"
                value={invite.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onFocus={() =>
                  invite.email.length >= 2 &&
                  dispatchInvite({ kind: "suggestions-shown" })
                }
                onBlur={() =>
                  setTimeout(
                    () => dispatchInvite({ kind: "suggestions-hidden" }),
                    200
                  )
                }
                placeholder="Search by email or name..."
                required
                autoComplete="off"
                className="block w-full rounded-lg border px-4 py-2.5 placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink"
              />
              {invite.isSearching && (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-line-strong" />
                </div>
              )}
            </div>
            {invite.showSearchResults && invite.searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border shadow-lg border-line bg-surface-raised">
                <ul className="max-h-60 overflow-auto py-1">
                  {invite.searchResults.map((user) => (
                    <li key={user._id}>
                      <button
                        type="button"
                        onClick={() => selectUser(user)}
                        disabled={user.isMember || user.hasPendingInvitation}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 hover:bg-surface-hover"
                      >
                        {user.avatarUrl ? (
                          <Image
                            src={user.avatarUrl}
                            alt={user.name || user.email}
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover">
                            <span className="text-xs font-semibold text-ink-muted">
                              {(user.name || user.email)
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {user.name || "Unnamed User"}
                          </p>
                          <p className="truncate text-xs text-ink-muted">
                            {user.email}
                          </p>
                        </div>
                        {user.isMember && (
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-accent-soft text-accent">
                            Member
                          </span>
                        )}
                        {user.hasPendingInvitation && (
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                            Pending
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-ink"
            >
              Role
            </label>
            <select
              id="role"
              value={invite.role}
              onChange={(e) =>
                dispatchInvite({
                  kind: "role-changed",
                  role: e.target.value as OrgRole,
                })
              }
              className="mt-2 block w-full rounded-lg border px-4 py-2.5 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink"
            >
              {inviteRoleOptions.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.displayName}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ink-muted">
              {roleMetaBySlug.get(invite.role)?.description ??
                ORG_ROLE_DESCRIPTIONS[invite.role] ??
                ""}
            </p>
          </div>
          {invite.role !== "owner" && projects.length === 0 && (
            <div className="rounded-lg border p-3 border-line bg-surface-raised">
              <p className="text-xs text-ink-muted">
                No projects available. Create a project first to assign
                project-level access during invitation.
              </p>
            </div>
          )}
          {invite.role !== "owner" && projects.length > 0 && (
            <>
              <div>
                {/* A span, not a <label>: this names the checkbox group below,
                    not one input. */}
                <span
                  id={projectAssignmentLabelId}
                  className="block text-sm font-medium text-ink"
                >
                  Assign to Projects
                </span>
                <p className="mt-1 text-xs text-ink-muted">
                  Select which projects this member is assigned to. What they
                  can do there follows from their organization role.
                </p>
                <div
                  role="group"
                  aria-labelledby={projectAssignmentLabelId}
                  className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 border-line"
                >
                  {projects.map((project) => (
                    <label
                      key={project._id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-hover"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectIdSet.has(project._id)}
                        onChange={(e) =>
                          dispatchInvite({
                            kind: "project-toggled",
                            projectId: project._id,
                            selected: e.target.checked,
                          })
                        }
                        className="h-4 w-4"
                      />
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded"
                          style={{
                            backgroundColor: project.color || "#71717a",
                          }}
                        >
                          <ProjectIcon icon={project.icon} size={14} />
                        </span>
                        <span className="text-sm text-ink">{project.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          {inviteEnvScopeApplies && (
            <EnvironmentScopeSelector
              selected={invite.environmentScope}
              onChange={(environments) =>
                dispatchInvite({ kind: "environments-changed", environments })
              }
              disabled={invite.isSubmitting}
            />
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={resetInviteForm}
              className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-line text-ink-muted hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                invite.isSubmitting ||
                !invite.email ||
                (inviteEnvScopeApplies && invite.environmentScope.length === 0)
              }
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
            >
              {invite.isSubmitting ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </DrawerPanel>
    </div>
  );
}
