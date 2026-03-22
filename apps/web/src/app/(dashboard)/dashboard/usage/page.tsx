"use client";

import { useState, useEffect } from "react";
import { useAuthContext } from "@/components/auth";
import { useCachedTierData } from "@/hooks/useTierStore";
import { useAllFeatures } from "@/hooks";
import {
  TerminalWindow,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import type { Id } from "@convex/_generated/dataModel";
import type { UsageLayoutProps } from "./usage-data";
import { LayoutC } from "./layout-c";
import { usePaymentsEnabled } from "@/hooks/usePaymentsEnabled";

const CHECKOUT_URL =
  "/api/checkout?products=d1edde6d-3201-4cec-b1e4-e053d7edba23";

export default function UsagePage() {
  const { organization } = useAuthContext();
  const paymentsEnabled = usePaymentsEnabled();
  const { isLoading, tier, usage, isFree, enforcementEnabled } =
    useCachedTierData();
  const [orgCount, setOrgCount] = useState<number | null>(null);
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const {
    features: resolvedFeatures,
    isAllowed,
    getLimit,
  } = useAllFeatures(orgId);

  // Fetch owned org count
  useEffect(() => {
    const controller = new AbortController();
    async function fetchOrgCount() {
      try {
        const response = await fetch("/api/organizations", {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          const owned = (data.organizations || []).filter(
            (o: { role: string }) => o.role === "admin"
          );
          setOrgCount(owned.length);
        }
      } catch {
        // Silently fail (includes AbortError)
      }
    }
    fetchOrgCount();
    return () => controller.abort();
  }, []);

  // -----------------------------------------------------------------------
  // Early returns
  // -----------------------------------------------------------------------

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> envpilot usage
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          No active organization. Create or join one to view usage.
        </p>
      </div>
    );
  }

  if (isLoading || !tier) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-mono text-lg font-semibold text-zinc-100">
            <span className="text-green-400">$</span> envpilot usage
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your plan, resource usage, and feature availability
          </p>
        </div>
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
      <div>
        <h1 className="font-mono text-lg font-semibold text-zinc-100">
          <span className="text-green-400">$</span> envpilot usage
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your plan, resource usage, and feature availability
        </p>
      </div>

      <LayoutC {...layoutProps} />
    </div>
  );
}
