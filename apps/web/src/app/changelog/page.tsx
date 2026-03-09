"use client";

import Link from "next/link";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChangelogEntries } from "@/hooks";

type ChangelogType =
  | "feature"
  | "fix"
  | "improvement"
  | "security"
  | "breaking";

const TYPE_CONFIG: Record<
  ChangelogType,
  { label: string; color: string; bgColor: string }
> = {
  feature: {
    label: "Feature",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  fix: {
    label: "Bug Fix",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  improvement: {
    label: "Improvement",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  security: {
    label: "Security",
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  breaking: {
    label: "Breaking",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
};

const ALL_TYPES: ChangelogType[] = [
  "feature",
  "fix",
  "improvement",
  "security",
  "breaking",
];

export default function ChangelogPage() {
  const { entries, isLoading } = useChangelogEntries();
  const [selectedType, setSelectedType] = useState<ChangelogType | null>(null);

  const filteredEntries = selectedType
    ? entries?.filter((entry) => entry.type === selectedType)
    : entries;

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
            <Link
              href="/sign-in"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="container mx-auto px-4 py-12 md:px-6 lg:py-16">
          {/* Page Header */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
              Changelog
            </h1>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              All the latest updates, improvements, and fixes to ENV Connect.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setSelectedType(null)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selectedType === null
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              All Updates
            </button>
            {ALL_TYPES.map((type) => {
              const config = TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedType === type
                      ? `${config.bgColor} ${config.color}`
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  {config.label}
                </button>
              );
            })}
          </div>

          {/* Changelog Entries */}
          <div className="mx-auto max-w-3xl">
            {isLoading ? (
              <div className="space-y-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="mt-4 h-8 w-3/4 rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="mt-4 space-y-2">
                      <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
                      <div className="h-4 w-5/6 rounded bg-zinc-200 dark:bg-zinc-700" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredEntries && filteredEntries.length > 0 ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-0 top-0 hidden h-full w-px bg-zinc-200 dark:bg-zinc-800 md:block md:left-[60px]" />

                <div className="space-y-12">
                  {filteredEntries.map((entry) => (
                    <ChangelogEntry
                      key={entry._id}
                      title={entry.title}
                      content={entry.content}
                      version={entry.version}
                      type={entry.type as ChangelogType}
                      publishedAt={entry.publishedAt ?? entry.createdAt}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <svg
                  className="mx-auto h-12 w-12 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
                  No updates yet
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedType
                    ? `No ${TYPE_CONFIG[selectedType].label.toLowerCase()} updates found.`
                    : "Check back soon for product updates and improvements."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-12 dark:border-zinc-800">
        <div className="container mx-auto px-4 text-center md:px-6">
          <div className="flex items-center justify-center gap-6 text-sm text-zinc-500 dark:text-zinc-400">
            <Link
              href="/"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Home
            </Link>
            <Link
              href="/wishlist"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Wishlist
            </Link>
            <Link
              href="/changelog"
              className="hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Changelog
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            &copy; {new Date().getFullYear()} ENV Connect. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function ChangelogEntry({
  title,
  content,
  version,
  type,
  publishedAt,
}: {
  title: string;
  content: string;
  version: string;
  type: ChangelogType;
  publishedAt: number;
}) {
  const config = TYPE_CONFIG[type];
  const date = new Date(publishedAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="relative pl-0 md:pl-24">
      {/* Date marker for timeline (desktop) */}
      <div className="absolute left-0 top-0 hidden text-right md:block">
        <time className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </time>
      </div>

      {/* Timeline dot (desktop) */}
      <div className="absolute left-[56px] top-1.5 hidden h-2 w-2 rounded-full bg-zinc-400 ring-4 ring-white dark:bg-zinc-600 dark:ring-zinc-950 md:block" />

      {/* Entry content */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${config.bgColor} ${config.color}`}
          >
            {config.label}
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {version}
          </span>
          <time className="text-sm text-zinc-500 dark:text-zinc-400 md:hidden">
            {formattedDate}
          </time>
        </div>

        {/* Title */}
        <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>

        {/* Markdown Content */}
        <div className="prose prose-zinc max-w-none dark:prose-invert prose-headings:font-semibold prose-h3:text-lg prose-h4:text-base prose-a:text-blue-600 prose-a:no-underline prose-a:hover:underline prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none dark:prose-a:text-blue-400 dark:prose-code:bg-zinc-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
