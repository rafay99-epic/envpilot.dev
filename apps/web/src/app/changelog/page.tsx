"use client";

import Link from "next/link";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChangelogEntries } from "@/hooks";
import { ChevronRight } from "lucide-react";

type ChangelogType =
  | "feature"
  | "fix"
  | "improvement"
  | "security"
  | "breaking";

const TYPE_CONFIG: Record<
  ChangelogType,
  { label: string; color: string; dot: string; prefix: string }
> = {
  feature: {
    label: "feature",
    color: "text-emerald-400",
    dot: "bg-emerald-400",
    prefix: "+",
  },
  fix: {
    label: "fix",
    color: "text-red-400",
    dot: "bg-red-400",
    prefix: "!",
  },
  improvement: {
    label: "improvement",
    color: "text-blue-400",
    dot: "bg-blue-400",
    prefix: "~",
  },
  security: {
    label: "security",
    color: "text-amber-400",
    dot: "bg-amber-400",
    prefix: "#",
  },
  breaking: {
    label: "breaking",
    color: "text-purple-400",
    dot: "bg-purple-400",
    prefix: "!!",
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
    ? entries?.filter((entry) => {
        const entryTypes = entry.types ?? [entry.type];
        return entryTypes.includes(selectedType);
      })
    : entries;

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
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 transition-colors hover:text-green-400"
            >
              sign-in
            </Link>
            <Link
              href="/sign-up"
              className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
            >
              get-started
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="border-b border-zinc-800/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// changelog"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              What&apos;s new in Envpilot
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-500">
              All the latest updates, improvements, and fixes. Follow along as
              we build.
            </p>

            {/* Filter pills */}
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedType(null)}
                className={`rounded border px-3 py-1.5 text-xs transition-all ${
                  selectedType === null
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                }`}
              >
                all
              </button>
              {ALL_TYPES.map((type) => {
                const config = TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`rounded border px-3 py-1.5 text-xs transition-all ${
                      selectedType === type
                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                    }`}
                  >
                    <span className={config.color}>{config.prefix}</span>{" "}
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Entries */}
        <section className="py-12">
          <div className="mx-auto max-w-5xl px-4">
            {isLoading ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6"
                  >
                    <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
                    <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-zinc-800" />
                    <div className="mt-4 space-y-2">
                      <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-zinc-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredEntries && filteredEntries.length > 0 ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 hidden h-[calc(100%-16px)] w-px bg-zinc-800 md:block" />

                <div className="space-y-8">
                  {filteredEntries.map((entry) => (
                    <ChangelogEntry
                      key={entry._id}
                      title={entry.title}
                      content={entry.content}
                      version={entry.version}
                      type={entry.type as ChangelogType}
                      types={(entry.types ?? [entry.type]) as ChangelogType[]}
                      publishedAt={entry.publishedAt ?? entry.createdAt}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center">
                <p className="text-sm text-zinc-500">
                  <span className="text-green-500">$</span> envpilot changelog
                  --filter {selectedType ?? "all"}
                </p>
                <p className="mt-2 text-xs text-zinc-600">
                  {selectedType
                    ? `No ${TYPE_CONFIG[selectedType].label} updates found.`
                    : "No updates yet. Check back soon."}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

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
              <Link href="/support" className="hover:text-zinc-400">
                Support
              </Link>
              <Link href="/contact" className="hover:text-zinc-400">
                Contact
              </Link>
            </div>
            <div className="text-right text-xs text-zinc-700">
              <p>&copy; {new Date().getFullYear()} Envpilot</p>
              <p className="text-[10px] text-zinc-800">
                Built at{" "}
                <a
                  href="https://syntaxlabtechnology.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Syntax Lab Technology
                </a>{" "}
                &middot;{" "}
                <a
                  href="https://rafay99.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Abdul Rafay
                </a>
              </p>
            </div>
          </div>
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
  types,
  publishedAt,
}: {
  title: string;
  content: string;
  version: string;
  type: ChangelogType;
  types?: ChangelogType[];
  publishedAt: number;
}) {
  const entryTypes = types ?? [type];
  const primaryConfig = TYPE_CONFIG[entryTypes[0]];
  const date = new Date(publishedAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <article className="group relative pl-0 md:pl-8">
      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-[22px] hidden h-[15px] w-[15px] rounded-full border-2 border-zinc-950 md:block ${primaryConfig.dot}`}
      />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <time className="text-xs text-zinc-500">{formattedDate}</time>
          <span className="text-zinc-700">&middot;</span>
          {entryTypes.map((t) => {
            const cfg = TYPE_CONFIG[t];
            return (
              <span key={t} className={`text-xs font-medium ${cfg.color}`}>
                [{cfg.prefix}] {cfg.label}
              </span>
            );
          })}
          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
            {version}
          </span>
        </div>

        {/* Title */}
        <h2 className="mt-3 flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <ChevronRight className="h-4 w-4 text-green-500" />
          {title}
        </h2>

        {/* Markdown Content */}
        <div className="mt-4 text-sm leading-relaxed text-zinc-400 [&_a]:text-blue-400 [&_a]:hover:underline [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-green-400 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h4]:mt-3 [&_h4]:font-medium [&_h4]:text-zinc-300 [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
