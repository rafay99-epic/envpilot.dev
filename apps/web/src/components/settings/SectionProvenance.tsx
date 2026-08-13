"use client";

import Link from "next/link";
import { useSettingsProvenance } from "@/hooks";

/** "2 days ago" without pulling in a date library for one line of text. */
function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
  ];
  let label = "minute";
  let value = Math.floor(seconds / 60);
  for (const [size, unit] of units) {
    const scaled = Math.floor(seconds / size);
    if (scaled < 1) break;
    label = unit;
    value = scaled;
  }
  return `${value} ${label}${value === 1 ? "" : "s"} ago`;
}

/**
 * Provenance line for a settings section: who touched it last, linking into
 * the audit log. Renders nothing when the viewer cannot read audit logs or the
 * change has aged out of the retention window — settings must not depend on it.
 */
export function SectionProvenance({
  organizationId,
  action,
  projectId,
}: {
  organizationId: string | undefined;
  action: string;
  projectId?: string;
}) {
  const last = useSettingsProvenance({ organizationId, action, projectId });
  if (!last) return null;

  return (
    <Link
      href="/dashboard/audit"
      className="font-mono text-[11px] text-ink-faint transition-colors hover:text-accent"
    >
      Changed by {last.userName} ·{" "}
      <span className="whitespace-nowrap">
        {relativeTime(last.changedAt)} →
      </span>
    </Link>
  );
}
