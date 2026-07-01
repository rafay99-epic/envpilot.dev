"use client";

import { useState, useEffect, use } from "react";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { usePagination } from "@/hooks";
import {
  normalizeOrgRole,
  roleLevel,
  ROLE_LEVEL,
  ORG_ROLE_LABELS,
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
      return "border-green-500/20 bg-green-500/10 text-green-400";
    case "project_manager":
      return "border-amber-500/20 bg-amber-500/10 text-amber-400";
    case "team_lead":
      return "border-blue-500/20 bg-blue-500/10 text-blue-400";
    case "developer":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";
  }
}

export default function ProjectMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { organization } = useAuthContext();

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [assignableMembers, setAssignableMembers] = useState<
    AssignableMember[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Gates from the actor's org role: owners and project managers manage
  // anyone below them; team leads manage developers only.
  const myRole = normalizeOrgRole(organization?.role);
  const canManageMembers =
    !!organization?.role && roleLevel(myRole) >= ROLE_LEVEL.team_lead;
  const canManageTarget = (targetRole: OrgRole): boolean => {
    if (!canManageMembers) return false;
    if (myRole === "team_lead") return targetRole === "developer";
    return roleLevel(targetRole) < roleLevel(myRole);
  };

  // Team leads can only add developers to their projects.
  const addableMembers = assignableMembers.filter((m) =>
    canManageTarget(normalizeOrgRole(m.orgRole))
  );

  async function fetchData() {
    try {
      if (!organization?.id) return;

      // Fetch project
      const projectsRes = await fetch(
        `/api/projects?organizationId=${organization.id}`
      );
      const projectsData = await projectsRes.json();
      const foundProject = projectsData.projects?.find(
        (p: Project) => p.slug === slug
      );

      if (!foundProject) {
        setError("Project not found");
        setIsLoading(false);
        return;
      }

      setProject(foundProject);

      // Fetch project members
      const membersRes = await fetch(
        `/api/projects/${foundProject._id}/members`
      );
      const membersData = await membersRes.json();

      if (!membersRes.ok) {
        throw new Error(membersData.error || "Failed to fetch members");
      }

      setMembers(membersData.members ?? []);
      setAssignableMembers(membersData.assignableMembers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [organization?.id, slug]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!project || !selectedUserId) return;

    setIsAdding(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project._id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add member");
      }

      setSuccessMessage("Member added successfully");
      setShowAddMember(false);
      setSelectedUserId("");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!project) return;
    setError(null);

    try {
      const response = await fetch(
        `/api/projects/${project._id}/members?userId=${userId}`,
        { method: "DELETE" }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove member");
      }

      setSuccessMessage("Member removed");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }

  const membersPagination = usePagination(members, { pageSize: 10 });

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (error && !project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-lg font-semibold text-zinc-100">{error}</h2>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Project Members</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage who has access to {project?.name}
          </p>
        </div>

        {canManageMembers && addableMembers.length > 0 && (
          <button
            onClick={() => setShowAddMember(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm text-green-700 dark:text-green-400">
            {successMessage}
          </p>
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
        <p className="text-sm text-blue-400">
          Organization owners have implicit access to all projects. What each
          member can do here follows from their organization role.
        </p>
      </div>

      {/* Members List */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Members ({members.length})
          </h2>
        </div>

        {members.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No members assigned to this project yet.
          </div>
        ) : (
          <>
            <AnimatedList
              className="divide-y divide-zinc-100 dark:divide-zinc-800"
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
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                        {member.user.name
                          ? member.user.name.charAt(0).toUpperCase()
                          : member.user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {member.user.name || member.user.email}
                        </p>
                        {member.user.name && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                        {ORG_ROLE_LABELS[targetRole]}
                      </span>

                      {targetRole !== "owner" &&
                        canManageTarget(targetRole) && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
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

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Add Project Member
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Assign an organization member to this project. Their abilities
              here follow from their organization role.
            </p>

            <form onSubmit={handleAddMember} className="mt-6 space-y-4">
              {/* User selection */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Member
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">Select a member...</option>
                  {addableMembers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name || m.email} {m.name ? `(${m.email})` : ""} -{" "}
                      {ORG_ROLE_LABELS[normalizeOrgRole(m.orgRole)]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMember(false);
                    setSelectedUserId("");
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding || !selectedUserId}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isAdding ? "Adding..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
