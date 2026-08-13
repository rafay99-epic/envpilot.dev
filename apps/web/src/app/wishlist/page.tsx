"use client";

import { useState } from "react";
import {
  useFeatureRequests,
  usePlannedFeatures,
  useFeatureCategories,
  useFeatureRequestMutations,
} from "@/hooks";
import { Id } from "@convex/_generated/dataModel";
import { ChevronUp, Plus, X, AlertTriangle } from "lucide-react";
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
  submitted: {
    label: "submitted",
    color: "text-ink-muted",
    dot: "bg-surface-hover",
  },
  under_review: {
    label: "under-review",
    color: "text-warning",
    dot: "bg-warning",
  },
  planned: {
    label: "planned",
    color: "text-ink-muted",
    dot: "bg-surface-hover",
  },
  in_progress: {
    label: "in-progress",
    color: "text-warning",
    dot: "bg-warning",
  },
  completed: {
    label: "completed",
    color: "text-accent",
    dot: "bg-accent",
  },
  declined: { label: "declined", color: "text-danger", dot: "bg-danger" },
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

export default function WishlistPage() {
  const [activeTab, setActiveTab] = useState<TabType>("requests");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [votedFeatures, setVotedFeatures] = useState<Set<string>>(new Set());
  const [voterEmail, setVoterEmail] = useState("");
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [pendingVoteId, setPendingVoteId] =
    useState<Id<"featureRequests"> | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const featureRequests = useFeatureRequests(
    statusFilter === "all" ? undefined : statusFilter,
    categoryFilter === "all" ? undefined : categoryFilter
  );
  const plannedFeatures = usePlannedFeatures();
  const categories = useFeatureCategories();
  const { submit, vote, unvote } = useFeatureRequestMutations();

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
        setVotedFeatures((prev) => new Set([...prev, featureId]));
      }
    } catch {
      setToastMessage(
        "Failed to update vote. You may have already voted for this feature."
      );
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
      setVotedFeatures((prev) => new Set([...prev, pendingVoteId]));
    } catch {
      setToastMessage(
        "Failed to vote. You may have already voted for this feature."
      );
    }
    setPendingVoteId(null);
  };

  return (
    <MarketingShell>
      <PageHero
        eyebrow="wishlist"
        title={
          <>
            Help shape <span className="text-accent">the roadmap</span>
          </>
        }
        description="Vote on what we build next, or submit your own ideas. Every vote shapes the product."
        align="left"
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowSubmitForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold text-ink-inverse shadow-[0_0_24px_-6px_rgba(34,197,94,0.6)] transition-all hover:bg-accent"
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
                <span className="font-mono text-xs text-ink-faint">
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
                          ? "border-accent-line bg-accent-soft text-accent shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
                          : "border-line text-ink-subtle hover:border-accent-line hover:text-ink-muted"
                      }`}
                    >
                      {status === "all" ? "*" : status.replace("_", "-")}
                    </button>
                  ))}
                </div>

                {categories && categories.length > 0 && (
                  <>
                    <span className="font-mono text-xs text-ink-faint">
                      --category
                    </span>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="rounded-lg border border-line bg-surface/60 px-2.5 py-1 font-mono text-xs text-ink focus:border-accent-line focus:outline-none focus:ring-2 focus:ring-accent-line"
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
              </div>

              {/* Feature List */}
              {!featureRequests ? (
                <LoadingSkeleton rows={4} />
              ) : featureRequests.length === 0 ? (
                <EmptyState onSubmit={() => setShowSubmitForm(true)} />
              ) : (
                <Stagger className="space-y-3">
                  {featureRequests.map((feature: FeatureRequestType) => (
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
        />
      )}

      {/* Email Prompt Dialog */}
      {showEmailPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-gradient-to-b from-accent-line via-line to-line p-px shadow-[0_0_60px_-12px_rgba(34,197,94,0.35)]">
            <div className="overflow-hidden rounded-[11px] bg-canvas font-mono">
              <div className="border-b border-line px-5 py-4">
                <h3 className="font-sans text-sm font-bold tracking-tight text-ink">
                  Enter your email to vote
                </h3>
              </div>
              <form onSubmit={handleEmailSubmit} className="px-5 py-4">
                <p className="mb-3 text-xs text-ink-muted">
                  Your email is used to track your votes and prevent duplicates.
                </p>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-line bg-surface/60 px-3 py-2 text-sm text-ink placeholder-ink-faint focus:border-accent-line focus:outline-none focus:ring-2 focus:ring-accent-line"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailPrompt(false);
                      setPendingVoteId(null);
                      setEmailInput("");
                    }}
                    className="rounded-lg border border-line px-4 py-1.5 text-xs text-ink-muted transition-colors hover:border-accent-line hover:text-ink-muted"
                  >
                    cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-ink-inverse shadow-[0_0_20px_-6px_rgba(34,197,94,0.6)] transition-colors hover:bg-accent"
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
          <div className="flex items-center gap-2 rounded-lg border border-danger-line bg-canvas px-4 py-3 font-mono text-xs text-danger shadow-[0_0_30px_-8px_rgba(248,113,113,0.4)]">
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
          ? "border-accent-line bg-accent-soft text-accent shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
          : "border-line text-ink-subtle hover:border-accent-line hover:text-ink-muted"
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
        <div key={i} className="flex gap-4 rounded-xl border border-line p-5">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-surface/40" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface/40" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface/40" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-surface/40" />
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
              ? "border-accent-line bg-accent-soft text-accent shadow-[0_0_20px_-4px_rgba(34,197,94,0.5)]"
              : "border-line bg-canvas/40 text-ink-subtle hover:border-accent-line hover:text-accent"
          }`}
        >
          <ChevronUp className="h-4 w-4" />
          <span className="text-xs font-bold">{feature.voteCount}</span>
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-sm font-bold tracking-tight text-ink">
              {feature.title}
            </h3>
            <span
              className={`flex items-center gap-1.5 font-mono text-[10px] ${status.color}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            {feature.category && (
              <span className="rounded-full border border-line bg-canvas/60 px-2 py-0.5 font-mono text-[10px] text-ink-subtle">
                {feature.category}
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 font-mono text-xs leading-relaxed text-ink-subtle">
            {feature.description}
          </p>
          <p className="mt-2 font-mono text-[10px] text-ink-faint">
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
    <div className="rounded-xl border border-dashed border-line bg-surface/40 p-12 text-center">
      <p className="font-mono text-sm text-ink-subtle">
        <span className="text-accent">❯</span> envpilot wishlist --list
      </p>
      <p className="mt-2 font-mono text-xs text-ink-faint">
        No feature requests yet. Be the first.
      </p>
      <button
        onClick={onSubmit}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold text-ink-inverse shadow-[0_0_24px_-6px_rgba(34,197,94,0.6)] transition-all hover:bg-accent"
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
            <div className="h-8 animate-pulse rounded-lg bg-surface/40" />
            <div className="h-24 animate-pulse rounded-xl bg-surface/40" />
            <div className="h-24 animate-pulse rounded-xl bg-surface/40" />
          </div>
        ))}
      </div>
    );
  }

  const { planned, inProgress, completed } = plannedFeatures;

  const columns = [
    {
      title: "planned",
      dot: "bg-surface-hover",
      color: "text-ink-muted",
      borderColor: "border-line",
      items: planned,
      showDate: false,
    },
    {
      title: "in-progress",
      dot: "bg-warning",
      color: "text-warning",
      borderColor: "border-warning-line",
      items: inProgress,
      showDate: false,
    },
    {
      title: "completed",
      dot: "bg-accent",
      color: "text-accent",
      borderColor: "border-accent-line",
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
            className={`rounded-xl border ${col.borderColor} bg-surface/20 p-4`}
          >
            {/* Column header */}
            <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
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
              <span className="ml-auto rounded-full border border-line bg-canvas/60 px-2 py-0.5 font-mono text-[10px] text-ink-subtle">
                {col.items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {col.items.length === 0 ? (
                <p className="py-6 text-center font-mono text-xs text-ink-faint">
                  # empty
                </p>
              ) : (
                <>
                  {visibleItems.map((feature) => (
                    <div
                      key={feature._id}
                      className="rounded-xl border border-line bg-surface/40 p-4 transition-colors hover:border-accent-line"
                    >
                      <h4 className="font-sans text-xs font-bold tracking-tight text-ink">
                        {feature.title}
                      </h4>
                      <p className="mt-1.5 line-clamp-2 font-mono text-[11px] leading-relaxed text-ink-subtle">
                        {feature.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-ink-faint">
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
                      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed ${col.borderColor} py-2.5 font-mono text-[11px] font-medium ${col.color} transition-colors hover:bg-surface-hover/50`}
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
}

