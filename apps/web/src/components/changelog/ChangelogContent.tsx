"use client";

import { useState } from "react";
import { terminal } from "@/components/marketing";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDate } from "@/lib/format";
import { CHANGELOG_TYPES, type ChangelogType } from "@/lib/changelog-schema";

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

export const CHANGELOG_PAGE_SIZE = 10;

/**
 * One rendered entry. `body` arrives already compiled by the server through
 * the shared docs MDX pipeline, so this component never parses markdown.
 */
export interface RenderedChangelogEntry {
  id: string;
  version: string;
  title: string;
  publishedAt: number;
  types: ChangelogType[];
  body: React.ReactNode;
}

export function ChangelogContent({
  entries,
}: {
  entries: RenderedChangelogEntry[];
}) {
  const [selectedType, setSelectedType] = useState<ChangelogType | null>(null);
  const [visibleCount, setVisibleCount] = useState(CHANGELOG_PAGE_SIZE);

  const filteredEntries = selectedType
    ? entries.filter((entry) => entry.types.includes(selectedType))
    : entries;

  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const canLoadMore = visibleCount < filteredEntries.length;

  function selectType(type: ChangelogType | null) {
    setSelectedType(type);
    setVisibleCount(CHANGELOG_PAGE_SIZE);
  }

  return (
    <>
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`mr-1 ${terminal.mono} text-[12px] text-ink-faint`}>
          <span className="text-accent">❯</span> --filter
        </span>
        <FilterPill
          active={selectedType === null}
          onClick={() => selectType(null)}
        >
          all
        </FilterPill>
        {CHANGELOG_TYPES.map((type) => {
          const config = TYPE_CONFIG[type];
          return (
            <FilterPill
              key={type}
              active={selectedType === type}
              onClick={() => selectType(type)}
            >
              <span className="text-accent">{config.prefix}</span>{" "}
              {config.label}
            </FilterPill>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="mt-12">
        {visibleEntries.length > 0 ? (
          <div className="relative">
            {/* Left rail */}
            <div
              aria-hidden
              className="absolute top-3 bottom-3 left-[7px] hidden w-px bg-line md:block"
            />

            <div className="space-y-8">
              {visibleEntries.map((entry) => (
                <ChangelogEntryCard key={entry.id} entry={entry} />
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
                ? `No ${TYPE_CONFIG[selectedType].label} updates yet.`
                : "No updates yet. Check back soon."}
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-2">
          {canLoadMore ? (
            <button
              onClick={() => setVisibleCount((n) => n + CHANGELOG_PAGE_SIZE)}
              className="rounded-md px-5 py-2.5 font-sans text-[15px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
            >
              Load more
            </button>
          ) : (
            filteredEntries.length > 0 && (
              <p className={`${terminal.mono} text-[12px] text-ink-faint`}>
                # end of changelog
              </p>
            )
          )}
          <p className={`${terminal.mono} text-[11px] text-ink-faint`}>
            {selectedType
              ? `${filteredEntries.length} of ${entries.length} entries match`
              : `${entries.length} entries`}
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

function ChangelogEntryCard({ entry }: { entry: RenderedChangelogEntry }) {
  const primaryConfig = TYPE_CONFIG[entry.types[0]];
  const timeZone = useTimeZone();
  const formattedDate = formatDate(entry.publishedAt, timeZone);

  return (
    <article id={entry.id} className="group relative scroll-mt-24 md:pl-10">
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
          <span className="text-ink-muted">
            v{entry.version.replace(/^v/i, "")}
          </span>
          {entry.types.map((type) => {
            const cfg = TYPE_CONFIG[type];
            return (
              <span key={type} className={`rounded px-2 py-0.5 ${cfg.badge}`}>
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
          {entry.title}
        </h2>

        {/* Body — rendered by the shared docs MDX components */}
        <div className="mt-4">{entry.body}</div>
      </div>
    </article>
  );
}
