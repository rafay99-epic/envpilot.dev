"use client";

import { useId, useState, use } from "react";
import Link from "next/link";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import {
  useAssignableProjectMembers,
  useConvexUser,
  usePagination,
  useProjectBySlug,
  useProjectMemberActions,
  useProjectMembers,
} from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import { DrawerPanel } from "@/components/ui";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { EnvironmentScopeSelector } from "@/components/members/environment-scope-selector";
import {
  allEnvironments,
  formatEnvironmentScope,
  scopeToPayload,
} from "@/components/members/environment-scope";
import {
  normalizeOrgRole,
  roleLevel,
  roleLabel,
  ROLE_LEVEL,
  ENV_SCOPED_ROLE_FALLBACK,
  type OrgRole,
} from "@/lib/roles";

// Project membership is a pure assignment ("who is on this project").
// What a member can do here follows from their organization role, so the
// role shown next to each member is a read-only badge.
interface ProjectMember {
  _id: string;
  projectId: string;
  userId: string;
  /** The member's organization role (new API shape). */
  orgRole?: string;
  /** Legacy field — older API responses put the role here. */
  role?: string;
  /** Environment scope for developers — absent/empty means unrestricted. */
  environments?: string[];
  /** The role's default scope — the ceiling this member's scope may only narrow. */
  roleEnvironments?: string[];
  addedAt: number;
  user: {
    _id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  };
  addedByUser?: {
    name?: string;
    email: string;
  };
  isOrgAdmin?: boolean;
}

interface AssignableMember {
  _id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  orgRole: string;
  /** The role's default scope — the ceiling an added member's scope may only narrow. */
  roleEnvironments?: string[];
}

interface Project {
  _id: string;
  name: string;
  slug: string;
  organizationId: string;
}

function memberOrgRole(member: ProjectMember): OrgRole {
  if (member.isOrgAdmin) return "owner";
  return normalizeOrgRole(member.orgRole ?? member.role);
}

function roleBadgeClasses(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "border-accent-line bg-accent-soft text-accent";
    case "project_manager":
      return "border-warning-line bg-warning-soft text-warning";
    case "team_lead":
      return "border-info-line bg-info-soft text-info";
    case "editor":
      return "border-info-line bg-info-soft text-info";
    default:
      // developer, viewer, and custom registry roles
      return "border-line-strong bg-surface-hover/10 text-ink-muted";
  }
}

/** Env scoping applies to registry roles holding access.env_scoped —
 *  seeded fallback here since the members API only carries the slug. */
function isEnvScopedRole(role: OrgRole): boolean {
  return ENV_SCOPED_ROLE_FALLBACK.has(role);
}

