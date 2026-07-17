"use client";

import { useEffect, useState } from "react";
import {
  useFeatureRequests,
  usePlannedFeatures,
  useFeatureCategories,
  useFeatureRequestMutations,
} from "@/hooks";
import { Id } from "@convex/_generated/dataModel";
import { ChevronUp, Plus, Search, X, AlertTriangle } from "lucide-react";
import { sanitizeConvexError } from "@/lib/error-messages";
import {
  MarketingShell,
  PageHero,
  GlowCard,
  GlowDivider,
  TerminalFrame,
  Stagger,
  StaggerItem,
} from "@/components/marketing";

type TabType = "requests" | "roadmap";
type StatusFilter =
  | "all"
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed";

/** Brand palette is locked to green / amber / red / zinc. */
const statusConfig: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  submitted: { label: "submitted", color: "text-zinc-400", dot: "bg-zinc-400" },
  under_review: {
    label: "under-review",
    color: "text-amber-400",
    dot: "bg-amber-400",
  },
  planned: { label: "planned", color: "text-zinc-300", dot: "bg-zinc-400" },
  in_progress: {
    label: "in-progress",
    color: "text-amber-400",
    dot: "bg-amber-400",
  },
  completed: {
    label: "completed",
    color: "text-green-400",
    dot: "bg-green-400",
  },
  declined: { label: "declined", color: "text-red-400", dot: "bg-red-400" },
};

interface FeatureRequestType {
  _id: Id<"featureRequests">;
  title: string;
  description: string;
  status: string;
  category?: string;
  voteCount: number;
  createdAt: number;
}

// Anonymous voter identity + vote history, persisted so returning visitors
// keep their vote highlights across reloads (the backend enforces uniqueness
// either way — this is purely UX state).
const VOTER_STORAGE_KEY = "envpilot-wishlist-voter";

