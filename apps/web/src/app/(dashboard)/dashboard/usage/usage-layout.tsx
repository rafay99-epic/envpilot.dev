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

const FEATURE_GROUPS = [
  "Resources",
  "Variables & secrets",
  "Sharing & collaboration",
] as const;

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
      icon: <ScrollText className="h-4 w-4 text-ink-muted" />,
      label: "Audit Log Retention",
      days: meterLimits.auditDays,
      proDays: 365,
    },
    {
      icon: <BarChart3 className="h-4 w-4 text-ink-muted" />,
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

  // A capped row is one the plan actually meters. Everything else is uncapped,
  // and is listed by name rather than drawn as a full bar — a 100%-filled bar
  // for an unlimited resource reads as "maxed out", which is the opposite of
  // what it means.
  const cappedRows = quotaRows.filter((r) => r.limit !== null);
  const uncappedRows = quotaRows.filter((r) => r.limit === null);

  const offFeatures = enforcementEnabled
    ? featureCategories.flatMap((cat) =>
        cat.features
          .filter(
            (f) =>
              !QUOTA_KEYS.has(f.key) &&
              !formatFeatureValue(planVals[f.key], f.isNumeric, f.numericSuffix)
                .enabled
          )
          .map((f) => f.label)
      )
    : [];

  return (
    <div className="space-y-6">
      {/* ── 1. Plan strip ─────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border bg-surface p-4 ${
          tier === "pro"
            ? "border-premium-line ring-1 ring-premium-line"
            : "border-accent-line ring-1 ring-accent-line"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <TierBadge tier={tier} size="md" />
            <span
              className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                tier === "pro"
                  ? "text-premium bg-premium-soft"
                  : "text-accent bg-accent-soft"
              }`}
            >
              Current plan
            </span>
            <span className="text-lg font-mono font-bold text-ink">
              {isFree ? "$0" : "$15/mo"}
            </span>
            {!enforcementEnabled && (
              <span className="inline-flex items-center gap-1 rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[9px] text-accent">
                <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                Pre-alpha
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {enforcementEnabled && isFree && onUpgrade && (
              <button
                onClick={onUpgrade}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
              >
                <Crown className="h-4 w-4" />
                Upgrade
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <Link
              href="/dashboard/settings?tab=billing"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent/80 hover:text-accent transition-colors"
            >
              Manage billing
              <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent/80 hover:text-accent transition-colors"
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
              ? "border-danger-line bg-danger-soft"
              : "border-warning-line bg-warning-soft"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className={`text-sm font-medium ${
                alertVariant === "red" ? "text-danger" : "text-warning"
              }`}
            >
              {alertVariant === "red"
                ? `${atLimitRows.length} resource${atLimitRows.length !== 1 ? "s" : ""} at ${atLimitRows.length === 1 ? "its" : "their"} limit: ${atLimitRows.map((r) => r.label).join(", ")}`
                : `Approaching limits: ${alertRows.map((r) => r.label).join(", ")}`}
            </p>
            {alertVariant === "red" &&
              enforcementEnabled &&
              isFree &&
              onUpgrade && (
                <button
                  onClick={onUpgrade}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
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
      <TerminalWindow title="usage — limits">
        <div className="p-6 space-y-6">
          <p className="font-mono text-xs text-ink-subtle">
            $ envpilot status --usage
          </p>

          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`font-mono text-2xl font-bold ${
                  atLimitRows.length > 0
                    ? "text-danger"
                    : nearRows.length > 0
                      ? "text-warning"
                      : "text-accent"
                }`}
              >
                {atLimitRows.length > 0
                  ? `${atLimitRows.length} at limit`
                  : nearRows.length > 0
                    ? `${nearRows.length} near limit`
                    : "All clear"}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                {atLimitRows.length > 0
                  ? atLimitRows.map((r) => r.label).join(", ")
                  : nearRows.length > 0
                    ? nearRows.map((r) => r.label).join(", ")
                    : "nothing near a limit"}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-ink-faint">
              {tier} &middot; {uncappedRows.length} of {quotaRows.length}{" "}
              resources uncapped
            </p>
          </div>

          {cappedRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-faint">
                Counts toward a limit
              </h3>
              <div className="divide-y divide-line border-y border-line">
                {cappedRows.map((r) => (
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
                {retentionRows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between py-2.5"
                  >
                    <span className="text-sm text-ink-muted">{r.label}</span>
                    <span className="font-mono text-sm text-ink">
                      {r.days} days
                      {enforcementEnabled && isFree && (
                        <span className="ml-2 text-[11px] text-ink-faint">
                          Pro: {r.proDays}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uncappedRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-faint">
                No limit on your plan
              </h3>
              <p className="font-mono text-[11px] leading-relaxed text-ink-muted">
                {uncappedRows.map((r) => r.label).join("  ·  ")}
              </p>
            </div>
          )}

          {offFeatures.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-faint">
                Not in your plan
              </h3>
              <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
                {offFeatures.join("  ·  ")}
              </p>
            </div>
          )}
        </div>
      </TerminalWindow>

      {/* ── 4. Plan features ──────────────────────────────────────────── */}
      <TerminalWindow title={`plan features — ${tier}`}>
        <div className="p-6">
          <p className="font-mono text-xs text-ink-subtle mb-4">
            $ envpilot features --plan {tier}
          </p>

          {featureCategories.map((cat) => {
            const visible = cat.features.filter((f) => !QUOTA_KEYS.has(f.key));
            if (visible.length === 0) return null;
            return (
              <div key={cat.name} className="mb-4">
                <h3 className="text-[10px] uppercase tracking-widest text-ink-faint font-bold mb-1.5 mt-3">
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
                          <Check className="h-4 w-4 text-accent shrink-0" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                        )}
                        <span
                          className={`text-sm ${
                            included ? "text-ink-muted" : "text-ink-subtle"
                          }`}
                        >
                          {f.label}
                        </span>
                        {!included && (
                          <>
                            {proVal.enabled ? (
                              <span className="text-[10px] text-premium bg-premium-soft rounded px-1.5 py-0.5">
                                Pro
                              </span>
                            ) : (
                              <span className="text-[10px] text-ink-subtle bg-surface-hover/10 rounded px-1.5 py-0.5">
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
            <div className="border-t border-line pt-3 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-subtle">
                  Locked features are included in Pro.
                </p>
                <button
                  onClick={onUpgrade}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
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
      <div className="rounded-lg border border-line bg-surface-raised/20 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-4 w-4 text-ink-subtle shrink-0" />
          <p className="text-xs text-ink-subtle">
            Usage is computed in real time from your data. Limits are enforced
            per resource &mdash; existing data is never deleted.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <Link
            href="/faq#usage-limits"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent/80 hover:text-accent transition-colors"
          >
            How it works
            <ExternalLink className="h-3 w-3" />
          </Link>
          <Link
            href="/faq#plans-billing"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent/80 hover:text-accent transition-colors"
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
      <div className="rounded-lg border border-line bg-surface-raised/20 p-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-ink-faint" />
            <span className="text-xs font-medium text-ink-subtle">{label}</span>
            <span className="text-[10px] text-ink-faint">Requires Pro</span>
          </div>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="text-[11px] font-medium text-warning/80 hover:text-warning transition-colors"
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
          ? "border-danger-line bg-danger-soft"
          : isNear
            ? "border-warning-line bg-warning-soft"
            : "border-line bg-surface-raised/20"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-ink-muted mb-2">
        {icon}
        <span className="flex-1">{label}</span>
        {enforcementEnabled && isFree && (
          <span className="text-[10px] text-ink-faint">Pro: Unlimited</span>
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
          className="mt-1.5 text-[11px] font-medium text-warning hover:text-warning transition-colors"
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
        className="flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink-muted transition-colors"
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
