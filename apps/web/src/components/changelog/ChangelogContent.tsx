"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Stagger, StaggerItem } from "@/components/marketing";

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
    badge: "border-accent-line bg-accent-soft text-accent",
    node: "bg-accent shadow-[0_0_12px_rgba(34,197,94,0.6)]",
    prefix: "+",
  },
  fix: {
    label: "fix",
    badge: "border-warning-line bg-warning-soft text-warning",
    node: "bg-warning shadow-[0_0_12px_rgba(251,191,36,0.5)]",
    prefix: "!",
  },
  improvement: {
    label: "improvement",
    badge: "border-line bg-surface-raised/60 text-ink-muted",
    node: "bg-surface-hover",
    prefix: "~",
  },
  security: {
    label: "security",
    badge: "border-line bg-surface-raised/60 text-ink-muted",
    node: "bg-surface-hover",
    prefix: "#",
  },
  breaking: {
    label: "breaking",
    badge: "border-line bg-surface-raised/60 text-ink-muted",
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-xs text-ink-faint">
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
              className="absolute left-[7px] top-3 bottom-3 hidden w-px bg-gradient-to-b from-accent-line via-line to-line md:block"
            />

            <Stagger className="space-y-10">
              {filteredEntries.map((entry) => (
                <StaggerItem key={entry._id}>
                  <ChangelogEntryCard
                    title={entry.title}
                    content={entry.content}
                    version={entry.version}
                    type={entry.type as ChangelogType}
                    types={(entry.types ?? [entry.type]) as ChangelogType[]}
                    publishedAt={entry.publishedAt ?? entry.createdAt}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface/40 p-12 text-center">
            <p className="font-mono text-sm text-ink-subtle">
              <span className="text-accent">❯</span> envpilot changelog
              --filter {selectedType ?? "all"}
            </p>
            <p className="mt-2 font-mono text-xs text-ink-faint">
              {selectedType
                ? `No ${TYPE_CONFIG[selectedType].label} updates found.`
                : "No updates yet. Check back soon."}
            </p>
          </div>
        )}
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
      className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-all ${
        active
          ? "border-accent-line bg-accent-soft text-accent shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
          : "border-line text-ink-subtle hover:border-accent-line hover:text-ink-muted"
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
        className={`absolute left-0 top-7 hidden h-[15px] w-[15px] rounded-full border-2 border-line md:block ${primaryConfig.node}`}
      />

      <div className="rounded-xl border border-line bg-surface/40 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-accent-line">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-canvas/60 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-ink-muted">
            v{version.replace(/^v/i, "")}
          </span>
          {entryTypes.map((t) => {
            const cfg = TYPE_CONFIG[t];
            return (
              <span
                key={t}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide ${cfg.badge}`}
              >
                {cfg.prefix} {cfg.label}
              </span>
            );
          })}
          <time className="ml-auto font-mono text-xs text-ink-faint">
            {formattedDate}
          </time>
        </div>

        {/* Title */}
        <h2 className="mt-4 flex items-start gap-2 font-sans text-xl font-bold tracking-tight text-ink">
          <span aria-hidden className="mt-0.5 font-mono text-accent">
            ❯
          </span>
          {title}
        </h2>

        {/* Markdown Content */}
        <div className="mt-4 font-mono text-sm leading-relaxed text-ink-muted [&_a]:text-accent [&_a]:hover:underline [&_code]:rounded [&_code]:bg-surface-raised [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent [&_h3]:mt-4 [&_h3]:font-sans [&_h3]:font-semibold [&_h3]:text-ink [&_h4]:mt-3 [&_h4]:font-sans [&_h4]:font-medium [&_h4]:text-ink-muted [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
