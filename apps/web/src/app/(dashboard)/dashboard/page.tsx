"use client";

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
import type { Id } from "@convex/_generated/dataModel";
import { TerminalButtonLink } from "@/components/dashboard/terminal-ui";
import { PageHeader } from "@envpilot/ui";
import { SharedSecretsWidget } from "@/components/dashboard/shared-secrets-widget";
import {
  DuplicateKeysBanner,
  ExpiringSecretsPanel,
  GettingStartedPanel,
  RecentActivityPanel,
  RecentProjectsPanel,
  SystemStatusPanel,
  TeamMembersPanel,
} from "@/components/dashboard/home";
import { Plus } from "lucide-react";
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

      <DuplicateKeysBanner organizationId={activeOrganizationId} />

      {/* Stats as terminal output */}
      <SystemStatusPanel stats={stats} isLoading={statsLoading} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="space-y-6 lg:col-span-2">
          <GettingStartedPanel
            status={onboardingStatus}
            isLoading={onboardingLoading}
          />

          <RecentProjectsPanel
            projects={projects}
            isLoading={projectsLoading}
            canCreateProject={canCreateProject}
          />

          <RecentActivityPanel
            activity={activity}
            isLoading={activityLoading}
          />

          {showRotation && (
            <ExpiringSecretsPanel variables={expiringVariables} />
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
          <TeamMembersPanel
            members={members}
            isLoading={membersLoading}
            canInviteTeam={canInviteTeam}
          />
        </div>
      </div>
    </div>
  );
}
