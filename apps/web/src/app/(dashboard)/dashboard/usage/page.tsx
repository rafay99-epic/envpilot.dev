"use client";

import { useState, useEffect } from "react";
import { useAuthContext } from "@/components/auth";
import { useCachedTierData } from "@/hooks/useTierStore";
import { TierBadge } from "@/components/tier/TierBadge";
import { UsageMeter } from "@/components/tier/UsageMeter";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import {
  TerminalWindow,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { useAllFeatures } from "@/hooks";
import type { Id } from "@convex/_generated/dataModel";
import {
  Check,
  Lock,
  Terminal,
  Puzzle,
  History,
  Upload,
  Shield,
  ScrollText,
  Gauge,
  Building2,
  FolderKanban,
  Users,
  KeyRound,
} from "lucide-react";

const featureDisplayConfig = [
  {
    key: "api_access",
    label: "CLI Access",
    icon: Terminal,
    description: "Manage variables from the terminal",
  },
  {
    key: "extension_access",
    label: "VS Code Extension",
    icon: Puzzle,
    description: "Sync variables in your editor",
  },
  {
    key: "variable_version_history",
    label: "Version History",
    icon: History,
    description: "Track and rollback variable changes",
  },
  {
    key: "bulk_import",
    label: "Bulk Import",
    icon: Upload,
    description: "Import variables from .env files",
  },
  {
    key: "granular_permissions",
    label: "Granular Permissions",
    icon: Shield,
    description: "Per-variable access controls",
  },
];

export default function UsagePage() {
  const { organization } = useAuthContext();
  const { isLoading, tier, usage, isFree, enforcementEnabled } =
    useCachedTierData();
  const [orgCount, setOrgCount] = useState<number | null>(null);

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

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { features: resolvedFeatures, isAllowed, getLimit } = useAllFeatures(orgId);

  if (isLoading || !tier) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-mono text-lg font-semibold text-zinc-100">
            <span className="text-green-400">$</span> envpilot usage
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your plan and resource usage
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

  // In pre-alpha: show unlimited (null) for all meters
  // In enforcement mode: show real limits from dynamic features
  const meterLimits = {
    orgs: enforcementEnabled ? (getLimit("max_organizations") ?? null) : null,
    projects: enforcementEnabled ? (getLimit("max_projects") ?? null) : null,
    teamMembers: enforcementEnabled ? (getLimit("max_team_members") ?? null) : null,
    variables: enforcementEnabled ? (getLimit("max_variables_per_project") ?? null) : null,
    auditDays: enforcementEnabled
      ? (typeof resolvedFeatures?.audit_log_retention_days?.value === "number"
          ? resolvedFeatures.audit_log_retention_days.value
          : 7)
      : 730,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-mono text-lg font-semibold text-zinc-100">
          <span className="text-green-400">$</span> envpilot usage
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your plan and resource usage
        </p>
      </div>

      {/* Plan Overview */}
      <TerminalWindow title="plan — current">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TierBadge tier={tier} size="lg" />
              <div>
                <h2 className="text-sm font-medium text-zinc-100">
                  {tier === "pro" ? "Pro Plan" : "Free Plan"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {!enforcementEnabled
                    ? "Pre-alpha — all features unlocked, billing coming soon"
                    : tier === "pro"
                      ? "Unlimited access to all features"
                      : "Get started with essential features"}
                </p>
              </div>
            </div>
            {!enforcementEnabled && (
              <span className="inline-flex items-center gap-1.5 rounded border border-green-700 bg-green-900/30 px-2 py-0.5 text-[10px] text-green-400">
                <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                Pre-alpha
              </span>
            )}
          </div>
        </div>
      </TerminalWindow>

      {/* Resource Usage — always shown, meters reflect enforcement mode */}
      <TerminalWindow title="resources — usage">
        <div className="p-6 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {orgCount !== null && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                  <Building2 className="h-3.5 w-3.5" />
                  Organizations (owned)
                </div>
                <UsageMeter
                  current={orgCount}
                  limit={meterLimits.orgs}
                  label="Organizations"
                  showValue={true}
                  size="md"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
              </div>
              <UsageMeter
                current={usage?.projects ?? 0}
                limit={meterLimits.projects}
                label="Projects"
                showValue={true}
                size="md"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                <Users className="h-3.5 w-3.5" />
                Team Members
              </div>
              <UsageMeter
                current={usage?.teamMembers ?? 0}
                limit={meterLimits.teamMembers}
                label="Team Members"
                showValue={true}
                size="md"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                <KeyRound className="h-3.5 w-3.5" />
                Variables (highest project)
              </div>
              <UsageMeter
                current={usage?.maxVariablesInProject ?? 0}
                limit={meterLimits.variables}
                label={
                  usage?.maxVariablesProjectName
                    ? `${usage.maxVariablesProjectName}`
                    : "Variables / Project"
                }
                showValue={true}
                size="md"
              />
            </div>
          </div>

          {/* Per-project variable breakdown */}
          {usage?.variablesPerProject &&
            usage.variablesPerProject.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Variables by project
                </p>
                {usage.variablesPerProject.map((p) => (
                  <UsageMeter
                    key={p.projectId}
                    current={p.count}
                    limit={meterLimits.variables}
                    label={p.projectName}
                    showValue={true}
                    size="sm"
                  />
                ))}
              </div>
            )}

          {/* Audit Log Retention */}
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-300">
                  Audit Log Retention
                </span>
              </div>
              <span className="text-sm font-mono text-zinc-100">
                {meterLimits.auditDays} days
              </span>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Features */}
      <TerminalWindow title="features — availability">
        <div className="p-6">
          <div className="space-y-3">
            {featureDisplayConfig.map(({ key, label, icon: Icon, description }) => {
              const enabled = !enforcementEnabled || isAllowed(key);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    enabled
                      ? "border-zinc-700/50 bg-zinc-800/30"
                      : "border-zinc-700/30 bg-zinc-800/10 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4 w-4 ${enabled ? "text-green-400" : "text-zinc-500"}`}
                    />
                    <div>
                      <span
                        className={`text-sm font-medium ${enabled ? "text-zinc-200" : "text-zinc-400"}`}
                      >
                        {label}
                      </span>
                      <p className="text-xs text-zinc-500">{description}</p>
                    </div>
                  </div>
                  {enabled ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-xs font-medium text-amber-400">
                        Pro
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </TerminalWindow>

      {/* Upgrade Banner — only when enforcement is ON and user is on free tier */}
      {enforcementEnabled && isFree && (
        <UpgradePrompt
          reason="Unlock unlimited projects, variables, team members, and advanced features like version history and bulk import."
          feature="Pro Plan"
          currentTier={tier}
          variant="banner"
          onUpgradeClick={() => {
            if (organization.slug) {
              window.location.href = `/organizations/${organization.slug}/settings`;
            }
          }}
        />
      )}
    </div>
  );
}
