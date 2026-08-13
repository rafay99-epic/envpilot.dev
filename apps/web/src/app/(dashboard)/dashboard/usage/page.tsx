"use client";

import { RequireRole, useAuthContext } from "@/components/auth";
import { useCachedTierData, useExtendedUsageSync } from "@/hooks/useTierStore";
import { useAllFeatures, useConvexUser } from "@/hooks";
import { useUserOrganizations } from "@/hooks/useOrganizations";
import {
  TerminalWindow,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import type { Id } from "@convex/_generated/dataModel";
import type { UsageLayoutProps } from "./usage-data";
import { UsageLayout } from "./usage-layout";
import { usePaymentsEnabled } from "@/hooks/usePaymentsEnabled";
import { normalizeOrgRole } from "@/lib/roles";
import { PageHeader } from "@envpilot/ui";

const CHECKOUT_URL = "/api/checkout?tier=pro";

export default function UsagePage() {
  return (
    <RequireRole minimum="owner">
      <UsagePageContent />
    </RequireRole>
  );
}

function UsagePageContent() {
  const { organization, user } = useAuthContext();
  const paymentsEnabled = usePaymentsEnabled();
  // The heavyweight usage scan subscribes ONLY while this page is mounted —
  // the global nav sync deliberately excludes it (see useTierStore.ts).
  useExtendedUsageSync();
  const { isLoading, tier, usage, isFree, enforcementEnabled } =
    useCachedTierData();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const {
    features: resolvedFeatures,
    isAllowed,
    getLimit,
  } = useAllFeatures(orgId);

  // Owned org count via Convex WebSocket — instant, no HTTP round-trip
  const { convexUserId } = useConvexUser(user?.id);
  const allOrgs = useUserOrganizations(convexUserId);
  const orgCount =
    allOrgs !== undefined
      ? allOrgs.filter(
          (o) => o !== null && normalizeOrgRole(o.role) === "owner"
        ).length
      : null;

  // -----------------------------------------------------------------------
  // Early returns
  // -----------------------------------------------------------------------

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-ink-subtle">
          <span className="text-accent">$</span> envpilot usage
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          No active organization. Create or join one to view usage.
        </p>
      </div>
    );
  }

  if (isLoading || !tier) {
    return (
      <div className="space-y-6">
        <PageHeader
          cmd="envpilot usage"
          title="Usage & Plan"
          description="Your plan, resource usage, and feature availability"
        />
        <TerminalWindow title="loading">
          <div className="p-6">
            <TerminalLoading />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Resolved limits
  // -----------------------------------------------------------------------

  const meterLimits = {
    orgs: enforcementEnabled ? (getLimit("max_organizations") ?? null) : null,
    projects: enforcementEnabled ? (getLimit("max_projects") ?? null) : null,
    teamMembers: enforcementEnabled
      ? (getLimit("max_team_members") ?? null)
      : null,
    variables: enforcementEnabled
      ? (getLimit("max_variables_per_project") ?? null)
      : null,
    invitations: enforcementEnabled
      ? (getLimit("max_invitations") ?? null)
      : null,
    activeShares: enforcementEnabled
      ? (getLimit("max_active_shares") ?? null)
      : null,
    rotationLimit: enforcementEnabled
      ? (getLimit("secret_rotation_limit") ?? null)
      : null,
    sharedAccounts: enforcementEnabled
      ? (getLimit("shared_accounts_limit") ?? null)
      : null,
    auditDays: enforcementEnabled
      ? typeof resolvedFeatures?.audit_log_retention_days?.value === "number"
        ? resolvedFeatures.audit_log_retention_days.value
        : 7
      : 365,
    analyticsDays: enforcementEnabled
      ? typeof resolvedFeatures?.analytics_retention_days?.value === "number"
        ? resolvedFeatures.analytics_retention_days.value
        : 7
      : 30,
  };

  // -----------------------------------------------------------------------
  // Build props
  // -----------------------------------------------------------------------

  const layoutProps: UsageLayoutProps = {
    tier,
    isFree,
    enforcementEnabled,
    orgCount,
    usage: usage
      ? {
          projects: usage.projects,
          teamMembers: usage.teamMembers,
          pendingInvitations: usage.pendingInvitations,
          maxVariablesInProject: usage.maxVariablesInProject,
          maxVariablesProjectName: usage.maxVariablesProjectName,
          variablesPerProject: usage.variablesPerProject,
          activeShares: usage.activeShares,
          rotationEnabledVars: usage.rotationEnabledVars,
          sharedAccounts: usage.sharedAccounts,
        }
      : null,
    meterLimits,
    isAllowed,
    getLimit,
    onUpgrade: paymentsEnabled
      ? () => {
          window.location.href = CHECKOUT_URL;
        }
      : undefined,
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <PageHeader
        cmd="envpilot usage"
        title="Usage & Plan"
        description="Your plan, resource usage, and feature availability"
      />

      <UsageLayout {...layoutProps} />
    </div>
  );
}
