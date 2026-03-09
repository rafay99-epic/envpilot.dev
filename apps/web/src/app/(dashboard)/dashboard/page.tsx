"use client";

import Link from "next/link";
import {
  useDashboardStats,
  useRecentActivity,
  useRecentProjects,
  useTeamMembersQuickView,
  useOnboardingStatus,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import type { Id } from "@convex/_generated/dataModel";

export default function DashboardPage() {
  const { user, organization } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { stats, isLoading: statsLoading } =
    useDashboardStats(activeOrganizationId);
  const { activity, isLoading: activityLoading } =
    useRecentActivity(activeOrganizationId);
  const { projects, isLoading: projectsLoading } =
    useRecentProjects(activeOrganizationId);
  const { members, isLoading: membersLoading } =
    useTeamMembersQuickView(activeOrganizationId);
  const { status: onboardingStatus, isLoading: onboardingLoading } =
    useOnboardingStatus(activeOrganizationId);
  const { hasPermission } = useAuthContext();

  const canCreateProject = hasPermission(PERMISSIONS.PROJECT_CREATE);
  const canInviteTeam = hasPermission(PERMISSIONS.TEAM_INVITE);

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          No active organization
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Create or join an organization to access your dashboard.
        </p>
        <Link
          href="/organizations"
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Manage Organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Welcome back, {user?.firstName || "there"}!
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Here&apos;s an overview of your environment variables and team
            activity.
          </p>
        </div>
        {/* Quick Actions */}
        <div className="flex gap-2">
          {canCreateProject && (
            <Link
              href="/dashboard/projects/new"
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
              New Project
            </Link>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Projects"
          value={statsLoading ? "-" : String(stats?.projects.total ?? 0)}
          change={
            statsLoading ? "" : `+${stats?.projects.thisMonth ?? 0} this month`
          }
          icon={
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          }
          href="/dashboard/projects"
        />
        <StatCard
          title="Environment Variables"
          value={statsLoading ? "-" : String(stats?.variables.total ?? 0)}
          change={
            statsLoading ? "" : `${stats?.variables.encrypted ?? 0} encrypted`
          }
          icon={
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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          }
          href="/dashboard/variables"
        />
        <StatCard
          title="Team Members"
          value={statsLoading ? "-" : String(stats?.team.total ?? 1)}
          change={stats?.team.total === 1 ? "Just you" : "Active"}
          icon={
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
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          }
          href="/dashboard/team"
        />
        <StatCard
          title="Audit Events"
          value={statsLoading ? "-" : String(stats?.auditEvents.last7Days ?? 0)}
          change="Last 7 days"
          icon={
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
          href="/dashboard/audit"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Projects & Activity */}
        <div className="space-y-6 lg:col-span-2">
          {/* Getting Started - Only show if onboarding incomplete */}
          {!onboardingLoading &&
            onboardingStatus &&
            !isOnboardingComplete(onboardingStatus) && (
              <GettingStartedSection status={onboardingStatus} />
            )}

          {/* Recent Projects */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Recent Projects
              </h2>
              <Link
                href="/dashboard/projects"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                View all
              </Link>
            </div>
            {projectsLoading ? (
              <LoadingState />
            ) : projects.length === 0 ? (
              <EmptyProjectsState canCreate={canCreateProject} />
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {projects.map((project: RecentProject) => (
                  <ProjectRow key={project._id} project={project} />
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Recent Activity
              </h2>
              <Link
                href="/dashboard/audit"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                View all
              </Link>
            </div>
            {activityLoading ? (
              <LoadingState />
            ) : activity.length === 0 ? (
              <EmptyActivityState />
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activity.slice(0, 5).map((item: ActivityItem) => (
                  <ActivityRow key={item._id} activity={item} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Team & Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Quick Actions
            </h2>
            <div className="mt-4 space-y-2">
              {canCreateProject && (
                <QuickActionButton
                  href="/dashboard/projects/new"
                  icon={
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
                        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                      />
                    </svg>
                  }
                  label="Create new project"
                />
              )}
              <QuickActionButton
                href="/dashboard/variables"
                icon={
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                }
                label="Add environment variable"
              />
              {canInviteTeam && (
                <QuickActionButton
                  href="/dashboard/team"
                  icon={
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
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                      />
                    </svg>
                  }
                  label="Invite team member"
                />
              )}
              <QuickActionButton
                href="/dashboard/settings"
                icon={
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
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                }
                label="Organization settings"
              />
            </div>
          </div>

          {/* Team Members Card */}
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Team Members
              </h2>
              <Link
                href="/dashboard/team"
                className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Manage
              </Link>
            </div>
            {membersLoading ? (
              <LoadingState />
            ) : members.length === 0 ? (
              <EmptyTeamState canInvite={canInviteTeam} />
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {members
                  .filter(
                    (member): member is NonNullable<typeof member> =>
                      member !== null
                  )
                  .map((member) => (
                    <TeamMemberRow key={String(member._id)} member={member} />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isOnboardingComplete(status: {
  hasProjects: boolean;
  hasVariables: boolean;
  hasTeamMembers: boolean;
  hasIntegrations: boolean;
}): boolean {
  return (
    status.hasProjects &&
    status.hasVariables &&
    status.hasTeamMembers &&
    status.hasIntegrations
  );
}

function StatCard({
  title,
  value,
  change,
  icon,
  href,
}: {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {title}
        </span>
        <div className="rounded-lg bg-zinc-100 p-2 text-zinc-600 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700">
          {icon}
        </div>
      </div>
      <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{change}</p>
    </Link>
  );
}

function GettingStartedSection({
  status,
}: {
  status: {
    hasProjects: boolean;
    hasVariables: boolean;
    hasTeamMembers: boolean;
    hasIntegrations: boolean;
  };
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Getting Started
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Complete these steps to get the most out of ENV Connect.
      </p>

      <div className="mt-6 space-y-4">
        <GettingStartedStep
          number={1}
          title="Create your first project"
          description="Organize your environment variables by project."
          completed={status.hasProjects}
          href="/dashboard/projects/new"
        />
        <GettingStartedStep
          number={2}
          title="Add environment variables"
          description="Store your secrets securely with encryption."
          completed={status.hasVariables}
          href="/dashboard/variables"
        />
        <GettingStartedStep
          number={3}
          title="Invite team members"
          description="Collaborate with your team using role-based access."
          completed={status.hasTeamMembers}
          href="/dashboard/team"
        />
        <GettingStartedStep
          number={4}
          title="Install the CLI or IDE extension"
          description="Sync variables directly to your development environment."
          completed={status.hasIntegrations}
          href="/dashboard/settings#integrations"
        />
      </div>
    </div>
  );
}

function GettingStartedStep({
  number,
  title,
  description,
  completed,
  href,
}: {
  number: number;
  title: string;
  description: string;
  completed: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
    >
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-medium ${
          completed
            ? "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        }`}
      >
        {completed ? (
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
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          number
        )}
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      <svg
        className="h-5 w-5 flex-shrink-0 text-zinc-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function QuickActionButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
    >
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      {label}
    </Link>
  );
}

interface RecentProject {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: number;
  variableCount: number;
}

function ProjectRow({ project }: { project: RecentProject }) {
  return (
    <Link
      href={`/dashboard/projects/${project.slug}`}
      className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
    >
      <div className="flex items-center gap-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
          style={{ backgroundColor: project.color || "#f4f4f5" }}
        >
          {project.icon || "📁"}
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {project.name}
          </p>
          {project.description && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {project.variableCount} {project.variableCount === 1 ? "var" : "vars"}
        </span>
        <svg
          className="h-5 w-5 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

interface ActivityItem {
  _id: string;
  action: string;
  createdAt: number;
  details?: string;
  user: { name: string; avatarUrl?: string } | null;
  project: { name: string; slug: string } | null;
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const actionLabels: Record<string, string> = {
    "org.created": "created organization",
    "org.updated": "updated organization",
    "org.deleted": "deleted organization",
    "org.member_added": "added team member",
    "org.member_removed": "removed team member",
    "org.member_role_changed": "changed member role",
    "project.created": "created project",
    "project.updated": "updated project",
    "project.deleted": "deleted project",
    "variable.created": "added variable",
    "variable.updated": "updated variable",
    "variable.deleted": "deleted variable",
    "variable.accessed": "accessed variable",
    "variable.exported": "exported variable",
    "permission.granted": "granted permission",
    "permission.revoked": "revoked permission",
    "permission.updated": "updated permission",
    "invitation.sent": "sent invitation",
    "invitation.accepted": "accepted invitation",
    "invitation.declined": "declined invitation",
    "access.token_created": "created access token",
    "access.token_revoked": "revoked access token",
    "access.extension_linked": "linked extension",
    "access.extension_unlinked": "unlinked extension",
  };

  const actionLabel = actionLabels[activity.action] || activity.action;

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          {activity.user?.avatarUrl ? (
            <img
              src={activity.user.avatarUrl}
              alt={activity.user.name}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            activity.user?.name?.charAt(0).toUpperCase() || "?"
          )}
        </div>
        <div>
          <p className="text-sm text-zinc-900 dark:text-zinc-100">
            <span className="font-medium">
              {activity.user?.name || "Unknown"}
            </span>{" "}
            {actionLabel}
            {activity.project && (
              <>
                {" "}
                in <span className="font-medium">{activity.project.name}</span>
              </>
            )}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {formatRelativeTime(activity.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TeamMemberRow({
  member,
}: {
  member: {
    _id: unknown;
    role: string;
    joinedAt: number;
    user: { _id: unknown; name?: string; email: string; avatarUrl?: string };
  };
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          {member.user.avatarUrl ? (
            <img
              src={member.user.avatarUrl}
              alt={member.user.name || member.user.email}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            (member.user.name || member.user.email).charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {member.user.name || member.user.email}
          </p>
        </div>
      </div>
      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        {member.role.replace("_", " ")}
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
    </div>
  );
}

function EmptyProjectsState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      </div>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        No projects yet.
      </p>
      {canCreate && (
        <Link
          href="/dashboard/projects/new"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Create your first project
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      )}
    </div>
  );
}

function EmptyActivityState() {
  return (
    <div className="p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        No recent activity yet. Start by creating a project!
      </p>
    </div>
  );
}

function EmptyTeamState({ canInvite }: { canInvite: boolean }) {
  return (
    <div className="p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      </div>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        It&apos;s just you for now.
      </p>
      {canInvite && (
        <Link
          href="/dashboard/team"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Invite team members
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      )}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString();
  } else if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  } else {
    return "Just now";
  }
}
