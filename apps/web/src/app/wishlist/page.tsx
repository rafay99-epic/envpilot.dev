"use client";

import { useId, useRef, useState } from "react";
import {
  useFeatureRequests,
  usePlannedFeatures,
  useFeatureCategories,
  useFeatureRequestMutations,
} from "@/hooks";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDate, formatDateWith } from "@/lib/format";
import { Id } from "@convex/_generated/dataModel";
import { ChevronUp, Plus, X, AlertTriangle } from "lucide-react";
import {
  MarketingShell,
  PageHero,
  TerminalPanel,
  terminal,
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

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "submitted",
  "under_review",
  "planned",
  "in_progress",
  "completed",
];

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
  // Read only inside handlers, never rendered, so a ref keeps the extra
  // render out of the vote path.
  const pendingVoteId = useRef<Id<"featureRequests"> | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const emailPromptId = useId();

  const featureRequests = useFeatureRequests(
    statusFilter === "all" ? undefined : statusFilter,
    categoryFilter === "all" ? undefined : categoryFilter
  );
  const plannedFeatures = usePlannedFeatures();
  const categories = useFeatureCategories();
  const { submit, vote, unvote } = useFeatureRequestMutations();

  const handleVote = async (featureId: Id<"featureRequests">) => {
    if (!voterEmail) {
      pendingVoteId.current = featureId;
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
    const featureId = pendingVoteId.current;
    if (!email || !featureId) return;

    setVoterEmail(email);
    setShowEmailPrompt(false);
    setEmailInput("");

    try {
      await vote({ featureRequestId: featureId, voterEmail: email });
      setVotedFeatures((prev) => new Set([...prev, featureId]));
    } catch {
      setToastMessage(
        "Failed to vote. You may have already voted for this feature."
      );
    }
    pendingVoteId.current = null;
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
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowSubmitForm(true)}
            className={terminal.cta}
          >
            <Plus className="h-4 w-4" />
            Submit a feature
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

      {/* Content */}
      <section className="pb-24">
        <div className={terminal.shell}>
          {activeTab === "requests" ? (
            <>
              {/* Filters — a labelled toolbar, so the status row and the
                  category picker stop reading as one run-on line. */}
              <div
                className={`mb-8 ${terminal.panel} flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <span
                    className={`${terminal.mono} shrink-0 text-[12px] text-ink-faint`}
                  >
                    --status
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.map((status) => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        aria-pressed={statusFilter === status}
                        className={`shrink-0 rounded-md px-2.5 py-1.5 ${terminal.mono} text-[12px] ring-1 transition-colors ${
                          statusFilter === status
                            ? "bg-accent-soft text-accent ring-accent-line"
                            : "text-ink-subtle ring-line hover:text-ink hover:ring-line-strong"
                        }`}
                      >
                        {status === "all" ? "all" : status.replace("_", "-")}
                      </button>
                    ))}
                  </div>
                </div>

                {categories && categories.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span
                      className={`${terminal.mono} shrink-0 text-[12px] text-ink-faint`}
                    >
                      --category
                    </span>
                    <select
                      aria-label="Filter by category"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className={`min-w-0 flex-1 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 ${terminal.mono} text-[12px] text-ink transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none lg:flex-none`}
                    >
                      <option value="all">all</option>
                      {categories.map((cat: string) => (
                        <option key={cat} value={cat}>
                          {cat.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Feature List */}
              {!featureRequests ? (
                <LoadingSkeleton rows={4} />
              ) : featureRequests.length === 0 ? (
                <EmptyState onSubmit={() => setShowSubmitForm(true)} />
              ) : (
                <div className="space-y-3">
                  {featureRequests.map((feature: FeatureRequestType) => (
                    <FeatureCard
                      key={feature._id}
                      feature={feature}
                      hasVoted={votedFeatures.has(feature._id)}
                      onVote={() => handleVote(feature._id)}
                    />
                  ))}
                </div>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay backdrop-blur-sm">
          <TerminalPanel
            title="envpilot vote --email"
            className="mx-4 w-full max-w-sm"
          >
            <form onSubmit={handleEmailSubmit}>
              <p className="font-sans text-[15px] leading-relaxed text-ink-muted">
                Your email tracks your votes and prevents duplicates.
              </p>
              <label
                htmlFor={emailPromptId}
                className={`mt-4 block ${terminal.label}`}
              >
                email
              </label>
              <input
                id={emailPromptId}
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className={`mt-1.5 ${terminal.input}`}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailPrompt(false);
                    pendingVoteId.current = null;
                    setEmailInput("");
                  }}
                  className="rounded-md px-4 py-2 font-sans text-[14px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-4 py-2 font-sans text-[14px] font-semibold text-chrome transition-colors hover:bg-accent-hover"
                >
                  Vote
                </button>
              </div>
            </form>
          </TerminalPanel>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed right-6 bottom-6 z-[100]">
          <div className="flex items-center gap-2 rounded-panel border border-danger-line bg-danger-soft px-4 py-3 font-sans text-[14px] text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss"
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
      className={`rounded-md px-4 py-2.5 font-mono text-[13px] ring-1 transition-colors ${
        active
          ? "bg-accent-soft text-accent ring-accent-line"
          : "text-ink-subtle ring-line hover:text-ink hover:ring-line-strong"
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
        <div key={i} className={`flex gap-4 ${terminal.panel} p-5`}>
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-md bg-surface-raised" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-4 w-1/3 animate-pulse rounded bg-surface-raised" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-surface-raised" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-surface-raised" />
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
  const timeZone = useTimeZone();

  return (
    <div
      className={`${terminal.panel} p-5 transition-shadow hover:ring-line-strong`}
    >
      <div className="flex gap-4">
        {/* Upvote */}
        <button
          onClick={onVote}
          aria-pressed={hasVoted}
          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md ${terminal.mono} ring-1 transition-colors ${
            hasVoted
              ? "bg-accent-soft text-accent ring-accent-line"
              : "text-ink-subtle ring-line hover:text-accent hover:ring-accent-line"
          }`}
        >
          <ChevronUp className="h-4 w-4" />
          <span className="text-[13px] font-semibold">{feature.voteCount}</span>
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-sans text-[16px] font-semibold tracking-[-0.01em] text-ink">
              {feature.title}
            </h3>
            <span
              className={`flex items-center gap-1.5 ${terminal.mono} text-[11px] ${status.color}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            {feature.category && (
              <span className={`${terminal.mono} text-[11px] text-ink-faint`}>
                #{feature.category}
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 font-sans text-[15px] leading-relaxed text-ink-muted">
            {feature.description}
          </p>
          <p className={`mt-2 ${terminal.mono} text-[11px] text-ink-faint`}>
            {formatDate(feature.createdAt, timeZone)}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className={`${terminal.panel} p-12 text-center`}>
      <p className={`${terminal.mono} text-[13px] text-ink-subtle`}>
        <span className="text-accent">❯</span> envpilot wishlist --list
      </p>
      <p className="mt-2 font-sans text-[15px] text-ink-muted">
        No feature requests yet. Be the first.
      </p>
      <button onClick={onSubmit} className={`mt-6 ${terminal.cta}`}>
        <Plus className="h-4 w-4" />
        Submit a feature
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
  const timeZone = useTimeZone();

  if (!plannedFeatures) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-8 animate-pulse rounded-md bg-surface-raised" />
            <div className="h-24 animate-pulse rounded-panel bg-surface-raised" />
            <div className="h-24 animate-pulse rounded-panel bg-surface-raised" />
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
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map((col) => {
        const isExpanded = expanded[col.title] ?? false;
        const hasOverflow = col.items.length > INITIAL_VISIBLE;
        const visibleItems = isExpanded
          ? col.items
          : col.items.slice(0, INITIAL_VISIBLE);
        const hiddenCount = col.items.length - INITIAL_VISIBLE;

        return (
          <div key={col.title} className={`${terminal.panel} p-4`}>
            {/* Column header */}
            <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
              <span
                className={`h-2 w-2 rounded-full ${col.dot} ${
                  col.title === "in-progress" ? "animate-pulse" : ""
                }`}
              />
              <h3
                className={`${terminal.mono} text-[11px] tracking-[0.14em] uppercase ${col.color}`}
              >
                {col.title}
              </h3>
              <span
                className={`ml-auto ${terminal.mono} text-[11px] text-ink-faint`}
              >
                {col.items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-3">
              {col.items.length === 0 ? (
                <p
                  className={`py-6 text-center ${terminal.mono} text-[12px] text-ink-faint`}
                >
                  # empty
                </p>
              ) : (
                <>
                  {visibleItems.map((feature) => (
                    <div
                      key={feature._id}
                      className="rounded-md bg-surface-raised p-4 ring-1 ring-line transition-shadow hover:ring-line-strong"
                    >
                      <h4 className="font-sans text-[15px] font-semibold tracking-[-0.01em] text-ink">
                        {feature.title}
                      </h4>
                      <p className="mt-1.5 line-clamp-2 font-sans text-[14px] leading-relaxed text-ink-muted">
                        {feature.description}
                      </p>
                      <div
                        className={`mt-3 flex items-center justify-between ${terminal.mono} text-[11px] text-ink-faint`}
                      >
                        <span className="flex items-center gap-1">
                          <ChevronUp className="h-3 w-3" />
                          {feature.voteCount}
                        </span>
                        {col.showDate &&
                          "updatedAt" in feature &&
                          typeof feature.updatedAt === "number" && (
                            <span>
                              {formatDateWith(
                                feature.updatedAt,
                                { month: "short", day: "numeric" },
                                timeZone
                              )}
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
                      className={`flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed ${col.borderColor} py-2.5 ${terminal.mono} text-[11px] ${col.color} transition-colors hover:bg-surface-hover`}
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
          </div>
        );
      })}
    </div>
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

const INPUT_CLASSES = `mt-1.5 block ${terminal.input}`;

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
  const fieldId = useId();

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
      <button
        type="button"
        aria-label="Dismiss"
        className="fixed inset-0 bg-overlay backdrop-blur-sm"
        onClick={onClose}
      />
      <TerminalPanel
        title="envpilot feature --new"
        className="relative w-full max-w-lg"
        bodyClassName="max-h-[80vh] overflow-y-auto p-5"
      >
        <div className="flex items-start justify-between">
          <p className={`${terminal.mono} text-[13px] text-ink-subtle`}>
            <span className="text-accent">❯</span> envpilot feature --new
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-ink-subtle transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-panel border border-danger-line bg-danger-soft px-3 py-2 font-sans text-[14px] text-danger">
              error: {error}
            </div>
          )}

          <div>
            <label
              htmlFor={`${fieldId}-title`}
              className={`block ${terminal.label}`}
            >
              title *
            </label>
            <input
              id={`${fieldId}-title`}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASSES}
              placeholder="Brief title for your feature"
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldId}-description`}
              className={`block ${terminal.label}`}
            >
              description *
            </label>
            <textarea
              id={`${fieldId}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={INPUT_CLASSES}
              placeholder="Describe the feature and why it would be valuable..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${fieldId}-email`}
                className={`block ${terminal.label}`}
              >
                email *
              </label>
              <input
                id={`${fieldId}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASSES}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor={`${fieldId}-name`}
                className={`block ${terminal.label}`}
              >
                name
              </label>
              <input
                id={`${fieldId}-name`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT_CLASSES}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${fieldId}-category`}
              className={`block ${terminal.label}`}
            >
              category
            </label>
            <input
              id={`${fieldId}-category`}
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
              className="rounded-md px-4 py-2 font-sans text-[14px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-accent px-4 py-2 font-sans text-[14px] font-semibold text-chrome transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isSubmitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </TerminalPanel>
    </div>
  );
}
