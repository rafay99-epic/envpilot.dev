"use client";

import { use, useReducer, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { DocEditor, DocSharesList, DocShareDrawer } from "@/components/docs";
import { DocDetailHeader } from "@/components/docs/doc-detail-header";
import {
  docEditorReducer,
  initialDocEditorState,
} from "@/components/docs/doc-editor-state";
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
import { useTimeZone } from "@/hooks/useTimeZone";

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
  // Everything below is per-page state — the editor draft, the notice, the
  // open share drawer. Keying on the slug restarts it when another page is
  // opened, which the App Router does not do on its own because the route
  // stays the same.
  return <DocDetailView key={docSlug} slug={slug} docSlug={docSlug} />;
}

function DocDetailView({ slug, docSlug }: { slug: string; docSlug: string }) {
  const router = useRouter();
  const timeZone = useTimeZone();
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

  // The editor's fields move together, so they are one reducer rather than
  // seven setters called in sequence. The two dialog toggles below are
  // genuinely independent and stay as plain state.
  const [editor, dispatch] = useReducer(
    docEditorReducer,
    initialDocEditorState
  );
  const { isEditing, draftBody, draftTitle, warnings, error, notice, isBusy } =
    editor;
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

  const beginEdit = () => {
    if (!doc) return;
    dispatch({ kind: "edit-started", title: doc.title, body: doc.body });
  };

  const handleSave = async () => {
    if (!doc) return;
    dispatch({ kind: "request-started" });
    try {
      const result = await updateDoc({
        docId: doc._id,
        title: draftTitle,
        body: draftBody,
      });
      dispatch({
        kind: "saved",
        warnings: result.warnings ?? [],
        notice: result.unpublished
          ? "Saved. Editing a published page returns it to draft, so publish again when it reads right."
          : "Saved.",
      });
      // The title change may have moved the slug, so follow it.
      if (result.slug !== docSlug) {
        router.replace(`/dashboard/projects/${slug}/docs/${result.slug}`);
      }
    } catch (e) {
      dispatch({ kind: "request-failed", error: sanitizeConvexError(e) });
    }
  };

  const handlePublish = async () => {
    if (!doc) return;
    dispatch({ kind: "request-started" });
    try {
      await publishDoc({ docId: doc._id });
      dispatch({ kind: "request-succeeded", notice: "Published." });
    } catch (e) {
      dispatch({ kind: "request-failed", error: sanitizeConvexError(e) });
    }
  };

  const handleUnpublish = async () => {
    if (!doc) return;
    dispatch({ kind: "request-started" });
    try {
      await unpublishDoc({ docId: doc._id });
      dispatch({ kind: "request-succeeded", notice: "Returned to draft." });
    } catch (e) {
      dispatch({ kind: "request-failed", error: sanitizeConvexError(e) });
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    dispatch({ kind: "request-started" });
    try {
      await deleteDoc({ docId: doc._id });
      router.push(`/dashboard/projects/${slug}/docs`);
    } catch (e) {
      dispatch({ kind: "request-failed", error: sanitizeConvexError(e) });
    }
    // Closed after the try/catch rather than in a finally block: React
    // Compiler bails on any function holding a try with a finalizer, and the
    // catch above swallows, so this runs on both paths.
    setConfirmDelete(false);
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
            <DocDetailHeader
              doc={doc}
              isEditing={isEditing}
              isBusy={isBusy}
              draftTitle={draftTitle}
              timeZone={timeZone}
              canOpenShare={canOpenShare}
              onTitleChange={(title) =>
                dispatch({ kind: "title-changed", title })
              }
              onBeginEdit={beginEdit}
              onCancelEdit={() => dispatch({ kind: "edit-cancelled" })}
              onSave={handleSave}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              onShare={() => setShareOpen(true)}
              onDelete={() => setConfirmDelete(true)}
            />

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
                  onChange={(body) => dispatch({ kind: "body-changed", body })}
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
