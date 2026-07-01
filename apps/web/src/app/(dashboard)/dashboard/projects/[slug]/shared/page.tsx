"use client";

import { useState, useMemo, useCallback, useEffect, use } from "react";
import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Flame,
  Clock,
  Lock,
  X,
  Loader2,
  Check,
  Circle,
  Eye,
  Shield,
  Share2,
  AlertTriangle,
} from "lucide-react";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { useProjects } from "@/hooks";
import { useRevokeShare } from "@/hooks/useShareSecret";
import { ConfirmDialog } from "@/components/ui";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";

/* ─── Types ────────────────────────────────────────────────────────── */

type ShareStatus = "active" | "burned" | "expired" | "revoked";
type FilterKey = "all" | ShareStatus;

interface ShareRecipient {
  email: string;
  hasViewed: boolean;
  viewedAt?: number;
  otpVerified: boolean;
}

interface ShareData {
  _id: string;
  variableKey: string;
  mode: "one_time" | "time_limited";
  status: ShareStatus;
  expiresAt: number;
  hasPassphrase: boolean;
  totalViewCount: number;
  createdAt: number;
  recipients: ShareRecipient[];
}

interface SharedPageProps {
  params: Promise<{ slug: string }>;
}

/* ─── Constants (stable references, never re-created) ──────────────── */

