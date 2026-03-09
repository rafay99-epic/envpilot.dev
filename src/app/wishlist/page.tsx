"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  useFeatureRequests,
  usePlannedFeatures,
  useFeatureCategories,
  useFeatureRequestMutations,
} from "@/hooks";
import { Id } from "../../../convex/_generated/dataModel";

type TabType = "requests" | "roadmap";
type StatusFilter =
  | "all"
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed";

const statusColors: Record<string, string> = {
  submitted: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  under_review:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  planned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const statusLabels: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  declined: "Declined",
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
    categoryFilter === "all" ? undefined : categoryFilter,
  );
  const plannedFeatures = usePlannedFeatures();
  const categories = useFeatureCategories();
  const { submit, vote, unvote } = useFeatureRequestMutations();

  const handleVote = useCallback(
    async (featureId: Id<"featureRequests">) => {
      if (!voterEmail) {
        const email = prompt("Please enter your email to vote:");
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
    [voterEmail, votedFeatures, vote, unvote],
  );

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100">
              <svg
                className="h-4 w-4 text-white dark:text-zinc-900"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              ENV Connect
            </span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Home
            </Link>
            <button
              onClick={() => setShowSubmitForm(true)}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Submit Feature
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="container mx-auto px-4 text-center md:px-6">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
            Feature Wishlist
          </h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Vote on features you want to see, or submit your own ideas.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 md:px-6">
          {/* Tabs */}
          <div className="mb-6 flex border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab("requests")}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "requests"
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              Feature Requests
            </button>
            <button
              onClick={() => setActiveTab("roadmap")}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "roadmap"
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              Roadmap
            </button>
          </div>

          {activeTab === "requests" ? (
            <>
              {/* Filters */}
              <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="status"
                    className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Status:
                  </label>
                  <select
                    id="status"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as StatusFilter)
                    }
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="all">All</option>
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under Review</option>
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                {categories && categories.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="category"
                      className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Category:
                    </label>
                    <select
                      id="category"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value="all">All Categories</option>
                      {categories.map((cat: string) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Feature List */}
              {!featureRequests ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
                </div>
              ) : featureRequests.length === 0 ? (
                <EmptyState onSubmit={() => setShowSubmitForm(true)} />
              ) : (
                <div className="space-y-4">
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
      <footer className="border-t border-zinc-200 py-8 dark:border-zinc-800">
        <div className="container mx-auto px-4 text-center md:px-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            &copy; {new Date().getFullYear()} ENV Connect. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  feature: {
    _id: Id<"featureRequests">;
    title: string;
    description: string;
    status: string;
    category?: string;
    voteCount: number;
    createdAt: number;
  };
  hasVoted: boolean;
  onVote: () => void;
}

function FeatureCard({ feature, hasVoted, onVote }: FeatureCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex gap-4">
        {/* Vote Button */}
        <div className="flex flex-col items-center">
          <button
            onClick={onVote}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-lg border transition-colors ${
              hasVoted
                ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600"
            }`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
            <span className="text-sm font-semibold">{feature.voteCount}</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {feature.title}
            </h3>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[feature.status]}`}
            >
              {statusLabels[feature.status]}
            </span>
            {feature.category && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {feature.category}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {feature.description}
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            Submitted {new Date(feature.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        No feature requests yet
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Be the first to submit a feature idea!
      </p>
      <button
        onClick={onSubmit}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Submit Feature
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
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  const { planned, inProgress, completed } = plannedFeatures;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Planned Column */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Planned
          </h3>
          <span className="ml-auto text-sm text-zinc-500">
            {planned.length}
          </span>
        </div>
        <div className="space-y-3">
          {planned.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No planned features yet
            </p>
          ) : (
            planned.map((feature) => (
              <RoadmapCard key={feature._id} feature={feature} />
            ))
          )}
        </div>
      </div>

      {/* In Progress Column */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-purple-500" />
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            In Progress
          </h3>
          <span className="ml-auto text-sm text-zinc-500">
            {inProgress.length}
          </span>
        </div>
        <div className="space-y-3">
          {inProgress.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              Nothing in progress
            </p>
          ) : (
            inProgress.map((feature) => (
              <RoadmapCard key={feature._id} feature={feature} />
            ))
          )}
        </div>
      </div>

      {/* Completed Column */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Completed
          </h3>
          <span className="ml-auto text-sm text-zinc-500">
            {completed.length}
          </span>
        </div>
        <div className="space-y-3">
          {completed.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No completed features yet
            </p>
          ) : (
            completed.map((feature) => (
              <RoadmapCard key={feature._id} feature={feature} showDate />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface RoadmapCardProps {
  feature: {
    _id: Id<"featureRequests">;
    title: string;
    description: string;
    voteCount: number;
    updatedAt?: number;
  };
  showDate?: boolean;
}

function RoadmapCard({ feature, showDate }: RoadmapCardProps) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
      <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
        {feature.title}
      </h4>
      <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
        {feature.description}
      </p>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
        <span>{feature.voteCount} votes</span>
        {showDate && feature.updatedAt && (
          <span>{new Date(feature.updatedAt).toLocaleDateString()}</span>
        )}
      </div>
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
      setError("Please enter a valid email address");
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
        err instanceof Error ? err.message : "Failed to submit feature request",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Submit Feature Request
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Share your ideas to help us improve ENV Connect.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Title *
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              placeholder="Brief title for your feature"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Description *
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              placeholder="Describe the feature and why it would be valuable..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Your Email *
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Your Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Category
            </label>
            <input
              type="text"
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              placeholder="e.g., Security, Integrations, UI/UX"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isSubmitting ? "Submitting..." : "Submit Feature"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
