"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalButton,
  TerminalButtonLink,
} from "@/components/dashboard/terminal-ui";
import { createLogger } from "@/lib/logger";

const log = createLogger("access-notices");

/**
 * Full-screen access notices, mounted inside the dashboard shell:
 *
 * 1. Security hold — the ACTIVE org's membership is suspended: hard block
 *    on the org's content until reinstated. The `/organizations` routes are
 *    exempt — that's the escape hatch where the user switches to another
 *    org (or creates one); without the exemption the overlay would brick
 *    the whole app, including the switcher itself.
 * 2. Exit notices (membership tombstones) — "your access to X has been
 *    revoked, contact your organization" — shown once, acknowledged away.
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
  const pathname = usePathname();
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

  // The organizations list/create pages are the escape route out of a
  // suspended org — never cover them.
  const onEscapeRoute = pathname?.startsWith("/organizations");

  // ── Security hold on the active org ─────────────────────────────────
  if (membershipStatus?.status === "suspended" && !onEscapeRoute) {
    return (
      <div className="dark fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a] px-4">
        {/* Subtle grid background (matches auth-error-page) */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <TerminalWindow
          title="access_revoked"
          className="relative z-10 w-full max-w-md shadow-2xl"
        >
          <div className="p-8 font-mono text-sm">
            <p className="text-red-400">
              ERROR: access revoked [exit code 403]
            </p>
            <p className="mt-3 text-zinc-400">
              Your access to this organization has been revoked
              {membershipStatus.suspendedAt
                ? ` on ${new Date(membershipStatus.suspendedAt).toLocaleDateString()}`
                : ""}
              .
            </p>
            <p className="mt-2 text-zinc-400">
              Please contact your organization.
            </p>
            <p className="mt-4 text-xs text-zinc-600">
              Your role and project assignments are preserved — if an
              administrator reinstates you, everything returns as it was.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <TerminalButtonLink href="/organizations" variant="primary">
                {hasOtherOrganizations
                  ? "Switch organization"
                  : "Go to organizations"}
              </TerminalButtonLink>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  // ── Exit notices (removed / left / org deleted) ──────────────────────
  if (!tombstones || tombstones.length === 0) return null;
  const notice = tombstones[0];

  const heading =
    notice.kind === "org_deleted"
      ? "organization deleted"
      : notice.kind === "left"
        ? "organization left"
        : "access revoked";

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
    <div className="dark fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <TerminalWindow
        title="notice"
        className="relative z-10 w-full max-w-md shadow-2xl"
      >
        <div className="p-8 font-mono text-sm">
          <p className="text-amber-400">NOTICE: {heading}</p>
          <p className="mt-3 text-zinc-400">{message}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <TerminalButton
              variant="primary"
              onClick={handleAcknowledge}
              disabled={acknowledging}
            >
              {acknowledging ? "Dismissing…" : "Got it"}
            </TerminalButton>
            {!hasOtherOrganizations && (
              <TerminalButtonLink href="/organizations/new" variant="secondary">
                Create your own workspace
              </TerminalButtonLink>
            )}
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
}
