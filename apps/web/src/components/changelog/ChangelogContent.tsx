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
    badge: "border-green-500/30 bg-green-500/10 text-green-400",
    node: "bg-green-400 shadow-[0_0_12px_rgba(34,197,94,0.6)]",
    prefix: "+",
  },
  fix: {
    label: "fix",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    node: "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]",
    prefix: "!",
  },
  improvement: {
    label: "improvement",
    badge: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
    node: "bg-zinc-500",
    prefix: "~",
  },
  security: {
    label: "security",
    badge: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
    node: "bg-zinc-500",
    prefix: "#",
  },
  breaking: {
    label: "breaking",
    badge: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
    node: "bg-zinc-500",
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
        <span className="mr-1 font-mono text-xs text-zinc-600">
          <span className="text-green-500">❯</span> --filter
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
              <span className="text-green-500">{config.prefix}</span>{" "}
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
              className="absolute left-[7px] top-3 bottom-3 hidden w-px bg-gradient-to-b from-green-500/40 via-zinc-800 to-zinc-800 md:block"
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
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <p className="font-mono text-sm text-zinc-500">
              <span className="text-green-500">❯</span> envpilot changelog
              --filter {selectedType ?? "all"}
            </p>
            <p className="mt-2 font-mono text-xs text-zinc-600">
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
          ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_16px_-4px_rgba(34,197,94,0.4)]"
          : "border-zinc-800 text-zinc-500 hover:border-green-500/30 hover:text-zinc-300"
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
        className={`absolute left-0 top-7 hidden h-[15px] w-[15px] rounded-full border-2 border-zinc-950 md:block ${primaryConfig.node}`}
      />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-green-500/30">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-zinc-800 bg-zinc-950/60 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-zinc-400">
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
          <time className="ml-auto font-mono text-xs text-zinc-600">
            {formattedDate}
          </time>
        </div>

        {/* Title */}
        <h2 className="mt-4 flex items-start gap-2 font-sans text-xl font-bold tracking-tight text-zinc-100">
          <span aria-hidden className="mt-0.5 font-mono text-green-500">
            ❯
          </span>
          {title}
        </h2>

        {/* Markdown Content */}
        <div className="mt-4 font-mono text-sm leading-relaxed text-zinc-400 [&_a]:text-green-400 [&_a]:hover:underline [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-green-400 [&_h3]:mt-4 [&_h3]:font-sans [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h4]:mt-3 [&_h4]:font-sans [&_h4]:font-medium [&_h4]:text-zinc-300 [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </article>
  );
}