export default function WishlistPage() {
  const [activeTab, setActiveTab] = useState<TabType>("requests");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"top" | "new">("top");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [votedFeatures, setVotedFeatures] = useState<Set<string>>(new Set());
  const [voterEmail, setVoterEmail] = useState("");
  const [voterLoaded, setVoterLoaded] = useState(false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [pendingVoteId, setPendingVoteId] =
    useState<Id<"featureRequests"> | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Restore the anonymous voter identity + vote history after mount (not in a
  // state initializer — that would mismatch the server-rendered HTML). The
  // backend enforces vote uniqueness either way; this is purely UX state.
  useEffect(() => {
    // Deferred to a microtask: satisfies the compiler rule against
    // synchronous setState in effects while still running before paint-time
    // interactions matter.
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(VOTER_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            email?: string;
            votedIds?: string[];
          };
          if (typeof parsed.email === "string") setVoterEmail(parsed.email);
          if (Array.isArray(parsed.votedIds))
            setVotedFeatures(new Set(parsed.votedIds));
        }
      } catch {
        // Corrupt/unavailable storage — start fresh
      }
      setVoterLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!voterLoaded) return;
    try {
      window.localStorage.setItem(
        VOTER_STORAGE_KEY,
        JSON.stringify({ email: voterEmail, votedIds: [...votedFeatures] })
      );
    } catch {
      // Storage unavailable (private mode) — votes just won't persist
    }
  }, [voterLoaded, voterEmail, votedFeatures]);

  const featureRequests = useFeatureRequests(
    statusFilter === "all" ? undefined : statusFilter,
    categoryFilter === "all" ? undefined : categoryFilter,
    sortBy
  );
  const plannedFeatures = usePlannedFeatures();
  const categories = useFeatureCategories();
  const { submit, vote, unvote } = useFeatureRequestMutations();

  const query = searchQuery.trim().toLowerCase();
  const visibleRequests =
    featureRequests && query
      ? featureRequests.filter(
          (f: FeatureRequestType) =>
            f.title.toLowerCase().includes(query) ||
            f.description.toLowerCase().includes(query) ||
            f.category?.toLowerCase().includes(query)
        )
      : featureRequests;

  const markVoted = (featureId: Id<"featureRequests">) =>
    setVotedFeatures((prev) => new Set([...prev, featureId]));

  const handleVoteError = (
    err: unknown,
    featureId: Id<"featureRequests">,
    fallback: string
  ) => {
    const message = sanitizeConvexError(err);
    if (/already voted/i.test(message)) {
      // Backend says this identity voted before (e.g. cleared storage) —
      // adopt that as truth instead of showing an error.
      markVoted(featureId);
      return;
    }
    setToastMessage(message || fallback);
  };

  const handleVote = async (featureId: Id<"featureRequests">) => {
    if (!voterEmail) {
      setPendingVoteId(featureId);
      setShowEmailPrompt(true);
      return;
    }

    try {
      if (votedFeatures.has(featureId)) {
        await unvote({ featureRequestId: featureId, voterEmail });
        setVotedFeatures((prev) => {
          const newSet = new Set(prev);
          newSet.delete(featureId);
          return newSet;
        });
      } else {
        await vote({ featureRequestId: featureId, voterEmail });
        markVoted(featureId);
      }
    } catch (err) {
      handleVoteError(err, featureId, "Failed to update vote.");
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email || !pendingVoteId) return;

    setVoterEmail(email);
    setShowEmailPrompt(false);
    setEmailInput("");

    try {
      await vote({ featureRequestId: pendingVoteId, voterEmail: email });
      markVoted(pendingVoteId);
    } catch (err) {
      handleVoteError(err, pendingVoteId, "Failed to vote.");
    }
    setPendingVoteId(null);
  };

  return (
    <MarketingShell>
      <PageHero
        eyebrow="wishlist"
        title={
          <>
            Help shape <span className="text-green-400">the roadmap</span>
          </>
        }
        description="Vote on what we build next, or submit your own ideas. Every vote shapes the product."
        align="left"
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowSubmitForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 font-mono text-xs font-semibold text-zinc-950 shadow-[0_0_24px_-6px_rgba(34,197,94,0.6)] transition-all hover:bg-green-400"
          >
            <Plus className="h-3.5 w-3.5" />
            submit-feature
          </button>
          <div className="flex gap-2">
            <TabButton
              active={activeTab === "requests"}
              onClick={() => setActiveTab("requests")}
            >
              ❯ ls requests/
            </TabButton>
            <TabButton
              active={activeTab === "roadmap"}
              onClick={() => setActiveTab("roadmap")}
            >
              ❯ cat roadmap
            </TabButton>
          </div>
        </div>
      </PageHero>

      <GlowDivider />

      {/* Content */}
      <section className="relative py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          {activeTab === "requests" ? (
            <>
              {/* Filters */}
              <div className="mb-10 flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-zinc-600">
                  --status
                </span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "all",
                      "submitted",
                      "under_review",
                      "planned",
                      "in_progress",
                      "completed",
                    ] as StatusFilter[]
                  ).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-xs transition-all ${
                        statusFilter === status
                          ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
                          : "border-zinc-800 text-zinc-500 hover:border-green-500/30 hover:text-zinc-300"
                      }`}
                    >
                      {status === "all" ? "*" : status.replace("_", "-")}
                    </button>
                  ))}
                </div>

                {categories && categories.length > 0 && (
                  <>
                    <span className="font-mono text-xs text-zinc-600">
                      --category
                    </span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-xs text-zinc-200 focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    >
                      <option value="all">all</option>
                      {categories.map((cat: string) => (
                        <option key={cat} value={cat}>
                          {cat.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <span className="font-mono text-xs text-zinc-600">--sort</span>
                <div className="flex gap-2">
                  {(["top", "new"] as const).map((sort) => (
                    <button
                      key={sort}
                      onClick={() => setSortBy(sort)}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-xs transition-all ${
                        sortBy === sort
                          ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
                          : "border-zinc-800 text-zinc-500 hover:border-green-500/30 hover:text-zinc-300"
                      }`}
                    >
                      {sort}
                    </button>
                  ))}
                </div>

                <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="search requests..."
                    aria-label="Search feature requests"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-1 pr-2.5 pl-8 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  />
                </div>
              </div>

              {/* Feature List */}
              {!visibleRequests ? (
                <LoadingSkeleton rows={4} />
              ) : visibleRequests.length === 0 ? (
                query ? (
                  <p className="py-10 text-center font-mono text-xs text-zinc-500">
                    No requests match &ldquo;{searchQuery.trim()}&rdquo; — maybe
                    yours is a new idea?
                  </p>
                ) : (
                  <EmptyState onSubmit={() => setShowSubmitForm(true)} />
                )
              ) : (
                <Stagger className="space-y-3">
                  {visibleRequests.map((feature: FeatureRequestType) => (
                    <StaggerItem key={feature._id}>
                      <FeatureCard
                        feature={feature}
                        hasVoted={votedFeatures.has(feature._id)}
                        onVote={() => handleVote(feature._id)}
                      />
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </>
          ) : (
            <RoadmapView plannedFeatures={plannedFeatures} />
          )}
        </div>
      </section>

      {/* Submit Form Modal */}
      {showSubmitForm && (
        <SubmitFeatureModal
          onClose={() => setShowSubmitForm(false)}
          onSubmit={submit}
          voterEmail={voterEmail}
          setVoterEmail={setVoterEmail}
          existingRequests={featureRequests}
          votedFeatures={votedFeatures}
          onVoteExisting={handleVote}
        />
      )}

      {/* Email Prompt Dialog */}
      {showEmailPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-gradient-to-b from-green-500/50 via-zinc-700/40 to-zinc-800/40 p-px shadow-[0_0_60px_-12px_rgba(34,197,94,0.35)]">
            <div className="overflow-hidden rounded-[11px] bg-zinc-950 font-mono">
              <div className="border-b border-zinc-800 px-5 py-4">
                <h3 className="font-sans text-sm font-bold tracking-tight text-zinc-100">
                  Enter your email to vote
                </h3>
              </div>
              <form onSubmit={handleEmailSubmit} className="px-5 py-4">
                <p className="mb-3 text-xs text-zinc-400">
                  Your email is used to track your votes and prevent duplicates.
                </p>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailPrompt(false);
                      setPendingVoteId(null);
                      setEmailInput("");
                    }}
                    className="rounded-lg border border-zinc-800 px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:border-green-500/30 hover:text-zinc-300"
                  >
                    cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-green-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 shadow-[0_0_20px_-6px_rgba(34,197,94,0.6)] transition-colors hover:bg-green-400"
                  >
                    vote
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100]">
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-zinc-950 px-4 py-3 font-mono text-xs text-red-400 shadow-[0_0_30px_-8px_rgba(248,113,113,0.4)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </MarketingShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 font-mono text-xs transition-all ${
        active
          ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
          : "border-zinc-800 text-zinc-500 hover:border-green-500/30 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 rounded-xl border border-zinc-800/80 p-5"
        >
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-zinc-900/40" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-900/40" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-900/40" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-900/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface FeatureCardProps {
  feature: FeatureRequestType;
  hasVoted: boolean;
  onVote: () => void;
}

function FeatureCard({ feature, hasVoted, onVote }: FeatureCardProps) {
  const status = statusConfig[feature.status] ?? statusConfig.submitted;

  return (
    <GlowCard className="p-5">
      <div className="flex gap-4">
        {/* Upvote */}
        <button
          onClick={onVote}
          aria-pressed={hasVoted}
          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border font-mono transition-all ${
            hasVoted
              ? "border-green-500/60 bg-green-500/15 text-green-400 shadow-[0_0_20px_-4px_rgba(34,197,94,0.5)]"
              : "border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-green-500/40 hover:text-green-400"
          }`}
        >
          <ChevronUp className="h-4 w-4" />
          <span className="text-xs font-bold">{feature.voteCount}</span>
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-sm font-bold tracking-tight text-zinc-100">
              {feature.title}
            </h3>
            <span
              className={`flex items-center gap-1.5 font-mono text-[10px] ${status.color}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            {feature.category && (
              <span className="rounded-full border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                {feature.category}
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 font-mono text-xs leading-relaxed text-zinc-500">
            {feature.description}
          </p>
          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            {new Date(feature.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
    </GlowCard>
  );
}

function EmptyState({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-12 text-center">
      <p className="font-mono text-sm text-zinc-500">
        <span className="text-green-500">❯</span> envpilot wishlist --list
      </p>
      <p className="mt-2 font-mono text-xs text-zinc-600">
        No feature requests yet. Be the first.
      </p>
      <button
        onClick={onSubmit}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 font-mono text-xs font-semibold text-zinc-950 shadow-[0_0_24px_-6px_rgba(34,197,94,0.6)] transition-all hover:bg-green-400"
      >
        <Plus className="h-3.5 w-3.5" />
        submit-feature
      </button>
    </div>
  );
}

interface RoadmapViewProps {
  plannedFeatures:
    | {
        planned: Array<{
          _id: Id<"featureRequests">;
          title: string;
          description: string;
          voteCount: number;
        }>;
        inProgress: Array<{
          _id: Id<"featureRequests">;
          title: string;
          description: string;
          voteCount: number;
        }>;
        completed: Array<{
          _id: Id<"featureRequests">;
          title: string;
          description: string;
          voteCount: number;
          updatedAt: number;
        }>;
      }
    | undefined;
}

const INITIAL_VISIBLE = 4;

function RoadmapView({ plannedFeatures }: RoadmapViewProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!plannedFeatures) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-8 animate-pulse rounded-lg bg-zinc-900/40" />
            <div className="h-24 animate-pulse rounded-xl bg-zinc-900/40" />
            <div className="h-24 animate-pulse rounded-xl bg-zinc-900/40" />
          </div>
        ))}
      </div>
    );
  }

  const { planned, inProgress, completed } = plannedFeatures;

  const columns = [
    {
      title: "planned",
      dot: "bg-zinc-400",
      color: "text-zinc-300",
      borderColor: "border-zinc-800",
      items: planned,
      showDate: false,
    },
    {
      title: "in-progress",
      dot: "bg-amber-400",
      color: "text-amber-400",
      borderColor: "border-amber-500/20",
      items: inProgress,
      showDate: false,
    },
    {
      title: "completed",
      dot: "bg-green-400",
      color: "text-green-400",
      borderColor: "border-green-500/20",
      items: completed,
      showDate: true,
    },
  ];

  return (
    <Stagger className="grid gap-6 lg:grid-cols-3">
      {columns.map((col) => {
        const isExpanded = expanded[col.title] ?? false;
        const hasOverflow = col.items.length > INITIAL_VISIBLE;
        const visibleItems = isExpanded
          ? col.items
          : col.items.slice(0, INITIAL_VISIBLE);
        const hiddenCount = col.items.length - INITIAL_VISIBLE;

        return (
          <StaggerItem
            key={col.title}
            className={`rounded-xl border ${col.borderColor} bg-zinc-900/20 p-4`}
          >
            {/* Column header */}
            <div className="mb-4 flex items-center gap-2 border-b border-zinc-800 pb-3">
              <span
                className={`h-2 w-2 rounded-full ${col.dot} ${
                  col.title === "in-progress" ? "animate-pulse" : ""
                }`}
              />
              <h3
                className={`font-mono text-xs font-bold uppercase tracking-wider ${col.color}`}
              >
                {col.title}
              </h3>
              <span className="ml-auto rounded-full border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                {col.items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {col.items.length === 0 ? (
                <p className="py-6 text-center font-mono text-xs text-zinc-700">
                  # empty
                </p>
              ) : (
                <>
                  {visibleItems.map((feature) => (
                    <div
                      key={feature._id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-green-500/30"
                    >
                      <h4 className="font-sans text-xs font-bold tracking-tight text-zinc-200">
                        {feature.title}
                      </h4>
                      <p className="mt-1.5 line-clamp-2 font-mono text-[11px] leading-relaxed text-zinc-500">
                        {feature.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-zinc-600">
                        <span className="flex items-center gap-1">
                          <ChevronUp className="h-3 w-3" />
                          {feature.voteCount}
                        </span>
                        {col.showDate &&
                          "updatedAt" in feature &&
                          typeof feature.updatedAt === "number" && (
                            <span>
                              {new Date(
                                feature.updatedAt as number
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                      </div>
                    </div>
                  ))}

                  {/* Show more / Show less toggle */}
                  {hasOverflow && (
                    <button
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [col.title]: !isExpanded,
                        }))
                      }
                      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed ${col.borderColor} py-2.5 font-mono text-[11px] font-medium ${col.color} transition-colors hover:bg-zinc-900/50`}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          show less
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-3 w-3 rotate-180" />
                          show {hiddenCount} more
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

interface SubmitFeatureModalProps {
  onClose: () => void;
  onSubmit: (args: {
    title: string;
    description: string;
    submitterEmail?: string;
    submitterName?: string;
    category?: string;
  }) => Promise<Id<"featureRequests">>;
  voterEmail: string;
  setVoterEmail: (email: string) => void;
  existingRequests: FeatureRequestType[] | undefined;
  votedFeatures: Set<string>;
  onVoteExisting: (id: Id<"featureRequests">) => void;
}

/**
 * Cheap client-side similarity: significant-word overlap between the typed
 * title and existing request titles. Good enough to catch duplicates at this
 * table size without a search index.
 */
function findSimilarRequests(
  title: string,
  requests: FeatureRequestType[] | undefined
): FeatureRequestType[] {
  if (!requests) return [];
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  if (words.length === 0) return [];
  return requests
    .filter((r) => {
      const haystack = r.title.toLowerCase();
      return words.some((w) => haystack.includes(w));
    })
    .slice(0, 3);
}

const INPUT_CLASSES =
  "mt-1.5 block w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20";

function SubmitFeatureModal({
  onClose,
  onSubmit,
  voterEmail,
  setVoterEmail,
  existingRequests,
  votedFeatures,
  onVoteExisting,
}: SubmitFeatureModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(voterEmail);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const similar = findSimilarRequests(title, existingRequests);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Invalid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        submitterEmail: email.trim(),
        submitterName: name.trim() || undefined,
        category: category.trim() || undefined,
      });
      setVoterEmail(email);
      onClose();
    } catch (err) {
      setError(sanitizeConvexError(err) || "Failed to submit feature request");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <TerminalFrame
        title="submit-feature-request"
        glow
        className="relative w-full max-w-lg"
        bodyClassName="max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between">
          <p className="font-mono text-xs text-zinc-500">
            <span className="text-green-500">❯</span> envpilot feature --new
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-400">
              error: {error}
            </div>
          )}

          <div>
            <label className="block font-mono text-xs text-zinc-400">
              title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASSES}
              placeholder="Brief title for your feature"
            />
            {similar.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="font-mono text-[11px] text-amber-400">
                  similar requests already exist — vote instead of duplicating:
                </p>
                <ul className="mt-1.5 space-y-1">
                  {similar.map((r) => (
                    <li
                      key={r._id}
                      className="flex items-center justify-between gap-3 font-mono text-[11px] text-zinc-400"
                    >
                      <span className="truncate">
                        {r.title}{" "}
                        <span className="text-zinc-600">
                          · {r.voteCount} {r.voteCount === 1 ? "vote" : "votes"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onVoteExisting(r._id)}
                        disabled={votedFeatures.has(r._id)}
                        className="shrink-0 rounded border border-green-500/30 px-2 py-0.5 text-green-400 transition-colors hover:bg-green-500/10 disabled:cursor-default disabled:border-zinc-800 disabled:text-zinc-600"
                      >
                        {votedFeatures.has(r._id) ? "voted" : "+1"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label className="block font-mono text-xs text-zinc-400">
              description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={INPUT_CLASSES}
              placeholder="Describe the feature and why it would be valuable..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-mono text-xs text-zinc-400">
                email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASSES}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-zinc-400">
                name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT_CLASSES}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs text-zinc-400">
              category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={INPUT_CLASSES}
              placeholder="e.g., security, integrations, ui"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-800 px-4 py-2 font-mono text-xs text-zinc-500 transition-colors hover:border-green-500/30 hover:text-zinc-300"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-green-500 px-4 py-2 font-mono text-xs font-semibold text-zinc-950 shadow-[0_0_20px_-6px_rgba(34,197,94,0.6)] transition-all hover:bg-green-400 disabled:opacity-50"
            >
              {isSubmitting ? "submitting..." : "submit"}
            </button>
          </div>
        </form>
      </TerminalFrame>
    </div>
  );
}
