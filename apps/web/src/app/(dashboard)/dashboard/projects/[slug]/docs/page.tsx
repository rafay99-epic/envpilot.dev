"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { BookText, Plus, FileText, Clock, Search } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  useProjectBySlug,
  useProjectDocs,
  useDocSearch,
  groupDocsByModule,
  type DocSummary,
} from "@/hooks";

interface DocsPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Project → Docs (module index).
 *
 * Renders METADATA ONLY — title, module, excerpt. No markdown reaches this
 * page, which is why it neither reads `docContent` nor ships the renderer.
 *
 * Drafts appear here to their author (and to Team Lead+) with an amber
 * marker and to nobody else: a draft is unreviewed, often agent-written
 * text, and the human publication gate is what keeps it out of teammates'
 * hands and out of every MCP read.
 */
export default function ProjectDocsPage({ params }: DocsPageProps) {
  const { slug } = use(params);
  const { organization } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;

  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectId = project?._id as Id<"projects"> | undefined;

  const docs = useProjectDocs(projectId);
  const isLoadingDocs = docs === undefined;

  const [filter, setFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Debounced — two search indexes per call, so per-keystroke would bill an
  // index read per character.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(filter.trim()), 250);
    return () => clearTimeout(id);
  }, [filter]);

  const results = useDocSearch(projectId, searchTerm);
  const isSearching = searchTerm.length > 0 && results === undefined;

  const allDocs = docs ?? [];
  // Search results replace the listing while a term is active.
  const visible: DocSummary[] =
    searchTerm.length > 0 ? (results ?? []) : allDocs;
  const visibleCount = visible.length;
  const groups = groupDocsByModule(visible);
  const draftTotal = allDocs.filter((doc) => doc.status === "draft").length;

  if (isLoadingProject) return <TerminalLoading fullPage />;
  if (!project) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Project not found.
      </p>
    );
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="project_docs"
      featureName="Project Documentation"
    >
      <div className="space-y-8">
        <PageHeader
          icon={BookText}
          title="Documentation"
          description={`How ${project.name} works — written as the work happens, read by whoever picks it up next, and by their agent.`}
          actions={
            <Link
              href={`/dashboard/projects/${slug}/docs/new`}
              data-testid="doc-new"
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
            >
              <Plus className="h-4 w-4" />
              New Page
            </Link>
          }
        />

        {draftTotal > 0 && (
          <p
            data-testid="doc-review-banner"
            className="border-l-2 border-amber-500/60 py-1 pl-3 text-xs text-zinc-600 dark:text-zinc-400"
          >
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {draftTotal} page{draftTotal !== 1 ? "s" : ""} awaiting review
            </span>{" "}
            — drafts are not visible to your team, and no agent can read them
            until they are published.
          </p>
        )}

        {allDocs.length > 0 && (
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="doc-filter"
              placeholder="Search titles and page text…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pr-20 pl-9 text-sm text-zinc-100 transition-colors outline-none placeholder:text-zinc-500 focus:border-green-500/40 focus:bg-white/[0.05]"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] text-zinc-500">
              {isSearching
                ? "searching…"
                : searchTerm
                  ? `${visibleCount} found`
                  : ""}
            </span>
          </div>
        )}

        {isLoadingDocs ? (
          <TerminalLoading />
        ) : groups.length === 0 ? (
          <div className="py-16 text-center">
            <BookText className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-700" />
            <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {allDocs.length === 0 ? "No pages yet" : "No matching pages"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
              {allDocs.length === 0
                ? "Write one here, or let your coding agent propose pages over MCP as it builds — you review and publish them."
                : "Try a different filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.module}>
                <h2 className="mb-2 font-mono text-xs tracking-wider text-zinc-500 uppercase dark:text-zinc-500">
                  {group.module}
                </h2>
                {/* Rules, not a card per module — boxes inside boxes. */}
                <AnimatedList className="divide-y divide-zinc-200/70 border-t border-zinc-200/70 dark:divide-zinc-800 dark:border-zinc-800">
                  {group.docs.map((doc) => (
                    <DocRow key={doc._id} doc={doc} projectSlug={slug} />
                  ))}
                </AnimatedList>
              </section>
            ))}
          </div>
        )}
      </div>
    </FeatureGate>
  );
}

function DocRow({
  doc,
  projectSlug,
}: {
  doc: DocSummary;
  projectSlug: string;
}) {
  return (
    <Link
      href={`/dashboard/projects/${projectSlug}/docs/${doc.slug}`}
      data-testid={`doc-row-${doc.slug}`}
      className="flex items-start gap-3 px-2 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
    >
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {doc.title}
          </span>
          <span className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 uppercase dark:border-zinc-700 dark:text-zinc-400">
            {doc.type}
          </span>
          {doc.status === "draft" && (
            <span
              data-testid="doc-draft-badge"
              className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 uppercase dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400"
            >
              draft
            </span>
          )}
        </div>
        {doc.excerpt && (
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
            {doc.excerpt}
          </p>
        )}
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-zinc-400 sm:flex">
        <Clock className="h-3 w-3" />
        {new Date(doc.updatedAt).toLocaleDateString()}
      </span>
    </Link>
  );
}
