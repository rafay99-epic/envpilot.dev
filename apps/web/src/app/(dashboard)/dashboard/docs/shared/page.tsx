"use client";

import Link from "next/link";
import { FileText, FolderOpen, Inbox } from "lucide-react";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { PageHeader } from "@envpilot/ui";
import { useSharedWithMe } from "@/hooks";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDate } from "@/lib/format";

/**
 * Pages teammates handed to the reader.
 *
 * This list exists because a share can reach someone with no access to the
 * project the page lives in — they have nowhere else in the product to find
 * it. Anyone who *does* have project access is linked straight to the real
 * page instead, which has the sidebar, search and edit controls.
 */
export default function SharedDocsPage() {
  const shares = useSharedWithMe();
  const timeZone = useTimeZone();

  return (
    <div className="space-y-5 pt-6">
      <PageHeader
        icon={Inbox}
        title="Shared with me"
        description="Pages and modules teammates have shared with you directly."
      />

      {shares === undefined ? (
        <TerminalLoading />
      ) : shares.length === 0 ? (
        <div className="rounded-xl border border-line px-6 py-14 text-center">
          <Inbox className="mx-auto mb-3 h-6 w-6 text-ink-faint" />
          <p className="text-sm text-ink-muted">Nothing shared with you yet.</p>
          <p className="mt-1 text-xs text-ink-faint">
            When someone shares a page, it shows up here until it expires.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shares.map((share) => (
            <li key={share._id}>
              <Link
                // Always the share reader. If the reader turns out to hold
                // normal project access it redirects itself to the real page,
                // which keeps that lookup off this list's read budget.
                href={`/dashboard/docs/shared/${share._id}`}
                className="block rounded-xl border border-line px-4 py-3.5 transition-colors hover:border-line hover:bg-surface-hover/40"
              >
                <div className="flex items-start gap-3">
                  {share.scope === "module" ? (
                    <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  ) : (
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {share.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-subtle">
                      {share.projectName}
                      {share.scope === "module"
                        ? ` · ${share.pageCount} ${share.pageCount === 1 ? "page" : "pages"}`
                        : ` · ${share.module}`}{" "}
                      · shared by {share.sharedByName}
                    </p>
                    {share.note && (
                      <p className="mt-2 border-l-2 border-accent-line pl-2.5 text-xs text-ink-muted italic">
                        {share.note}
                      </p>
                    )}
                    {share.excerpt && !share.note && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-ink-subtle">
                        {share.excerpt}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                    expires {formatDate(share.expiresAt, timeZone)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
