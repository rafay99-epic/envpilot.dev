"use client";

import type { useRecentActivity } from "@/hooks";
import { useNow } from "@/hooks";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDateWith } from "@/lib/format";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";

interface ActivityItem {
  _id: string;
  action: string;
  createdAt: number;
  details?: string;
  user: { name: string; avatarUrl?: string } | null;
  project: { name: string; slug: string } | null;
}

// The `envpilot audit --tail` terminal window (latest five events).
export function RecentActivityPanel({
  activity,
  isLoading,
}: {
  activity: ReturnType<typeof useRecentActivity>["activity"];
  isLoading: boolean;
}) {
  return (
    <TerminalWindow
      title="activity-log"
      cmd="envpilot audit --tail"
      action={{ label: "View all", href: "/dashboard/audit" }}
    >
      {isLoading ? (
        <TerminalLoading />
      ) : activity.length === 0 ? (
        <TerminalEmptyState
          command="envpilot audit --tail"
          message="No recent activity. Start by creating a project!"
        />
      ) : (
        <AnimatedList className="divide-y divide-line">
          {activity.slice(0, 5).map((item: ActivityItem) => (
            <ActivityRow key={item._id} activity={item} />
          ))}
        </AnimatedList>
      )}
    </TerminalWindow>
  );
}

const actionLabels: Record<string, string> = {
  "org.created": "created organization",
  "org.updated": "updated organization",
  "org.deleted": "deleted organization",
  "org.member_added": "added team member",
  "org.member_removed": "removed team member",
  "org.member_role_changed": "changed member role",
  "project.created": "created project",
  "workspace.created": "created shared group",
  "workspace.project_added": "started sharing with project",
  "workspace.project_removed": "stopped sharing with project",
  "workspace.variable_adopted": "shared variable across projects",
  "project.updated": "updated project",
  "project.deleted": "deleted project",
  "project.restored": "restored project",
  "project.moved": "moved project",
  "project.member_added": "added project member",
  "project.member_removed": "removed project member",
  "project.member_environments_changed": "changed environment access",
  "variable.created": "added variable",
  "variable.updated": "updated variable",
  "variable.deleted": "deleted variable",
  "variable.accessed": "accessed variable",
  "variable.exported": "exported variable",
  "permission.granted": "granted permission",
  "permission.revoked": "revoked permission",
  "permission.updated": "updated permission",
  "invitation.sent": "sent invitation",
  "invitation.accepted": "accepted invitation",
  "invitation.declined": "declined invitation",
  "invitation.canceled": "canceled invitation",
  "invitation.resent": "resent invitation",
  "tag.created": "created tag",
  "tag.updated": "updated tag",
  "tag.deleted": "deleted tag",
  "template.created": "created template",
  "template.updated": "updated template",
  "template.deleted": "deleted template",
  "access.token_created": "created access token",
  "access.token_revoked": "revoked access token",
  "access.extension_linked": "linked extension",
  "access.extension_unlinked": "unlinked extension",
  "variable.rotated": "rotated secret",
  "variable.expired": "secret expired",
  "variable.rotation_reminder_sent": "sent rotation reminder",
};

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const timeZone = useTimeZone();
  const now = useNow(60_000);
  const actionLabel = actionLabels[activity.action] || activity.action;
  const time = formatTimestamp(activity.createdAt, timeZone, now);

  return (
    <div className="flex items-start gap-3 px-5 py-3 font-mono text-xs">
      <span className="text-ink-faint whitespace-nowrap">[{time}]</span>
      <div className="min-w-0">
        <p className="text-ink-muted">
          <span className="text-accent">
            {activity.user?.name || "unknown"}
          </span>{" "}
          {actionLabel}
          {activity.project && (
            <>
              {" "}
              in <span className="text-warning">{activity.project.name}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function formatTimestamp(
  timestamp: number,
  timeZone: string,
  now: number
): string {
  const hours = Math.floor((now - timestamp) / (1000 * 60 * 60));

  if (hours < 24) {
    return formatDateWith(
      timestamp,
      { hour: "2-digit", minute: "2-digit" },
      timeZone
    );
  }
  return formatDateWith(
    timestamp,
    { month: "short", day: "numeric" },
    timeZone
  );
}
