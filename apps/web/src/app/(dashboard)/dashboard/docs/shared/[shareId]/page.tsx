"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileText } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { useMarkShareViewed, useSharedDoc } from "@/hooks";

const DocMarkdown = dynamic(
  () => import("@/components/docs/doc-markdown").then((m) => m.DocMarkdown),
  { ssr: false, loading: () => <TerminalLoading /> }
);

/**
 * Documentation reached through a share, for a member who has no access to
 * the project it lives in.
 *
 * Deliberately bare: for a page share, the page. For a module share, an index
 * of that module and nothing else — no sibling modules, no project detail.
 * The grant is exactly as wide as the UI makes it look.
 */
export default function SharedDocReaderPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = use(params);
  const router = useRouter();

  // Which page of a module is open. Local rather than routed: a recipient
  // arrives at the index and reads from there, and a share id in a URL is not
  // something anyone bookmarks a sub-path of.
  const [openSlug, setOpenSlug] = useState<string | undefined>(undefined);

  const shared = useSharedDoc(shareId as Id<"docShares">, openSlug);
  const markViewed = useMarkShareViewed();
  const recorded = useRef<string | null>(null);

  // Fired once per share, from an effect — never from the reactive query,
  // which re-runs on unrelated writes and would log a view each time.
  useEffect(() => {
    if (shared?.status !== "ok" || recorded.current === shareId) return;
    recorded.current = shareId;
    void markViewed({ shareId: shareId as Id<"docShares"> });
  }, [shared?.status, shareId, markViewed]);

  // Someone who can open the project outright gets the real page, with its
  // sidebar and edit controls, rather than this stripped-down copy. Guarded
  // by a ref because the subscription re-runs on unrelated writes and would
  // otherwise fire a navigation on every one of them.
  const redirected = useRef(false);
  useEffect(() => {
    if (redirected.current) return;
    if (
      shared?.status === "ok" &&
      shared.kind === "page" &&
      shared.projectSlug
    ) {
      redirected.current = true;
      router.replace(
        `/dashboard/projects/${shared.projectSlug}/docs/${shared.docSlug}`
      );
    }
  }, [shared, router]);

  if (shared === undefined) {
    return (
      <div className="pt-6">
        <TerminalLoading />
      </div>
    );
  }

  if (shared.status !== "ok") {
    return (
      <div className="mx-auto max-w-md pt-16">
        <div className="rounded-xl border border-line p-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <h1 className="mb-2 text-lg font-semibold text-ink">
            This is no longer shared with you
          </h1>
          <p className="text-sm text-ink-muted">
            The share may have expired or been revoked, or the page may have
            been returned to draft.
          </p>
          <Link
            href="/dashboard/docs/shared"
            className="mt-5 inline-block text-xs text-accent hover:underline"
          >
            Back to shared documentation
          </Link>
        </div>
      </div>
    );
  }

  // ── Module index ────────────────────────────────────────────────────────
  if (shared.kind === "module") {
    const { module } = shared;
    return (
      <div className="space-y-5 pt-6">
        <Link
          href="/dashboard/docs/shared"
          className="inline-flex items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Shared with me
        </Link>

        <div>
          <p className="font-mono text-xs tracking-wide text-ink-subtle uppercase">
            {module.projectName}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold text-ink">
            {module.module}
          </h1>
          <p className="mt-1 text-xs text-ink-subtle">
            Shared by {module.sharedByName} · access expires{" "}
            {new Date(module.expiresAt).toLocaleDateString()}
          </p>
        </div>

        {module.note && (
          <p className="border-l-2 border-accent-line pl-3 text-sm text-ink-muted italic">
            {module.note}
          </p>
        )}

        {module.pages.length === 0 ? (
          // Not an error: a module whose pages are all drafts today is empty
          // and will fill in on its own as they are published.
          <p className="rounded-xl border border-line px-6 py-12 text-center text-sm text-ink-subtle">
            No published pages in this module yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="shared-module-index">
            {module.pages.map((page) => (
              <li key={page.slug}>
                <button
                  type="button"
                  onClick={() => setOpenSlug(page.slug)}
                  className="block w-full rounded-xl border border-line px-4 py-3.5 text-left transition-colors hover:border-line hover:bg-surface-hover/40"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {page.title}
                      </p>
                      {page.excerpt && (
                        <p className="mt-1 line-clamp-2 text-xs text-ink-subtle">
                          {page.excerpt}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── One page ────────────────────────────────────────────────────────────
  const { doc, moduleName } = shared;

  return (
    <div className="space-y-5 pt-6">
      <button
        type="button"
        onClick={() =>
          openSlug
            ? setOpenSlug(undefined)
            : router.push("/dashboard/docs/shared")
        }
        className="inline-flex items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {openSlug && moduleName ? moduleName : "Shared with me"}
      </button>

      <div>
        <p className="font-mono text-xs tracking-wide text-ink-subtle uppercase">
          {doc.projectName} · {doc.module}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold text-ink">{doc.title}</h1>
        <p className="mt-1 text-xs text-ink-subtle">
          Written by {doc.authorName} · shared by {doc.sharedByName} · access
          expires {new Date(doc.expiresAt).toLocaleDateString()}
        </p>
      </div>

      {doc.note && !openSlug && (
        <p className="border-l-2 border-accent-line pl-3 text-sm text-ink-muted italic">
          {doc.note}
        </p>
      )}

      <div data-testid="shared-doc-body" className="max-w-5xl">
        <DocMarkdown body={doc.body} />
      </div>
    </div>
  );
}
