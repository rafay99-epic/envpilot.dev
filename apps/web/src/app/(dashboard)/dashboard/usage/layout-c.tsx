"use client";

/**
 * Layout C: "Side-by-Side Plan Comparison" (PlanetScale / Neon)
 *
 * - Two plan columns: Free (left) and Pro (right)
 * - Current plan has highlighted border/glow
 * - Comprehensive "Your usage" section with all metered resources
 * - Collapsible detail view for per-project breakdown
 * - Full feature comparison table below
 */

import { useState } from "react";
import Link from "next/link";
import { TierBadge } from "@/components/tier/TierBadge";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";
import { UsageMeter } from "@/components/tier/UsageMeter";
import {
  Check,
  X,
  Crown,
  ArrowRight,
  Infinity,
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
} from "lucide-react";
import type { UsageLayoutProps } from "./usage-data";
import {
  featureCategories,
  FREE_VALUES,
  PRO_VALUES,
  formatFeatureValue,
} from "./usage-data";

export function LayoutC(props: UsageLayoutProps) {
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

  const isPro = tier === "pro";

  return (
    <div className="space-y-6">
      {/* ── Two-column plan cards ────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Free Plan Card */}
        <PlanCard
          tierName="free"
          displayName="Free"
          price="$0"
          priceSuffix=""
          description="Essential features to get started"
          isCurrent={!isPro}
          accentColor="green"
          enforcementEnabled={enforcementEnabled}
        />

        {/* Pro Plan Card */}
        <PlanCard
          tierName="pro"
          displayName="Pro"
          price="$15"
          priceSuffix="/mo"
          description="Unlimited access, advanced features"
          isCurrent={isPro}
          accentColor="purple"
          enforcementEnabled={enforcementEnabled}
          showUpgrade={enforcementEnabled && isFree}
          onUpgrade={onUpgrade}
        />
      </div>

      {/* ── Your Usage — comprehensive meters ────────────────────────── */}
      <UsageSection
        orgCount={orgCount}
        usage={usage}
        meterLimits={meterLimits}
        enforcementEnabled={enforcementEnabled}
        isFree={isFree}
        isAllowed={isAllowed}
        onUpgrade={onUpgrade}
      />

      {/* ── How Usage Works — info bar ─────────────────────────────────── */}
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

      {/* ── Feature Comparison Table ─────────────────────────────────── */}
      <TerminalWindow title="features — free vs pro">
        <div className="p-6">
          <p className="font-mono text-xs text-zinc-500 mb-4">
            $ envpilot plans --diff free pro
          </p>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-b border-zinc-700/50 pb-2 mb-3">
            <span className="text-[11px] uppercase tracking-wider text-zinc-600 font-semibold">
              Feature
            </span>
            <span
              className={`text-[11px] uppercase tracking-wider font-semibold text-center ${
                !isPro ? "text-green-400" : "text-zinc-600"
              }`}
            >
              Free
            </span>
            <span
              className={`text-[11px] uppercase tracking-wider font-semibold text-center ${
                isPro ? "text-purple-400" : "text-zinc-600"
              }`}
            >
              Pro
            </span>
          </div>

          {featureCategories.map((cat) => (
            <div key={cat.name} className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-1.5 mt-3">
                {cat.label}
              </h3>
              {cat.features.map((f) => {
                const freeVal = formatFeatureValue(
                  FREE_VALUES[f.key],
                  f.isNumeric,
                  f.numericSuffix
                );
                const proVal = formatFeatureValue(
                  PRO_VALUES[f.key],
                  f.isNumeric,
                  f.numericSuffix
                );
                const isUpgradeRow = !freeVal.enabled && proVal.enabled;

                return (
                  <div
                    key={f.key}
                    className={`grid grid-cols-[1fr_90px_90px] gap-2 items-center py-1.5 px-1 rounded ${
                      isUpgradeRow && isFree ? "bg-purple-500/5" : ""
                    }`}
                  >
                    <span className="text-sm text-zinc-400 truncate">
                      {f.label}
                    </span>
                    <ValueCell value={freeVal} highlighted={!isPro} />
                    <ValueCell value={proVal} highlighted={isPro} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </TerminalWindow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan Card
// ---------------------------------------------------------------------------

function PlanCard({
  tierName,
  displayName,
  price,
  priceSuffix,
  description,
  isCurrent,
  accentColor,
  enforcementEnabled,
  showUpgrade,
  onUpgrade,
}: {
  tierName: string;
  displayName: string;
  price: string;
  priceSuffix: string;
  description: string;
  isCurrent: boolean;
  accentColor: "green" | "purple";
  enforcementEnabled: boolean;
  showUpgrade?: boolean;
  onUpgrade?: () => void;
}) {
  const borderClass = isCurrent
    ? accentColor === "purple"
      ? "border-purple-500/30 ring-1 ring-purple-500/10"
      : "border-green-500/30 ring-1 ring-green-500/10"
    : "border-zinc-700/40";

  return (
    <div
      className={`rounded-xl border bg-zinc-900 p-5 transition-all relative overflow-hidden ${borderClass} ${
        !isCurrent ? "bg-zinc-900/50" : ""
      }`}
    >
      {/* Subtle gradient for Pro card */}
      {accentColor === "purple" && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent pointer-events-none" />
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TierBadge tier={tierName} size="md" />
            {isCurrent && (
              <span
                className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                  accentColor === "purple"
                    ? "text-purple-400 bg-purple-400/10"
                    : "text-green-400 bg-green-400/10"
                }`}
              >
                Current
              </span>
            )}
            {!enforcementEnabled && isCurrent && (
              <span className="inline-flex items-center gap-1 rounded border border-green-700 bg-green-900/30 px-1.5 py-0.5 text-[9px] text-green-400">
                <span className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
                Pre-alpha
              </span>
            )}
          </div>
          <span className="text-lg font-mono font-bold text-zinc-100">
            {price}
            {priceSuffix && (
              <span className="text-xs text-zinc-500">{priceSuffix}</span>
            )}
          </span>
        </div>
        <p className="text-xs text-zinc-500 mb-3">{description}</p>

        {showUpgrade && onUpgrade && (
          <button
            onClick={onUpgrade}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-400 transition-all hover:border-green-500/50 hover:bg-green-500/20"
          >
            <Crown className="h-4 w-4" />
            Upgrade
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Section — all metered resources
// ---------------------------------------------------------------------------

function UsageSection({
  orgCount,
  usage,
  meterLimits,
  enforcementEnabled,
  isFree,
  isAllowed,
  onUpgrade,
}: {
  orgCount: number | null;
  usage: UsageLayoutProps["usage"];
  meterLimits: UsageLayoutProps["meterLimits"];
  enforcementEnabled: boolean;
  isFree: boolean;
  isAllowed: (key: string) => boolean;
  onUpgrade?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  // Primary resources (always visible)
  const primaryResources: {
    icon: React.ReactNode;
    label: string;
    current: number;
    limit: number | null;
    proLimit: string;
  }[] = [
    ...(orgCount !== null
      ? [
          {
            icon: <Building2 className="h-3.5 w-3.5" />,
            label: "Organizations",
            current: orgCount,
            limit: meterLimits.orgs,
            proLimit: "Unlimited",
          },
        ]
      : []),
    {
      icon: <FolderKanban className="h-3.5 w-3.5" />,
      label: "Projects",
      current: usage?.projects ?? 0,
      limit: meterLimits.projects,
      proLimit: "Unlimited",
    },
    {
      icon: <Users className="h-3.5 w-3.5" />,
      label: "Team Members",
      current: usage?.teamMembers ?? 0,
      limit: meterLimits.teamMembers,
      proLimit: "Unlimited",
    },
    {
      icon: <KeyRound className="h-3.5 w-3.5" />,
      label: usage?.maxVariablesProjectName
        ? `Variables — ${usage.maxVariablesProjectName}`
        : "Variables / Project",
      current: usage?.maxVariablesInProject ?? 0,
      limit: meterLimits.variables,
      proLimit: "Unlimited",
    },
  ];

  // Extended resources (shown in details)
  const extendedResources: {
    icon: React.ReactNode;
    label: string;
    current: number;
    limit: number | null;
    proLimit: string;
    featureKey: string;
    gateKey?: string; // boolean gate that must also be enabled
  }[] = [
    {
      icon: <Mail className="h-3.5 w-3.5" />,
      label: "Pending Invitations",
      current: usage?.pendingInvitations ?? 0,
      limit: meterLimits.invitations,
      proLimit: "Unlimited",
      featureKey: "max_invitations",
    },
    {
      icon: <Share2 className="h-3.5 w-3.5" />,
      label: "Active Share Links",
      current: usage?.activeShares ?? 0,
      limit: meterLimits.activeShares,
      proLimit: "Unlimited",
      featureKey: "max_active_shares",
      gateKey: "secret_sharing",
    },
    {
      icon: <KeySquare className="h-3.5 w-3.5" />,
      label: "Rotation-Enabled Variables",
      current: usage?.rotationEnabledVars ?? 0,
      limit: meterLimits.rotationLimit,
      proLimit: "Unlimited",
      featureKey: "secret_rotation_limit",
      gateKey: "secret_rotation",
    },
    {
      icon: <KeySquare className="h-3.5 w-3.5" />,
      label: "Shared Accounts",
      current: usage?.sharedAccounts ?? 0,
      limit: meterLimits.sharedAccounts,
      proLimit: "Unlimited",
      featureKey: "shared_accounts_limit",
      gateKey: "shared_accounts",
    },
  ];

  return (
    <TerminalWindow title="your usage — resources">
      <div className="p-6 space-y-4">
        <p className="font-mono text-xs text-zinc-500">
          $ envpilot status --usage
        </p>

        {/* Primary resource meters */}
        <div className="grid gap-4 sm:grid-cols-2">
          {primaryResources.map((r) => (
            <ResourceMeter
              key={r.label}
              icon={r.icon}
              label={r.label}
              current={r.current}
              limit={r.limit}
              proLimit={r.proLimit}
              isFree={isFree}
              enforcementEnabled={enforcementEnabled}
              onUpgrade={onUpgrade}
            />
          ))}
        </div>

        {/* Retention metrics */}
        <div className="grid gap-3 sm:grid-cols-2">
          <RetentionBlock
            icon={<ScrollText className="h-4 w-4 text-zinc-400" />}
            label="Audit Log Retention"
            days={meterLimits.auditDays}
            proDays={365}
            isFree={isFree}
            enforcementEnabled={enforcementEnabled}
          />
          <RetentionBlock
            icon={<BarChart3 className="h-4 w-4 text-zinc-400" />}
            label="Analytics Retention"
            days={meterLimits.analyticsDays}
            proDays={30}
            isFree={isFree}
            enforcementEnabled={enforcementEnabled}
          />
        </div>

        {/* Expandable detailed usage */}
        <div className="border-t border-zinc-700/30 pt-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex w-full items-center justify-between text-left group"
          >
            <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-400 transition-colors">
              Detailed usage — shares, rotation, invitations
            </span>
            <ChevronDown
              className={`h-4 w-4 text-zinc-600 transition-transform ${showDetails ? "rotate-180" : ""}`}
            />
          </button>

          {showDetails && (
            <div className="mt-3 space-y-3">
              {extendedResources.map((r) => {
                const gateEnabled =
                  !r.gateKey || !enforcementEnabled || isAllowed(r.gateKey);

                if (!gateEnabled) {
                  // Feature is gated — show locked state
                  return (
                    <div
                      key={r.featureKey}
                      className="flex items-center justify-between rounded-lg border border-zinc-700/30 bg-zinc-800/20 px-4 py-3 opacity-60"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-zinc-600">{r.icon}</span>
                        <div>
                          <span className="text-sm text-zinc-500">
                            {r.label}
                          </span>
                          <span className="text-[10px] text-zinc-600 ml-2">
                            Requires Pro
                          </span>
                        </div>
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
                  );
                }

                return (
                  <ResourceMeter
                    key={r.featureKey}
                    icon={r.icon}
                    label={r.label}
                    current={r.current}
                    limit={r.limit}
                    proLimit={r.proLimit}
                    isFree={isFree}
                    enforcementEnabled={enforcementEnabled}
                    onUpgrade={onUpgrade}
                    compact
                  />
                );
              })}

              {/* Per-project variable breakdown (inside details) */}
              {usage?.variablesPerProject &&
                usage.variablesPerProject.length > 1 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[11px] font-medium text-zinc-600 uppercase tracking-wider">
                      Variables by project
                    </p>
                    {usage.variablesPerProject.map((p) => (
                      <UsageMeter
                        key={p.projectId}
                        current={p.count}
                        limit={meterLimits.variables}
                        label={p.projectName}
                        showValue
                        size="sm"
                      />
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </TerminalWindow>
  );
}

// ---------------------------------------------------------------------------
// Resource Meter — single metered resource with bar + contextual upgrade
// ---------------------------------------------------------------------------

function ResourceMeter({
  icon,
  label,
  current,
  limit,
  proLimit,
  isFree,
  enforcementEnabled,
  onUpgrade,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  limit: number | null;
  proLimit: string;
  isFree: boolean;
  enforcementEnabled: boolean;
  onUpgrade?: () => void;
  compact?: boolean;
}) {
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
        {enforcementEnabled && isFree && !compact && (
          <span className="text-[10px] text-zinc-600">Pro: {proLimit}</span>
        )}
      </div>
      <UsageMeter
        current={current}
        limit={limit}
        label=""
        showValue
        size={compact ? "sm" : "md"}
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
// Retention Block
// ---------------------------------------------------------------------------

function RetentionBlock({
  icon,
  label,
  days,
  proDays,
  isFree,
  enforcementEnabled,
}: {
  icon: React.ReactNode;
  label: string;
  days: number;
  proDays: number;
  isFree: boolean;
  enforcementEnabled: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/20 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-zinc-300">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-mono text-zinc-100">{days} days</span>
          {enforcementEnabled && isFree && (
            <p className="text-[10px] text-zinc-600">Pro: {proDays} days</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value Cell (for comparison table)
// ---------------------------------------------------------------------------

function ValueCell({
  value,
  highlighted,
}: {
  value: { text: string; enabled: boolean };
  highlighted?: boolean;
}) {
  if (value.text) {
    const isUnlimited = value.text === "Unlimited";
    return (
      <div className="flex justify-center">
        <span
          className={`text-xs font-mono ${
            isUnlimited
              ? "text-green-400"
              : highlighted
                ? "text-zinc-200"
                : "text-zinc-500"
          }`}
        >
          {isUnlimited ? <Infinity className="h-3 w-3 mx-auto" /> : value.text}
        </span>
      </div>
    );
  }
  if (value.enabled) {
    return (
      <div className="flex justify-center">
        <Check className="h-4 w-4 text-green-400" />
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <X className="h-3.5 w-3.5 text-zinc-700" />
    </div>
  );
}
