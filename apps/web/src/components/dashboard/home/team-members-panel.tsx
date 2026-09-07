"use client";

import Image from "next/image";
import type { useTeamMembersQuickView } from "@/hooks";
import { normalizeOrgRole, roleLabel } from "@/lib/roles";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";

// The `envpilot team list` terminal window in the dashboard's right column.
export function TeamMembersPanel({
  members,
  isLoading,
  canInviteTeam,
}: {
  members: ReturnType<typeof useTeamMembersQuickView>["members"];
  isLoading: boolean;
  canInviteTeam: boolean;
}) {
  return (
    <TerminalWindow
      title="team-members"
      cmd="envpilot team list"
      action={{ label: "Manage", href: "/dashboard/team" }}
    >
      {isLoading ? (
        <TerminalLoading />
      ) : members.length === 0 ? (
        <TerminalEmptyState
          command="envpilot team list"
          message="It's just you for now."
          action={
            canInviteTeam
              ? {
                  label: "Invite team members",
                  href: "/dashboard/team",
                }
              : undefined
          }
        />
      ) : (
        <AnimatedList className="divide-y divide-line">
          {members
            .filter(
              (member): member is NonNullable<typeof member> => member !== null
            )
            .map((member) => (
              <TeamMemberRow key={String(member._id)} member={member} />
            ))}
        </AnimatedList>
      )}
    </TerminalWindow>
  );
}

function TeamMemberRow({
  member,
}: {
  member: {
    _id: unknown;
    role: string;
    joinedAt: number;
    user: { _id: unknown; name?: string; email: string; avatarUrl?: string };
  };
}) {
  const role = normalizeOrgRole(member.role);
  const roleColor =
    role === "owner"
      ? "purple"
      : role === "project_manager"
        ? "amber"
        : role === "team_lead"
          ? "blue"
          : ("zinc" as const);

  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-xs font-medium text-ink-muted">
          {member.user.avatarUrl ? (
            <Image
              src={member.user.avatarUrl}
              alt={member.user.name || member.user.email}
              width={28}
              height={28}
              className="h-7 w-7 rounded-full"
            />
          ) : (
            (member.user.name || member.user.email).charAt(0).toUpperCase()
          )}
        </div>
        <span className="text-sm text-ink-muted">
          {member.user.name || member.user.email}
        </span>
      </div>
      <TerminalBadge color={roleColor}>{roleLabel(role)}</TerminalBadge>
    </div>
  );
}
