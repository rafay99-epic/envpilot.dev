"use client";

import { useState } from "react";
import Link from "next/link";
import { TierBadge } from "@/components/tier/TierBadge";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";
import { UsageMeter } from "@/components/tier/UsageMeter";
import {
  Check,
  Crown,
  ArrowRight,
  ChevronDown,
  Building2,
  FolderKanban,
  Users,
  KeyRound,
  Mail,
  Share2,
  KeySquare,
  ScrollText,
  BarChart3,
  HelpCircle,
  ExternalLink,
  Lock,
} from "lucide-react";
import type { UsageLayoutProps } from "./usage-data";
import {
  featureCategories,
  FREE_VALUES,
  PRO_VALUES,
  formatFeatureValue,
} from "./usage-data";

const QUOTA_KEYS = new Set([
  "max_projects",
  "max_variables_per_project",
  "max_organizations",
  "max_team_members",
  "max_invitations",
  "secret_rotation_limit",
  "max_active_shares",
  "shared_accounts_limit",
  "audit_log_retention_days",
  "analytics_retention_days",
]);

export function UsageLayout(props: UsageLayoutProps) {
  const {
    tier,
    isFree,
    enforcementEnabled,
    orgCount,
    usage,
    meterLimits,
    isAllowed,
    onUpgrade,
  } = props;

  // ── Quota row definitions (used for alerts + rendering) ─────────────
  type QuotaDef = {
    icon: React.ReactNode;
    label: string;
    current: number;
    limit: number | null;
    gateKey?: string;
    group: string;
    isVariableRow?: boolean;
  };

  const quotaRows: QuotaDef[] = [
    ...(orgCount !== null
      ? [
          {
            icon: <Building2 className="h-3.5 w-3.5" />,
            label: "Organizations",
            current: orgCount,
            limit: meterLimits.orgs,
            group: "Resources",
          },
        ]
      : []),
    {
      icon: <FolderKanban className="h-3.5 w-3.5" />,
      label: "Projects",
      current: usage?.projects ?? 0,
      limit: meterLimits.projects,
      group: "Resources",
    },
    {
      icon: <Users className="h-3.5 w-3.5" />,
      label: "Team Members",
      current: usage?.teamMembers ?? 0,
      limit: meterLimits.teamMembers,
      group: "Resources",
    },
    {
      icon: <Mail className="h-3.5 w-3.5" />,
      label: "Pending Invitations",
      current: usage?.pendingInvitations ?? 0,
      limit: meterLimits.invitations,
      group: "Resources",
    },
    {
      icon: <KeyRound className="h-3.5 w-3.5" />,
      label: usage?.maxVariablesProjectName
        ? `Variables — ${usage.maxVariablesProjectName}`
        : "Variables / Project",
      current: usage?.maxVariablesInProject ?? 0,
      limit: meterLimits.variables,
      group: "Variables & secrets",
      isVariableRow: true,
    },
    {
      icon: <KeySquare className="h-3.5 w-3.5" />,
      label: "Rotation-Enabled Variables",
      current: usage?.rotationEnabledVars ?? 0,
      limit: meterLimits.rotationLimit,
      gateKey: "secret_rotation",
      group: "Variables & secrets",
    },
    {
      icon: <Share2 className="h-3.5 w-3.5" />,
      label: "Active Share Links",
      current: usage?.activeShares ?? 0,
      limit: meterLimits.activeShares,
      gateKey: "secret_sharing",
      group: "Sharing & collaboration",
    },
    {
      icon: <KeySquare className="h-3.5 w-3.5" />,
      label: "Shared Accounts",
      current: usage?.sharedAccounts ?? 0,
      limit: meterLimits.sharedAccounts,
      gateKey: "shared_accounts",
      group: "Sharing & collaboration",
    },
  ];

  const retentionRows = [
    {
      icon: <ScrollText className="h-4 w-4 text-zinc-400" />,
      label: "Audit Log Retention",
      days: meterLimits.auditDays,
      proDays: 365,
    },
    {
      icon: <BarChart3 className="h-4 w-4 text-zinc-400" />,
      label: "Analytics Retention",
      days: meterLimits.analyticsDays,
      proDays: 30,
    },
  ];

  // ── Alert computation ───────────────────────────────────────────────
  type AlertRow = { label: string; atLimit: boolean };
  const alertRows: AlertRow[] = [];
  for (const r of quotaRows) {
    if (r.limit !== null && r.limit > 0) {
      const pct = r.current / r.limit;
      if (pct >= 0.8) {
        alertRows.push({ label: r.label, atLimit: r.current >= r.limit });
      }
    }
  }

  const hasAlerts = alertRows.length > 0 && enforcementEnabled;
  const atLimitRows = alertRows.filter((r) => r.atLimit);
  const nearRows = alertRows.filter((r) => !r.atLimit);
  const alertVariant: "red" | "amber" | null =
    atLimitRows.length > 0 ? "red" : nearRows.length > 0 ? "amber" : null;

  // ── Plan features data ──────────────────────────────────────────────
  const planVals = isFree ? FREE_VALUES : PRO_VALUES;

  const groups = [
    "Resources",
    "Variables & secrets",
    "Sharing & collaboration",
  ] as const;

  return (
    <div className="space-y-6">
      {/* ── 1. Plan strip ─────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border bg-zinc-900 p-4 ${
          tier === "pro"
            ? "border-purple-500/30 ring-1 ring-purple-500/10"
            : "border-green-500/30 ring-1 ring-green-500/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <TierBadge tier={tier} size="md" />
            <span
              className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                tier === "pro"
                  ? "text-purple-400 bg-purple-400/10"
                  : "text-green-400 bg-green-400/10"
              }`}
            >
              Current plan
            </span>
            <span className="text-lg font-mono font-bold text-zinc-100">
              {isFree ? "$0" : "$15/mo"}
            </span>
            {!enforcementEnabled && (
              <span className="inline-flex items-center gap-1 rounded border border-green-700 bg-green-900/30 px-1.5 py-0.5 text-[9px] text-green-400">
                <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                Pre-alpha
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {enforcementEnabled && isFree && onUpgrade && (
              <button
                onClick={onUpgrade}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
              >
                <Crown className="h-4 w-4" />
                Upgrade
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400/80 hover:text-green-400 transition-colors"
            >
              Compare plans
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── 2. Alert zone ─────────────────────────────────────────────── */}
      {hasAlerts && alertVariant && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            alertVariant === "red"
              ? "border-red-500/30 bg-red-500/5"
              : "border-amber-500/20 bg-amber-500/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <p
              className={`text-sm font-medium ${
                alertVariant === "red" ? "text-red-400" : "text-amber-400"
              }`}
            >
              {alertVariant === "red"
                ? `${atLimitRows.length} resource${atLimitRows.length !== 1 ? "s" : ""} at their limit: ${atLimitRows.map((r) => r.label).join(", ")}`
                : `Approaching limits: ${alertRows.map((r) => r.label).join(", ")}`}
            </p>
            {alertVariant === "red" &&
              enforcementEnabled &&
              isFree &&
              onUpgrade && (
                <button
                  onClick={onUpgrade}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
                >
                  <Crown className="h-3.5 w-3.5" />
                  Upgrade
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
          </div>
        </div>
      )}

      {/* ── 3. Quotas & limits ────────────────────────────────────────── */}
      <TerminalWindow title="usage — quotas & limits">
        <div className="p-6 space-y-4">
          <p className="font-mono text-xs text-zinc-500">
            $ envpilot status --usage
          </p>

          {groups.map((group) => {
            const rows = quotaRows.filter((r) => r.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-3">
                  {group}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {rows.map((r) => (
                    <div key={r.label}>
                      <QuotaRow
                        icon={r.icon}
                        label={r.label}
                        current={r.current}
                        limit={r.limit}
                        isFree={isFree}
                        enforcementEnabled={enforcementEnabled}
                        isAllowed={isAllowed}
                        gateKey={r.gateKey}
                        onUpgrade={onUpgrade}
                      />
                      {r.isVariableRow &&
                        usage?.variablesPerProject &&
                        usage.variablesPerProject.length > 1 && (
                          <VariableByProject
                            projects={usage.variablesPerProject}
                            limit={meterLimits.variables}
                          />
                        )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Data retention */}
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-3">
              Data retention
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {retentionRows.map((r) => (
                <div
                  key={r.label}
                  className="rounded-lg border border-zinc-700/40 bg-zinc-800/20 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {r.icon}
                      <span className="text-sm font-medium text-zinc-300">
                        {r.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono text-zinc-100">
                        {r.days} days
                      </span>
                      {enforcementEnabled && isFree && (
                        <p className="text-[10px] text-zinc-600">
                          Pro: {r.proDays} days
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* ── 4. Plan features ──────────────────────────────────────────── */}
      <TerminalWindow title={`plan features — ${tier}`}>
        <div className="p-6">
          <p className="font-mono text-xs text-zinc-500 mb-4">
            $ envpilot features --plan {tier}
          </p>

          {featureCategories.map((cat) => {
            const visible = cat.features.filter((f) => !QUOTA_KEYS.has(f.key));
            if (visible.length === 0) return null;
            return (
              <div key={cat.name} className="mb-4">
                <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1.5 mt-3">
                  {cat.label}
                </h3>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {visible.map((f) => {
                    const val = formatFeatureValue(
                      planVals[f.key],
                      f.isNumeric,
                      f.numericSuffix
                    );
                    const included = !enforcementEnabled || val.enabled;
                    const proVal = formatFeatureValue(
                      PRO_VALUES[f.key],
                      f.isNumeric,
                      f.numericSuffix
                    );

                    return (
                      <div
                        key={f.key}
                        className="flex items-center gap-2 py-1.5"
                      >
                        {included ? (
                          <Check className="h-4 w-4 text-green-400 shrink-0" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                        )}
                        <span
                          className={`text-sm ${
                            included ? "text-zinc-300" : "text-zinc-500"
                          }`}
                        >
                          {f.label}
                        </span>
                        {!included && (
                          <>
                            {proVal.enabled ? (
                              <span className="text-[10px] text-purple-400 bg-purple-400/10 rounded px-1.5 py-0.5">
                                Pro
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-500 bg-zinc-500/10 rounded px-1.5 py-0.5">
                                Soon
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {isFree && enforcementEnabled && onUpgrade && (
            <div className="border-t border-zinc-700/30 pt-3 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                  Locked features are included in Pro.
                </p>
                <button
                  onClick={onUpgrade}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
                >
                  <Crown className="h-4 w-4" />
                  Upgrade
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </TerminalWindow>

      {/* ── 5. Info bar ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-700/30 bg-zinc-800/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-4 w-4 text-zinc-500 shrink-0" />
          <p className="text-xs text-zinc-500">
            Usage is computed in real time from your data. Limits are enforced
            per resource &mdash; existing data is never deleted.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <Link
            href="/faq#usage-limits"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400/80 hover:text-green-400 transition-colors"
          >
            How it works
            <ExternalLink className="h-3 w-3" />
          </Link>
          <Link
            href="/faq#plans-billing"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400/80 hover:text-green-400 transition-colors"
          >
            Billing FAQ
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuotaRow
// ---------------------------------------------------------------------------

function QuotaRow({
  icon,
  label,
  current,
  limit,
  isFree,
  enforcementEnabled,
  isAllowed,
  gateKey,
  onUpgrade,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  limit: number | null;
  isFree: boolean;
  enforcementEnabled: boolean;
  isAllowed: (key: string) => boolean;
  gateKey?: string;
  onUpgrade?: () => void;
}) {
  const gated = gateKey && enforcementEnabled && !isAllowed(gateKey);

  if (gated) {
    return (
      <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/20 p-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-xs font-medium text-zinc-500">{label}</span>
            <span className="text-[10px] text-zinc-600">Requires Pro</span>
          </div>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="text-[11px] font-medium text-amber-400/80 hover:text-amber-300 transition-colors"
            >
              Unlock &rarr;
            </button>
          )}
        </div>
      </div>
    );
  }

  const isAt = limit !== null && limit > 0 && current >= limit;
  const isNear = limit !== null && limit > 0 && current / limit >= 0.8;

  return (
    <div
      className={`rounded-lg border p-3 ${
        isAt
          ? "border-red-500/30 bg-red-500/5"
          : isNear
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-zinc-700/40 bg-zinc-800/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 mb-2">
        {icon}
        <span className="flex-1">{label}</span>
        {enforcementEnabled && isFree && (
          <span className="text-[10px] text-zinc-600">Pro: Unlimited</span>
        )}
      </div>
      <UsageMeter
        current={current}
        limit={limit}
        label=""
        showValue
        size="md"
      />
      {isAt && enforcementEnabled && isFree && onUpgrade && (
        <button
          onClick={onUpgrade}
          className="mt-1.5 text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
        >
          Upgrade for more &rarr;
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VariableByProject — collapsible per-project breakdown
// ---------------------------------------------------------------------------

function VariableByProject({
  projects,
  limit,
}: {
  projects: { projectId: string; projectName: string; count: number }[];
  limit: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-400 transition-colors"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
        By project
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {projects.map((p) => (
            <UsageMeter
              key={p.projectId}
              current={p.count}
              limit={limit}
              label={p.projectName}
              showValue
              size="sm"
            />
          ))}
        </div>
      )}
    </div>
  );
}
