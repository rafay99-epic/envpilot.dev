"use client";

import { useState, useMemo, useCallback, useEffect, useRef, use } from "react";
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
  Copy,
  Eye,
  FileText,
  FolderTree,
  Globe,
  KeyRound,
  Shield,
  Share2,
  Users,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import {
  TerminalLoading,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import {
  useProjectBySlug,
  useConvexUser,
  useProjectDocShares,
  useRevokeDocShare,
  type ProjectDocShare,
} from "@/hooks";
import { useRevokeShare } from "@/hooks/useShareSecret";
import { ConfirmDialog } from "@/components/ui";
import { sanitizeConvexError } from "@/lib/error-messages";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";

/* ─── Types ────────────────────────────────────────────────────────── */

type ShareStatus = "active" | "burned" | "expired" | "revoked";
type FilterKey = "all" | ShareStatus;
type ShareKind = "variables" | "docs";

interface ShareRecipient {
  email: string;
  hasViewed: boolean;
  viewedAt?: number;
  otpVerified: boolean;
}

interface ShareData {
  _id: string;
  variableKey: string;
  resourceType?: "variable" | "account";
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
    classes: "bg-accent-soft text-accent",
  },
  burned: {
    label: "Viewed",
    classes: "bg-warning-soft text-warning",
  },
  expired: {
    label: "Expired",
    classes: "bg-surface-raised text-ink-muted",
  },
  revoked: {
    label: "Revoked",
    classes: "bg-danger-soft text-danger",
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
    color: "text-ink-muted bg-surface-raised",
  },
  {
    key: "active" as FilterKey,
    label: "Active",
    icon: Shield,
    color: "text-accent bg-accent-soft",
  },
  {
    key: "burned" as FilterKey,
    label: "Viewed",
    icon: Eye,
    color: "text-warning bg-warning-soft",
  },
  {
    key: "expired" as FilterKey,
    label: "Expired",
    icon: Clock,
    color: "text-ink-muted bg-surface-raised/50",
  },
  {
    key: "revoked" as FilterKey,
    label: "Revoked",
    icon: X,
    color: "text-danger bg-danger-soft",
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

function EmptyState({ filter, kind }: { filter: FilterKey; kind: ShareKind }) {
  const isDocs = kind === "docs";
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
        <Share2 className="h-6 w-6 text-ink-muted" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink">
        {filter === "all"
          ? isDocs
            ? "No shared documentation yet."
            : "No shared variables yet."
          : `No ${FILTER_OPTIONS.find((f) => f.key === filter)?.label.toLowerCase()} shares.`}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        {filter === "all"
          ? isDocs
            ? "Share a page from the Documentation tab to get started."
            : "Share a variable from the Variables page to get started."
          : "Try changing the filter to see other shares."}
      </p>
    </div>
  );
}

/* ─── Skeleton for loading state ───────────────────────────────────── */

function StatsSkeleton({ count }: { count: number }) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 ${count === 4 ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border p-3 border-line"
        >
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-surface-hover" />
            <div className="h-3 w-12 rounded bg-surface-hover" />
          </div>
          <div className="mt-2 h-6 w-8 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

function ShareCardSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-32 rounded bg-surface-hover" />
                <div className="h-4 w-16 rounded-full bg-surface-hover" />
              </div>
              <div className="h-3 w-48 rounded bg-surface-raised" />
              <div className="h-3 w-36 rounded bg-surface-raised" />
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
            <code className="font-mono text-sm font-semibold text-ink">
              {share.variableKey}
            </code>

            {/* Resource type badge */}
            <TerminalBadge
              color={share.resourceType === "account" ? "purple" : "zinc"}
            >
              {share.resourceType === "account" ? "account" : "variable"}
            </TerminalBadge>

            {/* Mode badge */}
            {share.mode === "one_time" ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                <Flame className="h-3 w-3" />
                One-time
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-info-soft text-info">
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
              <Lock className="h-3.5 w-3.5 text-ink-muted" />
            )}
          </div>

          {/* Recipients */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {share.recipients.map((recipient) => (
              <span
                key={recipient.email}
                className="flex items-center gap-1 text-xs text-ink-muted"
              >
                {recipient.hasViewed ? (
                  <Check className="h-3 w-3 text-accent" />
                ) : (
                  <Circle className="h-2.5 w-2.5 fill-ink-faint text-ink-faint" />
                )}
                <span>{recipient.email}</span>
                {recipient.hasViewed && recipient.viewedAt && (
                  <span className="text-ink-subtle">
                    ({formatRelativeTime(recipient.viewedAt, now)})
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Meta row */}
          <p className="mt-1.5 text-xs text-ink-muted">
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 border-danger-line text-danger hover:bg-danger-soft"
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

/* ─── Resource kind switch ─────────────────────────────────────────── */

function KindSwitch({
  kind,
  onSelect,
}: {
  kind: ShareKind;
  onSelect: (kind: ShareKind) => void;
}) {
  const tab = (key: ShareKind) =>
    `flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      kind === key
        ? "shadow-sm bg-surface text-ink"
        : "text-ink-subtle hover:text-ink-muted"
    }`;

  return (
    <div className="flex gap-1 rounded-lg p-1 bg-surface-raised/60">
      <button
        type="button"
        onClick={() => onSelect("variables")}
        className={tab("variables")}
      >
        <KeyRound className="h-4 w-4" /> Variables
      </button>
      <button
        type="button"
        onClick={() => onSelect("docs")}
        className={tab("docs")}
      >
        <FileText className="h-4 w-4" /> Documentation
      </button>
    </div>
  );
}

/* ─── Documentation share card ─────────────────────────────────────── */

interface DocShareCardProps {
  share: ProjectDocShare;
  now: number;
  revokingId: string | null;
  onRevokeClick: (id: string) => void;
}

function DocShareCard({
  share,
  now,
  revokingId,
  onRevokeClick,
}: DocShareCardProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // The share URL is built here, never taken from the server: `token` is
  // withheld from roles that may not share externally, so its presence is
  // the permission check.
  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/d/${token}`);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left side: share info */}
        <div className="min-w-0 flex-1">
          {/* Top row: target + badges */}
          <div className="flex flex-wrap items-center gap-2">
            {share.scope === "module" ? (
              <FolderTree className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            )}
            <span className="truncate text-sm font-semibold text-ink">
              {share.target}
            </span>

            {/* Scope badge */}
            <TerminalBadge color={share.scope === "module" ? "purple" : "zinc"}>
              {share.scope === "module" ? "module" : "page"}
            </TerminalBadge>

            {/* Audience badge */}
            {share.audience === "external" ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                <Globe className="h-3 w-3" />
                Public link
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-info-soft text-info">
                <Users className="h-3 w-3" />
                Member
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
              <Lock className="h-3.5 w-3.5 text-ink-muted" />
            )}
          </div>

          {/* Recipient */}
          <p className="mt-2 truncate text-xs text-ink-muted">
            Shared with {share.recipientName}
          </p>

          {/* Meta row */}
          <p className="mt-1.5 text-xs text-ink-muted">
            Created {formatRelativeTime(share.createdAt, now)} by{" "}
            {share.createdByName}
            {share.status === "active" && (
              <>
                {" "}
                &middot; Expires in {formatTimeRemaining(share.expiresAt, now)}
              </>
            )}{" "}
            &middot; <Eye className="mb-px inline h-3 w-3" /> {share.viewCount}{" "}
            view
            {share.viewCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Right side: link + revoke */}
        <div className="flex shrink-0 items-center gap-2">
          {share.token && (
            <button
              onClick={() => copyLink(share.token!)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors border-line text-ink-muted hover:bg-surface-hover"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-accent" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>
          )}

          {/* Absent, not disabled, without the flag: it mirrors the mutation's
              own rule, so a rendered button always works. */}
          {share.canRevoke && (
            <button
              onClick={() => onRevokeClick(share._id)}
              disabled={revokingId === share._id}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 border-danger-line text-danger hover:bg-danger-soft"
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
    </div>
  );
}

/* ─── Page component ───────────────────────────────────────────────── */

export default function SharedVariablesPage({ params }: SharedPageProps) {
  const { slug } = use(params);
  const {
    organization,
    roleMeta,
    user,
    isLoading: isAuthLoading,
  } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);

  // Stable timestamp for relative time formatting — refreshes every 60s
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TIMESTAMP_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { allowed: canShare } = useFeatureGate(orgId, "secret_sharing");

  // Direct by-slug lookup — no dependency on the full project list (and on
  // convexUserId resolving first) just to find one project.
  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectError = project === null ? new Error("Project not found") : null;

  const projectId = project?._id as Id<"projects"> | undefined;

  const projectShares = useConvexQuery(
    api.features.sharing.queries.listByProject,
    // Identity is derived server-side from the attached JWT; `convexUserId`
    // gates the query until the current user is known (auth ready).
    projectId && convexUserId ? { projectId } : "skip"
  );

  // ── UI state ──
  const [kind, setKind] = useState<ShareKind>("variables");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const isDocs = kind === "docs";

  // Only subscribed once the tab is opened — most visits never leave
  // Variables. Held until `convexUserId` resolves, like the query above:
  // the backend requires an authed caller.
  const docShares = useProjectDocShares(
    isDocs && convexUserId ? projectId : undefined
  );

  const revokeShare = useRevokeShare();
  const revokeDocShare = useRevokeDocShare();

  // Revoking shares requires team lead or above (variables CRUD scope)
  const isOrgAdmin =
    !!organization?.role &&
    (roleMeta?.level ?? roleLevel(organization.role)) >= ROLE_LEVEL.team_lead;

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

  const docList = docShares ?? [];
  const docCounts: Record<FilterKey, number> = {
    all: docList.length,
    active: docList.filter((s) => s.status === "active").length,
    // A documentation share is never one-time — no "Viewed" terminal state.
    burned: 0,
    expired: docList.filter((s) => s.status === "expired").length,
    revoked: docList.filter((s) => s.status === "revoked").length,
  };
  const filteredDocShares =
    filter === "all" ? docList : docList.filter((s) => s.status === filter);

  const activeCounts = isDocs ? docCounts : counts;
  const statsConfig = STATS_CONFIG.filter((s) => !isDocs || s.key !== "burned");
  const filterOptions = FILTER_OPTIONS.filter(
    (o) => !isDocs || o.key !== "burned"
  );

  const selectKind = (next: ShareKind) => {
    setKind(next);
    if (next === "docs" && filter === "burned") setFilter("all");
  };

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
      if (isDocs) {
        await revokeDocShare({ shareId: confirmRevokeId as Id<"docShares"> });
      } else {
        await revokeShare.mutateAsync(confirmRevokeId);
      }
    } catch (err) {
      setRevokeError(sanitizeConvexError(err));
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  }, [confirmRevokeId, isDocs, revokeDocShare, revokeShare]);

  const dismissError = useCallback(() => setRevokeError(null), []);

  // ── Loading: auth or project still loading ──
  const isLoadingShares = projectShares === undefined;

  if (isAuthLoading || isLoadingProject) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full p-3 bg-danger-soft">
          <AlertTriangle className="h-6 w-6 text-danger" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">
          {projectError instanceof Error
            ? projectError.message
            : "Project not found"}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-ink hover:text-ink-muted"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  // Variable sharing is tier-gated on its own; documentation sharing is not,
  // so the gate replaces one tab's contents rather than the whole page.
  if (!canShare && !isDocs) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          icon={Share2}
          title="Shared"
          description="Manage shared access to this project's variables and documentation."
        />
        <KindSwitch kind={kind} onSelect={selectKind} />
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

  const isLoadingList = isDocs ? docShares === undefined : isLoadingShares;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <PageHeader
        icon={Share2}
        title="Shared"
        description="Manage shared access to this project's variables and documentation."
      />

      <KindSwitch kind={kind} onSelect={selectKind} />

      {/* Stats Row */}
      {isLoadingList ? (
        <StatsSkeleton count={statsConfig.length} />
      ) : (
        <div
          className={`grid grid-cols-2 gap-3 ${isDocs ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}
        >
          {statsConfig.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg border p-3 border-line ${stat.color}`}
            >
              <div className="flex items-center gap-2">
                <stat.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{stat.label}</span>
              </div>
              <p className="mt-1 text-lg font-bold">{activeCounts[stat.key]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error Banner */}
      {revokeError && (
        <div className="flex items-center justify-between rounded-lg border p-4 border-danger-line bg-danger-soft">
          <p className="text-sm text-danger">{revokeError}</p>
          <button
            onClick={dismissError}
            className="ml-4 shrink-0 text-danger hover:text-danger"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Buttons */}
      {!isLoadingList && (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === opt.key
                  ? "bg-accent-soft text-accent ring-1 ring-accent-line"
                  : "bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {opt.label}
              <span className="ml-1.5 text-xs opacity-70">
                {activeCounts[opt.key]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Share List */}
      <div className="rounded-xl border border-line bg-surface">
        {isLoadingList ? (
          <ShareCardSkeleton />
        ) : isDocs ? (
          filteredDocShares.length === 0 ? (
            <EmptyState filter={filter} kind={kind} />
          ) : (
            <AnimatedList className="divide-y divide-line">
              {filteredDocShares.map((share) => (
                <DocShareCard
                  key={share._id}
                  share={share}
                  now={now}
                  revokingId={revokingId}
                  onRevokeClick={openRevokeConfirm}
                />
              ))}
            </AnimatedList>
          )
        ) : filteredShares.length === 0 ? (
          <EmptyState filter={filter} kind={kind} />
        ) : (
          <AnimatedList className="divide-y divide-line">
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
        message={
          isDocs
            ? "Are you sure you want to revoke this share? Recipients will no longer be able to read the documentation."
            : "Are you sure you want to revoke this share? Recipients will no longer be able to access the variable."
        }
        confirmText={revokingId ? "Revoking..." : "Revoke"}
        variant="danger"
      />
    </div>
  );
}
