"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useDashboardStats,
  useRecentActivity,
  useRecentProjects,
  useTeamMembersQuickView,
  useOnboardingStatus,
  useExpiringVariables,
  useFeatureGate,
  useConvexUser,
  useNow,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalButtonLink,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { PageHeader } from "@envpilot/ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { SharedSecretsWidget } from "@/components/dashboard/shared-secrets-widget";
import { normalizeOrgRole, roleLabel } from "@/lib/roles";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDateWith } from "@/lib/format";
import { Plus, ChevronRight, Check, RotateCcw } from "lucide-react";
import DashboardHomeLoading from "./loading";

export default function DashboardPage() {
  const { user, organization, isLoading: isAuthLoading } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { convexUserId } = useConvexUser(user?.id);
  const { stats, isLoading: statsLoading } =
    useDashboardStats(activeOrganizationId);
  const { activity, isLoading: activityLoading } = useRecentActivity(
    activeOrganizationId,
    convexUserId
  );
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
  const { allowed: showSharing } = useFeatureGate(
    activeOrganizationId,
    "secret_sharing"
  );
  const { canDo } = useAuthContext();

  const canCreateProject = canDo("org:create_project");
  const canInviteTeam = canDo("org:invite_member");

  // The session streams in after the shell paints. Show the route's own
  // skeleton meanwhile: a bare spinner here became the whole static shell and
  // made the navigation stop feeling instant.
  if (isAuthLoading) {
    return <DashboardHomeLoading />;
  }

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-ink-subtle">
          <span className="text-accent">$</span> envpilot whoami
        </p>
        <p className="mt-2 text-sm text-ink-muted">
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
      <PageHeader
        cmd={"[" + (user?.firstName || "user") + "@envpilot ~]$"}
        title={"Welcome back, " + (user?.firstName || "there")}
        actions={
          canCreateProject ? (
            <TerminalButtonLink href="/dashboard/projects/new">
              <Plus className="h-4 w-4" />
              New Project
            </TerminalButtonLink>
          ) : undefined
        }
      />

      {/* Stats as terminal output */}
      <TerminalWindow title="system-status">
        <div className="p-5 font-mono text-sm">
          {statsLoading ? (
            <TerminalLoading />
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-ink-subtle mb-3">
                <span className="text-accent">$</span> envpilot stats
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
                  <p className="text-xs text-ink-subtle mb-4">
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
          <TerminalWindow
            title="recent-projects"
            cmd="envpilot project list --recent"
            action={{ label: "View all", href: "/dashboard/projects" }}
          >
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
              <AnimatedList className="divide-y divide-line">
                {projects.map((project: RecentProject) => (
                  <ProjectRow key={project._id} project={project} />
                ))}
              </AnimatedList>
            )}
          </TerminalWindow>

          {/* Recent Activity */}
          <TerminalWindow
            title="activity-log"
            cmd="envpilot audit --tail"
            action={{ label: "View all", href: "/dashboard/audit" }}
          >
            {activityLoading ? (
              <TerminalLoading />
            ) : activity.length === 0 ? (
              <TerminalEmptyState
                command="envpilot audit --tail"
                message="No recent activity. Start by creating a project!"
              />
            ) : (
              <AnimatedList className="divide-y divide-line">
                {activity.slice(0, 5).map((item: ActivityItem) => (
                  <ActivityRow key={item._id} activity={item} />
                ))}
              </AnimatedList>
            )}
          </TerminalWindow>

          {/* Expiring Secrets */}
          {showRotation && (
            <TerminalWindow
              title="expiring-secrets"
              cmd="envpilot secrets --expiring"
              action={{ label: "View all", href: "/dashboard/variables" }}
            >
              {expiringVariables.length === 0 ? (
                <TerminalEmptyState
                  command="envpilot secrets --expiring"
                  message="No secrets expiring in the next 7 days."
                />
              ) : (
                <AnimatedList className="divide-y divide-line">
                  {expiringVariables.map((v) => (
                    <ExpiringSecretRow key={String(v._id)} variable={v} />
                  ))}
                </AnimatedList>
              )}
            </TerminalWindow>
          )}

          {/* Shared Secrets */}
          {showSharing && activeOrganizationId && (
            <SharedSecretsWidget
              organizationId={activeOrganizationId}
              userId={convexUserId}
            />
          )}
        </div>

        {/* Right Column -- Team */}
        <div className="space-y-6">
          <TerminalWindow
            title="team-members"
            cmd="envpilot team list"
            action={{ label: "Manage", href: "/dashboard/team" }}
          >
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
              <AnimatedList className="divide-y divide-line">
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
    <p className="text-ink-muted">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink-faint"> {dots} </span>
      <span className="text-accent font-semibold">{value}</span>
      <span className="text-ink-faint ml-3 text-xs">({detail})</span>
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent-soft"
    >
      <span className="text-ink-faint text-xs w-6">
        [{String(number).padStart(2, "0")}]
      </span>
      <span className="text-ink-subtle">$</span>
      <span
        className={completed ? "text-ink-faint line-through" : "text-ink-muted"}
      >
        {command}
      </span>
      <span className="ml-auto">
        {completed ? (
          <span className="text-accent text-xs flex items-center gap-1">
            <Check className="h-3 w-3" /> DONE
          </span>
        ) : (
          <span className="text-warning text-xs">PENDING</span>
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
      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent-soft"
    >
      <div className="flex items-center gap-3">
        <span className="text-accent font-mono text-xs">{">"}</span>
        <div>
          <p className="text-sm font-medium font-mono text-ink">
            {project.name}
          </p>
          {project.description && (
            <p className="mt-0.5 text-xs text-ink-subtle truncate max-w-xs">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TerminalBadge color="zinc">
          {project.variableCount} {project.variableCount === 1 ? "var" : "vars"}
        </TerminalBadge>
        <ChevronRight className="h-4 w-4 text-ink-faint" />
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
  "project.restored": "restored project",
  "project.moved": "moved project",
  "project.member_added": "added project member",
  "project.member_removed": "removed project member",
  "project.member_environments_changed": "changed environment access",
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
  "invitation.canceled": "canceled invitation",
  "invitation.resent": "resent invitation",
  "tag.created": "created tag",
  "tag.updated": "updated tag",
  "tag.deleted": "deleted tag",
  "template.created": "created template",
  "template.updated": "updated template",
  "template.deleted": "deleted template",
  "access.token_created": "created access token",
  "access.token_revoked": "revoked access token",
  "access.extension_linked": "linked extension",
  "access.extension_unlinked": "unlinked extension",
  "variable.rotated": "rotated secret",
  "variable.expired": "secret expired",
  "variable.rotation_reminder_sent": "sent rotation reminder",
};

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const timeZone = useTimeZone();
  const now = useNow(60_000);
  const actionLabel = actionLabels[activity.action] || activity.action;
  const time = formatTimestamp(activity.createdAt, timeZone, now);

  return (
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs">
      <span className="text-ink-faint whitespace-nowrap">[{time}]</span>
      <div className="min-w-0">
        <p className="text-ink-muted">
          <span className="text-accent">
            {activity.user?.name || "unknown"}
          </span>{" "}
          {actionLabel}
          {activity.project && (
            <>
              {" "}
              in <span className="text-warning">{activity.project.name}</span>
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
  const role = normalizeOrgRole(member.role);
  const roleColor =
    role === "owner"
      ? "purple"
      : role === "project_manager"
        ? "amber"
        : role === "team_lead"
          ? "blue"
          : ("zinc" as const);

  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-xs font-medium text-ink-muted">
          {member.user.avatarUrl ? (
            <Image
              src={member.user.avatarUrl}
              alt={member.user.name || member.user.email}
              width={28}
              height={28}
              className="h-7 w-7 rounded-full"
            />
          ) : (
            (member.user.name || member.user.email).charAt(0).toUpperCase()
          )}
        </div>
        <span className="text-sm text-ink-muted">
          {member.user.name || member.user.email}
        </span>
      </div>
      <TerminalBadge color={roleColor}>{roleLabel(role)}</TerminalBadge>
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
  const timeZone = useTimeZone();
  const isExpired = variable.rotationStatus === "expired";
  const label = isExpired
    ? "expired"
    : `expires ${formatDateWith(variable.expiresAt, { month: "short", day: "numeric" }, timeZone)}`;

  return (
    <div className="flex items-center justify-between px-5 py-3 font-mono text-xs">
      <div className="flex items-center gap-3">
        <RotateCcw className="h-3.5 w-3.5 text-warning" />
        <div>
          <p className="text-sm text-ink-muted">{variable.key}</p>
          <p className="text-ink-faint">{variable.projectName}</p>
        </div>
      </div>
      <TerminalBadge color={isExpired ? "red" : "amber"}>{label}</TerminalBadge>
    </div>
  );
}

function formatTimestamp(
  timestamp: number,
  timeZone: string,
  now: number
): string {
  const hours = Math.floor((now - timestamp) / (1000 * 60 * 60));

  if (hours < 24) {
    return formatDateWith(
      timestamp,
      { hour: "2-digit", minute: "2-digit" },
      timeZone
    );
  }
  return formatDateWith(
    timestamp,
    { month: "short", day: "numeric" },
    timeZone
  );
}
