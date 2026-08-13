"use client";

import { Shield, Eye, KeyRound, CheckCircle } from "lucide-react";
import {
  TerminalWindow,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";

interface SecurityInsightsProps {
  securityEventCount: number;
  sensitiveAccessCount: number;
  severityCounts: Record<string, number>;
  permissionChangeCount: number;
}

export function SecurityInsights({
  securityEventCount,
  sensitiveAccessCount,
  severityCounts,
  permissionChangeCount,
}: SecurityInsightsProps) {
  const criticalCount = severityCounts["critical"] ?? 0;
  const warningCount = severityCounts["warning"] ?? 0;
  const infoCount = severityCounts["info"] ?? 0;

  return (
    <TerminalWindow title="security-insights">
      <div className="border-b border-line px-5 py-2.5">
        <span className="font-mono text-xs text-ink-subtle">
          <span className="text-accent">$</span> envpilot analytics
          --security
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-surface-raised/50 lg:grid-cols-4">
        {/* Security Events */}
        <div className="bg-[#0f172a] p-5">
          <div className="flex items-center gap-2 text-ink-subtle mb-3">
            <Shield className="h-4 w-4" />
            <span className="font-mono text-xs">Security Events</span>
          </div>
          <p className="text-2xl font-bold font-mono text-ink">
            {securityEventCount}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {criticalCount > 0 && (
              <TerminalBadge color="red">
                {criticalCount} critical
              </TerminalBadge>
            )}
            {warningCount > 0 && (
              <TerminalBadge color="amber">
                {warningCount} warning
              </TerminalBadge>
            )}
            {infoCount > 0 && (
              <TerminalBadge color="zinc">{infoCount} info</TerminalBadge>
            )}
            {securityEventCount === 0 && (
              <TerminalBadge color="green">clear</TerminalBadge>
            )}
          </div>
        </div>

        {/* Sensitive Access */}
        <div className="bg-[#0f172a] p-5">
          <div className="flex items-center gap-2 text-ink-subtle mb-3">
            <Eye className="h-4 w-4" />
            <span className="font-mono text-xs">Sensitive Access</span>
          </div>
          <p className="text-2xl font-bold font-mono text-ink">
            {sensitiveAccessCount}
          </p>
          <p className="mt-2 text-xs text-ink-faint font-mono">
            encrypted variable reads
          </p>
        </div>

        {/* Permission Changes */}
        <div className="bg-[#0f172a] p-5">
          <div className="flex items-center gap-2 text-ink-subtle mb-3">
            <KeyRound className="h-4 w-4" />
            <span className="font-mono text-xs">Permission Changes</span>
          </div>
          <p className="text-2xl font-bold font-mono text-ink">
            {permissionChangeCount}
          </p>
          <p className="mt-2 text-xs text-ink-faint font-mono">
            grants &amp; revocations
          </p>
        </div>

        {/* Compliance Status */}
        <div className="bg-[#0f172a] p-5">
          <div className="flex items-center gap-2 text-ink-subtle mb-3">
            <CheckCircle className="h-4 w-4" />
            <span className="font-mono text-xs">Compliance</span>
          </div>
          <p className="text-2xl font-bold font-mono text-accent flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Passing
          </p>
          <p className="mt-2 text-xs text-ink-faint font-mono">
            audit trail complete
          </p>
        </div>
      </div>
    </TerminalWindow>
  );
}
