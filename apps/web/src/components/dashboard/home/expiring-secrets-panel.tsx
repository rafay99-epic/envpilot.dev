"use client";

import { RotateCcw } from "lucide-react";
import type { useExpiringVariables } from "@/hooks";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDateWith } from "@/lib/format";
import {
  TerminalWindow,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";

// The `envpilot secrets --expiring` terminal window (rotation feature only).
export function ExpiringSecretsPanel({
  variables,
}: {
  variables: ReturnType<typeof useExpiringVariables>["variables"];
}) {
  return (
    <TerminalWindow
      title="expiring-secrets"
      cmd="envpilot secrets --expiring"
      action={{ label: "View all", href: "/dashboard/variables" }}
    >
      {variables.length === 0 ? (
        <TerminalEmptyState
          command="envpilot secrets --expiring"
          message="No secrets expiring in the next 7 days."
        />
      ) : (
        <AnimatedList className="divide-y divide-line">
          {variables.map((v) => (
            <ExpiringSecretRow key={String(v._id)} variable={v} />
          ))}
        </AnimatedList>
      )}
    </TerminalWindow>
  );
}

function ExpiringSecretRow({
  variable,
}: {
  variable: {
    _id: unknown;
    key: string;
    projectName: string;
    expiresAt: number;
    rotationStatus: string;
  };
}) {
  const timeZone = useTimeZone();
  const isExpired = variable.rotationStatus === "expired";
  const label = isExpired
    ? "expired"
    : `expires ${formatDateWith(variable.expiresAt, { month: "short", day: "numeric" }, timeZone)}`;

  return (
    <div className="flex items-center justify-between px-5 py-3 font-mono text-xs">
      <div className="flex items-center gap-3">
        <RotateCcw className="h-3.5 w-3.5 text-warning" />
        <div>
          <p className="text-sm text-ink-muted">{variable.key}</p>
          <p className="text-ink-faint">{variable.projectName}</p>
        </div>
      </div>
      <TerminalBadge color={isExpired ? "red" : "amber"}>{label}</TerminalBadge>
    </div>
  );
}
