"use client";

import { use, useEffect, useId, useState } from "react";
import Link from "next/link";
import { BookText, Plus, FileText, Clock, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  useProjectBySlug,
  useProjectDocs,
  useDocAccess,
  useDocSearch,
  useFeatureGate,
  groupDocsByModule,
  type DocSummary,
} from "@/hooks";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDate } from "@/lib/format";

/** Mirrors SEARCH_LIMIT in convex/features/docs/queries.ts. */
const SEARCH_LIMIT = 20;

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

  // The docs queries throw for an org without the feature, which would blow
  // up before FeatureGate could render its upgrade state — so skip them
  // until the gate says yes. The server still enforces.
  const { allowed: docsAllowed } = useFeatureGate(orgId, "project_docs");
  const gatedProjectId = docsAllowed ? projectId : undefined;

  const docs = useProjectDocs(gatedProjectId);
  const access = useDocAccess(gatedProjectId);
  const atLimit = Boolean(access?.atProjectLimit || access?.atOrgLimit);
  // Show the action while access is still loading — hiding it on every page
  // load until a second query lands reads as a broken button, and the
  // mutation refuses anyway if the role or the tier says no.
  const showNew = access ? access.canCreate && !atLimit : true;
  const isLoadingDocs = docs === undefined;

  const filterFieldId = useId();
  const [filter, setFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Debounced — two search indexes per call, so per-keystroke would bill an
  // index read per character.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(filter.trim()), 250);
    return () => clearTimeout(id);
  }, [filter]);

  const results = useDocSearch(gatedProjectId, searchTerm);
  const isSearching = searchTerm.length > 0 && results === undefined;

  const allDocs = docs ?? [];
  // Search results replace the listing while a term is active.
  const visible: Array<DocSummary & { matchedBody?: boolean }> =
    searchTerm.length > 0 ? (results ?? []) : allDocs;
  const visibleCount = visible.length;
  const groups = groupDocsByModule(visible);
  const draftTotal = allDocs.filter((doc) => doc.status === "draft").length;

  if (isLoadingProject) return <TerminalLoading fullPage />;
  if (!project) {
    return <p className="text-sm text-ink-muted">Project not found.</p>;
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
            <>
              {/* Deleting a page from here otherwise gave no route back —
                  the only Trash link lives on the project detail page and is
                  gated on variable-delete, which a doc author may not hold. */}
              <Link
                href={`/dashboard/projects/${slug}/trash`}
                data-testid="doc-trash-link"
                title="Deleted pages are recoverable for 7 days"
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                <Trash2 className="h-4 w-4" />
                Trash
              </Link>
              {showNew && (
                <Link
                  href={`/dashboard/projects/${slug}/docs/new`}
                  data-testid="doc-new"
                  className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-ink-muted"
                >
                  <Plus className="h-4 w-4" />
                  New Page
                </Link>
              )}
            </>
          }
        />

        {atLimit && (
          <p
            data-testid="doc-limit-banner"
            className="border-l-2 border-warning-line py-1 pl-3 text-xs text-ink-muted"
          >
            <span className="font-medium text-warning">
              Documentation limit reached
            </span>{" "}
            {access?.atProjectLimit
              ? `This project holds ${access.projectCount} of ${access.projectLimit} pages.`
              : `Your organization holds ${access?.orgCount} of ${access?.orgLimit} pages.`}{" "}
            Delete a page or upgrade for unlimited pages.
          </p>
        )}

        {draftTotal > 0 && (
          <p
            data-testid="doc-review-banner"
            className="border-l-2 border-warning-line py-1 pl-3 text-xs text-ink-muted"
          >
            <span className="font-medium text-warning">
              {draftTotal} page{draftTotal !== 1 ? "s" : ""} awaiting review
            </span>{" "}
            — drafts are not visible to your team, and no agent can read them
            until they are published.
          </p>
        )}

        {allDocs.length > 0 && (
          <div className="relative max-w-md">
            {/* sr-only: the field is a bare search box whose icon and result
                counter already occupy its gutters — a visible label would add
                a line the layout does not have room for. */}
            <label htmlFor={filterFieldId} className="sr-only">
              Search pages
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              id={filterFieldId}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="doc-filter"
              placeholder="Search titles and page text…"
              // 16px on phones, or iOS zooms the viewport on focus.
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pr-20 pl-9 text-base text-ink transition-colors outline-none placeholder:text-ink-subtle focus:border-accent-line focus:bg-white/[0.05] sm:text-sm"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] text-ink-subtle">
              {isSearching
                ? "searching…"
                : searchTerm
                  ? `${visibleCount}${visibleCount >= SEARCH_LIMIT ? "+" : ""} found`
                  : ""}
            </span>
          </div>
        )}

        {isLoadingDocs || isSearching ? (
          <TerminalLoading />
        ) : groups.length === 0 ? (
          <div className="py-16 text-center">
            <BookText className="mx-auto h-8 w-8 text-ink-faint" />
            <h3 className="mt-3 text-sm font-semibold text-ink">
              {allDocs.length === 0 ? "No pages yet" : "No matching pages"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-subtle">
              {allDocs.length === 0
                ? "Write one here, or let your coding agent propose pages over MCP as it builds — you review and publish them."
                : "Try a different filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.module}>
                <h2 className="mb-2 font-mono text-xs tracking-wider uppercase text-ink-subtle">
                  {group.module}
                </h2>
                {/* Rules, not a card per module — boxes inside boxes. */}
                <AnimatedList className="divide-y border-t divide-line border-line">
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
  doc: DocSummary & { matchedBody?: boolean };
  projectSlug: string;
}) {
  const timeZone = useTimeZone();

  return (
    <Link
      href={`/dashboard/projects/${projectSlug}/docs/${doc.slug}`}
      data-testid={`doc-row-${doc.slug}`}
      className="flex items-start gap-3 px-2 py-3 transition-colors hover:bg-surface-hover/40"
    >
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{doc.title}</span>
          <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase border-line text-ink-muted">
            {doc.type}
          </span>
          {doc.status === "draft" && (
            <span
              data-testid="doc-draft-badge"
              className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase border-warning-line bg-warning-soft text-warning"
            >
              draft
            </span>
          )}
          {doc.matchedBody && (
            <span className="font-mono text-[10px] text-ink-subtle">
              matched in page text
            </span>
          )}
        </div>
        {doc.excerpt && (
          <p className="mt-1 line-clamp-1 text-xs text-ink-muted">
            {doc.excerpt}
          </p>
        )}
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-ink-muted sm:flex">
        <Clock className="h-3 w-3" />
        {formatDate(doc.updatedAt, timeZone)}
      </span>
    </Link>
  );
}