const INPUT_CLASSES =
  "mt-1.5 block w-full rounded-lg border border-line bg-surface/60 px-3 py-2 font-mono text-xs text-ink placeholder-ink-faint focus:border-accent-line focus:outline-none focus:ring-2 focus:ring-accent-line";

function SubmitFeatureModal({
  onClose,
  onSubmit,
  voterEmail,
  setVoterEmail,
}: SubmitFeatureModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState(voterEmail);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      setError(
        err instanceof Error ? err.message : "Failed to submit feature request"
      );
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
          <p className="font-mono text-xs text-ink-subtle">
            <span className="text-accent">❯</span> envpilot feature --new
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-ink-subtle transition-colors hover:text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 font-mono text-xs text-danger">
              error: {error}
            </div>
          )}

          <div>
            <label className="block font-mono text-xs text-ink-muted">
              title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASSES}
              placeholder="Brief title for your feature"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-ink-muted">
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
              <label className="block font-mono text-xs text-ink-muted">
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
              <label className="block font-mono text-xs text-ink-muted">
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
            <label className="block font-mono text-xs text-ink-muted">
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
              className="rounded-lg border border-line px-4 py-2 font-mono text-xs text-ink-subtle transition-colors hover:border-accent-line hover:text-ink-muted"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-accent px-4 py-2 font-mono text-xs font-semibold text-ink-inverse shadow-[0_0_20px_-6px_rgba(34,197,94,0.6)] transition-all hover:bg-accent disabled:opacity-50"
            >
              {isSubmitting ? "submitting..." : "submit"}
            </button>
          </div>
        </form>
      </TerminalFrame>
    </div>
  );
}
