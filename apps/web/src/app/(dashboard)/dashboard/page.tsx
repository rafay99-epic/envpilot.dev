"use client";

import Link from "next/link";
import {
  useDashboardStats,
  useRecentActivity,
  useRecentProjects,
  useTeamMembersQuickView,
  useOnboardingStatus,
  useExpiringVariables,
  useFeatureGate,
  useConvexUser,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalButtonLink,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { Plus, ChevronRight, Check, RotateCcw } from "lucide-react";

export default function DashboardPage() {
  const { user, organization } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { convexUserId } = useConvexUser(user?.id);
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
  const { variables: expiringVariables } = useExpiringVariables(
    activeOrganizationId,
    convexUserId
  );
  const { allowed: showRotation } = useFeatureGate(
    activeOrganizationId,
    "secret_rotation"
  );
  const { hasPermission } = useAuthContext();

  const canCreateProject = hasPermission(PERMISSIONS.PROJECT_CREATE);
  const canInviteTeam = hasPermission(PERMISSIONS.TEAM_INVITE);

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> envpilot whoami
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          No active organization. Create or join one to continue.
        </p>
        <TerminalButtonLink href="/organizations" className="mt-6">
          Manage Organizations
        </TerminalButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono">
          <p className="text-xs text-zinc-500">
            [{user?.firstName || "user"}@envpilot ~]$
          </p>
          <h1 className="mt-1 text-xl font-bold text-zinc-100">
            Welcome back, {user?.firstName || "there"}
          </h1>
        </div>
        {canCreateProject && (
          <TerminalButtonLink href="/dashboard/projects/new">
            <Plus className="h-4 w-4" />
            New Project
          </TerminalButtonLink>
        )}
      </div>

      {/* Stats as terminal output */}
      <TerminalWindow title="system-status">
        <div className="p-5 font-mono text-sm">
          {statsLoading ? (
            <TerminalLoading />
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-500 mb-3">
                <span className="text-green-400">$</span> envpilot stats
              </p>
              <StatLine
                label="projects"
                value={String(stats?.projects.total ?? 0)}
                detail={`+${stats?.projects.thisMonth ?? 0} this month`}
              />
              <StatLine
                label="variables"
                value={String(stats?.variables.total ?? 0)}
                detail={`${stats?.variables.encrypted ?? 0} encrypted`}
              />
              <StatLine
                label="team"
                value={String(stats?.team.total ?? 1)}
                detail={stats?.team.total === 1 ? "just you" : "active"}
              />
              <StatLine
                label="events"
                value={String(stats?.auditEvents.last7Days ?? 0)}
                detail="last 7 days"
              />
            </div>
          )}
        </div>
      </TerminalWindow>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Getting Started */}
          {!onboardingLoading &&
            onboardingStatus &&
            !isOnboardingComplete(onboardingStatus) && (
              <TerminalWindow title="getting-started">
                <div className="p-5 font-mono text-sm">
                  <p className="text-xs text-zinc-500 mb-4">
                    Complete these steps to get the most out of Envpilot.
                  </p>
                  <div className="space-y-2">
                    <OnboardingStep
                      number={1}
                      command="envpilot project create"
                      completed={onboardingStatus.hasProjects}
                      href="/dashboard/projects/new"
                    />
                    <OnboardingStep
                      number={2}
                      command="envpilot variable add"
                      completed={onboardingStatus.hasVariables}
                      href="/dashboard/variables"
                    />
                    <OnboardingStep
                      number={3}
                      command="envpilot team invite"
                      completed={onboardingStatus.hasTeamMembers}
                      href="/dashboard/team"
                    />
                    <OnboardingStep
                      number={4}
                      command="envpilot extension install"
                      completed={onboardingStatus.hasIntegrations}
                      href="/dashboard/settings#integrations"
                    />
                  </div>
                </div>
              </TerminalWindow>
            )}

          {/* Recent Projects */}
          <TerminalWindow title="recent-projects">
            <div className="flex items-center justify-between border-b border-zinc-700/50 px-5 py-2.5">
              <span className="font-mono text-xs text-zinc-500">
                <span className="text-green-400">$</span> envpilot project list
                --recent
              </span>
              <Link
                href="/dashboard/projects"
                className="text-xs text-zinc-500 hover:text-green-400"
              >
                View all
              </Link>
            </div>
            {projectsLoading ? (
              <TerminalLoading />
            ) : projects.length === 0 ? (
              <TerminalEmptyState
                command="envpilot project list"
                message="No projects found."
                action={
                  canCreateProject
                    ? {
                        label: "Create your first project",
                        href: "/dashboard/projects/new",
                      }
                    : undefined
                }
              />
            ) : (
              <AnimatedList className="divide-y divide-zinc-800/50">
                {projects.map((project: RecentProject) => (
                  <ProjectRow key={project._id} project={project} />
                ))}
              </AnimatedList>
            )}
          </TerminalWindow>

          {/* Recent Activity */}
          <TerminalWindow title="activity-log">
            <div className="flex items-center justify-between border-b border-zinc-700/50 px-5 py-2.5">
              <span className="font-mono text-xs text-zinc-500">
                <span className="text-green-400">$</span> envpilot audit --tail
              </span>
              <Link
                href="/dashboard/audit"
                className="text-xs text-zinc-500 hover:text-green-400"
              >
                View all
              </Link>
            </div>
            {activityLoading ? (
              <TerminalLoading />
            ) : activity.length === 0 ? (
              <TerminalEmptyState
                command="envpilot audit --tail"
                message="No recent activity. Start by creating a project!"
              />
            ) : (
              <AnimatedList className="divide-y divide-zinc-800/50">
                {activity.slice(0, 5).map((item: ActivityItem) => (
                  <ActivityRow key={item._id} activity={item} />
                ))}
              </AnimatedList>
            )}
          </TerminalWindow>

          {/* Expiring Secrets */}
          {showRotation && (
            <TerminalWindow title="expiring-secrets">
              <div className="flex items-center justify-between border-b border-zinc-700/50 px-5 py-2.5">
                <span className="font-mono text-xs text-zinc-500">
                  <span className="text-green-400">$</span> envpilot secrets
                  --expiring
                </span>
                <Link
                  href="/dashboard/variables"
                  className="text-xs text-zinc-500 hover:text-green-400"
                >
                  View all
                </Link>
              </div>
              {expiringVariables.length === 0 ? (
                <TerminalEmptyState
                  command="envpilot secrets --expiring"
                  message="No secrets expiring in the next 7 days."
                />
              ) : (
                <AnimatedList className="divide-y divide-zinc-800/50">
                  {expiringVariables.map((v) => (
                    <ExpiringSecretRow key={String(v._id)} variable={v} />
                  ))}
                </AnimatedList>
              )}
            </TerminalWindow>
          )}
        </div>

        {/* Right Column -- Team */}
        <div className="space-y-6">
          <TerminalWindow title="team-members">
            <div className="flex items-center justify-between border-b border-zinc-700/50 px-5 py-2.5">
              <span className="font-mono text-xs text-zinc-500">
                <span className="text-green-400">$</span> envpilot team list
              </span>
              <Link
                href="/dashboard/team"
                className="text-xs text-zinc-500 hover:text-green-400"
              >
                Manage
              </Link>
            </div>
            {membersLoading ? (
              <TerminalLoading />
            ) : members.length === 0 ? (
              <TerminalEmptyState
                command="envpilot team list"
                message="It's just you for now."
                action={
                  canInviteTeam
                    ? {
                        label: "Invite team members",
                        href: "/dashboard/team",
                      }
                    : undefined
                }
              />
            ) : (
              <AnimatedList className="divide-y divide-zinc-800/50">
                {members
                  .filter(
                    (member): member is NonNullable<typeof member> =>
                      member !== null
                  )
                  .map((member) => (
                    <TeamMemberRow key={String(member._id)} member={member} />
                  ))}
              </AnimatedList>
            )}
          </TerminalWindow>
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

function StatLine({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  const dots = ".".repeat(Math.max(2, 20 - label.length));
  return (
    <p className="text-zinc-300">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-700"> {dots} </span>
      <span className="text-green-400 font-semibold">{value}</span>
      <span className="text-zinc-600 ml-3 text-xs">({detail})</span>
    </p>
  );
}

function OnboardingStep({
  number,
  command,
  completed,
  href,
}: {
  number: number;
  command: string;
  completed: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-green-500/5"
    >
      <span className="text-zinc-600 text-xs w-6">
        [{String(number).padStart(2, "0")}]
      </span>
      <span className="text-zinc-500">$</span>
      <span
        className={completed ? "text-zinc-600 line-through" : "text-zinc-300"}
      >
        {command}
      </span>
      <span className="ml-auto">
        {completed ? (
          <span className="text-green-400 text-xs flex items-center gap-1">
            <Check className="h-3 w-3" /> DONE
          </span>
        ) : (
          <span className="text-amber-400 text-xs">PENDING</span>
        )}
      </span>
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
      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-green-500/5"
    >
      <div className="flex items-center gap-3">
        <span className="text-green-400 font-mono text-xs">{">"}</span>
        <div>
          <p className="text-sm font-medium font-mono text-zinc-100">
            {project.name}
          </p>
          {project.description && (
            <p className="mt-0.5 text-xs text-zinc-500 truncate max-w-xs">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TerminalBadge color="zinc">
          {project.variableCount} {project.variableCount === 1 ? "var" : "vars"}
        </TerminalBadge>
        <ChevronRight className="h-4 w-4 text-zinc-600" />
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
  "variable.rotated": "rotated secret",
  "variable.expired": "secret expired",
  "variable.rotation_reminder_sent": "sent rotation reminder",
};

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const actionLabel = actionLabels[activity.action] || activity.action;
  const time = formatTimestamp(activity.createdAt);

  return (
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs">
      <span className="text-zinc-600 whitespace-nowrap">[{time}]</span>
      <div className="min-w-0">
        <p className="text-zinc-300">
          <span className="text-green-400">
            {activity.user?.name || "unknown"}
          </span>{" "}
          {actionLabel}
          {activity.project && (
            <>
              {" "}
              in <span className="text-amber-400">{activity.project.name}</span>
            </>
          )}
        </p>
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
  const roleColor =
    member.role === "admin"
      ? "purple"
      : member.role === "team_lead"
        ? "blue"
        : ("zinc" as const);

  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-400">
          {member.user.avatarUrl ? (
            <img
              src={member.user.avatarUrl}
              alt={member.user.name || member.user.email}
              className="h-7 w-7 rounded-full"
            />
          ) : (
            (member.user.name || member.user.email).charAt(0).toUpperCase()
          )}
        </div>
        <span className="text-sm text-zinc-300">
          {member.user.name || member.user.email}
        </span>
      </div>
      <TerminalBadge color={roleColor}>
        {member.role.replace("_", " ")}
      </TerminalBadge>
    </div>
  );
}

function ExpiringSecretRow({
  variable,
}: {
  variable: {
    _id: unknown;
    key: string;
    projectName: string;
    expiresAt: number;
    rotationStatus: string;
  };
}) {
  const isExpired = variable.rotationStatus === "expired";
  const expiresDate = new Date(variable.expiresAt);
  const label = isExpired
    ? "expired"
    : `expires ${expiresDate.toLocaleDateString([], { month: "short", day: "numeric" })}`;

  return (
    <div className="flex items-center justify-between px-5 py-3 font-mono text-xs">
      <div className="flex items-center gap-3">
        <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
        <div>
          <p className="text-sm text-zinc-300">{variable.key}</p>
          <p className="text-zinc-600">{variable.projectName}</p>
        </div>
      </div>
      <TerminalBadge color={isExpired ? "red" : "amber"}>{label}</TerminalBadge>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 24) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
