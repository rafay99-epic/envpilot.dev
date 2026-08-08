"use client";

import { useState, use, useCallback, useRef } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Users } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { ConfirmDialog, DrawerPanel, ProjectIcon } from "@/components/ui";
import {
  EnvironmentScopeSelector,
  allEnvironments,
  scopeToPayload,
} from "@/components/members/environment-scope-selector";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { usePagination, useConvexUser, useAssignableRoles } from "@/hooks";
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

const log = createLogger("app/dashboard/organization-members");

interface SearchUser {
  _id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isMember?: boolean;
  hasPendingInvitation?: boolean;
}

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

  // ---------------------------------------------------------------------------
  // Convex queries — real-time via WebSocket, no fetch() round-trip
  // ---------------------------------------------------------------------------
  const org = useQuery(api.features.organizations.queries.getBySlug, { slug });
  const orgId = org?._id;

  const membersData = useQuery(
    api.features.organizations.queries.getMembers,
    orgId ? { organizationId: orgId } : "skip"
  );
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

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("developer");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  // Environment scope for developer invites — all checked = unrestricted.
  const [inviteEnvScope, setInviteEnvScope] =
    useState<string[]>(allEnvironments());

  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [expandedSessionsUserId, setExpandedSessionsUserId] = useState<
    string | null
  >(null);
  const [memberSessions, setMemberSessions] = useState<{
    cliTokens: Array<{
      _id: string;
      deviceName: string;
      lastUsedAt?: number;
      createdAt: number;
      expiresAt: number;
      tokenPreview: string;
    }>;
    extensionSessions: Array<{
      _id: string;
      projectId: string;
      projectName: string;
      deviceName: string;
      lastUsedAt?: number;
      createdAt: number;
      expiresAt: number;
      tokenPreview: string;
    }>;
  } | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingSession, setIsRevokingSession] = useState(false);

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
    roleMetaBySlug.get(inviteRole)?.envScoped ??
    ENV_SCOPED_ROLE_FALLBACK.has(inviteRole);
  const inviteEnvScopeApplies =
    inviteRoleEnvScoped && selectedProjectIds.length > 0;

  function resetInviteForm() {
    setShowInviteModal(false);
    setInviteEmail("");
    setInviteRole("developer");
    setSelectedProjectIds([]);
    setInviteEnvScope(allEnvironments());
    setInviteError(null);
    setSearchResults([]);
    setShowSearchResults(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setIsInviting(true);
    setInviteError(null);

    const environments = inviteEnvScopeApplies
      ? scopeToPayload(inviteEnvScope)
      : undefined;

    try {
      const response = await fetch(`/api/organizations/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          ...(inviteRole !== "owner" && selectedProjectIds.length > 0
            ? { projectIds: selectedProjectIds }
            : {}),
          ...(environments ? { environments } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === "TIER_LIMIT_REACHED") {
          setInviteError(
            "Team member limit reached. Upgrade to Pro for unlimited team members."
          );
          return;
        }
        throw new Error(data.error || "Failed to send invitation");
      }

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
    } catch (err) {
      log.error(
        "organization_invite_failed",
        {
          slug,
          email: inviteEmail,
          inviteRole,
          projectIds: selectedProjectIds,
        },
        err
      );
      setInviteError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsInviting(false);
    }
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

  const searchUsers = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}&organizationId=${orgId}&limit=5`
        );
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.users || []);
          setShowSearchResults(true);
        }
      } catch (err) {
        log.error(
          "member_search_failed",
          { slug, organizationId: orgId, query },
          err
        );
      } finally {
        setIsSearching(false);
      }
    },
    [slug, orgId]
  );

  function handleEmailChange(value: string) {
    setInviteEmail(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(value);
    }, 300);
  }

  function selectUser(user: SearchUser) {
    setInviteEmail(user.email);
    setShowSearchResults(false);
    setSearchResults([]);
  }

  async function toggleSessions(userId: string) {
    if (expandedSessionsUserId === userId) {
      setExpandedSessionsUserId(null);
      setMemberSessions(null);
      return;
    }

    setExpandedSessionsUserId(userId);
    setIsLoadingSessions(true);
    setMemberSessions(null);

    try {
      const response = await fetch(
        `/api/organizations/${slug}/members/${userId}/sessions`
      );
      if (response.ok) {
        const data = await response.json();
        setMemberSessions(data);
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
    } finally {
      setIsLoadingSessions(false);
    }
  }

  async function handleRevokeSession(
    userId: string,
    type: "cli" | "extension" | "all",
    sessionId?: string
  ) {
    setIsRevokingSession(true);
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

      // Refresh the sessions list without closing the panel
      setIsLoadingSessions(true);
      const refreshRes = await fetch(
        `/api/organizations/${slug}/members/${userId}/sessions`
      );
      if (refreshRes.ok) {
        setMemberSessions(await refreshRes.json());
      }
      setIsLoadingSessions(false);
    } catch (err) {
      log.error(
        "member_session_revoke_failed",
        { slug, userId, type, sessionId, organizationId: orgId },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setIsRevokingSession(false);
    }
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
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-800/60" />
            <div className="mt-4 h-8 w-44 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded bg-zinc-800/40" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-800" />
        </div>
        {/* Members list skeleton */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <div className="h-5 w-24 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-800" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-28 animate-pulse rounded bg-zinc-800" />
                    <div className="h-3 w-40 animate-pulse rounded bg-zinc-800/40" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-800/60" />
                  <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/40" />
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href={`/organizations/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
                      ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
                      : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
              : "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20"
          }`}
        >
          <p
            className={`text-sm ${
              notice.includes("could not be sent")
                ? "text-amber-700 dark:text-amber-400"
                : "text-green-700 dark:text-green-400"
            }`}
          >
            {notice}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Members List */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Members ({members.length})
          </h2>
        </div>
        <AnimatedList
          className="divide-y divide-zinc-200 dark:divide-zinc-800"
          pageKey={membersPagination.currentPage}
        >
          {membersPagination.pageItems.map((member) => (
            <div key={member._id}>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  {member.user.avatarUrl ? (
                    <img
                      src={member.user.avatarUrl}
                      alt={member.user.name || member.user.email}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                        {(member.user.name || member.user.email)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {member.user.name || "Unnamed User"}
                      {member.status === "suspended" && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Suspended
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
                        expandedSessionsUserId === member.user._id
                          ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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
                        className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
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
                        className="text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400"
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
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
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
              {expandedSessionsUserId === member.user._id && (
                <div className="border-t border-zinc-100 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
                  {isLoadingSessions ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-400" />
                      <span className="ml-2 text-sm text-zinc-500">
                        Loading sessions...
                      </span>
                    </div>
                  ) : memberSessions ? (
                    <div className="space-y-4">
                      {/* CLI Tokens */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          CLI Tokens ({memberSessions.cliTokens.length})
                        </h4>
                        {memberSessions.cliTokens.length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
                            No active CLI sessions.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {memberSessions.cliTokens.map((token) => (
                              <div
                                key={token._id}
                                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                <div className="flex items-center gap-3">
                                  <svg
                                    className="h-4 w-4 text-zinc-400"
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
                                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                      {token.deviceName}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                      Created{" "}
                                      {new Date(
                                        token.createdAt
                                      ).toLocaleDateString()}
                                      {token.lastUsedAt &&
                                        ` · Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`}
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
                                  disabled={isRevokingSession}
                                  className="rounded-md px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
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
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          VS Code Extension (
                          {memberSessions.extensionSessions.length})
                        </h4>
                        {memberSessions.extensionSessions.length === 0 ? (
                          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
                            No active extension sessions.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {memberSessions.extensionSessions.map((session) => (
                              <div
                                key={session._id}
                                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                <div className="flex items-center gap-3">
                                  <svg
                                    className="h-4 w-4 text-zinc-400"
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
                                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                      {session.projectName}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {session.deviceName} · Linked{" "}
                                      {new Date(
                                        session.createdAt
                                      ).toLocaleDateString()}
                                      {session.lastUsedAt &&
                                        ` · Last used ${new Date(session.lastUsedAt).toLocaleDateString()}`}
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
                                  disabled={isRevokingSession}
                                  className="rounded-md px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                >
                                  Revoke
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Revoke All Button */}
                      {(memberSessions.cliTokens.length > 0 ||
                        memberSessions.extensionSessions.length > 0) && (
                        <div className="flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-700">
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
                            disabled={isRevokingSession}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
                          >
                            {isRevokingSession
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
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <AnimatedList
            className="divide-y divide-zinc-200 dark:divide-zinc-800"
            pageKey={invitationsPagination.currentPage}
          >
            {invitationsPagination.pageItems.map((invitation) => (
              <div
                key={invitation._id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <svg
                      className="h-5 w-5 text-amber-600 dark:text-amber-400"
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
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {invitation.email}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Invited{" "}
                      {new Date(invitation.createdAt).toLocaleDateString()} ·
                      Expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
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
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
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
        preventClose={isInviting}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {inviteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400">
                {inviteError}
              </p>
            </div>
          )}
          <div className="relative">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Email Address
            </label>
            <div className="relative mt-2">
              <input
                ref={searchInputRef}
                type="email"
                id="email"
                value={inviteEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                onFocus={() =>
                  inviteEmail.length >= 2 && setShowSearchResults(true)
                }
                onBlur={() =>
                  setTimeout(() => setShowSearchResults(false), 200)
                }
                placeholder="Search by email or name..."
                required
                autoComplete="off"
                className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              {isSearching && (
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-400" />
                </div>
              )}
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                <ul className="max-h-60 overflow-auto py-1">
                  {searchResults.map((user) => (
                    <li key={user._id}>
                      <button
                        type="button"
                        onClick={() => selectUser(user)}
                        disabled={user.isMember || user.hasPendingInvitation}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-700"
                      >
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name || user.email}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-700">
                            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                              {(user.name || user.email)
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {user.name || "Unnamed User"}
                          </p>
                          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {user.email}
                          </p>
                        </div>
                        {user.isMember && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Member
                          </span>
                        )}
                        {user.hasPendingInvitation && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
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
              className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              Role
            </label>
            <select
              id="role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {inviteRoleOptions.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.displayName}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {roleMetaBySlug.get(inviteRole)?.description ??
                ORG_ROLE_DESCRIPTIONS[inviteRole] ??
                ""}
            </p>
          </div>
          {inviteRole !== "owner" && projects.length === 0 && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No projects available. Create a project first to assign
                project-level access during invitation.
              </p>
            </div>
          )}
          {inviteRole !== "owner" && projects.length > 0 && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Assign to Projects
                </label>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Select which projects this member is assigned to. What they
                  can do there follows from their organization role.
                </p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                  {projects.map((project) => (
                    <label
                      key={project._id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProjectIds([
                              ...selectedProjectIds,
                              project._id,
                            ]);
                          } else {
                            setSelectedProjectIds(
                              selectedProjectIds.filter(
                                (id) => id !== project._id
                              )
                            );
                          }
                        }}
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
                        <span className="text-sm text-zinc-900 dark:text-zinc-100">
                          {project.name}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
          {inviteEnvScopeApplies && (
            <EnvironmentScopeSelector
              selected={inviteEnvScope}
              onChange={setInviteEnvScope}
              disabled={isInviting}
            />
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={resetInviteForm}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isInviting ||
                !inviteEmail ||
                (inviteEnvScopeApplies && inviteEnvScope.length === 0)
              }
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isInviting ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </form>
      </DrawerPanel>
    </div>
  );
}