export default function ProjectMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { organization, roleMeta, user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);
  const project = useProjectBySlug(organization?.id, slug);
  const projectMemberActions = useProjectMemberActions();
  const projectId = project?._id as Id<"projects"> | undefined;
  const { members: liveMembers, isLoading: membersLoading } =
    useProjectMembers(projectId);
  const { members: liveAssignableMembers, isLoading: assignableLoading } =
    useAssignableProjectMembers(projectId, convexUserId);
  const members = liveMembers as ProjectMember[];
  const assignableMembers = liveAssignableMembers as AssignableMember[];
  const isLoading =
    project === undefined || membersLoading || assignableLoading;
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const memberSelectId = useId();
  // Environment scope for developers being added — all checked = unrestricted.
  const [addEnvScope, setAddEnvScope] = useState<string[]>(allEnvironments);

  // Edit environment scope for an existing developer member
  const [editingScopeMember, setEditingScopeMember] =
    useState<ProjectMember | null>(null);
  const [editEnvScope, setEditEnvScope] = useState<string[]>(allEnvironments);
  const [isSavingScope, setIsSavingScope] = useState(false);

  // Gates from the actor's org role: strictly-below management. The caller's
  // level comes from the registry (getMyPermissions roleMeta) so custom roles
  // gate correctly; the seeded ROLE_LEVEL map is the fallback.
  const myLevel = roleMeta?.level ?? roleLevel(organization?.role);
  const canManageMembers =
    !!organization?.role && myLevel >= ROLE_LEVEL.team_lead;
  const canManageTarget = (targetRole: OrgRole): boolean => {
    if (!canManageMembers) return false;
    return roleLevel(targetRole) < myLevel;
  };

  // Only roles strictly below the caller can be added to the project.
  const addableMembers = assignableMembers.filter((m) =>
    canManageTarget(normalizeOrgRole(m.orgRole))
  );

  // Environment scoping only applies to env-scopeable roles.
  const selectedAddTarget = addableMembers.find(
    (m) => m._id === selectedUserId
  );
  const addEnvScopeApplies =
    !!selectedAddTarget &&
    isEnvScopedRole(normalizeOrgRole(selectedAddTarget.orgRole));
  // The target role's default — the ceiling addEnvScope may only narrow.
  const addEnvCeiling = selectedAddTarget?.roleEnvironments;

  function handleSelectAddTarget(userId: string) {
    setSelectedUserId(userId);
    const target = addableMembers.find((m) => m._id === userId);
    setAddEnvScope(target?.roleEnvironments ?? allEnvironments());
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !selectedUserId) return;

    setIsAdding(true);
    setError(null);

    // Covering the full ceiling = unrestricted-within-role = send nothing.
    const environments = addEnvScopeApplies
      ? scopeToPayload(addEnvScope, addEnvCeiling)
      : undefined;

    try {
      await projectMemberActions.add({
        projectId: project._id,
        userId: selectedUserId,
        environments,
      });

      setSuccessMessage("Member added successfully");
      setShowAddMember(false);
      setSelectedUserId("");
      setAddEnvScope(allEnvironments());
    } catch (err) {
      setError(sanitizeConvexError(err));
    } finally {
      setIsAdding(false);
    }
  }

  function openScopeEditor(member: ProjectMember) {
    setEditingScopeMember(member);
    setEditEnvScope(
      member.environments && member.environments.length > 0
        ? [...member.environments]
        : (member.roleEnvironments ?? allEnvironments())
    );
  }

  async function handleSaveScope(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !editingScopeMember) return;

    setIsSavingScope(true);
    setError(null);

    // A role change since the selection was made can leave a disabled,
    // outside-the-ceiling environment checked — drop it before it's sent.
    const ceiling = editingScopeMember.roleEnvironments;
    const scoped = ceiling
      ? editEnvScope.filter((env) => ceiling.includes(env))
      : editEnvScope;

    // Covering the full ceiling = unrestricted-within-role = send nothing.
    const environments = scopeToPayload(scoped, ceiling);

    try {
      await projectMemberActions.setEnvironments({
        projectId: project._id,
        userId: editingScopeMember.userId,
        environments,
      });

      setSuccessMessage("Environment access updated");
      setEditingScopeMember(null);
    } catch (err) {
      setError(sanitizeConvexError(err));
    } finally {
      setIsSavingScope(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!project) return;
    setError(null);

    try {
      await projectMemberActions.remove({ projectId: project._id, userId });

      setSuccessMessage("Member removed");
    } catch (err) {
      setError(sanitizeConvexError(err));
    }
  }

  const membersPagination = usePagination(members, { pageSize: 10 });

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-lg font-semibold text-ink">Project not found</h2>
        <p className="mt-2 text-sm text-ink-muted">
          This project does not exist or you do not have access.
        </p>
        <Link
          href="/dashboard/projects"
          className="mt-4 text-sm font-medium text-accent hover:underline"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader
            cmd="envpilot project members"
            title="Project Members"
            description={`Manage who has access to ${project?.name ?? ""}`}
          />
        </div>

        {canManageMembers && addableMembers.length > 0 && (
          <button
            onClick={() => setShowAddMember(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium transition-colors text-ink-inverse hover:bg-ink-muted"
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
            Add Member
          </button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border p-4 border-danger-line bg-danger-soft">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border p-4 border-accent-line bg-accent-soft">
          <p className="text-sm text-accent">{successMessage}</p>
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-lg border border-info-line bg-info-soft p-4">
        <p className="text-sm text-info">
          Organization owners have implicit access to all projects. What each
          member can do here follows from their organization role.
        </p>
      </div>

      {/* Members List */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="border-b px-6 py-4 border-line">
          <h2 className="font-semibold text-ink">Members ({members.length})</h2>
        </div>

        {members.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">
            No members assigned to this project yet.
          </div>
        ) : (
          <>
            <AnimatedList
              className="divide-y divide-line"
              pageKey={membersPagination.currentPage}
            >
              {membersPagination.pageItems.map((member) => {
                const targetRole = memberOrgRole(member);
                return (
                  <div
                    key={member._id}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium bg-surface-hover text-ink-muted">
                        {member.user.name
                          ? member.user.name.charAt(0).toUpperCase()
                          : member.user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {member.user.name || member.user.email}
                        </p>
                        {member.user.name && (
                          <p className="text-xs text-ink-muted">
                            {member.user.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClasses(
                          targetRole
                        )}`}
                      >
                        {roleLabel(targetRole)}
                      </span>

                      {/* Environment scope — env-scopeable roles only */}
                      {isEnvScopedRole(targetRole) && (
                        <span
                          className="inline-flex items-center rounded-full border border-line-strong bg-surface-hover/10 px-2 py-0.5 text-xs font-medium text-ink-muted"
                          title="Environment access"
                        >
                          {formatEnvironmentScope(
                            member.environments ?? member.roleEnvironments
                          )}
                        </span>
                      )}

                      {isEnvScopedRole(targetRole) &&
                        canManageTarget(targetRole) && (
                          <button
                            onClick={() => openScopeEditor(member)}
                            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
                            title="Edit environment access"
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
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                        )}

                      {targetRole !== "owner" &&
                        canManageTarget(targetRole) && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="rounded-lg p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                            title="Remove from project"
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
                        )}
                    </div>
                  </div>
                );
              })}
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
          </>
        )}
      </div>

      {/* Add Member — slide-over panel */}
      <DrawerPanel
        isOpen={showAddMember}
        onClose={() => {
          setShowAddMember(false);
          setSelectedUserId("");
          setAddEnvScope(allEnvironments());
        }}
        title="Add Project Member"
        side="right"
        width="md"
        preventClose={isAdding}
      >
        <p className="text-sm text-ink-muted">
          Assign an organization member to this project. Their abilities here
          follow from their organization role.
        </p>

        <form onSubmit={handleAddMember} className="mt-6 space-y-4">
          {/* User selection */}
          <div>
            <label
              htmlFor={memberSelectId}
              className="block text-sm font-medium text-ink"
            >
              Member
            </label>
            <select
              id={memberSelectId}
              value={selectedUserId}
              onChange={(e) => handleSelectAddTarget(e.target.value)}
              required
              className="mt-2 block w-full rounded-lg border px-4 py-2.5 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong border-line bg-surface-raised text-ink"
            >
              <option value="">Select a member...</option>
              {addableMembers.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name || m.email} {m.name ? `(${m.email})` : ""} -{" "}
                  {roleLabel(m.orgRole)}
                </option>
              ))}
            </select>
          </div>

          {/* Environment access — developers only */}
          {addEnvScopeApplies && (
            <EnvironmentScopeSelector
              selected={addEnvScope}
              onChange={setAddEnvScope}
              disabled={isAdding}
              ceiling={addEnvCeiling}
            />
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAddMember(false);
                setSelectedUserId("");
                setAddEnvScope(allEnvironments());
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isAdding ||
                !selectedUserId ||
                (addEnvScopeApplies && addEnvScope.length === 0)
              }
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
            >
              {isAdding ? "Adding..." : "Add Member"}
            </button>
          </div>
        </form>
      </DrawerPanel>

      {/* Edit Environment Access — slide-over panel */}
      <DrawerPanel
        isOpen={editingScopeMember !== null}
        onClose={() => setEditingScopeMember(null)}
        title="Edit Environment Access"
        side="right"
        width="md"
        preventClose={isSavingScope}
      >
        {editingScopeMember && (
          <>
            <p className="text-sm text-ink-muted">
              Limit which environments{" "}
              {editingScopeMember.user.name || editingScopeMember.user.email}{" "}
              can work in on this project. Check all environments to remove the
              restriction.
            </p>

            <form onSubmit={handleSaveScope} className="mt-6 space-y-4">
              <EnvironmentScopeSelector
                selected={editEnvScope}
                onChange={setEditEnvScope}
                disabled={isSavingScope}
                ceiling={editingScopeMember.roleEnvironments}
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingScopeMember(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingScope || editEnvScope.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
                >
                  {isSavingScope ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </>
        )}
      </DrawerPanel>
    </div>
  );
}
