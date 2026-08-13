"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { terminal } from "@/components/marketing";

type ChangelogType =
  | "feature"
  | "fix"
  | "improvement"
  | "security"
  | "breaking";

/**
 * Brand palette is locked to green / amber / zinc:
 * features read green, fixes read amber, everything else stays zinc.
 */
const TYPE_CONFIG: Record<
  ChangelogType,
  { label: string; badge: string; node: string; prefix: string }
> = {
  feature: {
    label: "feature",
    badge: "bg-accent-soft text-accent",
    node: "bg-accent shadow-[0_0_12px_rgba(34,197,94,0.6)]",
    prefix: "+",
  },
  fix: {
    label: "fix",
    badge: "bg-warning-soft text-warning",
    node: "bg-warning shadow-[0_0_12px_rgba(251,191,36,0.5)]",
    prefix: "!",
  },
  improvement: {
    label: "improvement",
    badge: "bg-surface-raised text-ink-muted",
    node: "bg-surface-hover",
    prefix: "~",
  },
  security: {
    label: "security",
    badge: "bg-surface-raised text-ink-muted",
    node: "bg-surface-hover",
    prefix: "#",
  },
  breaking: {
    label: "breaking",
    badge: "bg-surface-raised text-ink-muted",
    node: "bg-surface-hover",
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

export const CHANGELOG_PAGE_SIZE = 10;

export function ChangelogContent({
  initialEntries,
}: {
  initialEntries: ChangelogEntry[];
}) {
  const [selectedType, setSelectedType] = useState<ChangelogType | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.features.community.changelog.queries.listPublishedPaginated,
    {},
    { initialNumItems: CHANGELOG_PAGE_SIZE }
  );

  // The server rendered the first page for SEO and first paint; the client
  // query takes over as soon as it has anything.
  const entries: ChangelogEntry[] =
    results.length > 0 ? (results as ChangelogEntry[]) : initialEntries;

  const filteredEntries = selectedType
    ? entries.filter((entry) => {
        const entryTypes = entry.types ?? [entry.type];
        return entryTypes.includes(selectedType);
      })
    : entries;

  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore";

  return (
    <>
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`mr-1 ${terminal.mono} text-[12px] text-ink-faint`}>
          <span className="text-accent">❯</span> --filter
        </span>
        <FilterPill
          active={selectedType === null}
          onClick={() => setSelectedType(null)}
        >
          all
        </FilterPill>
        {ALL_TYPES.map((type) => {
          const config = TYPE_CONFIG[type];
          return (
            <FilterPill
              key={type}
              active={selectedType === type}
              onClick={() => setSelectedType(type)}
            >
              <span className="text-accent">{config.prefix}</span>{" "}
              {config.label}
            </FilterPill>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="mt-12">
        {filteredEntries.length > 0 ? (
          <div className="relative">
            {/* Left rail */}
            <div
              aria-hidden
              className="absolute top-3 bottom-3 left-[7px] hidden w-px bg-line md:block"
            />

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
          <div className={`${terminal.panel} p-8 text-center sm:p-12`}>
            <p className={`${terminal.mono} text-[13px] text-ink-subtle`}>
              <span className="text-accent">❯</span> envpilot changelog --filter{" "}
              {selectedType ?? "all"}
            </p>
            <p className="mt-2 font-sans text-[15px] text-ink-muted">
              {selectedType
                ? `No ${TYPE_CONFIG[selectedType].label} updates in the entries loaded so far.`
                : "No updates yet. Check back soon."}
            </p>
          </div>
        )}

        {/* Paging — a filter narrows what is loaded, so the button stays
            reachable while filtered. */}
        <div className="mt-10 flex flex-col items-center gap-2">
          {canLoadMore || isLoadingMore ? (
            <button
              onClick={() => loadMore(CHANGELOG_PAGE_SIZE)}
              disabled={isLoadingMore}
              className="rounded-md px-5 py-2.5 font-sans text-[15px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong disabled:opacity-50"
            >
              {isLoadingMore ? "Loading…" : "Load more"}
            </button>
          ) : (
            status === "Exhausted" && (
              <p className={`${terminal.mono} text-[12px] text-ink-faint`}>
                # end of changelog
              </p>
            )
          )}
          <p className={`${terminal.mono} text-[11px] text-ink-faint`}>
            {selectedType
              ? `${filteredEntries.length} of ${entries.length} loaded entries match`
              : `${entries.length} entries loaded`}
          </p>
        </div>
      </div>
    </>
  );
}

function FilterPill({
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
      className={`rounded-md px-3 py-1.5 font-mono text-[12px] ring-1 transition-colors ${
        active
          ? "bg-accent-soft text-accent ring-accent-line"
          : "text-ink-subtle ring-line hover:text-ink hover:ring-line-strong"
      }`}
    >
      {children}
    </button>
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
    <article className="group relative md:pl-10">
      {/* Timeline node */}
      <span
        aria-hidden
        className={`absolute top-7 left-0 hidden h-[15px] w-[15px] rounded-full border-2 border-line md:block ${primaryConfig.node}`}
      />

      <div
        className={`${terminal.panel} p-6 transition-shadow duration-300 hover:ring-line-strong`}
      >
        {/* Meta row */}
        <div
          className={`flex flex-wrap items-center gap-3 ${terminal.mono} text-[11px]`}
        >
          <span className="text-ink-muted">v{version.replace(/^v/i, "")}</span>
          {entryTypes.map((t) => {
            const cfg = TYPE_CONFIG[t];
            return (
              <span key={t} className={`rounded px-2 py-0.5 ${cfg.badge}`}>
                {cfg.prefix} {cfg.label}
              </span>
            );
          })}
          <time className="ml-auto text-ink-faint">{formattedDate}</time>
        </div>

        {/* Title */}
        <h2 className="mt-4 flex items-start gap-2.5 font-sans text-[20px] font-semibold tracking-[-0.02em] text-ink">
          <span aria-hidden className="mt-0.5 font-mono text-accent">
            ❯
          </span>
          {title}
        </h2>

        {/* Markdown Content */}
        <div className="mt-4 font-sans text-[15px] leading-relaxed text-ink-muted [&_a]:text-accent [&_a]:hover:underline [&_code]:rounded [&_code]:bg-surface-raised [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-accent [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-ink [&_h4]:mt-3 [&_h4]:font-medium [&_h4]:text-ink-muted [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