const STATUS_CONFIG: Record<ShareStatus, { label: string; classes: string }> = {
  active: {
    label: "Active",
    classes:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  burned: {
    label: "Viewed",
    classes:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  expired: {
    label: "Expired",
    classes: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
  revoked: {
    label: "Revoked",
    classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "burned", label: "Viewed" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

const STATS_CONFIG = [
  {
    key: "all" as FilterKey,
    label: "Total",
    icon: Share2,
    color: "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800",
  },
  {
    key: "active" as FilterKey,
    label: "Active",
    icon: Shield,
    color:
      "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
  },
  {
    key: "burned" as FilterKey,
    label: "Viewed",
    icon: Eye,
    color:
      "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  },
  {
    key: "expired" as FilterKey,
    label: "Expired",
    icon: Clock,
    color: "text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50",
  },
  {
    key: "revoked" as FilterKey,
    label: "Revoked",
    icon: X,
    color: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  },
] as const;

/** Refresh interval for relative timestamps (60s) */
const TIMESTAMP_REFRESH_MS = 60_000;

/* ─── Helpers ──────────────────────────────────────────────────────── */

function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function formatTimeRemaining(expiresAt: number, now: number): string {
  const diff = expiresAt - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/* ─── Empty state sub-component ────────────────────────────────────── */

function EmptyState({ filter }: { filter: FilterKey }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <Share2 className="h-6 w-6 text-zinc-400" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {filter === "all"
          ? "No shared variables yet."
          : `No ${FILTER_OPTIONS.find((f) => f.key === filter)?.label.toLowerCase()} shares.`}
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {filter === "all"
          ? "Share a variable from the Variables page to get started."
          : "Try changing the filter to see other shares."}
      </p>
    </div>
  );
}

/* ─── Skeleton for loading state ───────────────────────────────────── */

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3 w-12 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <div className="mt-2 h-6 w-8 rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}

function ShareCardSkeleton() {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="h-3 w-48 rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-3 w-36 rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Share card sub-component (extracted for readability) ─────────── */

interface ShareCardProps {
  share: ShareData;
  now: number;
  isOrgAdmin: boolean;
  revokingId: string | null;
  onRevokeClick: (id: string) => void;
}

function ShareCard({
  share,
  now,
  isOrgAdmin,
  revokingId,
  onRevokeClick,
}: ShareCardProps) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left side: share info */}
        <div className="min-w-0 flex-1">
          {/* Top row: key + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {share.variableKey}
            </code>

            {/* Mode badge */}
            {share.mode === "one_time" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Flame className="h-3 w-3" />
                One-time
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Clock className="h-3 w-3" />
                Time-limited
              </span>
            )}

            {/* Status badge */}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[share.status].classes}`}
            >
              {STATUS_CONFIG[share.status].label}
            </span>

            {/* Lock icon */}
            {share.hasPassphrase && (
              <Lock className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </div>

          {/* Recipients */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {share.recipients.map((recipient) => (
              <span
                key={recipient.email}
                className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                {recipient.hasViewed ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Circle className="h-2.5 w-2.5 fill-zinc-300 text-zinc-300 dark:fill-zinc-600 dark:text-zinc-600" />
                )}
                <span>{recipient.email}</span>
                {recipient.hasViewed && recipient.viewedAt && (
                  <span className="text-zinc-400 dark:text-zinc-500">
                    ({formatRelativeTime(recipient.viewedAt, now)})
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Meta row */}
          <p className="mt-1.5 text-xs text-zinc-400">
            Created {formatRelativeTime(share.createdAt, now)}
            {share.status === "active" && (
              <>
                {" "}
                &middot; Expires in {formatTimeRemaining(share.expiresAt, now)}
              </>
            )}{" "}
            &middot; <Eye className="mb-px inline h-3 w-3" />{" "}
            {share.totalViewCount} view
            {share.totalViewCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Right side: revoke button */}
        {isOrgAdmin && share.status === "active" && (
          <button
            onClick={() => onRevokeClick(share._id)}
            disabled={revokingId === share._id}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {revokingId === share._id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Page component ───────────────────────────────────────────────── */

export default function SharedVariablesPage({ params }: SharedPageProps) {
  const { slug } = use(params);
  const { organization, isLoading: isAuthLoading } = useAuthContext();

  // Stable timestamp for relative time formatting — refreshes every 60s
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TIMESTAMP_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { allowed: canShare } = useFeatureGate(orgId, "secret_sharing");

  const project = useProjects(orgId)?.projects.find((p) => p.slug === slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectError = project === null ? new Error("Project not found") : null;

  const projectId = project?._id as Id<"projects"> | undefined;

  const projectShares = useConvexQuery(
    api.sharedSecrets.listByProject,
    projectId ? { projectId } : "skip"
  );

  const revokeShare = useRevokeShare();

  // Revoking shares requires team lead or above (variables CRUD scope)
  const isOrgAdmin =
    !!organization?.role &&
    roleLevel(organization.role) >= ROLE_LEVEL.team_lead;

  // ── UI state ──
  const [filter, setFilter] = useState<FilterKey>("all");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  // ── Derived data (memoized) ──
  const shares: ShareData[] = useMemo(
    () =>
      (projectShares ?? []).map((s) => ({
        ...s,
        _id: String(s._id),
      })),
    [projectShares]
  );

  const counts: Record<FilterKey, number> = useMemo(
    () => ({
      all: shares.length,
      active: shares.filter((s) => s.status === "active").length,
      burned: shares.filter((s) => s.status === "burned").length,
      expired: shares.filter((s) => s.status === "expired").length,
      revoked: shares.filter((s) => s.status === "revoked").length,
    }),
    [shares]
  );

  const filteredShares = useMemo(
    () =>
      filter === "all" ? shares : shares.filter((s) => s.status === filter),
    [shares, filter]
  );

  // ── Handlers (stable refs) ──
  const openRevokeConfirm = useCallback((id: string) => {
    setRevokeError(null); // clear stale errors when opening a new dialog
    setConfirmRevokeId(id);
  }, []);

  const closeRevokeConfirm = useCallback(() => {
    setConfirmRevokeId(null);
  }, []);

  const handleRevoke = useCallback(async () => {
    if (!confirmRevokeId) return;
    setRevokingId(confirmRevokeId);
    setRevokeError(null);
    try {
      await revokeShare.mutateAsync(confirmRevokeId);
    } catch (err) {
      setRevokeError(
        err instanceof Error ? err.message : "Failed to revoke share"
      );
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  }, [confirmRevokeId, revokeShare]);

  const dismissError = useCallback(() => setRevokeError(null), []);

  // ── Loading: auth or project still loading ──
  const isLoadingShares = projectShares === undefined;

  if (isAuthLoading || isLoadingProject) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {projectError instanceof Error
            ? projectError.message
            : "Project not found"}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  if (!canShare) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Shared Variables
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage shared access links for this project&apos;s environment
            variables.
          </p>
        </div>
        <FeatureGate
          organizationId={orgId}
          featureKey="secret_sharing"
          featureName="Secret Sharing"
          fallbackVariant="card"
        >
          <div />
        </FeatureGate>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-zinc-400" />
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Shared Variables
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage shared access links for this project&apos;s environment
          variables.
        </p>
      </div>

      {/* Stats Row */}
      {isLoadingShares ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STATS_CONFIG.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 ${stat.color}`}
            >
              <div className="flex items-center gap-2">
                <stat.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{stat.label}</span>
              </div>
              <p className="mt-1 text-lg font-bold">{counts[stat.key]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error Banner */}
      {revokeError && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">
            {revokeError}
          </p>
          <button
            onClick={dismissError}
            className="ml-4 shrink-0 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Buttons */}
      {!isLoadingShares && (
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === opt.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {opt.label}
              <span className="ml-1.5 text-xs opacity-70">
                {counts[opt.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Share List */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {isLoadingShares ? (
          <ShareCardSkeleton />
        ) : filteredShares.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <AnimatedList className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredShares.map((share) => (
              <ShareCard
                key={share._id}
                share={share}
                now={now}
                isOrgAdmin={isOrgAdmin}
                revokingId={revokingId}
                onRevokeClick={openRevokeConfirm}
              />
            ))}
          </AnimatedList>
        )}
      </div>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmRevokeId}
        onClose={closeRevokeConfirm}
        onConfirm={handleRevoke}
        title="Revoke Share"
        message="Are you sure you want to revoke this share? Recipients will no longer be able to access the variable."
        confirmText={revokingId ? "Revoking..." : "Revoke"}
        variant="danger"
      />
    </div>
  );
}
