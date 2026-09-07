"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { useOnboardingStatus } from "@/hooks";
import { TerminalWindow } from "@/components/dashboard/terminal-ui";

type OnboardingStatus = ReturnType<typeof useOnboardingStatus>["status"];

// Renders nothing once every onboarding step is done (or while it loads).
export function GettingStartedPanel({
  status,
  isLoading,
}: {
  status: OnboardingStatus;
  isLoading: boolean;
}) {
  if (isLoading || !status || isOnboardingComplete(status)) return null;

  return (
    <TerminalWindow title="getting-started">
      <div className="p-5 font-mono text-sm">
        <p className="text-xs text-ink-subtle mb-4">
          Complete these steps to get the most out of Envpilot.
        </p>
        <div className="space-y-2">
          <OnboardingStep
            number={1}
            command="envpilot project create"
            completed={status.hasProjects}
            href="/dashboard/projects/new"
          />
          <OnboardingStep
            number={2}
            command="envpilot variable add"
            completed={status.hasVariables}
            href="/dashboard/variables"
          />
          <OnboardingStep
            number={3}
            command="envpilot team invite"
            completed={status.hasTeamMembers}
            href="/dashboard/team"
          />
          <OnboardingStep
            number={4}
            command="envpilot extension install"
            completed={status.hasIntegrations}
            href="/dashboard/settings#integrations"
          />
        </div>
      </div>
    </TerminalWindow>
  );
}

function isOnboardingComplete(status: {
  hasProjects: boolean;
  hasVariables: boolean;
  hasTeamMembers: boolean;
  hasIntegrations: boolean;
}): boolean {
  return (
    status.hasProjects &&
    status.hasVariables &&
    status.hasTeamMembers &&
    status.hasIntegrations
  );
}

function OnboardingStep({
  number,
  command,
  completed,
  href,
}: {
  number: number;
  command: string;
  completed: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent-soft"
    >
      <span className="text-ink-faint text-xs w-6">
        [{String(number).padStart(2, "0")}]
      </span>
      <span className="text-ink-subtle">$</span>
      <span
        className={completed ? "text-ink-faint line-through" : "text-ink-muted"}
      >
        {command}
      </span>
      <span className="ml-auto">
        {completed ? (
          <span className="text-accent text-xs flex items-center gap-1">
            <Check className="h-3 w-3" /> DONE
          </span>
        ) : (
          <span className="text-warning text-xs">PENDING</span>
        )}
      </span>
    </Link>
  );
}
