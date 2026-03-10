"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  useFeatureRequests,
  usePlannedFeatures,
  useFeatureCategories,
  useFeatureRequestMutations,
} from "@/hooks";
import { Id } from "@convex/_generated/dataModel";
import { ChevronUp, Plus, X } from "lucide-react";

type TabType = "requests" | "roadmap";
type StatusFilter =
  | "all"
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed";

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
  planned: { label: "planned", color: "text-blue-400", dot: "bg-blue-400" },
  in_progress: {
    label: "in-progress",
    color: "text-purple-400",
    dot: "bg-purple-400",
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

export default function WishlistPage() {
  const [activeTab, setActiveTab] = useState<TabType>("requests");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [votedFeatures, setVotedFeatures] = useState<Set<string>>(new Set());
  const [voterEmail, setVoterEmail] = useState("");

  const featureRequests = useFeatureRequests(
    statusFilter === "all" ? undefined : statusFilter,
    categoryFilter === "all" ? undefined : categoryFilter
  );
  const plannedFeatures = usePlannedFeatures();
  const categories = useFeatureCategories();
  const { submit, vote, unvote } = useFeatureRequestMutations();

  const handleVote = useCallback(
    async (featureId: Id<"featureRequests">) => {
      if (!voterEmail) {
        const email = prompt("Enter your email to vote:");
        if (!email) return;
        setVoterEmail(email);

        try {
          await vote({ featureRequestId: featureId, voterEmail: email });
          setVotedFeatures((prev) => new Set([...prev, featureId]));
        } catch {
          alert("Failed to vote. You may have already voted for this feature.");
        }
      } else {
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
          alert("Failed to update vote.");
        }
      }
    },
    [voterEmail, votedFeatures, vote, unvote]
  );

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="font-bold text-zinc-100">envpilot</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {[
              { label: "Changelog", href: "/changelog" },
              { label: "Wishlist", href: "/wishlist" },
              { label: "Docs", href: "/docs" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-xs text-zinc-500 transition-colors hover:text-green-400"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSubmitForm(true)}
              className="flex items-center gap-1.5 rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
            >
              <Plus className="h-3 w-3" />
              submit-feature
            </button>
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 transition-colors hover:text-green-400"
            >
              sign-in
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="border-b border-zinc-800/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// wishlist"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              Feature requests &amp; roadmap
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-500">
              Vote on what we build next, or submit your own ideas. Every vote
              shapes the product.
            </p>

            {/* Tabs */}
            <div className="mt-8 flex gap-2">
              <button
                onClick={() => setActiveTab("requests")}
                className={`rounded border px-4 py-2 text-xs transition-all ${
                  activeTab === "requests"
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                }`}
              >
                $ ls requests/
              </button>
              <button
                onClick={() => setActiveTab("roadmap")}
                className={`rounded border px-4 py-2 text-xs transition-all ${
                  activeTab === "roadmap"
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                }`}
              >
                $ cat roadmap
              </button>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-12">
          <div className="mx-auto max-w-5xl px-4">
            {activeTab === "requests" ? (
              <>
                {/* Filters */}
                <div className="mb-8 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-zinc-600">--status</span>
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
                        className={`rounded border px-2.5 py-1 text-xs transition-all ${
                          statusFilter === status
                            ? "border-green-500/30 bg-green-500/10 text-green-400"
                            : "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                        }`}
                      >
                        {status === "all" ? "*" : status.replace("_", "-")}
                      </button>
                    ))}
                  </div>

                  {categories && categories.length > 0 && (
                    <>
                      <span className="text-xs text-zinc-600">--category</span>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 focus:border-zinc-700 focus:outline-none"
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
                  <div className="flex items-center justify-center py-16">
                    <div className="text-xs text-zinc-600">
                      <span className="animate-pulse text-green-500">&gt;</span>{" "}
                      loading requests...
                    </div>
                  </div>
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
      </main>

      {/* Submit Form Modal */}
      {showSubmitForm && (
        <SubmitFeatureModal
          onClose={() => setShowSubmitForm(false)}
          onSubmit={submit}
          voterEmail={voterEmail}
          setVoterEmail={setVoterEmail}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-8">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span className="text-green-500">$</span> envpilot --version{" "}
              <span className="text-zinc-500">1.0.0</span>
            </div>
            <div className="flex gap-4 text-xs text-zinc-600">
              <Link href="/docs" className="hover:text-zinc-400">
                Docs
              </Link>
              <Link href="/changelog" className="hover:text-zinc-400">
                Changelog
              </Link>
              <Link href="/privacy" className="hover:text-zinc-400">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-zinc-400">
                Terms
              </Link>
            </div>
            <p className="text-xs text-zinc-700">
              &copy; {new Date().getFullYear()} Envpilot
            </p>
          </div>
        </div>
      </footer>
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
    <div className="group flex gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
      {/* Vote */}
      <button
        onClick={onVote}
        className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded border transition-all ${
          hasVoted
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
        }`}
      >
        <ChevronUp className="h-4 w-4" />
        <span className="text-xs font-bold">{feature.voteCount}</span>
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">
            {feature.title}
          </h3>
          <span
            className={`flex items-center gap-1.5 text-[10px] ${status.color}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          {feature.category && (
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
              {feature.category}
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
          {feature.description}
        </p>
        <p className="mt-2 text-[10px] text-zinc-600">
          {new Date(feature.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 p-12 text-center">
      <p className="text-sm text-zinc-500">
        <span className="text-green-500">$</span> envpilot wishlist --list
      </p>
      <p className="mt-2 text-xs text-zinc-600">
        No feature requests yet. Be the first.
      </p>
      <button
        onClick={onSubmit}
        className="mt-6 inline-flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs text-green-400 transition-all hover:bg-green-500/20"
      >
        <Plus className="h-3 w-3" />
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

function RoadmapView({ plannedFeatures }: RoadmapViewProps) {
  if (!plannedFeatures) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-xs text-zinc-600">
          <span className="animate-pulse text-green-500">&gt;</span> loading
          roadmap...
        </div>
      </div>
    );
  }

  const { planned, inProgress, completed } = plannedFeatures;

  const columns = [
    {
      title: "planned",
      dot: "bg-blue-400",
      color: "text-blue-400",
      borderColor: "border-blue-500/20",
      items: planned,
      showDate: false,
    },
    {
      title: "in-progress",
      dot: "bg-purple-400",
      color: "text-purple-400",
      borderColor: "border-purple-500/20",
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
    <div className="grid gap-6 lg:grid-cols-3">
      {columns.map((col) => (
        <div key={col.title}>
          {/* Column header */}
          <div className="mb-4 flex items-center gap-2 border-b border-zinc-800 pb-3">
            <span className={`h-2 w-2 rounded-full ${col.dot}`} />
            <h3
              className={`text-xs font-bold uppercase tracking-wider ${col.color}`}
            >
              {col.title}
            </h3>
            <span className="ml-auto text-xs text-zinc-600">
              {col.items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {col.items.length === 0 ? (
              <p className="py-6 text-center text-xs text-zinc-700"># empty</p>
            ) : (
              col.items.map((feature) => (
                <div
                  key={feature._id}
                  className={`rounded-lg border ${col.borderColor} bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700`}
                >
                  <h4 className="text-xs font-semibold text-zinc-200">
                    {feature.title}
                  </h4>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                    {feature.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-600">
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
              ))
            )}
          </div>
        </div>
      ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Terminal title bar */}
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-2 text-xs text-zinc-500">
            submit-feature-request
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-xs text-zinc-500">
            <span className="text-green-500">$</span> envpilot feature --new
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {error && (
              <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                error: {error}
              </div>
            )}

            <div>
              <label className="block text-xs text-zinc-400">title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 block w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
                placeholder="Brief title for your feature"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400">
                description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1.5 block w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
                placeholder="Describe the feature and why it would be valuable..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-400">email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400">name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 block w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400">category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 block w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-700 focus:outline-none"
                placeholder="e.g., security, integrations, ui"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-zinc-800 px-4 py-2 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-400"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs text-green-400 transition-all hover:bg-green-500/20 disabled:opacity-50"
              >
                {isSubmitting ? "submitting..." : "submit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
