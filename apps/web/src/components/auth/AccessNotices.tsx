"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { createLogger } from "@/lib/logger";

const log = createLogger("access-notices");

/**
 * Full-screen access notices, mounted inside the dashboard shell:
 *
 * 1. Exit notices (membership tombstones) — "your access to X has been
 *    revoked, contact your organization" — shown once, acknowledged away.
 * 2. Security hold — the ACTIVE org's membership is suspended: hard block
 *    on the org's content until reinstated (other orgs stay reachable via
 *    the link to the organizations list).
 *
 * Both are deliberately information-poor toward the affected user: org
 * name + date only, never who/why (that lives in the admin audit log).
 */
export function AccessNotices({
  activeOrganizationId,
  hasOtherOrganizations,
}: {
  activeOrganizationId: string | null;
  hasOtherOrganizations: boolean;
}) {
  const tombstones = useQuery(
    api.features.organizations.tombstones.myTombstones
  );
  const acknowledge = useMutation(
    api.features.organizations.tombstones.acknowledgeTombstone
  );
  const membershipStatus = useQuery(
    api.features.organizations.securityHold.getMyMembershipStatus,
    activeOrganizationId
      ? { organizationId: activeOrganizationId as Id<"organizations"> }
      : "skip"
  );
  const [acknowledging, setAcknowledging] = useState(false);

  // ── Security hold on the active org ─────────────────────────────────
  if (membershipStatus?.status === "suspended") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white p-6 dark:bg-zinc-950">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Your access has been revoked
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Your access to this organization has been revoked
            {membershipStatus.suspendedAt
              ? ` on ${new Date(membershipStatus.suspendedAt).toLocaleDateString()}`
              : ""}
            . Please contact your organization.
          </p>
          <Link
            href="/organizations"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {hasOtherOrganizations
              ? "Switch organization"
              : "Go to organizations"}
          </Link>
        </div>
      </div>
    );
  }

  // ── Exit notices (removed / left / org deleted) ──────────────────────
  if (!tombstones || tombstones.length === 0) return null;
  const notice = tombstones[0];

  const heading =
    notice.kind === "org_deleted"
      ? "An organization was deleted"
      : notice.kind === "left"
        ? "You left an organization"
        : "Your access has been revoked";

  const message =
    notice.kind === "org_deleted"
      ? `${notice.organizationName} was deleted on ${new Date(notice.createdAt).toLocaleDateString()}. Your data in it is no longer available.`
      : notice.kind === "left"
        ? `You left ${notice.organizationName} on ${new Date(notice.createdAt).toLocaleDateString()}.`
        : `Your access to ${notice.organizationName} was revoked on ${new Date(notice.createdAt).toLocaleDateString()}. Please contact your organization.`;

  async function handleAcknowledge() {
    setAcknowledging(true);
    try {
      await acknowledge({ tombstoneId: notice._id });
    } catch (err) {
      log.error(
        "tombstone_acknowledge_failed",
        { tombstoneId: notice._id },
        err
      );
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <svg
            className="h-6 w-6 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {heading}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {message}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {acknowledging ? "Dismissing…" : "Got it"}
          </button>
          {!hasOtherOrganizations && (
            <Link
              href="/organizations/new"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Create your own workspace
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
