"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { useNow } from "@/hooks";
import { ChangeReviewDrawer } from "./change-review-drawer";

type ChangeRequestRow = FunctionReturnType<
  typeof api.features.changeRequests.queries.listForOrg
>[number];

const STATUS_COLOR: Record<string, "green" | "red" | "zinc" | "amber"> = {
  pending: "amber",
  applied: "green",
  rejected: "red",
  canceled: "zinc",
  expired: "zinc",
};

function envBadgeColor(env: string): "green" | "amber" | "red" | "zinc" {
  if (env === "production") return "red";
  if (env === "staging") return "amber";
  if (env === "development") return "green";
  return "zinc";
}

/** Coarse age, because the exact minute never changes a review decision. */
function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Change requests for a project or an organization. Exactly one of the two
 * ids is passed; the other query is skipped.
 *
 * The open request lives in the URL (`?change=<id>`) rather than in state so
 * a notification can link straight to the review drawer.
 */
export function ChangeRequestList(props: {
  organizationId?: Id<"organizations">;
  projectId?: Id<"projects">;
}) {
  return (
    <Suspense fallback={<TerminalLoading />}>
      <ChangeRequestListInner {...props} />
    </Suspense>
  );
}

function ChangeRequestListInner({
  organizationId,
  projectId,
}: {
  organizationId?: Id<"organizations">;
  projectId?: Id<"projects">;
}) {
  const orgRows = useQuery(
    api.features.changeRequests.queries.listForOrg,
    organizationId ? { organizationId } : "skip"
  );
  const projectRows = useQuery(
    api.features.changeRequests.queries.listForProject,
    projectId ? { projectId } : "skip"
  );
  const rows: ChangeRequestRow[] | undefined = organizationId
    ? orgRows
    : projectRows;

  const now = useNow(60_000);
  const router = useRouter();
  const pathname = usePathname();
  const reviewing = useSearchParams().get(
    "change"
  ) as Id<"changeRequests"> | null;
  const open = (id: Id<"changeRequests">) =>
    router.replace(`${pathname}?change=${id}`, { scroll: false });
  const close = () => router.replace(pathname, { scroll: false });

  // The drawer renders from the id alone, so a deep link works even while the
  // list is loading or the request sits outside the visible rows.
  const drawer = reviewing && (
    <ChangeReviewDrawer requestId={reviewing} onClose={close} />
  );

  if (rows === undefined) return <TerminalLoading />;

  if (rows.length === 0) {
    return (
      <TerminalWindow title="changes">
        <TerminalEmptyState
          command="envpilot change list"
          message="No change requests. Writes to a protected environment land here."
        />
        {drawer}
      </TerminalWindow>
    );
  }

  return (
    <>
      <TerminalWindow title="changes">
        <div className="overflow-x-auto">
          {/* Under md the rows stack into cards; same DOM, so the test ids
              and click targets never fork. */}
          <table className="w-full">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-line">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                  Change
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                  Environments
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                  Requested
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-accent/70">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-line md:table-row-group">
              {rows.map((row) => (
                <tr
                  key={row._id}
                  data-testid="change-request-row"
                  onClick={() => open(row._id)}
                  className="block cursor-pointer py-2 align-top transition-colors hover:bg-accent-soft focus-within:bg-accent-soft md:table-row md:py-0"
                >
                  <td className="block px-5 py-1 md:table-cell md:py-3">
                    <button
                      type="button"
                      aria-label={`Review ${row.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        open(row._id);
                      }}
                      className="text-left focus-visible:outline-none"
                    >
                      <code className="font-mono text-sm text-warning">
                        {row.label}
                      </code>
                      <span className="mt-0.5 block text-xs text-ink-subtle">
                        {row.kind} {row.resourceType}
                      </span>
                    </button>
                  </td>
                  <td className="block px-5 py-1 md:table-cell md:py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.environments.map((env) => (
                        <TerminalBadge key={env} color={envBadgeColor(env)}>
                          {env}
                        </TerminalBadge>
                      ))}
                    </div>
                  </td>
                  <td className="block px-5 py-1 text-xs text-ink-subtle md:table-cell md:py-3">
                    {row.requester?.name ?? row.requester?.email ?? "Unknown"}
                    {now > 0 && (
                      <span className="ml-1.5 text-ink-faint">
                        {formatAge(now - row.createdAt)} ago
                      </span>
                    )}
                  </td>
                  <td className="block px-5 py-1 md:table-cell md:py-3 md:text-right">
                    <TerminalBadge color={STATUS_COLOR[row.status] ?? "zinc"}>
                      {row.status}
                    </TerminalBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TerminalWindow>

      {drawer}
    </>
  );
}
