"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  GitPullRequest,
  Pencil,
  Send,
  Share2,
  Trash2,
} from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  DocEditor,
  DocSharesList,
  DocShareDrawer,
  DocStatusPill,
} from "@/components/docs";
import {
  useDocAccess,
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
  const [shareOpen, setShareOpen] = useState(false);

  // Capability + tier, resolved by the backend. `canShare` covers the team
  // tab; the public-link tab has its own capability and is hidden without it.
  const docAccess = useDocAccess(projectId);

  // Either capability opens the drawer — a role may hold only the external
  // one — and so does the plan-blocked case, which the drawer itself explains.
  const canOpenShare =
    docAccess?.canShare === true ||
    docAccess?.canShareExternal === true ||
    docAccess?.externalUpgradeRequired === true;

  // Seed the editor when a different page loads. Guarded on docSlug rather
  // than the doc object so a live update from another tab cannot overwrite
  // what the user is currently typing.
  useEffect(() => {
    setIsEditing(false);
    setWarnings([]);
    setError(null);
    setNotice(null);
    setShareOpen(false);
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
    return <p className="text-sm text-ink-muted">Project not found.</p>;
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="project_docs"
      featureName="Project Documentation"
    >
      {/* Reading is a document (normal flow); editing is an application —
          pinned and overflow-hidden, so the page scroller has nothing to
          scroll and the editor panes are the only things that move. */}
      <div
        // Drops the shell's max-w-7xl + padding via the :has() rule in
        // globals.css. Editing only; reading keeps the normal measure.
        data-full-bleed={isEditing ? "" : undefined}
        className={
          isEditing
            ? // h-screen, not a calc: full-bleed zeroes the shell's padding,
              // so this owns the viewport column and ends flush at the bottom.
              "flex h-screen min-h-0 flex-col gap-4 overflow-hidden pt-6"
            : "space-y-5"
        }
      >
        {/* Header rows share the writing column's grid while editing. */}
        <Link
          href={`/dashboard/projects/${slug}/docs`}
          className={`inline-flex shrink-0 items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink ${
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
            {/* One header block. The title used to render twice while
                editing — a static h1 plus the edit input — under four more
                rows. The input IS the title; the rest is one meta line. */}
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
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-bold text-ink-inverse outline-none placeholder:text-ink"
                    />
                  ) : (
                    <h1
                      data-testid="doc-title"
                      className="min-w-0 truncate text-2xl font-bold text-ink"
                    >
                      {doc.title}
                    </h1>
                  )}
                  <DocStatusPill status={doc.status} />
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
                  <span className="text-ink-muted">{doc.module}</span>
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
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        <GitPullRequest className="h-3 w-3" />
                        Pull request
                      </a>
                    </>
                  )}
                </p>
              </div>

              {(doc.canEdit ||
                doc.canPublish ||
                doc.canDelete ||
                canOpenShare) && (
                <div className="flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        disabled={isBusy}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="doc-save"
                        onClick={handleSave}
                        disabled={isBusy}
                        className="rounded-lg bg-surface-raised px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-white disabled:opacity-50"
                      >
                        {isBusy ? "Saving…" : "Save"}
                      </button>
                    </>
                  ) : (
                    <>
                      {canOpenShare && doc.status === "published" && (
                        <button
                          type="button"
                          data-testid="doc-share"
                          onClick={() => setShareOpen(true)}
                          title="Share this page"
                          aria-label="Share this page"
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                        >
                          <Share2 className="h-4 w-4" />
                          Share
                        </button>
                      )}
                      {doc.canDelete && (
                        <button
                          type="button"
                          data-testid="doc-delete"
                          onClick={() => setConfirmDelete(true)}
                          title="Move to trash"
                          aria-label="Move to trash"
                          className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {doc.canEdit && (
                        <button
                          type="button"
                          data-testid="doc-edit"
                          onClick={beginEdit}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                      )}
                      {doc.canPublish &&
                        (doc.status === "draft" ? (
                          <button
                            type="button"
                            data-testid="doc-publish"
                            onClick={handlePublish}
                            disabled={isBusy}
                            className="flex items-center gap-1.5 rounded-lg bg-surface-raised px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-white disabled:opacity-50"
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
                            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                          >
                            Return to draft
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* What publishing actually changes. */}
            {doc.status === "draft" && !isEditing && (
              <p className="shrink-0 text-xs text-ink-subtle">
                Not visible to your team, and no agent can read it over MCP
                until it is published.
              </p>
            )}

            {notice && (
              <p className="border-l-2 border-accent-line py-1 pl-3 text-xs text-accent">
                {notice}
              </p>
            )}
            {error && (
              <p className="border-l-2 border-danger-line py-1 pl-3 text-xs text-danger">
                {error}
              </p>
            )}

            {isEditing ? (
              // min-h-0 so the editor shrinks inside the pinned page instead
              // of pushing it taller and re-creating a page scroll.
              <div className="min-h-0 flex-1">
                <DocEditor
                  body={draftBody}
                  onChange={setDraftBody}
                  warnings={warnings}
                  disabled={isBusy}
                />
              </div>
            ) : (
              // Wider than the prose measure on purpose — DocMarkdown caps
              // paragraphs at 72ch, so the extra room goes to tables, code
              // blocks and diagrams instead of to line length.
              <div className="max-w-5xl">
                <div data-testid="doc-body">
                  <DocMarkdown body={doc.body} />
                </div>
                {/* Outside the body wrapper: it is chrome about the page, not
                    part of it, and its icons would otherwise count as page
                    content to anything inspecting the rendered markdown. */}
                <DocSharesList docId={doc._id} />
              </div>
            )}

            {warnings.length > 0 && !isEditing && (
              <div className="space-y-1 border-l-2 border-warning-line py-1 pl-3">
                {warnings.map((warning) => (
                  <p key={warning} className="text-xs text-warning">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {doc && (
        <DocShareDrawer
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          docId={doc._id}
          docTitle={doc.title}
          docModule={doc.module}
          projectId={projectId!}
          isPublished={doc.status === "published"}
        />
      )}

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
