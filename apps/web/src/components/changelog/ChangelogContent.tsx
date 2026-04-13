"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

export interface ChangelogEntry {
  _id: string;
  title: string;
  content: string;
  version: string;
  type: string;
  types?: string[];
  publishedAt?: number;
  createdAt: number;
}

export function ChangelogContent({
  initialEntries,
}: {
  initialEntries: ChangelogEntry[];
}) {
  const [selectedType, setSelectedType] = useState<ChangelogType | null>(null);

  const filteredEntries = selectedType
    ? initialEntries.filter((entry) => {
        const entryTypes = entry.types ?? [entry.type];
        return entryTypes.includes(selectedType);
      })
    : initialEntries;

  return (
    <>
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

      {/* Entries */}
      <section className="py-12">
        <div className="mx-auto max-w-5xl px-4">
          {filteredEntries.length > 0 ? (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[7px] top-2 hidden h-[calc(100%-16px)] w-px bg-zinc-800 md:block" />

              <div className="space-y-8">
                {filteredEntries.map((entry) => (
                  <ChangelogEntryCard
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
    </>
  );
}

function ChangelogEntryCard({
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
