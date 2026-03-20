"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { Share2, Eye, Clock, Flame } from "lucide-react";

interface SharedSecretsWidgetProps {
  organizationId: Id<"organizations">;
}

export function SharedSecretsWidget({
  organizationId,
}: SharedSecretsWidgetProps) {
  let shares;
  let queryError: Error | null = null;

  try {
    shares = useQuery(api.sharedSecrets.listActiveByOrg, {
      organizationId,
    });
  } catch (err) {
    queryError =
      err instanceof Error ? err : new Error("Failed to load shares");
  }

  const isLoading = !queryError && shares === undefined;

  return (
    <TerminalWindow title="shared-secrets">
      <div className="flex items-center justify-between border-b border-zinc-700/50 px-5 py-2.5">
        <span className="font-mono text-xs text-zinc-500">
          <span className="text-green-400">$</span> envpilot shares --active
        </span>
        <Link
          href="/dashboard/variables"
          className="text-xs text-zinc-500 hover:text-green-400"
        >
          View all
        </Link>
      </div>
      {queryError ? (
        <TerminalEmptyState
          command="envpilot shares --active"
          message="Failed to load shared secrets."
        />
      ) : isLoading ? (
        <TerminalLoading />
      ) : shares && shares.length === 0 ? (
        <TerminalEmptyState
          command="envpilot shares --active"
          message="No active shared secrets."
        />
      ) : shares ? (
        <AnimatedList className="divide-y divide-zinc-800/50">
          {shares.map((share) => (
            <SharedSecretRow key={String(share._id)} share={share} />
          ))}
        </AnimatedList>
      ) : null}
    </TerminalWindow>
  );
}

interface ShareData {
  _id: unknown;
  variableKey: string;
  mode: "one_time" | "time_limited";
  expiresAt: number;
  totalViewCount: number;
  recipientCount: number;
  viewedCount: number;
  createdAt: number;
}

function SharedSecretRow({ share }: { share: ShareData }) {
  const timeRemaining = formatTimeRemaining(share.expiresAt);
  const isExpiringSoon = share.expiresAt - Date.now() < 3_600_000; // < 1 hour

  return (
    <div className="flex items-center justify-between px-5 py-3 font-mono text-xs">
      <div className="flex items-center gap-3">
        {share.mode === "one_time" ? (
          <Flame className="h-3.5 w-3.5 text-amber-400" />
        ) : (
          <Clock className="h-3.5 w-3.5 text-blue-400" />
        )}
        <div>
          <p className="text-sm text-zinc-300">{share.variableKey}</p>
          <p className="text-zinc-600">
            {share.recipientCount}{" "}
            {share.recipientCount === 1 ? "recipient" : "recipients"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-zinc-500">
          <Eye className="h-3 w-3" />
          {share.viewedCount}/{share.recipientCount}
        </span>
        <TerminalBadge color={isExpiringSoon ? "amber" : "green"}>
          {timeRemaining}
        </TerminalBadge>
        <TerminalBadge color={share.mode === "one_time" ? "amber" : "blue"}>
          {share.mode === "one_time" ? "burn" : "timed"}
        </TerminalBadge>
      </div>
    </div>
  );
}

function formatTimeRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
