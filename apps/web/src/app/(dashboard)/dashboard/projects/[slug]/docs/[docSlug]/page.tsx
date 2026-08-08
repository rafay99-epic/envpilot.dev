"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, GitPullRequest, Pencil, Send, Trash2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { DocEditor, DocStatusPill } from "@/components/docs";
import {
  useProjectBySlug,
  useProjectDoc,
  useUpdateDoc,
  usePublishDoc,
  useUnpublishDoc,
  useDeleteDoc,
} from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

// Read mode is the common case and is the only one that renders markdown;
// the module index never loads this chunk at all.
const DocMarkdown = dynamic(
  () => import("@/components/docs/doc-markdown").then((m) => m.DocMarkdown),
  { ssr: false, loading: () => <TerminalLoading /> }
);

interface DocPageProps {
  params: Promise<{ slug: string; docSlug: string }>;
}

/**
 * Project → Docs → one page.
 *
 * The review surface. A draft shows the amber bar explaining that nobody
 * else — human or agent — can see it yet; publishing is the human act that
 * changes that, and it is the only thing in the product that does.
 */
export default function DocDetailPage({ params }: DocPageProps) {
  const { slug, docSlug } = use(params);
  const router = useRouter();
  const { organization } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;

  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectId = project?._id as Id<"projects"> | undefined;

  const doc = useProjectDoc(projectId, docSlug);

  const updateDoc = useUpdateDoc();
  const publishDoc = usePublishDoc();
  const unpublishDoc = useUnpublishDoc();
  const deleteDoc = useDeleteDoc();

  const [isEditing, setIsEditing] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the editor when a different page loads. Guarded on docSlug rather
  // than the doc object so a live update from another tab cannot overwrite
  // what the user is currently typing.
  useEffect(() => {
    setIsEditing(false);
    setWarnings([]);
    setError(null);
    setNotice(null);
  }, [docSlug]);

  const beginEdit = () => {
    if (!doc) return;
    setDraftBody(doc.body);
    setDraftTitle(doc.title);
    setWarnings([]);
    setError(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!doc) return;
    setError(null);
    setNotice(null);
    setIsBusy(true);
    try {
      const result = await updateDoc({
        docId: doc._id,
        title: draftTitle,
        body: draftBody,
      });
      setWarnings(result.warnings ?? []);
      setIsEditing(false);
      setNotice(
        result.unpublished
          ? "Saved. Editing a published page returns it to draft — publish again when it reads right."
          : "Saved."
      );
      // The title change may have moved the slug, so follow it.
      if (result.slug !== docSlug) {
        router.replace(`/dashboard/projects/${slug}/docs/${result.slug}`);
      }
    } catch (e) {
      setError(sanitizeConvexError(e));
    } finally {
      setIsBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!doc) return;
    setError(null);
    setNotice(null);
    setIsBusy(true);
    try {
      await publishDoc({ docId: doc._id });
      setNotice("Published.");
    } catch (e) {
      setError(sanitizeConvexError(e));
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnpublish = async () => {
    if (!doc) return;
    setError(null);
    setNotice(null);
    setIsBusy(true);
    try {
      await unpublishDoc({ docId: doc._id });
      setNotice("Returned to draft.");
    } catch (e) {
      setError(sanitizeConvexError(e));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    setIsBusy(true);
    try {
      await deleteDoc({ docId: doc._id });
      router.push(`/dashboard/projects/${slug}/docs`);
    } catch (e) {
      setError(sanitizeConvexError(e));
      setIsBusy(false);
    } finally {
      setConfirmDelete(false);
    }
  };

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
      {/*
        Two layouts, one page.

        READING is a document: normal flow, the dashboard's own scroll
        container handles it, exactly like every other project page.

        EDITING is an application: the page is pinned to the visible area and
        `overflow-hidden`, so the dashboard scroller has nothing to scroll and
        the editor panes are the ONLY things that move. Without this the page
        scrolled AND the pane scrolled — two scrollbars racing each other,
        which is what made writing here feel wrong.

        The 7rem offset covers the shell's `py-8` (4rem total) plus this
        page's header rows; `min-h-0` lets the editor shrink inside it.
      */}
      <div
        // `data-full-bleed` drops the shell's max-w-7xl + horizontal padding
        // (one :has() rule in globals.css) so the writing surface runs the
        // full width of the page. Only while editing — reading keeps the
        // normal dashboard measure.
        data-full-bleed={isEditing ? "" : undefined}
        className={
          isEditing
            ? // h-screen, not a calc: full-bleed mode zeroes the shell's
              // padding entirely, so this container owns the whole viewport
              // column and the surface ends flush with the bottom edge.
              "flex h-screen min-h-0 flex-col gap-4 overflow-hidden pt-6"
            : "space-y-5"
        }
      >
        {/* While editing, every header row shares the writing column's
            centered 920px grid — chrome sits over the text, not floating at
            the viewport edge. */}
        <Link
          href={`/dashboard/projects/${slug}/docs`}
          className={`inline-flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-100 ${
            isEditing ? "mx-auto w-full max-w-[920px] px-4" : ""
          }`}
        >
          <ArrowLeft className="h-4 w-4" />
          Documentation
        </Link>

        {doc === undefined ? (
          <TerminalLoading />
        ) : (
          <>
            {/*
              One header block, not seven stacked rows.

              The title used to render TWICE while editing — a static <h1>
              plus the edit input right below it — under a module line, a meta
              line, a PR line and a full-width draft banner. The input IS the
              title now; everything else that is not the title collapses into
              a single muted meta line, and publication state is a pill rather
              than a banner. Writing starts one screen higher.
            */}
            <div
              className={`flex shrink-0 items-start justify-between gap-4 ${
                isEditing ? "mx-auto w-full max-w-[920px] px-4" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      maxLength={200}
                      data-testid="doc-title-edit"
                      aria-label="Page title"
                      placeholder="Page title"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-bold text-zinc-900 outline-none placeholder:text-zinc-600 dark:text-zinc-100"
                    />
                  ) : (
                    <h1
                      data-testid="doc-title"
                      className="min-w-0 truncate text-2xl font-bold text-zinc-900 dark:text-zinc-100"
                    >
                      {doc.title}
                    </h1>
                  )}
                  <DocStatusPill status={doc.status} />
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
                  <span className="text-zinc-400">{doc.module}</span>
                  <span aria-hidden>·</span>
                  <span>{doc.authorName}</span>
                  <span aria-hidden>·</span>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                  {doc.prUrl && (
                    <>
                      <span aria-hidden>·</span>
                      <a
                        href={doc.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-green-500 hover:underline"
                      >
                        <GitPullRequest className="h-3 w-3" />
                        Pull request
                      </a>
                    </>
                  )}
                </p>
              </div>

              {doc.canEdit && (
                <div className="flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        disabled={isBusy}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="doc-save"
                        onClick={handleSave}
                        disabled={isBusy}
                        className="rounded-lg bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
                      >
                        {isBusy ? "Saving…" : "Save"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid="doc-delete"
                        onClick={() => setConfirmDelete(true)}
                        title="Move to trash"
                        aria-label="Move to trash"
                        className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        data-testid="doc-edit"
                        onClick={beginEdit}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                      {doc.status === "draft" ? (
                        <button
                          type="button"
                          data-testid="doc-publish"
                          onClick={handlePublish}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Publish
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid="doc-unpublish"
                          onClick={handleUnpublish}
                          disabled={isBusy}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50"
                        >
                          Return to draft
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* The one thing the banner said that was worth keeping: what
                publishing actually changes. Shown only while it is true. */}
            {doc.status === "draft" && !isEditing && (
              <p className="shrink-0 text-xs text-zinc-500">
                Not visible to your team, and no agent can read it over MCP
                until it is published.
              </p>
            )}

            {notice && (
              <p className="border-l-2 border-green-500/60 py-1 pl-3 text-xs text-green-700 dark:text-green-400">
                {notice}
              </p>
            )}
            {error && (
              <p className="border-l-2 border-red-500/60 py-1 pl-3 text-xs text-red-700 dark:text-red-400">
                {error}
              </p>
            )}

            {isEditing ? (
              // min-h-0 so the editor can shrink inside the pinned page
              // instead of pushing it taller and re-creating a page scroll.
              // The title input lives in the header — there is exactly one.
              <div className="min-h-0 flex-1">
                <DocEditor
                  body={draftBody}
                  onChange={setDraftBody}
                  warnings={warnings}
                  disabled={isBusy}
                />
              </div>
            ) : (
              <div data-testid="doc-body" className="max-w-[76ch]">
                <DocMarkdown body={doc.body} />
              </div>
            )}

            {warnings.length > 0 && !isEditing && (
              <div className="space-y-1 border-l-2 border-amber-500/60 py-1 pl-3">
                {warnings.map((warning) => (
                  <p
                    key={warning}
                    className="text-xs text-amber-700 dark:text-amber-300"
                  >
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Move page to trash"
        message={
          doc
            ? `"${doc.title}" will be moved to trash and permanently deleted after the retention window.`
            : ""
        }
        confirmText="Move to trash"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </FeatureGate>
  );
}
